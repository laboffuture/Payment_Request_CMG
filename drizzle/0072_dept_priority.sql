-- The priority a department head gives a payment request once management has approved it:
-- Critical, High or Medium. Optional - empty means none was given - and it moves nothing:
-- the request's status and owner are untouched. Who set it and when ride along for the report.
ALTER TABLE `payment_requests` ADD `dept_priority` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `payment_requests` ADD `dept_priority_by` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `payment_requests` ADD `dept_priority_at` text DEFAULT '' NOT NULL;
