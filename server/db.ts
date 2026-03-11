import { eq, or, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, rooms, inviteTokens, messages, Room, InviteToken, Message, chatUsers, chatFriends } from "../drizzle/schema";
import { ENV } from "./_core/env";
import crypto from "crypto";
import bcrypt from "bcryptjs";

// Reserved usernames — cannot be registered by anyone
const RESERVED_USERNAMES = ["ammar", "Ammar", "AMMAR", "later", "Later", "LATER", "admin", "system", "moderator"];

// Security constants
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const BCRYPT_ROUNDS = 12;

// Sanitize user input: strip HTML, dangerous chars, trim, limit length
function sanitizeString(input: string, maxLength = 256): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/[<>"'`;\\]/g, "")
    .trim()
    .slice(0, maxLength);
}

// The 10 default rooms
const DEFAULT_ROOMS = [
  { name: "Now", description: "Pull up a chair and have a chat, mate!" },
  { name: "Arab World", description: "Arabic culture, news, and conversation." },
  { name: "Issues", description: "Discuss world issues and current events." },
  { name: "Social Media", description: "Talk about trends, platforms, and viral content." },
  { name: "Chilling Out", description: "Relax, unwind, and have a good time." },
  { name: "Dancing", description: "Music, moves, and dance culture." },
  { name: "Blah Blah", description: "Just talk about anything and everything." },
  { name: "Nothing Hidden", description: "Open, honest, and real conversations." },
  { name: "For All", description: "A room for everyone — all topics welcome." },
  { name: "Random", description: "Totally random conversations." },
];

function getDefaultRooms(): Room[] {
  return DEFAULT_ROOMS.map((r, i) => ({
    id: i + 1,
    name: r.name,
    description: r.description,
    isActive: true,
    createdAt: new Date(),
  }));
}

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

//// ── Room functions ───────────────────────────────────────────────────────────

async function seedDefaultRooms(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  for (const room of DEFAULT_ROOMS) {
    await db.insert(rooms).values({ name: room.name, description: room.description, isActive: true }).catch(() => {});
  }
}

export async function getAllRooms(): Promise<Room[]> {
  const db = await getDb();
  if (!db) return getDefaultRooms();
  const result = await db.select().from(rooms).where(eq(rooms.isActive, true));
  if (result.length === 0) {
    await seedDefaultRooms();
    return db.select().from(rooms).where(eq(rooms.isActive, true));
  }
  return result;
}

export async function getRoomById(id: number): Promise<Room | undefined> {
  const db = await getDb();
  if (!db) return getDefaultRooms().find((r) => r.id === id);
  const result = await db.select().from(rooms).where(eq(rooms.id, id)).limit(1);
  return result[0];
}

export async function getActiveRoom(): Promise<Room | undefined> {
  const db = await getDb();
  if (!db) return getDefaultRooms()[0];
  const result = await db.select().from(rooms).where(eq(rooms.isActive, true)).limit(1);
  return result[0];
}

export async function ensureDefaultRoom(): Promise<Room> {
  const db = await getDb();
  if (!db) return getDefaultRooms()[0];
  let room = await getActiveRoom();
  if (!room) {
    await seedDefaultRooms();
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

// ── Chat user registration/login (bcrypt + account lockout) ──────────────────

export async function registerChatUser(
  username: string,
  password: string,
  email: string,
  dateOfBirth?: string,
): Promise<{ success: boolean; error?: string }> {
  username = sanitizeString(username, 32);
  email = sanitizeString(email, 320);

  if (RESERVED_USERNAMES.some((r) => r.toLowerCase() === username.toLowerCase())) {
    return { success: false, error: "This username is reserved and cannot be registered." };
  }
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
    return { success: false, error: "Username must be 3-32 characters: letters, numbers, underscores only." };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { success: false, error: "Invalid email address." };
  }
  if (dateOfBirth) {
    const dob = new Date(dateOfBirth);
    const today = new Date();
    const age = today.getFullYear() - dob.getFullYear() -
      (today < new Date(today.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0);
    if (isNaN(age) || age < 18) {
      return { success: false, error: "You must be 18 or older to register." };
    }
  }

  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  const existing = await db.select().from(chatUsers).where(eq(chatUsers.username, username)).limit(1);
  if (existing.length > 0) return { success: false, error: "Username already taken" };

  const existingEmail = await db.select().from(chatUsers).where(eq(chatUsers.email, email)).limit(1);
  if (existingEmail.length > 0) return { success: false, error: "Email already registered" };

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await db.insert(chatUsers).values({
    username,
    passwordHash,
    email,
    ...(dateOfBirth ? { dateOfBirth: new Date(dateOfBirth) } : {}),
  });
  return { success: true };
}

export async function loginChatUser(
  username: string,
  password: string,
): Promise<{ success: boolean; error?: string }> {
  username = sanitizeString(username, 32);

  // NOTE: Reserved usernames (Ammar, Later) ARE allowed to log in.
  // The reserved check only applies to registration (others can't register those names).
  // Super admin role is granted automatically in socket.ts when they join a room.

  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  const result = await db.select().from(chatUsers).where(eq(chatUsers.username, username)).limit(1);
  if (!result.length) return { success: false, error: "Invalid username or password" };

  const user = result[0];

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return { success: false, error: `Account locked. Try again in ${minutesLeft} minute(s).` };
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);

  if (!isValid) {
    const newAttempts = (user.failedLoginAttempts || 0) + 1;
    if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
      await db.update(chatUsers)
        .set({ failedLoginAttempts: newAttempts, lockedUntil })
        .where(eq(chatUsers.id, user.id));
      return { success: false, error: "Too many failed attempts. Account locked for 30 minutes." };
    }
    await db.update(chatUsers)
      .set({ failedLoginAttempts: newAttempts })
      .where(eq(chatUsers.id, user.id));
    return { success: false, error: "Invalid username or password" };
  }

  await db.update(chatUsers)
    .set({ failedLoginAttempts: 0, lockedUntil: null })
    .where(eq(chatUsers.id, user.id));
  return { success: true };
}

export async function requestPasswordReset(email: string): Promise<{ success: boolean; token?: string; username?: string; error?: string }> {
  email = sanitizeString(email, 320);
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };
  const result = await db.select().from(chatUsers).where(eq(chatUsers.email, email)).limit(1);
  if (!result.length) return { success: true }; // silent to prevent email enumeration
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await db.update(chatUsers).set({ resetToken: token, resetTokenExpiresAt: expiresAt }).where(eq(chatUsers.email, email));
  return { success: true, token, username: result[0].username };
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  if (!/^[a-f0-9]{64}$/.test(token)) return { success: false, error: "Invalid reset token" };
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };
  const result = await db.select().from(chatUsers).where(eq(chatUsers.resetToken, token)).limit(1);
  if (!result.length) return { success: false, error: "Invalid or expired reset token" };
  const user = result[0];
  if (!user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
    return { success: false, error: "Reset token has expired" };
  }
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await db.update(chatUsers)
    .set({ passwordHash, resetToken: null, resetTokenExpiresAt: null, failedLoginAttempts: 0, lockedUntil: null })
    .where(eq(chatUsers.id, user.id));
  return { success: true };
}

export async function changeChatUserPassword(
  username: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ success: boolean; error?: string }> {
  username = sanitizeString(username, 32);
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  const result = await db.select().from(chatUsers).where(eq(chatUsers.username, username)).limit(1);
  if (!result.length) return { success: false, error: "Account not found" };

  const user = result[0];
  const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isValid) return { success: false, error: "Current password is incorrect" };

  if (newPassword.length < 6) return { success: false, error: "New password must be at least 6 characters" };

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await db.update(chatUsers)
    .set({ passwordHash, failedLoginAttempts: 0, lockedUntil: null })
    .where(eq(chatUsers.id, user.id));
  return { success: true };
}

// ── Friends / contacts (Yahoo Messenger style) ─────────────────────────────

export async function sendFriendRequest(requesterUsername: string, recipientUsername: string): Promise<{ success: boolean; error?: string }> {
  if (requesterUsername === recipientUsername) return { success: false, error: "You cannot add yourself." };
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };
  // Check recipient exists
  const recipient = await db.select().from(chatUsers).where(eq(chatUsers.username, recipientUsername)).limit(1);
  if (!recipient.length) return { success: false, error: "User not found." };
  // Check if already friends or pending
  const existing = await db.select().from(chatFriends).where(
    or(
      and(eq(chatFriends.requesterUsername, requesterUsername), eq(chatFriends.recipientUsername, recipientUsername)),
      and(eq(chatFriends.requesterUsername, recipientUsername), eq(chatFriends.recipientUsername, requesterUsername))
    )
  ).limit(1);
  if (existing.length > 0) {
    const s = existing[0].status;
    if (s === "accepted") return { success: false, error: "Already friends." };
    if (s === "pending") return { success: false, error: "Friend request already sent." };
    if (s === "blocked") return { success: false, error: "Cannot send request." };
  }
  await db.insert(chatFriends).values({ requesterUsername, recipientUsername, status: "pending" });
  return { success: true };
}

export async function respondFriendRequest(recipientUsername: string, requesterUsername: string, accept: boolean): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };
  const existing = await db.select().from(chatFriends).where(
    and(eq(chatFriends.requesterUsername, requesterUsername), eq(chatFriends.recipientUsername, recipientUsername), eq(chatFriends.status, "pending"))
  ).limit(1);
  if (!existing.length) return { success: false, error: "No pending request found." };
  if (accept) {
    await db.update(chatFriends).set({ status: "accepted" }).where(eq(chatFriends.id, existing[0].id));
  } else {
    await db.delete(chatFriends).where(eq(chatFriends.id, existing[0].id));
  }
  return { success: true };
}

export async function getFriends(username: string): Promise<{ username: string; status: string; direction: string }[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(chatFriends).where(
    or(eq(chatFriends.requesterUsername, username), eq(chatFriends.recipientUsername, username))
  );
  return rows.map((r) => ({
    username: r.requesterUsername === username ? r.recipientUsername : r.requesterUsername,
    status: r.status,
    direction: r.requesterUsername === username ? "sent" : "received",
  }));
}

export async function removeFriend(username: string, friendUsername: string): Promise<{ success: boolean }> {
  const db = await getDb();
  if (!db) return { success: false };
  await db.delete(chatFriends).where(
    or(
      and(eq(chatFriends.requesterUsername, username), eq(chatFriends.recipientUsername, friendUsername)),
      and(eq(chatFriends.requesterUsername, friendUsername), eq(chatFriends.recipientUsername, username))
    )
  );
  return { success: true };
}

// ── Profile functions ──────────────────────────────────────────────────────────────────

export async function getChatUserProfile(username: string): Promise<{ username: string; displayName: string | null; avatarUrl: string | null; statusMessage: string | null } | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select({
    username: chatUsers.username,
    displayName: chatUsers.displayName,
    avatarUrl: chatUsers.avatarUrl,
    statusMessage: chatUsers.statusMessage,
  }).from(chatUsers).where(eq(chatUsers.username, username)).limit(1);
  return result[0] ?? null;
}

export async function updateChatUserProfile(
  username: string,
  updates: { displayName?: string; avatarUrl?: string; statusMessage?: string; profileVideoUrl?: string }
): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };
  const set: Record<string, string | null | undefined> = {};
  if (updates.displayName !== undefined) set.displayName = updates.displayName || null;
  if (updates.avatarUrl !== undefined) set.avatarUrl = updates.avatarUrl || null;
  if (updates.statusMessage !== undefined) set.statusMessage = updates.statusMessage || null;
  if (updates.profileVideoUrl !== undefined) set.profileVideoUrl = updates.profileVideoUrl || null;
  if (Object.keys(set).length === 0) return { success: true };
  await db.update(chatUsers).set(set).where(eq(chatUsers.username, username));
  return { success: true };
}

export async function getAllRegisteredUsers(): Promise<{
  username: string;
  email: string;
  createdAt: Date | null;
  displayName: string | null;
  avatarUrl: string | null;
}[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      username: chatUsers.username,
      email: chatUsers.email,
      createdAt: chatUsers.createdAt,
      displayName: chatUsers.displayName,
      avatarUrl: chatUsers.avatarUrl,
    })
    .from(chatUsers)
    .orderBy(chatUsers.createdAt);
  return rows;
}
