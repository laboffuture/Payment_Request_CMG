-- The project schedule: the activities of a plan, each with its dates, responsible
-- person, progress and status.
CREATE TABLE IF NOT EXISTS `wf_plan_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text DEFAULT '' NOT NULL,
	`job_code` text DEFAULT '' NOT NULL,
	`activity` text DEFAULT '' NOT NULL,
	`start_date` text DEFAULT '' NOT NULL,
	`planned_end` text DEFAULT '' NOT NULL,
	`actual_start` text DEFAULT '' NOT NULL,
	`actual_end` text DEFAULT '' NOT NULL,
	`responsible_name` text DEFAULT '' NOT NULL,
	`responsible_email` text DEFAULT '' NOT NULL,
	`dependency` text DEFAULT '' NOT NULL,
	`percent` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT '' NOT NULL,
	`remarks` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `wf_planact_plan_idx` ON `wf_plan_activities` (`plan_id`,`start_date`);
