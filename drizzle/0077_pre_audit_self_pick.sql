-- Pre-audit tasks are picked by the auditors themselves from an open pool, and completed
-- with a short report. The auditor's login is kept beside the name, so "my tasks" does not
-- depend on two people never sharing a name. The completion date is the day it was filed.
ALTER TABLE `wf_audit_tasks` ADD `assigned_email` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_audit_tasks` ADD `work_description` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_audit_tasks` ADD `observations` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_audit_tasks` ADD `completed_on` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE INDEX `wf_at_completed_on_idx` ON `wf_audit_tasks` (`completed_on`);
--> statement-breakpoint
-- The Audit Head's remarks on an observation, as a JSON list of {by, at, text}.
ALTER TABLE `wf_observations` ADD `remarks` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE INDEX `wf_obs_entity_idx` ON `wf_observations` (`entity`);
