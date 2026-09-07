-- A payment request usually answers a purchase order, but there was nowhere to record
-- which one - so the reference lived in the description or not at all.
ALTER TABLE `payment_requests` ADD `po_number` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `pay_po_idx` ON `payment_requests` (`po_number`);
