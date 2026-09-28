-- The task catalogue: the recurring accounts, compliance and audit tasks of each entity,
-- imported from the business's daily task template. Master data - the pre-audit form's
-- dropdowns read from it. Loaded outside the repository, which is public.
CREATE TABLE IF NOT EXISTS `wf_task_catalogue` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`entity` text DEFAULT '' NOT NULL,
	`assignee_name` text DEFAULT '' NOT NULL,
	`assignee_email` text DEFAULT '' NOT NULL,
	`frequency` text DEFAULT '' NOT NULL,
	`due_rule` text DEFAULT '' NOT NULL,
	`next_due` text DEFAULT '' NOT NULL,
	`next_due_date` text DEFAULT '' NOT NULL,
	`status` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `wf_taskcat_entity_idx` ON `wf_task_catalogue` (`entity`,`category`);
