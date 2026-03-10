import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Chat room (single room, admin-created)
export const rooms = mysqlTable("rooms", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Room = typeof rooms.$inferSelect;
export type InsertRoom = typeof rooms.$inferInsert;

// Invite tokens (6-hour expiry)
export const inviteTokens = mysqlTable("invite_tokens", {
  id: int("id").autoincrement().primaryKey(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  roomId: int("roomId").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  usedCount: int("usedCount").default(0).notNull(),
});

export type InviteToken = typeof inviteTokens.$inferSelect;
export type InsertInviteToken = typeof inviteTokens.$inferInsert;

// Chat messages (stored for history)
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  senderNickname: varchar("senderNickname", { length: 64 }).notNull(),
  content: text("content").notNull(),
  type: mysqlEnum("type", ["public", "private", "system"]).default("public").notNull(),
  recipientNickname: varchar("recipientNickname", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

// Super admin config (stores hashed password for "Ammar")
export const superAdminConfig = mysqlTable("super_admin_config", {
  id: int("id").autoincrement().primaryKey(),
  passwordHash: varchar("passwordHash", { length: 256 }).notNull(),
  resetToken: varchar("resetToken", { length: 128 }),
  resetTokenExpiresAt: timestamp("resetTokenExpiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SuperAdminConfig = typeof superAdminConfig.$inferSelect;

// Banned users (by nickname and/or IP)
export const bannedUsers = mysqlTable("banned_users", {
  id: int("id").autoincrement().primaryKey(),
  nickname: varchar("nickname", { length: 64 }),
  ipAddress: varchar("ipAddress", { length: 64 }),
  reason: text("reason"),
  bannedBy: varchar("bannedBy", { length: 64 }).notNull(),
  voiceBanOnly: boolean("voiceBanOnly").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BannedUser = typeof bannedUsers.$inferSelect;
export type InsertBannedUser = typeof bannedUsers.$inferInsert;

// Chat roles (moderators promoted by super admin)
export const chatRoles = mysqlTable("chat_roles", {
  id: int("id").autoincrement().primaryKey(),
  nickname: varchar("nickname", { length: 64 }).notNull().unique(),
  role: mysqlEnum("role", ["moderator"]).notNull(),
  grantedBy: varchar("grantedBy", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChatRole = typeof chatRoles.$inferSelect;
export type InsertChatRole = typeof chatRoles.$inferInsert;
