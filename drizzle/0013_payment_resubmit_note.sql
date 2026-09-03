-- Resubmitting answered a rejection but said nothing about what had changed, so the
-- accountant had to work it out. The requestor's reply travels with the request, and
-- the original reason stays alongside it until the next decision.
ALTER TABLE `payment_requests` ADD `resubmit_note` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_requests` ADD `resubmitted_at` text DEFAULT '' NOT NULL;
