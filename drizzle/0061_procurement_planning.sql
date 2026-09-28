-- Procurement planning: for each material of the detailed BOM, the quantity to buy, up to
-- three quotations, the vendor chosen, the purchase order and its management approval
-- (maker-checker), and delivery.
CREATE TABLE IF NOT EXISTS `wf_plan_procurement` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text DEFAULT '' NOT NULL,
	`bom_id` text DEFAULT '' NOT NULL,
	`job_code` text DEFAULT '' NOT NULL,
	`project_name` text DEFAULT '' NOT NULL,
	`material` text DEFAULT '' NOT NULL,
	`unit` text DEFAULT '' NOT NULL,
	`required_qty` real DEFAULT 0 NOT NULL,
	`available_stock` real,
	`balance_required` real DEFAULT 0 NOT NULL,
	`required_date` text DEFAULT '' NOT NULL,
	`pr_no` text DEFAULT '' NOT NULL,
	`q1_vendor` text DEFAULT '' NOT NULL,
	`q1_amount` real,
	`q1_file_id` text DEFAULT '' NOT NULL,
	`q1_file_name` text DEFAULT '' NOT NULL,
	`q2_vendor` text DEFAULT '' NOT NULL,
	`q2_amount` real,
	`q2_file_id` text DEFAULT '' NOT NULL,
	`q2_file_name` text DEFAULT '' NOT NULL,
	`q3_vendor` text DEFAULT '' NOT NULL,
	`q3_amount` real,
	`q3_file_id` text DEFAULT '' NOT NULL,
	`q3_file_name` text DEFAULT '' NOT NULL,
	`selected_vendor` text DEFAULT '' NOT NULL,
	`selected_rate` real DEFAULT 0 NOT NULL,
	`po_no` text DEFAULT '' NOT NULL,
	`po_date` text DEFAULT '' NOT NULL,
	`approval` text DEFAULT '' NOT NULL,
	`approved_by_name` text DEFAULT '' NOT NULL,
	`approved_by_email` text DEFAULT '' NOT NULL,
	`approved_at` text DEFAULT '' NOT NULL,
	`maker_email` text DEFAULT '' NOT NULL,
	`expected_delivery` text DEFAULT '' NOT NULL,
	`actual_delivery` text DEFAULT '' NOT NULL,
	`status` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `wf_planproc_plan_idx` ON `wf_plan_procurement` (`plan_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `wf_planproc_approval_idx` ON `wf_plan_procurement` (`approval`);
