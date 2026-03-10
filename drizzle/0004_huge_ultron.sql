ALTER TABLE `chat_users` ADD `dateOfBirth` date;--> statement-breakpoint
ALTER TABLE `chat_users` ADD `failedLoginAttempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `chat_users` ADD `lockedUntil` timestamp;