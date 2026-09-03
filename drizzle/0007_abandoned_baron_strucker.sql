CREATE TABLE `wf_audit_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`ref` text NOT NULL,
	`title` text NOT NULL,
	`kind` text DEFAULT 'Pre-Audit' NOT NULL,
	`company_id` text DEFAULT '' NOT NULL,
	`department` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Available' NOT NULL,
	`assigned_to` text DEFAULT '' NOT NULL,
	`due_date` text DEFAULT '' NOT NULL,
	`planned_start` text DEFAULT '' NOT NULL,
	`planned_end` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`data_provider` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT '' NOT NULL,
	`accepted_at` text DEFAULT '' NOT NULL,
	`completed_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wf_at_kind_idx` ON `wf_audit_tasks` (`kind`);--> statement-breakpoint
CREATE INDEX `wf_at_status_idx` ON `wf_audit_tasks` (`status`);--> statement-breakpoint
CREATE INDEX `wf_at_company_idx` ON `wf_audit_tasks` (`company_id`);--> statement-breakpoint
CREATE INDEX `wf_at_assigned_idx` ON `wf_audit_tasks` (`assigned_to`);--> statement-breakpoint
CREATE INDEX `wf_at_kind_status_idx` ON `wf_audit_tasks` (`kind`,`status`);--> statement-breakpoint
CREATE TABLE `wf_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`vendor` text NOT NULL,
	`requested` real DEFAULT 0 NOT NULL,
	`approved` real,
	`currency` text DEFAULT 'AED' NOT NULL,
	`company_id` text DEFAULT '' NOT NULL,
	`statement` text DEFAULT '' NOT NULL,
	`reconciliation` text DEFAULT '' NOT NULL,
	`gl` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Audit Queue' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`proof` text DEFAULT '' NOT NULL,
	`raised_by` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT '' NOT NULL,
	`released_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wf_batch_status_idx` ON `wf_batches` (`status`);--> statement-breakpoint
CREATE INDEX `wf_batch_created_idx` ON `wf_batches` (`created_at`);--> statement-breakpoint
CREATE TABLE `wf_companies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text DEFAULT '' NOT NULL,
	`currency` text DEFAULT 'AED' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wf_co_active_idx` ON `wf_companies` (`active`);--> statement-breakpoint
CREATE TABLE `wf_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text DEFAULT '' NOT NULL,
	`author_name` text DEFAULT '' NOT NULL,
	`author_email` text DEFAULT '' NOT NULL,
	`author_role` text DEFAULT '' NOT NULL,
	`to_employee` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wf_msg_at_idx` ON `wf_messages` (`at`);--> statement-breakpoint
CREATE INDEX `wf_msg_to_idx` ON `wf_messages` (`to_employee`);--> statement-breakpoint
CREATE INDEX `wf_msg_author_idx` ON `wf_messages` (`author_id`);