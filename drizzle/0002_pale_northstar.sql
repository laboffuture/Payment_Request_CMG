CREATE TABLE `wf_departments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text DEFAULT '' NOT NULL,
	`color` text DEFAULT '#0b725d' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wf_employees` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`designation` text DEFAULT '' NOT NULL,
	`role_id` text NOT NULL,
	`dept_id` text DEFAULT 'd-group' NOT NULL,
	`department` text DEFAULT '' NOT NULL,
	`reports_to` text,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`jd` text DEFAULT '' NOT NULL,
	`photo_at` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`joined` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wf_emp_role_idx` ON `wf_employees` (`role_id`);--> statement-breakpoint
CREATE INDEX `wf_emp_dept_idx` ON `wf_employees` (`dept_id`);--> statement-breakpoint
CREATE INDEX `wf_emp_reports_idx` ON `wf_employees` (`reports_to`);--> statement-breakpoint
CREATE INDEX `wf_emp_name_idx` ON `wf_employees` (`name`);--> statement-breakpoint
CREATE INDEX `wf_emp_active_idx` ON `wf_employees` (`active`);--> statement-breakpoint
CREATE TABLE `wf_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text NOT NULL,
	`actor` text DEFAULT '' NOT NULL,
	`entity` text DEFAULT '' NOT NULL,
	`entity_id` text DEFAULT '' NOT NULL,
	`action` text DEFAULT '' NOT NULL,
	`detail` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wf_log_at_idx` ON `wf_logs` (`at`);--> statement-breakpoint
CREATE INDEX `wf_log_entity_idx` ON `wf_logs` (`entity`,`entity_id`);--> statement-breakpoint
CREATE TABLE `wf_photos` (
	`employee_id` text PRIMARY KEY NOT NULL,
	`mime` text DEFAULT 'image/jpeg' NOT NULL,
	`data` text NOT NULL,
	`bytes` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wf_queries` (
	`id` text PRIMARY KEY NOT NULL,
	`ref` text NOT NULL,
	`title` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`raised_by` text DEFAULT '' NOT NULL,
	`employee_id` text NOT NULL,
	`task_id` text DEFAULT '' NOT NULL,
	`dept_id` text DEFAULT 'd-group' NOT NULL,
	`priority` text DEFAULT 'Medium' NOT NULL,
	`status` text DEFAULT 'Open' NOT NULL,
	`raised_at` text DEFAULT '' NOT NULL,
	`due_at` text DEFAULT '' NOT NULL,
	`follow_ups` integer DEFAULT 0 NOT NULL,
	`last_follow_up_at` text DEFAULT '' NOT NULL,
	`resolved_at` text DEFAULT '' NOT NULL,
	`resolution` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wf_query_emp_idx` ON `wf_queries` (`employee_id`);--> statement-breakpoint
CREATE INDEX `wf_query_dept_idx` ON `wf_queries` (`dept_id`);--> statement-breakpoint
CREATE INDEX `wf_query_status_idx` ON `wf_queries` (`status`);--> statement-breakpoint
CREATE INDEX `wf_query_raised_idx` ON `wf_queries` (`raised_at`);--> statement-breakpoint
CREATE TABLE `wf_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`dept_id` text DEFAULT 'd-group' NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'Support' NOT NULL,
	`parent_id` text,
	`color` text DEFAULT '#0b725d' NOT NULL,
	`jd` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wf_roles_dept_idx` ON `wf_roles` (`dept_id`);--> statement-breakpoint
CREATE INDEX `wf_roles_parent_idx` ON `wf_roles` (`parent_id`);--> statement-breakpoint
CREATE TABLE `wf_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`series_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`frequency` text DEFAULT 'Daily' NOT NULL,
	`period` text DEFAULT '' NOT NULL,
	`start_date` text DEFAULT '' NOT NULL,
	`due_date` text DEFAULT '' NOT NULL,
	`priority` text DEFAULT 'Medium' NOT NULL,
	`employee_id` text NOT NULL,
	`dept_id` text DEFAULT 'd-group' NOT NULL,
	`assigned_by` text DEFAULT '' NOT NULL,
	`expected_output` text DEFAULT '' NOT NULL,
	`remarks` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Not Started' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`qty` integer DEFAULT 0 NOT NULL,
	`done` integer DEFAULT 0 NOT NULL,
	`blocker` text DEFAULT '' NOT NULL,
	`next_action` text DEFAULT '' NOT NULL,
	`completed_at` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wf_task_emp_idx` ON `wf_tasks` (`employee_id`);--> statement-breakpoint
CREATE INDEX `wf_task_dept_idx` ON `wf_tasks` (`dept_id`);--> statement-breakpoint
CREATE INDEX `wf_task_due_idx` ON `wf_tasks` (`due_date`);--> statement-breakpoint
CREATE INDEX `wf_task_status_idx` ON `wf_tasks` (`status`);--> statement-breakpoint
CREATE INDEX `wf_task_series_idx` ON `wf_tasks` (`series_id`);--> statement-breakpoint
CREATE INDEX `wf_task_emp_freq_idx` ON `wf_tasks` (`employee_id`,`frequency`);--> statement-breakpoint
CREATE TABLE `wf_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`task_type` text DEFAULT '' NOT NULL,
	`created_date` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`employee_id` text NOT NULL,
	`function_role_id` text DEFAULT '' NOT NULL,
	`dept_id` text DEFAULT 'd-group' NOT NULL,
	`priority` text DEFAULT 'Medium' NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`qty` integer DEFAULT 0 NOT NULL,
	`done` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'Not Started' NOT NULL,
	`remarks` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wf_token_emp_idx` ON `wf_tokens` (`employee_id`);--> statement-breakpoint
CREATE INDEX `wf_token_dept_idx` ON `wf_tokens` (`dept_id`);--> statement-breakpoint
CREATE INDEX `wf_token_status_idx` ON `wf_tokens` (`status`);