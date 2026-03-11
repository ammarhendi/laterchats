import { Server as SocketIOServer } from "socket.io";
import { Server as HttpServer } from "http";
import { getDb, getRoomById } from "./db";
import { messages, inviteTokens, offlineMessages } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import {
  SUPER_ADMIN_NICKNAME,
  isSuperAdminNickname,
  isUserBanned,
  banUser,
  unbanUser,
  getBannedUsers,
  promoteToModerator,
  demoteUser,
  getUserRole,
  getAllModerators,
} from "./super-admin";

// In-memory store for active users in the room
interface ActiveUser {
  socketId: string;
  nickname: string;
  roomId: number;
  isMuted: boolean;
  isVoiceActive: boolean;
  isVoiceBanned: boolean;
  isTextMuted: boolean; // moderator can mute text
  role: "super_admin" | "moderator" | "user";
  ipAddress: string;
  joinedAt: Date;
  publicKeyJwk?: string; // E2EE public key
}

const activeUsers = new Map<string, ActiveUser>(); // socketId -> user
const pendingSuperAdminNicknames = new Map<string, string>(); // socketId -> pending nickname

// Global presence map: tracks ALL connected users by nickname, regardless of room
// This is the source of truth for online/offline status on the Friends screen
const onlinePresence = new Map<string, string>(); // nickname.toLowerCase() -> socketId

export function isUserOnline(nickname: string): boolean {
  const socketId = onlinePresence.get(nickname.toLowerCase());
  if (!socketId) return false;
  // Also check activeUsers as fallback (room members are always online)
  return true;
}

export function getOnlineNicknames(): string[] {
  return Array.from(onlinePresence.keys());
}

function getRoomUsers(roomId: number) {
  return Array.from(activeUsers.values())
    .filter((u) => u.roomId === roomId)
    .map((u) => ({
      nickname: u.nickname,
      isMuted: u.isMuted,
      isVoiceActive: u.isVoiceActive,
      isVoiceBanned: u.isVoiceBanned,
      isTextMuted: u.isTextMuted,
      role: u.role,
    }));
}

let ioInstance: SocketIOServer | null = null;

export function getIo(): SocketIOServer | null {
  return ioInstance;
}

export function getActiveUserCount(roomId: number): number {
  return Array.from(activeUsers.values()).filter((u) => u.roomId === roomId).length;
}

export function getActiveUserByNickname(nickname: string): ActiveUser | undefined {
  return Array.from(activeUsers.values()).find(
    (u) => u.nickname.toLowerCase() === nickname.toLowerCase()
  );
}

// Get socket ID for any online user (presence map first, then activeUsers fallback)
export function getSocketIdByNickname(nickname: string): string | undefined {
  const presenceSocketId = onlinePresence.get(nickname.toLowerCase());
  if (presenceSocketId) return presenceSocketId;
  const activeUser = getActiveUserByNickname(nickname);
  return activeUser?.socketId;
}

export function initSocketServer(httpServer: HttpServer) {
  // In production, lock CORS to the actual domain; in dev allow all origins
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : null; // null = allow all (dev mode)

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: allowedOrigins
        ? (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
              callback(null, true);
            } else {
              callback(new Error("Not allowed by CORS"));
            }
          }
        : "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
    path: "/api/socket",
    // Connection limits to prevent DoS
    connectTimeout: 10000, // 10 seconds to complete handshake
    pingTimeout: 20000,
    pingInterval: 25000,
  });

  // IP-based connection rate limiting: max 10 connections per IP per minute
  const ipConnectionCounts = new Map<string, { count: number; resetAt: number }>();
  const MAX_CONNECTIONS_PER_IP = 10;
  const CONNECTION_WINDOW_MS = 60 * 1000; // 1 minute

  io.use((socket, next) => {
    const ip =
      (socket.handshake.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      socket.handshake.address ||
      "unknown";
    const now = Date.now();
    const entry = ipConnectionCounts.get(ip);
    if (!entry || now > entry.resetAt) {
      ipConnectionCounts.set(ip, { count: 1, resetAt: now + CONNECTION_WINDOW_MS });
      return next();
    }
    entry.count++;
    if (entry.count > MAX_CONNECTIONS_PER_IP) {
      console.warn(`[Socket] Connection rate limit exceeded for IP: ${ip}`);
      return next(new Error("Too many connections from this IP. Please wait."));
    }
    next();
  });

  // Store io instance for use by REST endpoints
  ioInstance = io;

  // Per-socket rate limiting: track message timestamps for flood prevention
  const socketMessageTimestamps = new Map<string, number[]>(); // socketId -> timestamps
  const RATE_LIMIT_WINDOW_MS = 5000; // 5 seconds
  const RATE_LIMIT_MAX_MESSAGES = 10; // max 10 messages per 5 seconds

  function isRateLimited(socketId: string): boolean {
    const now = Date.now();
    const timestamps = socketMessageTimestamps.get(socketId) || [];
    const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    recent.push(now);
    socketMessageTimestamps.set(socketId, recent);
    return recent.length > RATE_LIMIT_MAX_MESSAGES;
  }

  io.on("connection", (socket) => {
    // Get client IP address
    const ipAddress =
      (socket.handshake.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      socket.handshake.address ||
      "unknown";

    console.log(`[Socket] New connection: ${socket.id} from ${ipAddress}`);

    // ── Register presence (called immediately after socket connects, before joining a room) ──
    socket.on("register_presence", ({ nickname }: { nickname: string }) => {
      if (!nickname || typeof nickname !== "string") return;
      const key = nickname.toLowerCase();
      // Remove any old presence entry for this nickname
      for (const [k, v] of onlinePresence.entries()) {
        if (k === key && v !== socket.id) onlinePresence.delete(k);
      }
      onlinePresence.set(key, socket.id);
      console.log(`[Socket] Presence registered: ${nickname} (${socket.id})`);
    });

    // ── Rejoin room (after server restart / reconnect) ──────────────────────
    // Client sends this when socket reconnects and user was already in a room.
    // For super admin nicknames, re-adds them without password re-entry.
    socket.on("rejoin_room", async ({ nickname, roomId, role }: { nickname: string; roomId: number; role: string }) => {
      try {
        // Remove any existing entry for this socket
        activeUsers.delete(socket.id);
        const resolvedRole = isSuperAdminNickname(nickname) ? "super_admin" : (role === "moderator" ? "moderator" : "user");
        const user: ActiveUser = {
          socketId: socket.id,
          nickname,
          roomId,
          isMuted: true,
          isVoiceActive: false,
          isVoiceBanned: false,
          isTextMuted: false,
          role: resolvedRole as ActiveUser["role"],
          ipAddress,
          joinedAt: new Date(),
        };
        activeUsers.set(socket.id, user);
        socket.join(`room_${roomId}`);
        const roomUsers = getRoomUsers(roomId);
        const roomRecord = await getRoomById(roomId);
        const roomName = roomRecord?.name ?? "Now";
        socket.emit("room_joined", { roomId, roomName, nickname, users: roomUsers });
        const db = await getDb();
        if (db) {
          const recentMessages = await db.select().from(messages).where(eq(messages.roomId, roomId)).limit(50);
          socket.emit("message_history", recentMessages);
        }
        const freshUsersAfterRejoin = getRoomUsers(roomId);
        io.to(`room_${roomId}`).emit("users_updated", freshUsersAfterRejoin);
        socket.emit("users_updated", freshUsersAfterRejoin);
        console.log(`[Socket] ${nickname} (${resolvedRole}) rejoined room ${roomId} after reconnect`);
      } catch (err) {
        console.error("[Socket] rejoin_room error:", err);
      }
    });

    // ── Join room ─────────────────────────────────────────────────────────────
    socket.on("join_room", async ({ nickname, roomId, token }: { nickname: string; roomId: number; token?: string }) => {
      try {
        // Input validation and sanitization
        if (!nickname || typeof nickname !== "string") {
          socket.emit("error", { message: "Invalid nickname." });
          return;
        }
        // Sanitize: trim whitespace, strip HTML/script tags, limit length
        const sanitizedNickname = nickname.trim().replace(/<[^>]*>/g, "").slice(0, 30);
        if (!sanitizedNickname || sanitizedNickname.length < 2) {
          socket.emit("error", { message: "Nickname must be at least 2 characters." });
          return;
        }
        // Only allow alphanumeric, underscores, hyphens, and spaces
        if (!/^[a-zA-Z0-9_\-\s؀-ۿݐ-ݿ]+$/.test(sanitizedNickname)) {
          socket.emit("error", { message: "Nickname contains invalid characters." });
          return;
        }
        nickname = sanitizedNickname;
        if (typeof roomId !== "number" || roomId < 1) {
          socket.emit("error", { message: "Invalid room." });
          return;
        }

        // Check if user is fully banned (not just voice-banned)
        const banStatus = await isUserBanned(nickname, ipAddress);
        if (banStatus.banned && !banStatus.voiceBanOnly) {
          socket.emit("error", { message: "You have been banned from this chat room." });
          return;
        }

        // Validate invite token if provided
        if (token) {
          const db = await getDb();
          if (db) {
            const tokenRecord = await db
              .select()
              .from(inviteTokens)
              .where(eq(inviteTokens.token, token))
              .limit(1);

            if (!tokenRecord.length || tokenRecord[0].expiresAt < new Date()) {
              socket.emit("error", { message: "Invalid or expired invite link" });
              return;
            }
          }
        }

        // Check if nickname is already taken
        const existingUser = Array.from(activeUsers.values()).find(
          (u) => u.nickname.toLowerCase() === nickname.toLowerCase() && u.roomId === roomId
        );
        if (existingUser) {
          // Remove old entry for same nickname (reconnect scenario)
          const oldEntry = Array.from(activeUsers.entries()).find(
            ([, u]) => u.nickname.toLowerCase() === nickname.toLowerCase() && u.roomId === roomId
          );
          if (oldEntry) activeUsers.delete(oldEntry[0]);
        }

        // Auto-detect super admin by nickname — no password required
        const role = isSuperAdminNickname(nickname) ? "super_admin" : await getUserRole(nickname);

        const user: ActiveUser = {
          socketId: socket.id,
          nickname,
          roomId,
          isMuted: true,
          isVoiceActive: false,
          isVoiceBanned: banStatus.voiceBanOnly,
          isTextMuted: false,
          role,
          ipAddress,
          joinedAt: new Date(),
        };
        activeUsers.set(socket.id, user);
        socket.join(`room_${roomId}`);

        const roomUsers = getRoomUsers(roomId);
        const roomRecord = await getRoomById(roomId);
        const roomName = roomRecord?.name ?? "Now";

        socket.emit("room_joined", { roomId, roomName, nickname, users: roomUsers });

        // Load recent messages
        const db = await getDb();
        if (db) {
          const recentMessages = await db
            .select()
            .from(messages)
            .where(eq(messages.roomId, roomId))
            .limit(50);
          socket.emit("message_history", recentMessages);
        }

        // Deliver offline PMs stored while user was offline
        if (db) {
          try {
            const { and, eq: eqOp } = await import("drizzle-orm");
            const pendingPMs = await db
              .select()
              .from(offlineMessages)
              .where(and(
                eqOp(offlineMessages.recipientUsername, nickname.toLowerCase()),
                eqOp(offlineMessages.isRead, false)
              ))
              .limit(50);

            if (pendingPMs.length > 0) {
              // Deliver each stored PM to the user
              for (const pm of pendingPMs) {
                const deliveredMsg = {
                  id: pm.id,
                  roomId,
                  senderNickname: pm.senderNickname,
                  recipientNickname: nickname,
                  content: pm.content,
                  type: "private" as const,
                  createdAt: pm.createdAt,
                  isOffline: true,
                };
                socket.emit("private_message", deliveredMsg);
              }
              // Mark all as read
              await db
                .update(offlineMessages)
                .set({ isRead: true })
                .where(eqOp(offlineMessages.recipientUsername, nickname.toLowerCase()));
              // Notify user of offline PMs
              socket.emit("offline_pms_delivered", { count: pendingPMs.length });
              console.log(`[Socket] Delivered ${pendingPMs.length} offline PMs to ${nickname}`);
            }
          } catch (pmErr) {
            console.error("[Socket] Failed to deliver offline PMs:", pmErr);
          }
        }

        const systemMsg = {
          id: Date.now(),
          roomId,
          senderNickname: "system",
          content: role === "super_admin"
            ? `${nickname} has entered the room. 👑`
            : `${nickname} has entered the room.`,
          type: "system" as const,
          createdAt: new Date(),
        };
        io.to(`room_${roomId}`).emit("system_message", systemMsg);
        // Get a fresh users list (not the stale snapshot from before async DB ops)
        const freshRoomUsers = getRoomUsers(roomId);
        io.to(`room_${roomId}`).emit("users_updated", freshRoomUsers);
        // Also send a fresh list directly to the new joiner in case they missed the broadcast
        socket.emit("users_updated", freshRoomUsers);

        // Notify friends that this user came online
        try {
          const { getFriends } = await import("./db");
          const friendList = await getFriends(nickname);
          for (const friend of friendList) {
            if (friend.status === "accepted") {
              const friendSocket = getActiveUserByNickname(friend.username);
              if (friendSocket) {
                io.to(friendSocket.socketId).emit("friend_status_changed", { nickname, isOnline: true });
              }
            }
          }
        } catch {}

        console.log(`[Socket] ${nickname} (${role}) joined room ${roomId}`);
      } catch (err) {
        console.error("[Socket] join_room error:", err);
        socket.emit("error", { message: "Failed to join room" });
      }
    });

    // ── Send public message ───────────────────────────────────────────────────
    socket.on("send_message", async ({ content }: { content: string }) => {
      const user = activeUsers.get(socket.id);
      if (!user) return;
      if (user.isTextMuted) {
        socket.emit("error", { message: "You have been muted by a moderator." });
        return;
      }

      // Rate limiting: prevent message flooding
      if (isRateLimited(socket.id)) {
        socket.emit("error", { message: "You are sending messages too fast. Please slow down." });
        return;
      }

      // Input validation and sanitization
      if (!content || typeof content !== "string") return;
      const sanitized = content.trim().slice(0, 2000); // max 2000 chars
      if (!sanitized) return;

      try {
        const db = await getDb();
        let savedId = Date.now();
        if (db) {
          const result = await db.insert(messages).values({
            roomId: user.roomId,
            senderNickname: user.nickname,
            content: sanitized,
            type: "public",
          }).returning({ id: messages.id });
          savedId = result[0]?.id ?? savedId;
        }

        const msg = {
          id: savedId,
          roomId: user.roomId,
          senderNickname: user.nickname,
          content: sanitized,
          type: "public",
          createdAt: new Date(),
        };
        // Use socket.to() to broadcast to others (excludes sender), then emit to sender
        // This prevents the sender from receiving the message twice
        socket.to(`room_${user.roomId}`).emit("new_message", msg);
        socket.emit("new_message", msg);
      } catch (err) {
        console.error("[Socket] send_message error:", err);
      }
    });

    // ── E2EE: Publish public key ─────────────────────────────────────────────
    socket.on("publish_public_key", ({ publicKeyJwk }: { publicKeyJwk: string }) => {
      const user = activeUsers.get(socket.id);
      if (!user || !publicKeyJwk) return;
      // Store the public key on the user object
      user.publicKeyJwk = publicKeyJwk;
      // Broadcast to everyone else in the room so they can encrypt messages to this user
      socket.to(`room_${user.roomId}`).emit("public_key_broadcast", {
        nickname: user.nickname,
        publicKeyJwk,
      });
      // Also send all existing users' public keys back to this user
      const roomSockets = io.sockets.adapter.rooms.get(`room_${user.roomId}`);
      if (roomSockets) {
        for (const sid of roomSockets) {
          if (sid === socket.id) continue;
          const otherSocket = io.sockets.sockets.get(sid);
          const otherUser = activeUsers.get(sid);
          const otherKey = otherUser?.publicKeyJwk;
          if (otherUser && otherKey) {
            socket.emit("public_key_broadcast", {
              nickname: otherUser.nickname,
              publicKeyJwk: otherKey,
            });
          }
        }
      }
    });

    // ── Send private message ──────────────────────────────────────────────────
    socket.on("send_private_message", async ({ recipientNickname, content }: { recipientNickname: string; content: string }) => {
      const user = activeUsers.get(socket.id);
      if (!user) return;

      try {
        const db = await getDb();
        let savedId = Date.now();
        if (db) {
          const result = await db.insert(messages).values({
            roomId: user.roomId,
            senderNickname: user.nickname,
            content,
            type: "private",
            recipientNickname,
          }).returning({ id: messages.id });
          savedId = result[0]?.id ?? savedId;
        }

        const msg = {
          id: savedId,
          roomId: user.roomId,
          senderNickname: user.nickname,
          recipientNickname,
          content,
          type: "private",
          createdAt: new Date(),
        };

        socket.emit("private_message", msg);

        // Find recipient across ALL rooms (PMs are cross-room) — case-insensitive
        const recipientSocket = Array.from(activeUsers.values()).find(
          (u) => u.nickname.toLowerCase() === recipientNickname.toLowerCase()
        );
        if (recipientSocket) {
          // Deliver the PM to the recipient
          io.to(recipientSocket.socketId).emit("private_message", msg);
          // Also relay sender's public key to recipient (for cross-room E2EE)
          if (user.publicKeyJwk) {
            io.to(recipientSocket.socketId).emit("public_key_broadcast", {
              nickname: user.nickname,
              publicKeyJwk: user.publicKeyJwk,
            });
          }
          // And relay recipient's public key back to sender (for E2EE reply)
          if (recipientSocket.publicKeyJwk) {
            socket.emit("public_key_broadcast", {
              nickname: recipientSocket.nickname,
              publicKeyJwk: recipientSocket.publicKeyJwk,
            });
          }
        } else {
          // Recipient is offline — store PM for delivery on next login
          if (db) {
            try {
              await db.insert(offlineMessages).values({
                senderNickname: user.nickname,
                recipientUsername: recipientNickname.toLowerCase(),
                content,
              });
              console.log(`[Socket] Stored offline PM from ${user.nickname} to ${recipientNickname}`);
            } catch (offlineErr) {
              console.error("[Socket] Failed to store offline PM:", offlineErr);
            }
          }
        }
      } catch (err) {
        console.error("[Socket] send_private_message error:", err);
      }
    });

    // ── Voice: toggle mute ────────────────────────────────────────────────────
    socket.on("toggle_mute", ({ isMuted }: { isMuted: boolean }) => {
      const user = activeUsers.get(socket.id);
      if (!user) return;
      if (user.isVoiceBanned) {
        socket.emit("error", { message: "You have been voice-banned by the admin." });
        return;
      }
      user.isMuted = isMuted;
      user.isVoiceActive = !isMuted;
      io.to(`room_${user.roomId}`).emit("users_updated", getRoomUsers(user.roomId));
    });

    // ── WebRTC signaling ──────────────────────────────────────────────────────
    socket.on("webrtc_offer", ({ targetNickname, offer }: { targetNickname: string; offer: RTCSessionDescriptionInit }) => {
      const user = activeUsers.get(socket.id);
      if (!user || user.isVoiceBanned) return;
      const target = Array.from(activeUsers.values()).find(
        (u) => u.nickname === targetNickname && u.roomId === user.roomId
      );
      if (target) {
        io.to(target.socketId).emit("webrtc_offer", { fromNickname: user.nickname, offer });
      }
    });

    socket.on("webrtc_answer", ({ targetNickname, answer }: { targetNickname: string; answer: RTCSessionDescriptionInit }) => {
      const user = activeUsers.get(socket.id);
      if (!user) return;
      const target = Array.from(activeUsers.values()).find(
        (u) => u.nickname === targetNickname && u.roomId === user.roomId
      );
      if (target) {
        io.to(target.socketId).emit("webrtc_answer", { fromNickname: user.nickname, answer });
      }
    });

    socket.on("webrtc_ice_candidate", ({ targetNickname, candidate }: { targetNickname: string; candidate: RTCIceCandidateInit }) => {
      const user = activeUsers.get(socket.id);
      if (!user) return;
      const target = Array.from(activeUsers.values()).find(
        (u) => u.nickname === targetNickname && u.roomId === user.roomId
      );
      if (target) {
        io.to(target.socketId).emit("webrtc_ice_candidate", { fromNickname: user.nickname, candidate });
      }
    });

    socket.on("request_peers", () => {
      const user = activeUsers.get(socket.id);
      if (!user) return;
      const peers = Array.from(activeUsers.values())
        .filter((u) => u.roomId === user.roomId && u.socketId !== socket.id)
        .map((u) => u.nickname);
      socket.emit("peers_list", { peers });
    });

    // ── Private voice call signaling ─────────────────────────────────────────
    socket.on("private_call_request", ({ targetNickname, isVideo }: { targetNickname: string; isVideo?: boolean }) => {
      const caller = activeUsers.get(socket.id);
      if (!caller) return;
      // Cross-room: find by nickname only (no room restriction)
      const target = Array.from(activeUsers.values()).find(
        (u) => u.nickname.toLowerCase() === targetNickname.toLowerCase()
      );
      if (target) {
        io.to(target.socketId).emit("private_call_incoming", { fromNickname: caller.nickname, isVideo: !!isVideo });
      } else {
        socket.emit("private_call_rejected", { fromNickname: targetNickname, reason: "User not found or offline" });
      }
    });

    socket.on("private_call_accept", ({ targetNickname, isVideo }: { targetNickname: string; isVideo?: boolean }) => {
      const accepter = activeUsers.get(socket.id);
      if (!accepter) return;
      const target = Array.from(activeUsers.values()).find(
        (u) => u.nickname.toLowerCase() === targetNickname.toLowerCase()
      );
      if (target) {
        io.to(target.socketId).emit("private_call_accepted", { fromNickname: accepter.nickname, isVideo: !!isVideo });
      }
    });

    socket.on("private_call_reject", ({ targetNickname }: { targetNickname: string }) => {
      const rejecter = activeUsers.get(socket.id);
      if (!rejecter) return;
      const target = Array.from(activeUsers.values()).find(
        (u) => u.nickname.toLowerCase() === targetNickname.toLowerCase()
      );
      if (target) {
        io.to(target.socketId).emit("private_call_rejected", { fromNickname: rejecter.nickname, reason: "Call declined" });
      }
    });

    socket.on("private_call_end", ({ targetNickname }: { targetNickname: string }) => {
      const ender = activeUsers.get(socket.id);
      if (!ender) return;
      const target = Array.from(activeUsers.values()).find(
        (u) => u.nickname.toLowerCase() === targetNickname.toLowerCase()
      );
      if (target) {
        io.to(target.socketId).emit("private_call_ended", { fromNickname: ender.nickname });
      }
    });

    // Private WebRTC signaling (cross-room — no roomId restriction)
    socket.on("private_webrtc_offer", ({ targetNickname, offer }: { targetNickname: string; offer: RTCSessionDescriptionInit }) => {
      const user = activeUsers.get(socket.id);
      if (!user) return;
      const target = Array.from(activeUsers.values()).find(
        (u) => u.nickname.toLowerCase() === targetNickname.toLowerCase()
      );
      if (target) {
        io.to(target.socketId).emit("private_webrtc_offer", { fromNickname: user.nickname, offer });
      }
    });

    socket.on("private_webrtc_answer", ({ targetNickname, answer }: { targetNickname: string; answer: RTCSessionDescriptionInit }) => {
      const user = activeUsers.get(socket.id);
      if (!user) return;
      const target = Array.from(activeUsers.values()).find(
        (u) => u.nickname.toLowerCase() === targetNickname.toLowerCase()
      );
      if (target) {
        io.to(target.socketId).emit("private_webrtc_answer", { fromNickname: user.nickname, answer });
      }
    });

    socket.on("private_webrtc_ice", ({ targetNickname, candidate }: { targetNickname: string; candidate: RTCIceCandidateInit }) => {
      const user = activeUsers.get(socket.id);
      if (!user) return;
      const target = Array.from(activeUsers.values()).find(
        (u) => u.nickname.toLowerCase() === targetNickname.toLowerCase()
      );
      if (target) {
        io.to(target.socketId).emit("private_webrtc_ice", { fromNickname: user.nickname, candidate });
      }
    });

    // ── Invite to Room ──────────────────────────────────────────────────────
    socket.on("invite_to_room", ({ targetNickname, roomId: inviteRoomId, roomName: inviteRoomName }: { targetNickname: string; roomId: number; roomName: string }) => {
      const inviter = activeUsers.get(socket.id);
      if (!inviter) return;
      // Find target user anywhere (any room)
      const targetEntry = Array.from(activeUsers.entries()).find(
        ([, u]) => u.nickname === targetNickname
      );
      if (!targetEntry) {
        socket.emit("error", { message: `${targetNickname} is not currently online` });
        return;
      }
      const [targetSocketId] = targetEntry;
      io.to(targetSocketId).emit("room_invite", {
        fromNickname: inviter.nickname,
        roomId: inviteRoomId,
        roomName: inviteRoomName,
      });
      socket.emit("invite_sent", { targetNickname, roomName: inviteRoomName });
      console.log(`[Socket] ${inviter.nickname} invited ${targetNickname} to room ${inviteRoomId} (${inviteRoomName})`);
    });
    socket.on("invite_response", ({ fromNickname, accepted }: { fromNickname: string; accepted: boolean }) => {
      const responder = activeUsers.get(socket.id);
      if (!responder) return;
      const inviterEntry = Array.from(activeUsers.entries()).find(
        ([, u]) => u.nickname === fromNickname
      );
      if (inviterEntry) {
        const [inviterSocketId] = inviterEntry;
        io.to(inviterSocketId).emit("invite_response_result", {
          fromNickname: responder.nickname,
          accepted,
        });
      }
    });
    // ── Admin: kick user ──────────────────────────────────────────────────────
    socket.on("admin_kick", ({ targetNickname }: { targetNickname: string }) => {
      const admin = activeUsers.get(socket.id);
      if (!admin) return;
      if (admin.role !== "super_admin" && admin.role !== "moderator") {
        socket.emit("error", { message: "Insufficient permissions" });
        return;
      }

      const target = Array.from(activeUsers.values()).find(
        (u) => u.nickname === targetNickname && u.roomId === admin.roomId
      );
      if (!target) {
        socket.emit("error", { message: "User not found" });
        return;
      }
      // Cannot kick super admin
      if (target.role === "super_admin") {
        socket.emit("error", { message: "Cannot kick the super admin" });
        return;
      }
      // Moderators cannot kick other moderators
      if (admin.role === "moderator" && target.role === "moderator") {
        socket.emit("error", { message: "Moderators cannot kick other moderators" });
        return;
      }

      io.to(target.socketId).emit("kicked", { reason: `You were kicked by ${admin.nickname}` });
      activeUsers.delete(target.socketId);

      const systemMsg = {
        id: Date.now(),
        roomId: admin.roomId,
        senderNickname: "system",
        content: `${targetNickname} was kicked from the room.`,
        type: "system" as const,
        createdAt: new Date(),
      };
      io.to(`room_${admin.roomId}`).emit("system_message", systemMsg);
      io.to(`room_${admin.roomId}`).emit("users_updated", getRoomUsers(admin.roomId));
    });

    // ── Admin: ban user ───────────────────────────────────────────────────────
    socket.on("admin_ban", async ({ targetNickname, reason, voiceBanOnly }: { targetNickname: string; reason?: string; voiceBanOnly?: boolean }) => {
      const admin = activeUsers.get(socket.id);
      if (!admin || admin.role !== "super_admin") {
        socket.emit("error", { message: "Only Super Admin can ban users" });
        return;
      }

      const target = Array.from(activeUsers.values()).find(
        (u) => u.nickname === targetNickname && u.roomId === admin.roomId
      );

      try {
        await banUser({
          nickname: targetNickname,
          ipAddress: target?.ipAddress,
          reason,
          bannedBy: admin.nickname,
          voiceBanOnly: voiceBanOnly ?? false,
        });

        if (target) {
          if (voiceBanOnly) {
            // Voice-ban: user stays in room but mic is disabled
            target.isVoiceBanned = true;
            target.isMuted = true;
            target.isVoiceActive = false;
            io.to(target.socketId).emit("voice_banned", { message: "You have been voice-banned by the admin." });
            io.to(`room_${admin.roomId}`).emit("users_updated", getRoomUsers(admin.roomId));
          } else {
            // Full ban: kick them out
            io.to(target.socketId).emit("kicked", { reason: `You have been banned. ${reason || ""}` });
            activeUsers.delete(target.socketId);
            io.to(`room_${admin.roomId}`).emit("users_updated", getRoomUsers(admin.roomId));
          }
        }

        const actionText = voiceBanOnly ? "voice-banned" : "banned";
        const systemMsg = {
          id: Date.now(),
          roomId: admin.roomId,
          senderNickname: "system",
          content: `${targetNickname} has been ${actionText} by the admin.`,
          type: "system" as const,
          createdAt: new Date(),
        };
        io.to(`room_${admin.roomId}`).emit("system_message", systemMsg);

        socket.emit("admin_action_result", { success: true, message: `${targetNickname} has been ${actionText}.` });
      } catch (err) {
        console.error("[Socket] admin_ban error:", err);
        socket.emit("admin_action_result", { success: false, message: "Ban failed" });
      }
    });

    // ── Admin: unban user ─────────────────────────────────────────────────────
    socket.on("admin_unban", async ({ targetNickname }: { targetNickname: string }) => {
      const admin = activeUsers.get(socket.id);
      if (!admin || admin.role !== "super_admin") {
        socket.emit("error", { message: "Only Super Admin can unban users" });
        return;
      }
      try {
        await unbanUser(targetNickname);
        socket.emit("admin_action_result", { success: true, message: `${targetNickname} has been unbanned.` });
      } catch (err) {
        socket.emit("admin_action_result", { success: false, message: "Unban failed" });
      }
    });

    // ── Admin: get banned list ────────────────────────────────────────────────
    socket.on("admin_get_banned", async () => {
      const admin = activeUsers.get(socket.id);
      if (!admin || admin.role !== "super_admin") return;
      const banned = await getBannedUsers();
      socket.emit("admin_banned_list", banned);
    });

    // ── Admin: promote to moderator ───────────────────────────────────────────
    socket.on("admin_promote", async ({ targetNickname }: { targetNickname: string }) => {
      const admin = activeUsers.get(socket.id);
      if (!admin || admin.role !== "super_admin") {
        socket.emit("error", { message: "Only Super Admin can promote users" });
        return;
      }

      try {
        await promoteToModerator(targetNickname, admin.nickname);

        // Update in-memory role if user is online
        const target = Array.from(activeUsers.values()).find(
          (u) => u.nickname === targetNickname && u.roomId === admin.roomId
        );
        if (target) {
          target.role = "moderator";
          io.to(target.socketId).emit("role_updated", { role: "moderator", message: "You have been promoted to Moderator!" });
        }

        io.to(`room_${admin.roomId}`).emit("users_updated", getRoomUsers(admin.roomId));
        socket.emit("admin_action_result", { success: true, message: `${targetNickname} is now a Moderator.` });
      } catch (err) {
        socket.emit("admin_action_result", { success: false, message: "Promotion failed" });
      }
    });

    // ── Admin: demote moderator ───────────────────────────────────────────────
    socket.on("admin_demote", async ({ targetNickname }: { targetNickname: string }) => {
      const admin = activeUsers.get(socket.id);
      if (!admin || admin.role !== "super_admin") {
        socket.emit("error", { message: "Only Super Admin can demote users" });
        return;
      }

      try {
        await demoteUser(targetNickname);
        const target = Array.from(activeUsers.values()).find(
          (u) => u.nickname === targetNickname && u.roomId === admin.roomId
        );
        if (target) {
          target.role = "user";
          io.to(target.socketId).emit("role_updated", { role: "user", message: "Your moderator role has been removed." });
        }
        io.to(`room_${admin.roomId}`).emit("users_updated", getRoomUsers(admin.roomId));
        socket.emit("admin_action_result", { success: true, message: `${targetNickname} has been demoted.` });
      } catch (err) {
        socket.emit("admin_action_result", { success: false, message: "Demotion failed" });
      }
    });

    // ── Moderator: mute user text ─────────────────────────────────────────────
    socket.on("mod_mute_text", ({ targetNickname }: { targetNickname: string }) => {
      const mod = activeUsers.get(socket.id);
      if (!mod || (mod.role !== "super_admin" && mod.role !== "moderator")) {
        socket.emit("error", { message: "Insufficient permissions" });
        return;
      }

      const target = Array.from(activeUsers.values()).find(
        (u) => u.nickname === targetNickname && u.roomId === mod.roomId
      );
      if (!target || target.role === "super_admin") return;

      target.isTextMuted = true;
      io.to(target.socketId).emit("text_muted", { message: "You have been muted by a moderator." });
      io.to(`room_${mod.roomId}`).emit("users_updated", getRoomUsers(mod.roomId));
      socket.emit("admin_action_result", { success: true, message: `${targetNickname} has been muted.` });
    });

    // ── Moderator: unmute user text ───────────────────────────────────────────
    socket.on("mod_unmute_text", ({ targetNickname }: { targetNickname: string }) => {
      const mod = activeUsers.get(socket.id);
      if (!mod || (mod.role !== "super_admin" && mod.role !== "moderator")) return;

      const target = Array.from(activeUsers.values()).find(
        (u) => u.nickname === targetNickname && u.roomId === mod.roomId
      );
      if (!target) return;

      target.isTextMuted = false;
      io.to(target.socketId).emit("text_unmuted", { message: "You have been unmuted." });
      io.to(`room_${mod.roomId}`).emit("users_updated", getRoomUsers(mod.roomId));
      socket.emit("admin_action_result", { success: true, message: `${targetNickname} has been unmuted.` });
    });

    // ── Admin: get all moderators ─────────────────────────────────────────────
    socket.on("admin_get_moderators", async () => {
      const admin = activeUsers.get(socket.id);
      if (!admin || admin.role !== "super_admin") return;
      const mods = await getAllModerators();
      socket.emit("admin_moderators_list", mods);
    });

    // ── Admin: clear room messages ────────────────────────────────────────────
    socket.on("clear_room", async () => {
      const user = activeUsers.get(socket.id);
      console.log(`[Socket] clear_room received from ${socket.id}, user: ${user?.nickname}, role: ${user?.role}`);
      if (!user) {
        socket.emit("error", { message: "Not in room. Please rejoin." });
        return;
      }
      // Only super_admin or moderator can clear chat
      if (user.role !== "super_admin" && user.role !== "moderator") {
        socket.emit("error", { message: "Only admins can clear the chat." });
        return;
      }
      try {
        const db = await getDb();
        if (db) {
          await db.delete(messages).where(eq(messages.roomId, user.roomId));
          console.log(`[Socket] Deleted messages for room ${user.roomId}`);
        } else {
          console.warn("[Socket] No DB connection for clear_room - clearing in memory only");
        }
        // Broadcast room_cleared to ALL users in the room (io.to includes sender)
        // Do NOT emit separately to sender — that would cause double clear
        io.to(`room_${user.roomId}`).emit("room_cleared");
        console.log(`[Socket] Room ${user.roomId} cleared by ${user.nickname}`);
      } catch (err) {
        console.error("[Socket] clear_room error:", err);
        socket.emit("error", { message: "Failed to clear chat: " + (err as Error).message });
      }
    });

    // ── Switch room (without disconnecting) ──────────────────────────────────
    socket.on("switch_room", async ({ roomId: newRoomId }: { roomId: number }) => {
      const user = activeUsers.get(socket.id);
      if (!user) return;
      const oldRoomId = user.roomId;
      if (oldRoomId === newRoomId) return;

      try {
        // Leave old room
        socket.leave(`room_${oldRoomId}`);
        activeUsers.delete(socket.id);
        const leaveMsg = {
          id: Date.now(),
          roomId: oldRoomId,
          senderNickname: "system",
          content: `${user.nickname} has left the room.`,
          type: "system" as const,
          createdAt: new Date(),
        };
        io.to(`room_${oldRoomId}`).emit("system_message", leaveMsg);
        io.to(`room_${oldRoomId}`).emit("users_updated", getRoomUsers(oldRoomId));

        // Join new room
        const updatedUser: ActiveUser = { ...user, roomId: newRoomId };
        activeUsers.set(socket.id, updatedUser);
        socket.join(`room_${newRoomId}`);

        const roomUsers = getRoomUsers(newRoomId);
        const roomRecord = await getRoomById(newRoomId);
        const roomName = roomRecord?.name ?? "Now";

        socket.emit("room_joined", { roomId: newRoomId, roomName, nickname: user.nickname, users: roomUsers });

        // Load recent messages for new room
        const db = await getDb();
        if (db) {
          const recentMessages = await db
            .select()
            .from(messages)
            .where(eq(messages.roomId, newRoomId))
            .limit(50);
          socket.emit("message_history", recentMessages);
        }

        const joinMsg = {
          id: Date.now() + 1,
          roomId: newRoomId,
          senderNickname: "system",
          content: `${user.nickname} has entered the room.`,
          type: "system" as const,
          createdAt: new Date(),
        };
        io.to(`room_${newRoomId}`).emit("system_message", joinMsg);
        io.to(`room_${newRoomId}`).emit("users_updated", getRoomUsers(newRoomId));

        console.log(`[Socket] ${user.nickname} switched from room ${oldRoomId} to room ${newRoomId}`);
      } catch (err) {
        console.error("[Socket] switch_room error:", err);
        socket.emit("error", { message: "Failed to switch room" });
      }
    });

    // ── Request fresh users list ─────────────────────────────────────────────
    socket.on("request_users", () => {
      const user = activeUsers.get(socket.id);
      if (!user) return;
      socket.emit("users_updated", getRoomUsers(user.roomId));
    });

    // ── Disconnect ────────────────────────────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
      // Clean up rate limit tracking for this socket
      socketMessageTimestamps.delete(socket.id);

      // Remove from global presence map
      for (const [key, sid] of onlinePresence.entries()) {
        if (sid === socket.id) {
          onlinePresence.delete(key);
          break;
        }
      }

      const user = activeUsers.get(socket.id);
      if (user) {
        activeUsers.delete(socket.id);

        const systemMsg = {
          id: Date.now(),
          roomId: user.roomId,
          senderNickname: "system",
          content: `${user.nickname} has left the room.`,
          type: "system" as const,
          createdAt: new Date(),
        };
        io.to(`room_${user.roomId}`).emit("system_message", systemMsg);
        io.to(`room_${user.roomId}`).emit("users_updated", getRoomUsers(user.roomId));
        io.to(`room_${user.roomId}`).emit("peer_disconnected", { nickname: user.nickname });

        // Notify friends that this user went offline (async IIFE - best effort)
        const offlineNickname = user.nickname;
        (async () => {
          try {
            const { getFriends } = await import("./db");
            const friendList = await getFriends(offlineNickname);
            for (const friend of friendList) {
              if (friend.status === "accepted") {
                // Use presence map to find friend's socket (works even if not in a room)
                const friendSocketId = getSocketIdByNickname(friend.username);
                if (friendSocketId) {
                  io.to(friendSocketId).emit("friend_status_changed", { nickname: offlineNickname, isOnline: false });
                }
              }
            }
          } catch {}
        })();

        console.log(`[Socket] ${user.nickname} left room ${user.roomId}`);
      }
    });
  });

  return io;
}
