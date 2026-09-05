-- Training requests. Somebody asks to be taught a topic, a colleague takes it on and
-- marks it delivered, and the person who asked rates whether it helped.
CREATE TABLE `wf_trainings` (
  `id` text PRIMARY KEY NOT NULL,
  `ref` text NOT NULL,
  `topic` text NOT NULL,
  `reason` text DEFAULT '' NOT NULL,
  `employee_id` text DEFAULT '' NOT NULL,
  `employee_name` text DEFAULT '' NOT NULL,
  `requested_by` text DEFAULT '' NOT NULL,
  `status` text DEFAULT 'Requested' NOT NULL,
  `requested_at` text DEFAULT '' NOT NULL,
  `accepted_by` text DEFAULT '' NOT NULL,
  `accepted_at` text DEFAULT '' NOT NULL,
  `completed_by` text DEFAULT '' NOT NULL,
  `completed_at` text DEFAULT '' NOT NULL,
  `rating` integer DEFAULT 0 NOT NULL,
  `feedback` text DEFAULT '' NOT NULL,
  `feedback_at` text DEFAULT '' NOT NULL
);--> statement-breakpoint
CREATE INDEX `wf_train_status_idx` ON `wf_trainings` (`status`);--> statement-breakpoint
CREATE INDEX `wf_train_emp_idx` ON `wf_trainings` (`employee_id`);--> statement-breakpoint
CREATE INDEX `wf_train_by_idx` ON `wf_trainings` (`requested_by`);--> statement-breakpoint
CREATE INDEX `wf_train_at_idx` ON `wf_trainings` (`requested_at`);
