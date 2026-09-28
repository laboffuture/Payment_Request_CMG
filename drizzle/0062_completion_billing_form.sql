-- Completion & Billing, as its field specification sets out: the job code, project and
-- dates on each job and cycle; the billing, collection and job statuses, the completion
-- dates, pending work and reason for delay; the cost control certification and the
-- management approval, with who gave each (for maker-checker).
ALTER TABLE `wf_billing_jobs` ADD COLUMN `job_code` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_billing_jobs` ADD COLUMN `project_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_billing_jobs` ADD COLUMN `start_date` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_billing_jobs` ADD COLUMN `expected_completion` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_completions` ADD COLUMN `job_code` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_completions` ADD COLUMN `project_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_completions` ADD COLUMN `start_date` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_completions` ADD COLUMN `expected_completion` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_completions` ADD COLUMN `billing_status` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_completions` ADD COLUMN `collection_status` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_completions` ADD COLUMN `job_status` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_completions` ADD COLUMN `completion_request_date` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_completions` ADD COLUMN `actual_completion_date` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_completions` ADD COLUMN `pending_work` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_completions` ADD COLUMN `delay_reason` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_completions` ADD COLUMN `updated_by_email` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_completions` ADD COLUMN `cc_certification` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_completions` ADD COLUMN `certified_by_email` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_completions` ADD COLUMN `management_approval` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_completions` ADD COLUMN `approved_by_email` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE `wf_billing_jobs` SET
  `job_code`=coalesce((SELECT p.`job_code` FROM `wf_planning` p WHERE p.`id`=`wf_billing_jobs`.`plan_id`),''),
  `project_name`=coalesce((SELECT p.`project_name` FROM `wf_planning` p WHERE p.`id`=`wf_billing_jobs`.`plan_id`),''),
  `start_date`=coalesce((SELECT p.`start_date` FROM `wf_planning` p WHERE p.`id`=`wf_billing_jobs`.`plan_id`),''),
  `expected_completion`=coalesce((SELECT p.`end_date` FROM `wf_planning` p WHERE p.`id`=`wf_billing_jobs`.`plan_id`),'');
--> statement-breakpoint
UPDATE `wf_completions` SET
  `job_code`=coalesce((SELECT j.`job_code` FROM `wf_billing_jobs` j WHERE j.`id`=`wf_completions`.`billing_job_id`),''),
  `project_name`=coalesce((SELECT j.`project_name` FROM `wf_billing_jobs` j WHERE j.`id`=`wf_completions`.`billing_job_id`),''),
  `start_date`=coalesce((SELECT j.`start_date` FROM `wf_billing_jobs` j WHERE j.`id`=`wf_completions`.`billing_job_id`),''),
  `expected_completion`=coalesce((SELECT j.`expected_completion` FROM `wf_billing_jobs` j WHERE j.`id`=`wf_completions`.`billing_job_id`),'');
