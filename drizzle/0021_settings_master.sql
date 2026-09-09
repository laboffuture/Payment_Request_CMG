-- Master data an administrator maintains, so adding a dropdown option or an extra
-- field on a form no longer means a code change and a deploy.
CREATE TABLE `setting_options` (
  `id` text PRIMARY KEY NOT NULL,
  `list_id` text NOT NULL,
  `name` text NOT NULL,
  `position` integer DEFAULT 0 NOT NULL,
  `active` integer DEFAULT 1 NOT NULL
);--> statement-breakpoint
CREATE INDEX `set_opt_list_idx` ON `setting_options` (`list_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `set_opt_name_idx` ON `setting_options` (`list_id`,`name`);--> statement-breakpoint

-- Extra fields added to a form by an administrator. `options` holds the choices when
-- the type is a dropdown; it is unused for the other types.
CREATE TABLE `setting_fields` (
  `id` text PRIMARY KEY NOT NULL,
  `form` text NOT NULL,
  `label` text NOT NULL,
  `type` text DEFAULT 'text' NOT NULL,
  `options` text DEFAULT '' NOT NULL,
  `required` integer DEFAULT 0 NOT NULL,
  `position` integer DEFAULT 0 NOT NULL,
  `active` integer DEFAULT 1 NOT NULL
);--> statement-breakpoint
CREATE INDEX `set_fld_form_idx` ON `setting_fields` (`form`,`position`);--> statement-breakpoint

-- Values for those extra fields, kept with the request as a JSON object keyed by
-- field id. A request holds what it was raised with, so retiring a field later never
-- rewrites an old request.
ALTER TABLE `payment_requests` ADD `extra` text DEFAULT '' NOT NULL;--> statement-breakpoint

-- Nature of payment moves here from its own table, keeping whatever the
-- administrator has already added.
INSERT INTO `setting_options` (`id`,`list_id`,`name`,`position`,`active`)
  SELECT 'so-nature-'||`id`,'payment.nature',`name`,`position`,`active` FROM `payment_natures`;--> statement-breakpoint
DROP TABLE `payment_natures`;--> statement-breakpoint

INSERT INTO `setting_options` (`id`,`list_id`,`name`,`position`,`active`) VALUES
  ('so-cur-aed','payment.currency','AED',0,1),
  ('so-cur-sar','payment.currency','SAR',1,1),
  ('so-cur-inr','payment.currency','INR',2,1),
  ('so-cur-usd','payment.currency','USD',3,1),
  ('so-tds-no','payment.tds','No',0,1),
  ('so-tds-yes','payment.tds','Yes',1,1),
  ('so-urg-normal','payment.urgency','Normal',0,1),
  ('so-urg-urgent','payment.urgency','Urgent',1,1),
  ('so-att-invoice','attachment.kind','Invoice',0,1),
  ('so-att-proforma','attachment.kind','Proforma invoice',1,1),
  ('so-att-po','attachment.kind','Purchase order',2,1),
  ('so-att-do','attachment.kind','Delivery order',3,1),
  ('so-att-quote','attachment.kind','Quotation',4,1),
  ('so-att-contract','attachment.kind','Contract',5,1),
  ('so-att-proof','attachment.kind','Bank/payment proof',6,1),
  ('so-pri-low','task.priority','Low',0,1),
  ('so-pri-medium','task.priority','Medium',1,1),
  ('so-pri-high','task.priority','High',2,1),
  ('so-pri-critical','task.priority','Critical',3,1);
