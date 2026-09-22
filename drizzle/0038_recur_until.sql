-- The date a recurring series stops. Empty means it keeps going.
--
-- Without this, "every Monday" has no way to end except deleting the series, which would
-- take its history with it. An end date leaves every occurrence that already happened
-- exactly where it is.
ALTER TABLE `wf_audit_tasks` ADD `recur_until` text DEFAULT '' NOT NULL;
