-- A message for one person about a record that needs them or has moved on. Addressed by
-- login email, which every flow can resolve: roles, attendees and the person who raised it.
CREATE TABLE `wf_notifications` (
  `id` text PRIMARY KEY NOT NULL,
  `recipient` text NOT NULL,
  `title` text NOT NULL,
  `body` text DEFAULT '' NOT NULL,
  `module` text DEFAULT '' NOT NULL,
  `record_id` text DEFAULT '' NOT NULL,
  `created_at` text NOT NULL,
  `read_at` text DEFAULT '' NOT NULL
);--> statement-breakpoint
CREATE INDEX `wf_notif_recipient_idx` ON `wf_notifications` (`recipient`,`read_at`,`created_at`);--> statement-breakpoint
-- Who raised it, by email, so "your meeting was accepted" has somebody to reach. These
-- records only kept a display name before, and a name cannot find a login.
ALTER TABLE `wf_audit_tasks` ADD `raised_by_email` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `wf_batches` ADD `raiser_email` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `wf_queries` ADD `raiser_email` text DEFAULT '' NOT NULL;
