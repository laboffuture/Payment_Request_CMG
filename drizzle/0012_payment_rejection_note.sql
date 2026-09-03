-- Rejecting a request sent it back with no reason attached, so the requestor had
-- nothing to act on. The remark is required at the point of rejection and travels
-- with the request until it is corrected and resubmitted.
ALTER TABLE `payment_requests` ADD `rejection_note` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_requests` ADD `rejected_by` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_requests` ADD `rejected_at` text DEFAULT '' NOT NULL;
