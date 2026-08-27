CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`unit` text NOT NULL,
	`package_size` real NOT NULL,
	`remaining` real NOT NULL,
	`low_threshold` real NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `restocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`amount` real NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `wash_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`washed_at` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wash_usages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`wash_id` text NOT NULL,
	`product_id` integer NOT NULL,
	`amount` real NOT NULL,
	FOREIGN KEY (`wash_id`) REFERENCES `wash_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
