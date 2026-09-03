CREATE TABLE `wf_obs_replies` (
	`id` text PRIMARY KEY NOT NULL,
	`observation_id` text NOT NULL,
	`employee_id` text DEFAULT '' NOT NULL,
	`author_name` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wf_obsreply_obs_idx` ON `wf_obs_replies` (`observation_id`);--> statement-breakpoint
CREATE INDEX `wf_obsreply_at_idx` ON `wf_obs_replies` (`at`);--> statement-breakpoint
CREATE TABLE `wf_obs_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`observation_id` text NOT NULL,
	`employee_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wf_obstag_obs_idx` ON `wf_obs_tags` (`observation_id`);--> statement-breakpoint
CREATE INDEX `wf_obstag_emp_idx` ON `wf_obs_tags` (`employee_id`);--> statement-breakpoint
CREATE INDEX `wf_obstag_pair_idx` ON `wf_obs_tags` (`employee_id`,`observation_id`);--> statement-breakpoint
CREATE TABLE `wf_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`ref` text NOT NULL,
	`title` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`dept_id` text DEFAULT 'd-group' NOT NULL,
	`task_id` text DEFAULT '' NOT NULL,
	`risk` text DEFAULT 'Medium' NOT NULL,
	`status` text DEFAULT 'Open' NOT NULL,
	`raised_by` text DEFAULT '' NOT NULL,
	`raised_at` text DEFAULT '' NOT NULL,
	`target` text DEFAULT '' NOT NULL,
	`resolved_at` text DEFAULT '' NOT NULL,
	`resolution` text DEFAULT '' NOT NULL,
	`reply_count` integer DEFAULT 0 NOT NULL,
	`last_reply_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wf_obs_dept_idx` ON `wf_observations` (`dept_id`);--> statement-breakpoint
CREATE INDEX `wf_obs_status_idx` ON `wf_observations` (`status`);--> statement-breakpoint
CREATE INDEX `wf_obs_raised_idx` ON `wf_observations` (`raised_at`);--> statement-breakpoint
CREATE INDEX `wf_obs_task_idx` ON `wf_observations` (`task_id`);