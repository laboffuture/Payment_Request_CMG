-- The company an employee works for in the portal. Empty = every company (no restriction).
ALTER TABLE `wf_employees` ADD COLUMN `portal_company_id` text DEFAULT '' NOT NULL;
