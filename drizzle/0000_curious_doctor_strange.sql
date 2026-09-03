CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`record_id` integer NOT NULL,
	`action` text NOT NULL,
	`previous_value` text DEFAULT '' NOT NULL,
	`new_value` text DEFAULT '' NOT NULL,
	`actor` text DEFAULT 'Demo user' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payment_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_no` text NOT NULL,
	`company` text NOT NULL,
	`department` text NOT NULL,
	`vendor` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text NOT NULL,
	`due_date` text NOT NULL,
	`urgency` text DEFAULT 'Normal' NOT NULL,
	`status` text DEFAULT 'Submitted' NOT NULL,
	`owner` text DEFAULT 'Accountant queue' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_requests_request_no_unique` ON `payment_requests` (`request_no`);