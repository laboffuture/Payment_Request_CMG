-- The TDS rate accounts applied, as a percentage.
--
-- One ALTER per migration. Written first as two in a single file and it failed inside
-- D1 with an internal error, leaving nothing applied; 0032 shows a lone ALTER works and
-- 0033 shows an ALTER followed by an INSERT works, so the second ALTER is the difference.
-- Splitting them costs a file and removes the question.
--
-- Text rather than real, to match how the other figures on this table are stored and so
-- an unanswered question stays empty instead of becoming a silent zero.
ALTER TABLE `payment_requests` ADD `tds_percent` text DEFAULT '' NOT NULL;
