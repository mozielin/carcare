ALTER TABLE `products` ADD `owner_email` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `wash_flows` ADD `owner_email` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `wash_sessions` ADD `owner_email` text DEFAULT '' NOT NULL;