-- The pre-audit task form, from the Daily Task Import template: the category (area), the
-- project / entity (vertical), the due date rule and the catalogue task it was picked
-- from. And the Audit Observation template on observations: the vertical / entity, the
-- date identified and the recommendation.
ALTER TABLE `wf_audit_tasks` ADD COLUMN `category` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_audit_tasks` ADD COLUMN `entity` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_audit_tasks` ADD COLUMN `due_rule` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_audit_tasks` ADD COLUMN `catalogue_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_observations` ADD COLUMN `entity` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_observations` ADD COLUMN `date_identified` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_observations` ADD COLUMN `recommendation` text DEFAULT '' NOT NULL;
