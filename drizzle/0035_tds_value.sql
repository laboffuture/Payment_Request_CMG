-- The amount of TDS held back, as accounts recorded it. Paired with tds_percent in 0034
-- and split into its own file for the same reason: two ALTER TABLE statements in one
-- migration failed inside D1.
--
-- Empty unless TDS applies. The `tds` column already says Yes or No and is reused.
ALTER TABLE `payment_requests` ADD `tds_value` text DEFAULT '' NOT NULL;
