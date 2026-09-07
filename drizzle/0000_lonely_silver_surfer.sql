CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`room` text,
	`seen` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`p1` text NOT NULL,
	`p2` text,
	`status` text NOT NULL,
	`puzzle` integer NOT NULL,
	`created` integer NOT NULL,
	`start` integer,
	`ended` integer,
	`winner` text,
	`a1` text DEFAULT '[]' NOT NULL,
	`a2` text DEFAULT '[]' NOT NULL,
	`rev1` integer DEFAULT 0 NOT NULL,
	`rev2` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rooms_queue` ON `rooms` (`status`,`created`);--> statement-breakpoint
CREATE INDEX `idx_rooms_p1` ON `rooms` (`p1`);--> statement-breakpoint
CREATE INDEX `idx_rooms_p2` ON `rooms` (`p2`);--> statement-breakpoint
CREATE INDEX `idx_rooms_winner` ON `rooms` (`winner`);