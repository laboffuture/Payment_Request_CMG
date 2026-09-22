-- The day of the week a weekly series falls on, so "every Monday" can be said at all.
-- The frequency list only offers Daily, Weekly and Monthly; on its own, Weekly can only
-- mean "seven days after the last one".
--
-- Empty on every existing row, and empty means the series keeps whatever day its first
-- occurrence was set on - which is what those rows already do.
--
-- One ALTER per migration: two in a single file failed inside D1 with an internal error
-- and left nothing applied.
ALTER TABLE `wf_audit_tasks` ADD `recur_day` text DEFAULT '' NOT NULL;
