-- Finance can close a request at release as "Expenses Booked" instead of "Payment Released":
-- the expense is booked in the accounts against a voucher, with no bank payment to reference.
-- The voucher number is required for that, as the UTR number is for a release.
ALTER TABLE `payment_requests` ADD `voucher_number` text DEFAULT '' NOT NULL;
