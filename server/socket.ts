import { Server as SocketIOServer } from "socket.io";
import { Server as HttpServer } from "http";
import { getDb } from "./db";
import { messages, inviteTokens } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import {
  SUPER_ADMIN_NICKNAME,
  isSuperAdminPasswordSet,
  setSuperAdminPassword,
  verifySuperAdminPassword,
  isUserBanned,
  banUser,
  unbanUser,
  getBannedUsers,
  promoteToModerator,
  demoteUser,
  getUserRole,
  getAllModerators,
  sendPasswordResetEmail,
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
}

const activeUsers = new Map<string, ActiveUser>(); // socketId -> user

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

export function initSocketServer(httpServer: HttpServer) {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
    path: "/api/socket",
  });

  io.on("connection", (socket) => {
    // Get client IP address
    const ipAddress =
      (socket.handshake.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      socket.handshake.address ||
      "unknown";

    console.log(`[Socket] New connection: ${socket.id} from ${ipAddress}`);

    // ── Join room ─────────────────────────────────────────────────────────────
    socket.on("join_room", async ({ nickname, roomId, token }: { nickname: string; roomId: number; token?: string }) => {
      try {
        // Block reserved super admin nickname from being used by others
        if (nickname.toLowerCase() === SUPER_ADMIN_NICKNAME.toLowerCase()) {
          // The actual Ammar will authenticate separately via "super_admin_auth"
          // Here we just block the join until auth is confirmed
          socket.emit("require_super_admin_auth", {
            isPasswordSet: await isSuperAdminPasswordSet(),
          });
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
          socket.emit("error", { message: "Nickname already taken in this room" });
          return;
        }

        const role = await getUserRole(nickname);

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

        socket.emit("room_joined", { roomId, nickname, users: roomUsers });

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

        const systemMsg = {
          id: Date.now(),
          roomId,
          senderNickname: "system",
          content: `${nickname} has entered the room.`,
          type: "system" as const,
          createdAt: new Date(),
        };
        io.to(`room_${roomId}`).emit("system_message", systemMsg);
        io.to(`room_${roomId}`).emit("users_updated", roomUsers);

        console.log(`[Socket] ${nickname} (${role}) joined room ${roomId}`);
      } catch (err) {
        console.error("[Socket] join_room error:", err);
        socket.emit("error", { message: "Failed to join room" });
      }
    });

    // ── Super Admin authentication ────────────────────────────────────────────
    socket.on("super_admin_auth", async ({ password, isSetup, roomId }: { password: string; isSetup: boolean; roomId: number }) => {
      try {
        const passwordSet = await isSuperAdminPasswordSet();

        if (isSetup && !passwordSet) {
          // First-time setup
          if (!password || password.length < 6) {
            socket.emit("super_admin_auth_result", { success: false, message: "Password must be at least 6 characters" });
            return;
          }
          await setSuperAdminPassword(password);
          socket.emit("super_admin_auth_result", { success: true, message: "Super admin password set!" });
        } else {
          // Verify existing password
          const valid = await verifySuperAdminPassword(password);
          if (!valid) {
            socket.emit("super_admin_auth_result", { success: false, message: "Incorrect password" });
            return;
          }
          socket.emit("super_admin_auth_result", { success: true, message: "Welcome, Ammar!" });
        }

        // Now join the room as super admin
        const existingUser = Array.from(activeUsers.values()).find(
          (u) => u.nickname === SUPER_ADMIN_NICKNAME && u.roomId === roomId
        );
        if (existingUser) {
          socket.emit("error", { message: "Super admin is already in the room" });
          return;
        }

        const user: ActiveUser = {
          socketId: socket.id,
          nickname: SUPER_ADMIN_NICKNAME,
          roomId,
          isMuted: true,
          isVoiceActive: false,
          isVoiceBanned: false,
          isTextMuted: false,
          role: "super_admin",
          ipAddress,
          joinedAt: new Date(),
        };
        activeUsers.set(socket.id, user);
        socket.join(`room_${roomId}`);

        const roomUsers = getRoomUsers(roomId);
        socket.emit("room_joined", { roomId, nickname: SUPER_ADMIN_NICKNAME, users: roomUsers });

        const db = await getDb();
        if (db) {
          const recentMessages = await db.select().from(messages).where(eq(messages.roomId, roomId)).limit(50);
          socket.emit("message_history", recentMessages);
        }

        const systemMsg = {
          id: Date.now(),
          roomId,
          senderNickname: "system",
          content: `${SUPER_ADMIN_NICKNAME} has entered the room. 👑`,
          type: "system" as const,
          createdAt: new Date(),
        };
        io.to(`room_${roomId}`).emit("system_message", systemMsg);
        io.to(`room_${roomId}`).emit("users_updated", roomUsers);
      } catch (err) {
        console.error("[Socket] super_admin_auth error:", err);
        socket.emit("super_admin_auth_result", { success: false, message: "Authentication failed" });
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

      try {
        const db = await getDb();
        let savedId = Date.now();
        if (db) {
          const result = await db.insert(messages).values({
            roomId: user.roomId,
            senderNickname: user.nickname,
            content,
            type: "public",
          });
          savedId = (result[0] as any).insertId || savedId;
        }

        const msg = {
          id: savedId,
          roomId: user.roomId,
          senderNickname: user.nickname,
          content,
          type: "public",
          createdAt: new Date(),
        };
        io.to(`room_${user.roomId}`).emit("new_message", msg);
      } catch (err) {
        console.error("[Socket] send_message error:", err);
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
          });
          savedId = (result[0] as any).insertId || savedId;
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

        const recipientSocket = Array.from(activeUsers.values()).find(
          (u) => u.nickname === recipientNickname && u.roomId === user.roomId
        );
        if (recipientSocket) {
          io.to(recipientSocket.socketId).emit("private_message", msg);
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
      if (!user) return;
      if (user.role !== "super_admin") {
        socket.emit("error", { message: "Only Super Admin can clear the room" });
        return;
      }

      try {
        const db = await getDb();
        if (db) {
          await db.delete(messages).where(eq(messages.roomId, user.roomId));
        }
        io.to(`room_${user.roomId}`).emit("room_cleared");
        console.log(`[Socket] Room ${user.roomId} cleared by ${user.nickname}`);
      } catch (err) {
        console.error("[Socket] clear_room error:", err);
      }
    });

    // ── Admin: password reset email ───────────────────────────────────────────
    socket.on("admin_request_password_reset", async () => {
      const result = await sendPasswordResetEmail();
      socket.emit("admin_action_result", result);
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
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

        console.log(`[Socket] ${user.nickname} left room ${user.roomId}`);
      }
    });
  });

  return io;
}
