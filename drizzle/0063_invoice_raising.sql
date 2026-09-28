-- Invoice Raising, as its field specification sets out: the invoice type, the previous,
-- current and cumulative billing, the advance adjustment, retention and tax, and the
-- management approval of the invoice (maker-checker). invoice_amount holds the net
-- invoice value, which is what Debt Collection collects.
ALTER TABLE `wf_completions` ADD COLUMN `previous_billing` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_completions` ADD COLUMN `current_billing` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_completions` ADD COLUMN `cumulative_billing` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_completions` ADD COLUMN `advance_adjustment` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_completions` ADD COLUMN `retention_amount` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_completions` ADD COLUMN `tax_amount` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_completions` ADD COLUMN `invoice_type` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_completions` ADD COLUMN `invoiced_by_email` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_completions` ADD COLUMN `invoice_approval` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_completions` ADD COLUMN `invoice_approval_note` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_completions` ADD COLUMN `invoice_approved_by` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_completions` ADD COLUMN `invoice_approved_by_email` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_completions` ADD COLUMN `invoice_approved_at` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_billing_jobs` ADD COLUMN `retention_percent` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_billing_jobs` ADD COLUMN `advance_percent` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `wf_billing_jobs` SET
  `retention_percent`=coalesce((SELECT r.`retention_percent` FROM `wf_receivables` r WHERE r.`id`=`wf_billing_jobs`.`job_id`),0),
  `advance_percent`=coalesce((SELECT r.`advance_percent` FROM `wf_receivables` r WHERE r.`id`=`wf_billing_jobs`.`job_id`),0);
--> statement-breakpoint
-- An invoice raised before this was the whole amount, with no deductions.
UPDATE `wf_completions` SET `current_billing`=`invoice_amount` WHERE `invoice_no` <> '';
