-- The CRM job creation form: client contact, commercial terms, estimates and people.
ALTER TABLE `wf_receivables` ADD COLUMN `client_contact` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `client_address` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `project_type` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `contract_date` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `sales_person_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `sales_person_email` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `estimation_person_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `estimation_person_email` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `job_status` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `boq_value` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `estimated_cost` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `estimated_margin` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `margin_percent` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `payment_terms` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `retention_percent` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `advance_percent` real DEFAULT 0 NOT NULL;
