/**
 * Seed script: Creates Ammar and Later super admin accounts in the database.
 * Run with: npx tsx scripts/seed-superadmin.ts
 */
import "../scripts/load-env.js";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { chatUsers } from "../drizzle/schema";
import { eq } from "drizzle-orm";
const BCRYPT_ROUNDS = 12;
const SUPER_ADMINS = [
  { username: "Ammar", email: "ammar.hendi@hotmail.com", password: "fjyY1&$7" },
  { username: "Later", email: "ammar.hendi+later@hotmail.com", password: "fjyY1&$7" },
];
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("❌ DATABASE_URL not set. Cannot seed super admin accounts.");
    process.exit(1);
  }
  const client = postgres(connectionString);
  const db = drizzle(client);
  for (const admin of SUPER_ADMINS) {
    const existing = await db
      .select()
      .from(chatUsers)
      .where(eq(chatUsers.username, admin.username))
      .limit(1);
    if (existing.length > 0) {
      const passwordHash = await bcrypt.hash(admin.password, BCRYPT_ROUNDS);
      await db
        .update(chatUsers)
        .set({ passwordHash, email: admin.email, failedLoginAttempts: 0, lockedUntil: null })
        .where(eq(chatUsers.username, admin.username));
      console.log(`✅ Updated existing account: ${admin.username}`);
    } else {
      const passwordHash = await bcrypt.hash(admin.password, BCRYPT_ROUNDS);
      await db.insert(chatUsers).values({
        username: admin.username,
        passwordHash,
        email: admin.email,
        dateOfBirth: new Date("1990-01-01").toISOString().split("T")[0],
      });
      console.log(`✅ Created new account: ${admin.username}`);
    }
  }
  await client.end();
  console.log("🎉 Super admin accounts are ready. Login with username Ammar or Later and password fjyY1&$7");
}
main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
