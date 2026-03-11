import { boolean, integer, pgEnum, pgTable, serial, text, timestamp, varchar, date } from "drizzle-orm/pg-core";

// ── Enums ─────────────────────────────────────────────────────────────────────
export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const messageTypeEnum = pgEnum("message_type", ["public", "private", "system"]);
export const friendStatusEnum = pgEnum("friend_status", ["pending", "accepted", "blocked"]);
export const chatRoleEnum = pgEnum("chat_role_type", ["moderator"]);

// ── OAuth users (platform auth) ───────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ── Chat rooms ────────────────────────────────────────────────────────────────
export const rooms = pgTable("rooms", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Room = typeof rooms.$inferSelect;
export type InsertRoom = typeof rooms.$inferInsert;

// ── Invite tokens ─────────────────────────────────────────────────────────────
export const inviteTokens = pgTable("invite_tokens", {
  id: serial("id").primaryKey(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  roomId: integer("roomId").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  usedCount: integer("usedCount").default(0).notNull(),
});
export type InviteToken = typeof inviteTokens.$inferSelect;
export type InsertInviteToken = typeof inviteTokens.$inferInsert;

// ── Chat messages ─────────────────────────────────────────────────────────────
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  roomId: integer("roomId").notNull(),
  senderNickname: varchar("senderNickname", { length: 64 }).notNull(),
  content: text("content").notNull(),
  type: messageTypeEnum("type").default("public").notNull(),
  recipientNickname: varchar("recipientNickname", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

// ── Super admin config ────────────────────────────────────────────────────────
export const superAdminConfig = pgTable("super_admin_config", {
  id: serial("id").primaryKey(),
  passwordHash: varchar("passwordHash", { length: 256 }).notNull(),
  resetToken: varchar("resetToken", { length: 128 }),
  resetTokenExpiresAt: timestamp("resetTokenExpiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type SuperAdminConfig = typeof superAdminConfig.$inferSelect;

// ── Banned users ──────────────────────────────────────────────────────────────
export const bannedUsers = pgTable("banned_users", {
  id: serial("id").primaryKey(),
  nickname: varchar("nickname", { length: 64 }),
  ipAddress: varchar("ipAddress", { length: 64 }),
  reason: text("reason"),
  bannedBy: varchar("bannedBy", { length: 64 }).notNull(),
  voiceBanOnly: boolean("voiceBanOnly").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type BannedUser = typeof bannedUsers.$inferSelect;
export type InsertBannedUser = typeof bannedUsers.$inferInsert;

// ── Chat roles ────────────────────────────────────────────────────────────────
export const chatRoles = pgTable("chat_roles", {
  id: serial("id").primaryKey(),
  nickname: varchar("nickname", { length: 64 }).notNull().unique(),
  role: chatRoleEnum("role").notNull(),
  grantedBy: varchar("grantedBy", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ChatRole = typeof chatRoles.$inferSelect;
export type InsertChatRole = typeof chatRoles.$inferInsert;

// ── Registered chat users ─────────────────────────────────────────────────────
export const chatUsers = pgTable("chat_users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 256 }).notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  dateOfBirth: date("dateOfBirth"),
  resetToken: varchar("resetToken", { length: 128 }),
  resetTokenExpiresAt: timestamp("resetTokenExpiresAt"),
  failedLoginAttempts: integer("failedLoginAttempts").default(0).notNull(),
  lockedUntil: timestamp("lockedUntil"),
  displayName: varchar("displayName", { length: 64 }),
  avatarUrl: varchar("avatarUrl", { length: 512 }),
  profileVideoUrl: varchar("profileVideoUrl", { length: 512 }),
  statusMessage: varchar("statusMessage", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type ChatUser = typeof chatUsers.$inferSelect;
export type InsertChatUser = typeof chatUsers.$inferInsert;

// ── Friends / contacts ────────────────────────────────────────────────────────
export const chatFriends = pgTable("chat_friends", {
  id: serial("id").primaryKey(),
  requesterUsername: varchar("requesterUsername", { length: 64 }).notNull(),
  recipientUsername: varchar("recipientUsername", { length: 64 }).notNull(),
  status: friendStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type ChatFriend = typeof chatFriends.$inferSelect;
export type InsertChatFriend = typeof chatFriends.$inferInsert;

// ── Offline private messages ──────────────────────────────────────────────────
export const offlineMessages = pgTable("offline_messages", {
  id: serial("id").primaryKey(),
  senderNickname: varchar("senderNickname", { length: 64 }).notNull(),
  recipientUsername: varchar("recipientUsername", { length: 64 }).notNull(),
  content: text("content").notNull(),
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type OfflineMessage = typeof offlineMessages.$inferSelect;
export type InsertOfflineMessage = typeof offlineMessages.$inferInsert;
