-- Accounts Receivable, module 2: Planning & Procurement.
-- One row per job being planned: project manager, schedule, BOM and procurement, audit.
CREATE TABLE IF NOT EXISTS `wf_planning` (
	`id` text PRIMARY KEY NOT NULL,
	`ref` text NOT NULL,
	`stage` text DEFAULT 'Assign Project Manager' NOT NULL,
	`job_id` text DEFAULT '' NOT NULL,
	`job_ref` text DEFAULT '' NOT NULL,
	`customer` text DEFAULT '' NOT NULL,
	`company_id` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`pm_name` text DEFAULT '' NOT NULL,
	`pm_email` text DEFAULT '' NOT NULL,
	`pm_at` text DEFAULT '' NOT NULL,
	`start_date` text DEFAULT '' NOT NULL,
	`end_date` text DEFAULT '' NOT NULL,
	`plan_notes` text DEFAULT '' NOT NULL,
	`plan_at` text DEFAULT '' NOT NULL,
	`bom_summary` text DEFAULT '' NOT NULL,
	`bom_cost` real DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'AED' NOT NULL,
	`procurement_notes` text DEFAULT '' NOT NULL,
	`bom_at` text DEFAULT '' NOT NULL,
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
CREATE INDEX IF NOT EXISTS `wf_plan_stage_idx` ON `wf_planning` (`stage`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `wf_plan_job_idx` ON `wf_planning` (`job_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `wf_plan_pm_idx` ON `wf_planning` (`pm_email`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `wf_plan_created_idx` ON `wf_planning` (`created_at`);
