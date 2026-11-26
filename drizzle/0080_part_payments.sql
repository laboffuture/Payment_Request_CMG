-- Paying a request in parts. Each payment made against a request (amount, the day it was
-- paid, its UTR) is a row here; paid_amount on the request is their total. Requests released
-- before this existed have no rows and paid_amount 0 - their status says they are paid in full.
CREATE TABLE `payment_releases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`payment_id` integer NOT NULL,
	`amount` real NOT NULL,
	`paid_on` text NOT NULL,
	`utr_number` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payment_releases_payment_idx` ON `payment_releases` (`payment_id`);
--> statement-breakpoint
ALTER TABLE `payment_requests` ADD `paid_amount` real DEFAULT 0 NOT NULL;
