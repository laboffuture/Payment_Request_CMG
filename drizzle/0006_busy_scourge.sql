CREATE TABLE `wf_sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`roles` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT '' NOT NULL,
	`expires_at` text DEFAULT '' NOT NULL,
	`last_seen_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wf_sess_user_idx` ON `wf_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `wf_sess_exp_idx` ON `wf_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `wf_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`employee_id` text DEFAULT '' NOT NULL,
	`roles` text DEFAULT '["Requestor"]' NOT NULL,
	`salt` text NOT NULL,
	`hash` text NOT NULL,
	`iterations` integer DEFAULT 120000 NOT NULL,
	`must_change` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT '' NOT NULL,
	`password_set_at` text DEFAULT '' NOT NULL,
	`last_login_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wf_users_email_idx` ON `wf_users` (`email`);--> statement-breakpoint
CREATE INDEX `wf_users_emp_idx` ON `wf_users` (`employee_id`);