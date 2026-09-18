-- Scheduled payments stop being a module of their own and become a nature of payment
-- like any other, so one form and one queue carry every request.
--
-- OR IGNORE because the id is the primary key: running this twice must not fail, and
-- must not create a second "Scheduled Payment" in the dropdown.
--
-- Position 7 puts it after the existing eleven. The positions already stored are
-- duplicated (0,1,1,2,2,3,3,4,4,5,6) because two lists were merged into this one in
-- 0021, so 7 is simply past the highest rather than a gap being filled.
INSERT OR IGNORE INTO `setting_options` (`id`,`list_id`,`name`,`position`,`active`)
VALUES ('so-payment-nature-scheduled-payment','payment.nature','Scheduled Payment',7,1);
