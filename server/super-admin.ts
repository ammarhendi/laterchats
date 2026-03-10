import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import crypto from "crypto";
import { getDb } from "./db";
import { superAdminConfig, bannedUsers, chatRoles } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// The reserved super admin nicknames — nobody else can use these
export const SUPER_ADMIN_NICKNAME = "Ammar"; // Primary display name used in chat
export const SUPER_ADMIN_NICKNAMES = ["Ammar", "Later"]; // All valid super admin login names
export function isSuperAdminNickname(nickname: string): boolean {
  return SUPER_ADMIN_NICKNAMES.some((n) => n.toLowerCase() === nickname.toLowerCase());
}
// The hidden recovery email
const RECOVERY_EMAIL = "ammar.hendi@hotmail.com";

// ── Password helpers ──────────────────────────────────────────────────────────

export async function isSuperAdminPasswordSet(): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select().from(superAdminConfig).limit(1);
  return rows.length > 0;
}

export async function setSuperAdminPassword(plainPassword: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const hash = await bcrypt.hash(plainPassword, 12);
  const existing = await db.select().from(superAdminConfig).limit(1);
  if (existing.length > 0) {
    await db.update(superAdminConfig).set({ passwordHash: hash });
  } else {
    await db.insert(superAdminConfig).values({ passwordHash: hash });
  }
}

export async function verifySuperAdminPassword(plainPassword: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select().from(superAdminConfig).limit(1);
  if (!rows.length) return false;
  return bcrypt.compare(plainPassword, rows[0].passwordHash);
}

// ── Password reset via email ──────────────────────────────────────────────────

export async function sendPasswordResetEmail(): Promise<{ success: boolean; message: string }> {
  const db = await getDb();
  if (!db) return { success: false, message: "Database unavailable" };

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

  const existing = await db.select().from(superAdminConfig).limit(1);
  if (!existing.length) {
    return { success: false, message: "Super admin not configured yet" };
  }

  await db.update(superAdminConfig).set({
    resetToken: token,
    resetTokenExpiresAt: expiresAt,
  });

  // Build the reset link — uses the app's API base URL
  const resetLink = `${process.env.API_BASE_URL || "http://localhost:3000"}/api/admin/reset-password?token=${token}`;

  try {
    // Use Gmail SMTP or any configured SMTP
    const transporter = nodemailer.createTransport({
      service: "hotmail",
      auth: {
        user: process.env.SMTP_USER || RECOVERY_EMAIL,
        pass: process.env.SMTP_PASS || "",
      },
    });

    await transporter.sendMail({
      from: `"Later Chat" <${process.env.SMTP_USER || RECOVERY_EMAIL}>`,
      to: RECOVERY_EMAIL,
      subject: "Later Chat - Super Admin Password Reset",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #7B0099;">Later Chat — Password Reset</h2>
          <p>You requested a Super Admin password reset.</p>
          <p>Click the link below to set a new password. This link expires in <strong>1 hour</strong>.</p>
          <a href="${resetLink}" style="
            display: inline-block;
            background: #7B0099;
            color: #fff;
            padding: 12px 24px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: bold;
            margin: 16px 0;
          ">Reset Password</a>
          <p style="color: #888; font-size: 12px;">If you did not request this, ignore this email.</p>
        </div>
      `,
    });

    return { success: true, message: `Reset link sent to ${RECOVERY_EMAIL}` };
  } catch (err) {
    console.error("[SuperAdmin] Email send error:", err);
    // Return the reset link directly as fallback (for dev/testing)
    return { success: false, message: `Email failed. Reset token: ${token}` };
  }
}

export async function verifyResetToken(token: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select().from(superAdminConfig).limit(1);
  if (!rows.length) return false;
  const config = rows[0];
  if (!config.resetToken || config.resetToken !== token) return false;
  if (!config.resetTokenExpiresAt || config.resetTokenExpiresAt < new Date()) return false;
  return true;
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<boolean> {
  const valid = await verifyResetToken(token);
  if (!valid) return false;
  const hash = await bcrypt.hash(newPassword, 12);
  const db = await getDb();
  if (!db) return false;
  await db.update(superAdminConfig).set({
    passwordHash: hash,
    resetToken: null,
    resetTokenExpiresAt: null,
  });
  return true;
}

// ── Ban management ────────────────────────────────────────────────────────────

export async function banUser(opts: {
  nickname?: string;
  ipAddress?: string;
  reason?: string;
  bannedBy: string;
  voiceBanOnly?: boolean;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(bannedUsers).values({
    nickname: opts.nickname,
    ipAddress: opts.ipAddress,
    reason: opts.reason || "Banned by admin",
    bannedBy: opts.bannedBy,
    voiceBanOnly: opts.voiceBanOnly ?? false,
  });
}

export async function unbanUser(nickname: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(bannedUsers).where(eq(bannedUsers.nickname, nickname));
}

export async function isUserBanned(nickname: string, ipAddress?: string): Promise<{ banned: boolean; voiceBanOnly: boolean }> {
  const db = await getDb();
  if (!db) return { banned: false, voiceBanOnly: false };

  const rows = await db.select().from(bannedUsers);
  for (const row of rows) {
    const nickMatch = row.nickname && row.nickname.toLowerCase() === nickname.toLowerCase();
    const ipMatch = ipAddress && row.ipAddress === ipAddress;
    if (nickMatch || ipMatch) {
      return { banned: true, voiceBanOnly: row.voiceBanOnly };
    }
  }
  return { banned: false, voiceBanOnly: false };
}

export async function getBannedUsers(): Promise<typeof bannedUsers.$inferSelect[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(bannedUsers);
}

// ── Role management ───────────────────────────────────────────────────────────

export async function promoteToModerator(nickname: string, grantedBy: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  // Upsert moderator role
  const existing = await db.select().from(chatRoles).where(eq(chatRoles.nickname, nickname)).limit(1);
  if (existing.length > 0) {
    await db.update(chatRoles).set({ role: "moderator", grantedBy }).where(eq(chatRoles.nickname, nickname));
  } else {
    await db.insert(chatRoles).values({ nickname, role: "moderator", grantedBy });
  }
}

export async function demoteUser(nickname: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(chatRoles).where(eq(chatRoles.nickname, nickname));
}

export async function getUserRole(nickname: string): Promise<"super_admin" | "moderator" | "user"> {
  if (isSuperAdminNickname(nickname)) return "super_admin";
  const db = await getDb();
  if (!db) return "user";
  const rows = await db.select().from(chatRoles).where(eq(chatRoles.nickname, nickname)).limit(1);
  if (rows.length > 0) return "moderator";
  return "user";
}

export async function getAllModerators(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(chatRoles);
  return rows.map((r) => r.nickname);
}
