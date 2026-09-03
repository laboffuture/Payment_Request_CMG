ALTER TABLE `wf_companies` ADD `country` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `wf_companies` ADD `reminder_days` integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `wf_companies` ADD `escalation_days` integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE `wf_companies` ADD `management_email` text DEFAULT '' NOT NULL;