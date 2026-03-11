import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar, date } from "drizzle-orm/mysql-core";

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

// Chat rooms (multiple rooms)
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

// Registered chat users (username + password + email + dateOfBirth + lockout)
export const chatUsers = mysqlTable("chat_users", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 256 }).notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  dateOfBirth: date("dateOfBirth"),
  resetToken: varchar("resetToken", { length: 128 }),
  resetTokenExpiresAt: timestamp("resetTokenExpiresAt"),
  failedLoginAttempts: int("failedLoginAttempts").default(0).notNull(),
  lockedUntil: timestamp("lockedUntil"),
  displayName: varchar("displayName", { length: 64 }),
  avatarUrl: varchar("avatarUrl", { length: 512 }),
  profileVideoUrl: varchar("profileVideoUrl", { length: 512 }),
  statusMessage: varchar("statusMessage", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ChatUser = typeof chatUsers.$inferSelect;
export type InsertChatUser = typeof chatUsers.$inferInsert;

// Friends / contacts (Yahoo Messenger style)
export const chatFriends = mysqlTable("chat_friends", {
  id: int("id").autoincrement().primaryKey(),
  requesterUsername: varchar("requesterUsername", { length: 64 }).notNull(),
  recipientUsername: varchar("recipientUsername", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["pending", "accepted", "blocked"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ChatFriend = typeof chatFriends.$inferSelect;
export type InsertChatFriend = typeof chatFriends.$inferInsert;

// Offline private messages (delivered when recipient comes online)
export const offlineMessages = mysqlTable("offline_messages", {
  id: int("id").autoincrement().primaryKey(),
  senderNickname: varchar("senderNickname", { length: 64 }).notNull(),
  recipientUsername: varchar("recipientUsername", { length: 64 }).notNull(),
  content: text("content").notNull(),
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OfflineMessage = typeof offlineMessages.$inferSelect;
export type InsertOfflineMessage = typeof offlineMessages.$inferInsert;
