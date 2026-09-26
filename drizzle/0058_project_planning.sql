-- The project planning form: the job code and project, the people on the plan and its status.
ALTER TABLE `wf_planning` ADD COLUMN `job_code` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_planning` ADD COLUMN `project_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_planning` ADD COLUMN `site_engineer_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_planning` ADD COLUMN `site_engineer_email` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_planning` ADD COLUMN `qs_controller_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_planning` ADD COLUMN `qs_controller_email` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_planning` ADD COLUMN `procurement_person_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_planning` ADD COLUMN `procurement_person_email` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_planning` ADD COLUMN `finance_spoc_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_planning` ADD COLUMN `finance_spoc_email` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_planning` ADD COLUMN `planning_status` text DEFAULT '' NOT NULL;
--> statement-breakpoint
-- Plans started before this carry their job's code and project too.
UPDATE `wf_planning` SET `job_code`=(SELECT `job_code` FROM `wf_receivables` r WHERE r.`id`=`wf_planning`.`job_id`),
  `project_name`=(SELECT `project_name` FROM `wf_receivables` r WHERE r.`id`=`wf_planning`.`job_id`)
  WHERE EXISTS (SELECT 1 FROM `wf_receivables` r WHERE r.`id`=`wf_planning`.`job_id`);
