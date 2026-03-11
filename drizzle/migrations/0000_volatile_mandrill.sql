CREATE TYPE "public"."chat_role_type" AS ENUM('moderator');--> statement-breakpoint
CREATE TYPE "public"."friend_status" AS ENUM('pending', 'accepted', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('public', 'private', 'system');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "banned_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"nickname" varchar(64),
	"ipAddress" varchar(64),
	"reason" text,
	"bannedBy" varchar(64) NOT NULL,
	"voiceBanOnly" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_friends" (
	"id" serial PRIMARY KEY NOT NULL,
	"requesterUsername" varchar(64) NOT NULL,
	"recipientUsername" varchar(64) NOT NULL,
	"status" "friend_status" DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"nickname" varchar(64) NOT NULL,
	"role" "chat_role_type" NOT NULL,
	"grantedBy" varchar(64) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chat_roles_nickname_unique" UNIQUE("nickname")
);
--> statement-breakpoint
CREATE TABLE "chat_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(64) NOT NULL,
	"passwordHash" varchar(256) NOT NULL,
	"email" varchar(320) NOT NULL,
	"dateOfBirth" date,
	"resetToken" varchar(128),
	"resetTokenExpiresAt" timestamp,
	"failedLoginAttempts" integer DEFAULT 0 NOT NULL,
	"lockedUntil" timestamp,
	"displayName" varchar(64),
	"avatarUrl" varchar(512),
	"profileVideoUrl" varchar(512),
	"statusMessage" varchar(128),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chat_users_username_unique" UNIQUE("username"),
	CONSTRAINT "chat_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "invite_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" varchar(128) NOT NULL,
	"roomId" integer NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"usedCount" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "invite_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"roomId" integer NOT NULL,
	"senderNickname" varchar(64) NOT NULL,
	"content" text NOT NULL,
	"type" "message_type" DEFAULT 'public' NOT NULL,
	"recipientNickname" varchar(64),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offline_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"senderNickname" varchar(64) NOT NULL,
	"recipientUsername" varchar(64) NOT NULL,
	"content" text NOT NULL,
	"isRead" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "super_admin_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"passwordHash" varchar(256) NOT NULL,
	"resetToken" varchar(128),
	"resetTokenExpiresAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
