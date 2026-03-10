CREATE TABLE `banned_users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nickname` varchar(64),
	`ipAddress` varchar(64),
	`reason` text,
	`bannedBy` varchar(64) NOT NULL,
	`voiceBanOnly` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `banned_users_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nickname` varchar(64) NOT NULL,
	`role` enum('moderator') NOT NULL,
	`grantedBy` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `chat_roles_nickname_unique` UNIQUE(`nickname`)
);
--> statement-breakpoint
CREATE TABLE `super_admin_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`passwordHash` varchar(256) NOT NULL,
	`resetToken` varchar(128),
	`resetTokenExpiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `super_admin_config_id` PRIMARY KEY(`id`)
);
