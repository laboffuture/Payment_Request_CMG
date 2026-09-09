-- Whether tax is deducted at source was agreed in conversation and never recorded on
-- the request, so Accounts had no way to tell before releasing the payment.
ALTER TABLE `payment_requests` ADD `tds` text DEFAULT '' NOT NULL;
