-- Premier Mall at Kumbakonam, the first job outside Chennai.
--
-- The code is TRG-01-005 as given, which does not follow the TRG-J02-nnn pattern of the
-- fourteen before it. Added exactly as supplied rather than corrected to a guess: a job
-- code is a reference somebody else issues, and inventing a "J02" it might not have would
-- be worse than an inconsistent list.
INSERT OR IGNORE INTO `setting_options` (`id`,`list_id`,`name`,`position`,`active`)
VALUES ('so-job-trg-01-005','payment.job','TRG-01-005 | PREMIER MALL | KUMBAKONAM',14,1);
