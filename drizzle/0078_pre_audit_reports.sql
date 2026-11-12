-- Pre-audit work is reported by the auditor once done, and accepted or rejected by the
-- Audit Head. The project is kept beside the vertical (entity); the review is kept as who,
-- when and - for a rejection - why, with every step in a JSON history list.
ALTER TABLE `wf_audit_tasks` ADD `project` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_audit_tasks` ADD `reviewed_by` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_audit_tasks` ADD `reviewed_at` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_audit_tasks` ADD `reject_reason` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_audit_tasks` ADD `history` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE INDEX `wf_at_assigned_email_idx` ON `wf_audit_tasks` (`assigned_email`);
