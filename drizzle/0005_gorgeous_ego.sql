CREATE TABLE `chat_friends` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requesterUsername` varchar(64) NOT NULL,
	`recipientUsername` varchar(64) NOT NULL,
	`status` enum('pending','accepted','blocked') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chat_friends_id` PRIMARY KEY(`id`)
);
