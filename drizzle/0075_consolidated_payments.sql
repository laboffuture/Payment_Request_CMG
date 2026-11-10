-- Consolidated payments: payment requests that accounts, audit, finance or the administrator
-- combine into one batch (CP-26-0001), for one summary and one PDF. Putting a request in a
-- batch does not change its own workflow. A request sits in one batch at most: the item
-- table is keyed by the payment id.
CREATE TABLE `wf_consolidations` (
  `id` text PRIMARY KEY NOT NULL,
  `cp_no` text NOT NULL,
  `title` text DEFAULT '' NOT NULL,
  `note` text DEFAULT '' NOT NULL,
  `created_by` text DEFAULT '' NOT NULL,
  `created_by_email` text DEFAULT '' NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wf_consolidations_no_idx` ON `wf_consolidations` (`cp_no`);
--> statement-breakpoint
CREATE TABLE `wf_consolidation_items` (
  `payment_id` integer PRIMARY KEY NOT NULL,
  `consolidation_id` text NOT NULL,
  `added_by` text DEFAULT '' NOT NULL,
  `added_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wf_consolidation_items_batch_idx` ON `wf_consolidation_items` (`consolidation_id`);
