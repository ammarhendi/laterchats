import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

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
    getRoom: publicProcedure.query(async () => {
      try {
        const room = await db.ensureDefaultRoom();
        return room;
      } catch {
        return { id: 1, name: "Now", description: "Pull up a chair and have a chat, mate!", isActive: true, createdAt: new Date() };
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
        // Simple admin PIN check — default PIN is "later2024" if not configured
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
  }),
});

export type AppRouter = typeof appRouter;
