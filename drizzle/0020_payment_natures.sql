-- The nature of a payment was two values written into the form. Which kinds exist
-- changes with the business, so they live here and an administrator maintains them.
CREATE TABLE `payment_natures` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `position` integer DEFAULT 0 NOT NULL,
  `active` integer DEFAULT 1 NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `pay_nature_name_idx` ON `payment_natures` (`name`);--> statement-breakpoint
-- the two the form already offered, so nothing changes for anyone on day one
INSERT INTO `payment_natures` (`id`,`name`,`position`,`active`) VALUES
  ('pn-vendor-payment','Vendor Payment',0,1),
  ('pn-project-petty-cash','Project Petty Cash',1,1);
