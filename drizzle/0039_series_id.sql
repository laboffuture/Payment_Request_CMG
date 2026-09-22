-- Which series an occurrence belongs to. The first occurrence's own id becomes the series
-- id that every later one carries, so a series can be followed without a second table to
-- keep in step with this one.
--
-- Empty on existing rows, which is correct: none of them was generated from a series, and
-- a row with no series id is simply a one-off.
ALTER TABLE `wf_audit_tasks` ADD `series_id` text DEFAULT '' NOT NULL;
