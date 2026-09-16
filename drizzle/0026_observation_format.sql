-- The observation sheet's columns. Header, summary, risk rating and target date already
-- existed as title, detail, risk and target; these are the rest of it.
ALTER TABLE `wf_observations` ADD `area` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `wf_observations` ADD `impact` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `wf_observations` ADD `stakeholder` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `wf_observations` ADD `root_cause` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `wf_observations` ADD `transaction_value` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `wf_observations` ADD `responsibility` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `wf_observations` ADD `action_plan` text DEFAULT '' NOT NULL;
