-- Debt Collection, as its field specification sets out: the job code, project and payment
-- terms of each case; the person responsible; the last and next follow-up, the method,
-- the customer's response and remarks - on the case, and on each update logged.
ALTER TABLE `wf_collections` ADD COLUMN `job_code` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_collections` ADD COLUMN `project_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_collections` ADD COLUMN `payment_terms` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_collections` ADD COLUMN `responsible_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_collections` ADD COLUMN `responsible_email` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_collections` ADD COLUMN `last_follow_up_date` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_collections` ADD COLUMN `follow_up_method` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_collections` ADD COLUMN `next_follow_up_date` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_collections` ADD COLUMN `customer_response` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_collections` ADD COLUMN `collection_remarks` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_collection_events` ADD COLUMN `method` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_collection_events` ADD COLUMN `follow_up_date` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_collection_events` ADD COLUMN `next_follow_up_date` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `wf_collection_events` ADD COLUMN `remarks` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE `wf_collections` SET
  `job_code`=coalesce((SELECT j.`job_code` FROM `wf_billing_jobs` j WHERE j.`id`=`wf_collections`.`billing_job_id`),''),
  `project_name`=coalesce((SELECT j.`project_name` FROM `wf_billing_jobs` j WHERE j.`id`=`wf_collections`.`billing_job_id`),''),
  `payment_terms`=coalesce((SELECT r.`payment_terms` FROM `wf_billing_jobs` j JOIN `wf_receivables` r ON r.`id`=j.`job_id`
    WHERE j.`id`=`wf_collections`.`billing_job_id`),''),
  `responsible_name`=`collector_name`,`responsible_email`=`collector_email`;
