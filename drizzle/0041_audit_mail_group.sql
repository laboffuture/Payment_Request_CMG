-- The distribution list that audit notifications are emailed to.
--
-- Held as a setting rather than in code so the address can be changed, or the whole thing
-- switched off, without a release: an empty or inactive list means no email is sent to
-- auditors at all. It is the on-switch as much as the address.
--
-- Accounts and finance deliberately have no entry yet. A role with no group address sends
-- no email, so this is auditors only until somebody adds the others.
INSERT OR IGNORE INTO `setting_options` (`id`,`list_id`,`name`,`position`,`active`)
VALUES ('so-mail-auditor-team','mail.auditor','auditteam@toprockglobal.com',0,1);
