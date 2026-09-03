-- A payment request recorded who currently owns it but never who raised it, so
-- "my requests" could not be answered. Recorded server-side from the session.
ALTER TABLE `payment_requests` ADD `raised_by` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `pay_raised_by_idx` ON `payment_requests` (`raised_by`);
