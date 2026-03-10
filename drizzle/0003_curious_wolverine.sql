CREATE TABLE `chat_users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(64) NOT NULL,
	`passwordHash` varchar(256) NOT NULL,
	`email` varchar(320) NOT NULL,
	`resetToken` varchar(128),
	`resetTokenExpiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chat_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `chat_users_username_unique` UNIQUE(`username`),
	CONSTRAINT `chat_users_email_unique` UNIQUE(`email`)
);
