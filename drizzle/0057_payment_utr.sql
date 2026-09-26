-- The UTR (bank reference) recorded when a payment is released.
ALTER TABLE `payment_requests` ADD COLUMN `utr_number` text DEFAULT '' NOT NULL;
