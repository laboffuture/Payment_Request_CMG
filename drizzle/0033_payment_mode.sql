-- How the money actually moves: cash or bank. Asked for on every nature of payment, so
-- it sits in the base rules rather than against any one type.
--
-- The choices are rows like every other dropdown in this application rather than a list
-- in code, so an administrator can add "Cheque" or "UPI" from Settings without a release.
--
-- The column defaults to empty: the ninety-seven requests already raised were never asked
-- this, and inventing an answer for them would be worse than leaving it blank.
ALTER TABLE `payment_requests` ADD `payment_mode` text DEFAULT '' NOT NULL;--> statement-breakpoint

INSERT OR IGNORE INTO `setting_options` (`id`,`list_id`,`name`,`position`,`active`) VALUES
  ('so-payment-mode-cash','payment.mode','Cash',0,1),
  ('so-payment-mode-bank','payment.mode','Bank',1,1);
