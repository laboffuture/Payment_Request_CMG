-- Accounts Receivable, module 4: Debt Collection.
-- One case per missed invoice, and the log of follow-ups, statuses and payments against it.
CREATE TABLE IF NOT EXISTS `wf_collections` (
	`id` text PRIMARY KEY NOT NULL,
	`ref` text NOT NULL,
	`stage` text DEFAULT 'Invoice Missed' NOT NULL,
	`completion_id` text DEFAULT '' NOT NULL,
	`billing_job_id` text DEFAULT '' NOT NULL,
	`job_ref` text DEFAULT '' NOT NULL,
	`customer` text DEFAULT '' NOT NULL,
	`pm_name` text DEFAULT '' NOT NULL,
	`invoice_no` text DEFAULT '' NOT NULL,
	`invoice_date` text DEFAULT '' NOT NULL,
	`invoice_amount` real DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'AED' NOT NULL,
	`credit_days` integer DEFAULT 30 NOT NULL,
	`due_date` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Not contacted' NOT NULL,
	`promised_date` text DEFAULT '' NOT NULL,
	`amount_received` real DEFAULT 0 NOT NULL,
	`follow_ups` integer DEFAULT 0 NOT NULL,
	`last_follow_up_at` text DEFAULT '' NOT NULL,
	`collector_name` text DEFAULT '' NOT NULL,
	`collector_email` text DEFAULT '' NOT NULL,
	`submitted_at` text DEFAULT '' NOT NULL,
	`verified_by` text DEFAULT '' NOT NULL,
	`verified_at` text DEFAULT '' NOT NULL,
	`remarks` text DEFAULT '' NOT NULL,
	`return_note` text DEFAULT '' NOT NULL,
	`returned_at` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'billing' NOT NULL,
	`created_at` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `wf_coll_stage_idx` ON `wf_collections` (`stage`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `wf_coll_completion_idx` ON `wf_collections` (`completion_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `wf_coll_due_idx` ON `wf_collections` (`due_date`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `wf_coll_created_idx` ON `wf_collections` (`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `wf_collection_events` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT '' NOT NULL,
	`at` text DEFAULT '' NOT NULL,
	`by_name` text DEFAULT '' NOT NULL,
	`by_email` text DEFAULT '' NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT '' NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`promised_date` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `wf_collev_case_idx` ON `wf_collection_events` (`case_id`,`at`);
