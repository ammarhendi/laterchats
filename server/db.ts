import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, rooms, inviteTokens, messages, Room, InviteToken, Message } from "../drizzle/schema";
import { ENV } from "./_core/env";
import crypto from "crypto";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Room functions
export async function getActiveRoom(): Promise<Room | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(rooms).where(eq(rooms.isActive, true)).limit(1);
  return result[0];
}

export async function ensureDefaultRoom(): Promise<Room> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let room = await getActiveRoom();
  if (!room) {
    await db.insert(rooms).values({
      name: "Now",
      description: "Pull up a chair and have a chat, mate!",
      isActive: true,
    });
    room = await getActiveRoom();
  }
  return room!;
}

// Invite token functions
export async function generateInviteToken(roomId: number): Promise<InviteToken> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000); // 6 hours

  await db.insert(inviteTokens).values({ token, roomId, expiresAt });
  const result = await db.select().from(inviteTokens).where(eq(inviteTokens.token, token)).limit(1);
  return result[0];
}

export async function validateInviteToken(token: string): Promise<{ valid: boolean; roomId?: number; message?: string }> {
  const db = await getDb();
  if (!db) {
    return { valid: true, roomId: 1 };
  }

  const result = await db.select().from(inviteTokens).where(eq(inviteTokens.token, token)).limit(1);
  if (!result.length) return { valid: false, message: "Invalid invite link" };

  const tokenRecord = result[0];
  if (tokenRecord.expiresAt < new Date()) return { valid: false, message: "This invite link has expired" };

  return { valid: true, roomId: tokenRecord.roomId };
}

export async function getLatestInviteToken(roomId: number): Promise<InviteToken | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(inviteTokens).where(eq(inviteTokens.roomId, roomId)).limit(10);
  const now = new Date();
  const valid = result.filter((t) => t.expiresAt > now);
  return valid[valid.length - 1];
}

// Message functions
export async function getRecentMessages(roomId: number, limit = 50): Promise<Message[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(messages).where(eq(messages.roomId, roomId)).limit(limit);
}

export async function clearRoomMessages(roomId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(messages).where(eq(messages.roomId, roomId));
}
