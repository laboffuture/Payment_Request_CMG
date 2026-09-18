-- Accounts Receivable flow: job notification, CRM job, sales order, audit verification.
-- One row per job; `stage` holds the text of the stage it currently sits at.
CREATE TABLE IF NOT EXISTS `wf_receivables` (
	`id` text PRIMARY KEY NOT NULL,
	`ref` text NOT NULL,
	`stage` text DEFAULT 'Job Notification' NOT NULL,
	`customer` text DEFAULT '' NOT NULL,
	`company_id` text DEFAULT '' NOT NULL,
	`department` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`notified_on` text DEFAULT '' NOT NULL,
	`crm_job_no` text DEFAULT '' NOT NULL,
	`crm_owner` text DEFAULT '' NOT NULL,
	`crm_at` text DEFAULT '' NOT NULL,
	`so_no` text DEFAULT '' NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'AED' NOT NULL,
	`so_at` text DEFAULT '' NOT NULL,
	`submitted_at` text DEFAULT '' NOT NULL,
	`verified_by` text DEFAULT '' NOT NULL,
	`verified_at` text DEFAULT '' NOT NULL,
	`remarks` text DEFAULT '' NOT NULL,
	`return_note` text DEFAULT '' NOT NULL,
	`returned_at` text DEFAULT '' NOT NULL,
	`raised_by_email` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `wf_recv_stage_idx` ON `wf_receivables` (`stage`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `wf_recv_company_idx` ON `wf_receivables` (`company_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `wf_recv_created_idx` ON `wf_receivables` (`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `wf_recv_ref_idx` ON `wf_receivables` (`ref`);
