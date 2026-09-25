-- The sales order form: date, tax, totals, BOQ reference and approval.
ALTER TABLE `wf_receivables` ADD COLUMN `so_date` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `tax_amount` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `total_order_value` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `advance_amount` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `retention_amount` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `boq_reference` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `so_approved_by_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `so_approved_by_email` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_receivables` ADD COLUMN `so_approval_date` text DEFAULT '' NOT NULL;
