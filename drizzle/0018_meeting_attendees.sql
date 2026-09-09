-- A meeting was created with a title, a date and nobody on it: there was nowhere to
-- record who is expected to attend, so invitations lived outside the system.
ALTER TABLE `wf_audit_tasks` ADD `attendees` text DEFAULT '' NOT NULL;
