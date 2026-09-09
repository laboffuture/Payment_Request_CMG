-- Extra fields are no longer a payment-request idea. Every record a form creates can
-- carry the values an administrator added, kept as JSON alongside the record so a
-- field retired later never rewrites what was captured.
ALTER TABLE `wf_employees` ADD `extra` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `wf_tasks` ADD `extra` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `wf_tokens` ADD `extra` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `wf_queries` ADD `extra` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `wf_audit_tasks` ADD `extra` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `wf_trainings` ADD `extra` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `wf_companies` ADD `extra` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `wf_batches` ADD `extra` text DEFAULT '' NOT NULL;
