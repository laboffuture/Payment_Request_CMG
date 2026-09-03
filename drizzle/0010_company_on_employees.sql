-- Employees belong to a company. Until now only audit tasks and payment batches
-- carried a company, so the staff register could not be split between entities.
-- Existing rows are TRG, which is the only company on this deployment today.
ALTER TABLE `wf_employees` ADD `company_id` text DEFAULT 'c-trg' NOT NULL;--> statement-breakpoint
CREATE INDEX `wf_emp_company_idx` ON `wf_employees` (`company_id`);--> statement-breakpoint
CREATE INDEX `wf_emp_company_active_idx` ON `wf_employees` (`company_id`,`active`);
