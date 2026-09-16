-- Fields the payment-type rules turn on. One period column serves payroll month,
-- expense date and tax period: only one of them ever applies to a given type, and the
-- form labels it for the type chosen.
ALTER TABLE `payment_requests` ADD `project_code` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_requests` ADD `invoice_number` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_requests` ADD `invoice_date` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_requests` ADD `payment_terms` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_requests` ADD `period` text DEFAULT '' NOT NULL;--> statement-breakpoint
-- The seven payment types, added to the administrator's own list so they stay editable.
INSERT OR IGNORE INTO `setting_options` (`id`,`list_id`,`name`,`position`,`active`) VALUES
  ('so-payment-nature-vendor-payment','payment.nature','Vendor Payment',0,1),
  ('so-payment-nature-hr-payroll-payment','payment.nature','HR / Payroll Payment',1,1),
  ('so-payment-nature-admin-payment','payment.nature','Admin Payment',2,1),
  ('so-payment-nature-sales-marketing-payment','payment.nature','Sales / Marketing Payment',3,1),
  ('so-payment-nature-project-expense','payment.nature','Project Expense',4,1),
  ('so-payment-nature-employee-reimbursement-claim','payment.nature','Employee Reimbursement / Claim',5,1),
  ('so-payment-nature-statutory-compliance-payment','payment.nature','Statutory / Compliance Payment',6,1),
  ('so-payment-terms-advance','payment.terms','Advance Payment',0,1),
  ('so-payment-terms-progress','payment.terms','Progress Payment',1,1),
  ('so-payment-terms-final','payment.terms','Final Payment',2,1);--> statement-breakpoint
-- The administrator added Payment Terms and a project number by hand before these
-- existed. Hidden rather than deleted, so the wording is not lost.
UPDATE `setting_fields` SET `active`=0
  WHERE `form`='payment' AND (lower(`label`) LIKE '%payment term%' OR lower(`label`) LIKE '%project num%');
