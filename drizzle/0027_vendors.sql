-- The people we pay. Names are matched without regard to case, so "SSS AQUA DEVELOPERS"
-- and "sss Aqua Developers" cannot both be registered as separate vendors.
CREATE TABLE `wf_vendors` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `active` integer DEFAULT 1 NOT NULL,
  `createdAt` text DEFAULT '' NOT NULL,
  `createdBy` text DEFAULT '' NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `wf_vendor_name_idx` ON `wf_vendors` (lower(`name`));--> statement-breakpoint
CREATE INDEX `wf_vendor_active_idx` ON `wf_vendors` (`active`,`name`);
