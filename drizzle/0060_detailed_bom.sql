-- The detailed BOM: the material lines of a plan, with the BOQ, required and purchased
-- quantities, the estimated and actual cost and who approved each line.
CREATE TABLE IF NOT EXISTS `wf_plan_bom` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text DEFAULT '' NOT NULL,
	`job_code` text DEFAULT '' NOT NULL,
	`project_name` text DEFAULT '' NOT NULL,
	`boq_item` text DEFAULT '' NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`specification` text DEFAULT '' NOT NULL,
	`unit` text DEFAULT '' NOT NULL,
	`boq_qty` real DEFAULT 0 NOT NULL,
	`boq_rate` real DEFAULT 0 NOT NULL,
	`boq_value` real DEFAULT 0 NOT NULL,
	`required_qty` real DEFAULT 0 NOT NULL,
	`purchased_qty` real,
	`balance_qty` real,
	`estimated_cost` real,
	`actual_cost` real,
	`variance` real,
	`required_date` text DEFAULT '' NOT NULL,
	`approved_by_name` text DEFAULT '' NOT NULL,
	`approved_by_email` text DEFAULT '' NOT NULL,
	`remarks` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `wf_planbom_plan_idx` ON `wf_plan_bom` (`plan_id`,`created_at`);
