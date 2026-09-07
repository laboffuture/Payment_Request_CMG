-- Vendor invoices and project petty cash were both raised as plain payment requests,
-- so nothing on the record said which kind it was and Accounts had to read the
-- description to tell them apart.
ALTER TABLE `payment_requests` ADD `nature` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `pay_nature_idx` ON `payment_requests` (`nature`);
