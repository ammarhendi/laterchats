import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

const FALLBACK_ROOMS = [
  { id: 1, name: "Now", description: "Pull up a chair and have a chat, mate!", isActive: true, createdAt: new Date() },
  { id: 2, name: "Arab World", description: "Arabic culture, news, and conversation.", isActive: true, createdAt: new Date() },
  { id: 3, name: "Issues", description: "Discuss world issues and current events.", isActive: true, createdAt: new Date() },
  { id: 4, name: "Social Media", description: "Talk about trends, platforms, and viral content.", isActive: true, createdAt: new Date() },
  { id: 5, name: "Chilling Out", description: "Relax, unwind, and have a good time.", isActive: true, createdAt: new Date() },
  { id: 6, name: "Dancing", description: "Music, moves, and dance culture.", isActive: true, createdAt: new Date() },
  { id: 7, name: "Blah Blah", description: "Just talk about anything and everything.", isActive: true, createdAt: new Date() },
  { id: 8, name: "Nothing Hidden", description: "Open, honest, and real conversations.", isActive: true, createdAt: new Date() },
  { id: 9, name: "For All", description: "A room for everyone — all topics welcome.", isActive: true, createdAt: new Date() },
  { id: 10, name: "Random", description: "Totally random conversations.", isActive: true, createdAt: new Date() },
];

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  chat: router({
    getAllRooms: publicProcedure.query(async () => {
      try {
        return await db.getAllRooms();
      } catch {
        return FALLBACK_ROOMS;
      }
    }),

    getRoom: publicProcedure.query(async () => {
      try {
        const room = await db.ensureDefaultRoom();
        return room;
      } catch {
        return FALLBACK_ROOMS[0];
      }
    }),

    getRoomById: publicProcedure
      .input(z.object({ roomId: z.number() }))
      .query(async ({ input }) => {
        try {
          return await db.getRoomById(input.roomId) ?? null;
        } catch {
          return FALLBACK_ROOMS.find((r) => r.id === input.roomId) ?? null;
        }
      }),

    validateToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        return db.validateInviteToken(input.token);
      }),

    generateInvite: publicProcedure
      .input(z.object({ adminPin: z.string().optional() }))
      .mutation(async ({ input }) => {
        const expectedPin = process.env.ADMIN_PIN || "later2024";
        if (input.adminPin && input.adminPin !== expectedPin) {
          throw new Error("Invalid admin PIN");
        }
        const room = await db.ensureDefaultRoom();
        const token = await db.generateInviteToken(room.id);
        return { token: token.token, expiresAt: token.expiresAt };
      }),

    getLatestInvite: publicProcedure.query(async () => {
      const room = await db.ensureDefaultRoom();
      const token = await db.getLatestInviteToken(room.id);
      if (!token) return null;
      return { token: token.token, expiresAt: token.expiresAt };
    }),

    getMessages: publicProcedure
      .input(z.object({ roomId: z.number() }))
      .query(async ({ input }) => {
        return db.getRecentMessages(input.roomId, 50);
      }),

    clearRoom: publicProcedure
      .input(z.object({ superAdminToken: z.string() }))
      .mutation(async ({ input }) => {
        const expectedToken = process.env.SUPER_ADMIN_CLEAR_TOKEN || "ammar_clear_2024";
        if (input.superAdminToken !== expectedToken) {
          throw new Error("Unauthorized");
        }
        const room = await db.ensureDefaultRoom();
        await db.clearRoomMessages(room.id);
        return { success: true };
      }),
  }),

  user: router({
    register: publicProcedure
      .input(z.object({
        username: z.string().min(3).max(32),
        password: z.string().min(6),
        email: z.string().email(),
        dateOfBirth: z.string().optional(), // YYYY-MM-DD
      }))
      .mutation(async ({ input }) => {
        return db.registerChatUser(input.username, input.password, input.email, input.dateOfBirth);
      }),

    login: publicProcedure
      .input(z.object({
        username: z.string(),
        password: z.string(),
      }))
      .mutation(async ({ input }) => {
        return db.loginChatUser(input.username, input.password);
      }),

    requestPasswordReset: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input }) => {
        const result = await db.requestPasswordReset(input.email);
        return { success: result.success, error: result.error };
      }),

    resetPassword: publicProcedure
      .input(z.object({ token: z.string(), newPassword: z.string().min(6) }))
      .mutation(async ({ input }) => {
        return db.resetPasswordWithToken(input.token, input.newPassword);
      }),
  }),
});

export type AppRouter = typeof appRouter;
