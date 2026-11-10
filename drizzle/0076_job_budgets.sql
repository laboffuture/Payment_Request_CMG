-- Job budgets: the budget each job (JB code) is held to. A job with no row here has the
-- default budget (2 Cr). Spent is worked out from the payment requests, never stored.
CREATE TABLE `wf_job_budgets` (
  `code` text PRIMARY KEY NOT NULL,
  `budget` real NOT NULL,
  `updated_by` text DEFAULT '' NOT NULL,
  `updated_at` text NOT NULL
);
