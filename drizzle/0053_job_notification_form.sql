-- The full job notification form: job, client, project, PM, dates, contract, type,
-- scope, BOQ, management approval, priority and remarks.
ALTER TABLE `wf_receivables` ADD COLUMN `job_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `project_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `job_code` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `job_location` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `pm_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `pm_email` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `start_date` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `end_date` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `po_number` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `contract_value` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `contract_currency` text DEFAULT 'AED' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `job_type` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `scope` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `boq_available` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `management_approval` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `priority` text DEFAULT 'Normal' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `notification_remarks` text DEFAULT '' NOT NULL;
