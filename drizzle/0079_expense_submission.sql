-- Petty cash expense submission: the advance the custodian received, and the expense breakup
-- (one JSON list of dated, categorised lines with their bills). Both empty for every other request.
ALTER TABLE `payment_requests` ADD `advance_amount` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `payment_requests` ADD `expense_lines` text DEFAULT '' NOT NULL;
