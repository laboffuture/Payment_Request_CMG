CREATE TABLE `wf_attachment_blobs` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wf_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`kind` text DEFAULT 'Other' NOT NULL,
	`file_name` text NOT NULL,
	`mime` text DEFAULT 'application/octet-stream' NOT NULL,
	`bytes` integer DEFAULT 0 NOT NULL,
	`storage_key` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`uploaded_by` text DEFAULT '' NOT NULL,
	`uploaded_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wf_att_entity_idx` ON `wf_attachments` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `wf_att_kind_idx` ON `wf_attachments` (`kind`);--> statement-breakpoint
CREATE INDEX `wf_att_uploaded_idx` ON `wf_attachments` (`uploaded_at`);