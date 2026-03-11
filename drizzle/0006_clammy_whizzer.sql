ALTER TABLE `chat_users` ADD `displayName` varchar(64);--> statement-breakpoint
ALTER TABLE `chat_users` ADD `avatarUrl` varchar(512);--> statement-breakpoint
ALTER TABLE `chat_users` ADD `statusMessage` varchar(128);