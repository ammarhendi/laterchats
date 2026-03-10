import { Server as SocketIOServer } from "socket.io";
import { Server as HttpServer } from "http";
import { getDb } from "./db";
import { messages, inviteTokens } from "../drizzle/schema";
import { eq, gt } from "drizzle-orm";

// In-memory store for active users in the room
interface ActiveUser {
  socketId: string;
  nickname: string;
  roomId: number;
  isMuted: boolean;
  isVoiceActive: boolean;
  joinedAt: Date;
}

const activeUsers = new Map<string, ActiveUser>(); // socketId -> user

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
    console.log(`[Socket] New connection: ${socket.id}`);

    // Join room with nickname
    socket.on("join_room", async ({ nickname, roomId, token }: { nickname: string; roomId: number; token?: string }) => {
      try {
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

        // Check if nickname is already taken in this room
        const existingUser = Array.from(activeUsers.values()).find(
          (u) => u.nickname.toLowerCase() === nickname.toLowerCase() && u.roomId === roomId
        );

        if (existingUser) {
          socket.emit("error", { message: "Nickname already taken in this room" });
          return;
        }

        // Add user to active users
        const user: ActiveUser = {
          socketId: socket.id,
          nickname,
          roomId,
          isMuted: true,
          isVoiceActive: false,
          joinedAt: new Date(),
        };
        activeUsers.set(socket.id, user);

        // Join the socket room
        socket.join(`room_${roomId}`);

        // Get current users in room
        const roomUsers = Array.from(activeUsers.values())
          .filter((u) => u.roomId === roomId)
          .map((u) => ({
            nickname: u.nickname,
            isMuted: u.isMuted,
            isVoiceActive: u.isVoiceActive,
          }));

        // Send room data to the joining user
        socket.emit("room_joined", {
          roomId,
          nickname,
          users: roomUsers,
        });

        // Load recent messages from DB
        const db = await getDb();
        if (db) {
          const recentMessages = await db
            .select()
            .from(messages)
            .where(eq(messages.roomId, roomId))
            .limit(50);
          socket.emit("message_history", recentMessages);
        }

        // Notify others that user joined
        const systemMsg = {
          id: Date.now(),
          roomId,
          senderNickname: "system",
          content: `${nickname} has entered the room.`,
          type: "system" as const,
          createdAt: new Date(),
        };
        io.to(`room_${roomId}`).emit("system_message", systemMsg);

        // Broadcast updated user list
        io.to(`room_${roomId}`).emit("users_updated", roomUsers);

        console.log(`[Socket] ${nickname} joined room ${roomId}`);
      } catch (err) {
        console.error("[Socket] join_room error:", err);
        socket.emit("error", { message: "Failed to join room" });
      }
    });

    // Send public message
    socket.on("send_message", async ({ content }: { content: string }) => {
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
            type: "public",
          });
          savedId = result[0].insertId || savedId;
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

    // Send private message
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
          savedId = result[0].insertId || savedId;
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

        // Send to sender and recipient only
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

    // Voice: toggle mute
    socket.on("toggle_mute", ({ isMuted }: { isMuted: boolean }) => {
      const user = activeUsers.get(socket.id);
      if (!user) return;

      user.isMuted = isMuted;
      user.isVoiceActive = !isMuted;

      const roomUsers = Array.from(activeUsers.values())
        .filter((u) => u.roomId === user.roomId)
        .map((u) => ({
          nickname: u.nickname,
          isMuted: u.isMuted,
          isVoiceActive: u.isVoiceActive,
        }));

      io.to(`room_${user.roomId}`).emit("users_updated", roomUsers);
    });

    // WebRTC signaling: offer
    socket.on("webrtc_offer", ({ targetNickname, offer }: { targetNickname: string; offer: RTCSessionDescriptionInit }) => {
      const user = activeUsers.get(socket.id);
      if (!user) return;

      const target = Array.from(activeUsers.values()).find(
        (u) => u.nickname === targetNickname && u.roomId === user.roomId
      );
      if (target) {
        io.to(target.socketId).emit("webrtc_offer", {
          fromNickname: user.nickname,
          offer,
        });
      }
    });

    // WebRTC signaling: answer
    socket.on("webrtc_answer", ({ targetNickname, answer }: { targetNickname: string; answer: RTCSessionDescriptionInit }) => {
      const user = activeUsers.get(socket.id);
      if (!user) return;

      const target = Array.from(activeUsers.values()).find(
        (u) => u.nickname === targetNickname && u.roomId === user.roomId
      );
      if (target) {
        io.to(target.socketId).emit("webrtc_answer", {
          fromNickname: user.nickname,
          answer,
        });
      }
    });

    // WebRTC signaling: ICE candidate
    socket.on("webrtc_ice_candidate", ({ targetNickname, candidate }: { targetNickname: string; candidate: RTCIceCandidateInit }) => {
      const user = activeUsers.get(socket.id);
      if (!user) return;

      const target = Array.from(activeUsers.values()).find(
        (u) => u.nickname === targetNickname && u.roomId === user.roomId
      );
      if (target) {
        io.to(target.socketId).emit("webrtc_ice_candidate", {
          fromNickname: user.nickname,
          candidate,
        });
      }
    });

    // Notify others when a new user joins (for WebRTC peer connection setup)
    socket.on("request_peers", () => {
      const user = activeUsers.get(socket.id);
      if (!user) return;

      const peers = Array.from(activeUsers.values())
        .filter((u) => u.roomId === user.roomId && u.socketId !== socket.id)
        .map((u) => u.nickname);

      socket.emit("peers_list", { peers });
    });

    // Admin: clear room messages for everyone
    socket.on("clear_room", async () => {
      const user = activeUsers.get(socket.id);
      if (!user) return;

      try {
        const db = await getDb();
        if (db) {
          const { messages: messagesTable } = await import("../drizzle/schema.js");
          const { eq: eqFn } = await import("drizzle-orm");
          await db.delete(messagesTable).where(eqFn(messagesTable.roomId, user.roomId));
        }
        // Notify all users in the room to clear their chat
        io.to(`room_${user.roomId}`).emit("room_cleared");
        console.log(`[Socket] Room ${user.roomId} cleared by ${user.nickname}`);
      } catch (err) {
        console.error("[Socket] clear_room error:", err);
      }
    });

    // Disconnect
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

        const roomUsers = Array.from(activeUsers.values())
          .filter((u) => u.roomId === user.roomId)
          .map((u) => ({
            nickname: u.nickname,
            isMuted: u.isMuted,
            isVoiceActive: u.isVoiceActive,
          }));

        io.to(`room_${user.roomId}`).emit("users_updated", roomUsers);
        io.to(`room_${user.roomId}`).emit("peer_disconnected", { nickname: user.nickname });

        console.log(`[Socket] ${user.nickname} left room ${user.roomId}`);
      }
    });
  });

  return io;
}
