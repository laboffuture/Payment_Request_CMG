-- Training can be asked for on somebody else's behalf, so the request records who it is
-- for and which department they sit in, rather than assuming the person asking.
ALTER TABLE `wf_trainings` ADD `dept_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `wf_trainings` ADD `department` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `wf_train_dept_idx` ON `wf_trainings` (`dept_id`);
