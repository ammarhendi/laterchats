CREATE TABLE `offline_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`senderNickname` varchar(64) NOT NULL,
	`recipientUsername` varchar(64) NOT NULL,
	`content` text NOT NULL,
	`isRead` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `offline_messages_id` PRIMARY KEY(`id`)
);
