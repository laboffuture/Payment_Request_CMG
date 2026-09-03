CREATE TABLE `wf_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`computed_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wf_task_due_status_idx` ON `wf_tasks` (`due_date`,`status`);--> statement-breakpoint
CREATE INDEX `wf_task_dept_status_idx` ON `wf_tasks` (`dept_id`,`status`);