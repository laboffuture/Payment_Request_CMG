-- Accounts Receivable, module 3: Completion and Billing.
-- The jobs register (active or not, requested every few days) and the completion cycles.
CREATE TABLE IF NOT EXISTS `wf_billing_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`ref` text NOT NULL,
	`job_id` text DEFAULT '' NOT NULL,
	`plan_id` text DEFAULT '' NOT NULL,
	`job_ref` text DEFAULT '' NOT NULL,
	`customer` text DEFAULT '' NOT NULL,
	`company_id` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`pm_name` text DEFAULT '' NOT NULL,
	`pm_email` text DEFAULT '' NOT NULL,
	`contract_value` real DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'AED' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`every_days` integer DEFAULT 7 NOT NULL,
	`last_requested_at` text DEFAULT '' NOT NULL,
	`next_request_at` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `wf_bjob_job_idx` ON `wf_billing_jobs` (`job_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `wf_bjob_pm_idx` ON `wf_billing_jobs` (`pm_email`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `wf_bjob_next_idx` ON `wf_billing_jobs` (`next_request_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `wf_completions` (
	`id` text PRIMARY KEY NOT NULL,
	`ref` text NOT NULL,
	`stage` text DEFAULT 'Project Manager Update' NOT NULL,
	`billing_job_id` text DEFAULT '' NOT NULL,
	`job_ref` text DEFAULT '' NOT NULL,
	`customer` text DEFAULT '' NOT NULL,
	`pm_name` text DEFAULT '' NOT NULL,
	`pm_email` text DEFAULT '' NOT NULL,
	`contract_value` real DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'AED' NOT NULL,
	`requested_at` text DEFAULT '' NOT NULL,
	`requested_by` text DEFAULT '' NOT NULL,
	`percent_complete` real DEFAULT 0 NOT NULL,
	`completion_notes` text DEFAULT '' NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`pm_updated_at` text DEFAULT '' NOT NULL,
	`certified_percent` real DEFAULT 0 NOT NULL,
	`certification_notes` text DEFAULT '' NOT NULL,
	`certified_by` text DEFAULT '' NOT NULL,
	`certified_at` text DEFAULT '' NOT NULL,
	`approval_notes` text DEFAULT '' NOT NULL,
	`approved_by` text DEFAULT '' NOT NULL,
	`approved_at` text DEFAULT '' NOT NULL,
	`invoice_no` text DEFAULT '' NOT NULL,
	`invoice_date` text DEFAULT '' NOT NULL,
	`invoice_amount` real DEFAULT 0 NOT NULL,
	`invoiced_by` text DEFAULT '' NOT NULL,
	`invoiced_at` text DEFAULT '' NOT NULL,
	`verified_by` text DEFAULT '' NOT NULL,
	`verified_at` text DEFAULT '' NOT NULL,
	`remarks` text DEFAULT '' NOT NULL,
	`return_note` text DEFAULT '' NOT NULL,
	`returned_at` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `wf_comp_stage_idx` ON `wf_completions` (`stage`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `wf_comp_job_idx` ON `wf_completions` (`billing_job_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `wf_comp_pm_idx` ON `wf_completions` (`pm_email`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `wf_comp_created_idx` ON `wf_completions` (`created_at`);
