-- Remarks on an audit task: a running list of {by, at, text}, as JSON, added to from the
-- pre-audit queue and never rewritten.
ALTER TABLE `wf_audit_tasks` ADD COLUMN `remarks` text DEFAULT '' NOT NULL;
