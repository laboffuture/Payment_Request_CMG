-- Application settings an administrator switches without a code change, as key -> JSON.
-- The first: whether a payment request needs management approval before accounts, and
-- for which companies - on, for TOP ROCK GLOBAL, as it has run since 5 Oct 2026.
CREATE TABLE IF NOT EXISTS `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text DEFAULT '' NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `app_settings` (`key`,`value`,`updated_by`,`updated_at`)
VALUES ('payment.managementApproval','{"enabled":true,"companies":["TOP ROCK GLOBAL"]}','migration',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
