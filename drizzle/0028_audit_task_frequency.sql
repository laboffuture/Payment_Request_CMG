-- How often a meeting, task, token or training repeats. Descriptive: nothing schedules
-- the next one, it records what was agreed.
ALTER TABLE `wf_audit_tasks` ADD `frequency` text DEFAULT '' NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `setting_options` (`id`,`list_id`,`name`,`position`,`active`) VALUES
  ('so-audittask-frequency-one-time','audittask.frequency','One time',0,1),
  ('so-audittask-frequency-daily','audittask.frequency','Daily',1,1),
  ('so-audittask-frequency-weekly','audittask.frequency','Weekly',2,1),
  ('so-audittask-frequency-monthly','audittask.frequency','Monthly',3,1);
