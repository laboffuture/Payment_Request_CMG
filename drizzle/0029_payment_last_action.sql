-- Who last moved the request on, what they said, and when. The audit trail already holds
-- every change, but reading it per row on a queue of fifty would cost a query each; this
-- is the latest one kept where the list can show it.
ALTER TABLE `payment_requests` ADD `last_action_by` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_requests` ADD `last_action_note` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_requests` ADD `last_action_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Requests raised before this existed take theirs from the trail.
UPDATE `payment_requests` SET
  `last_action_by`=COALESCE((SELECT a.actor FROM `audit_logs` a
     WHERE a.record_id=`payment_requests`.`id` ORDER BY a.id DESC LIMIT 1),''),
  `last_action_at`=COALESCE((SELECT a.created_at FROM `audit_logs` a
     WHERE a.record_id=`payment_requests`.`id` ORDER BY a.id DESC LIMIT 1),''),
  `last_action_note`=COALESCE((SELECT CASE WHEN instr(a.new_value,' — ')>0
       THEN substr(a.new_value,instr(a.new_value,' — ')+3) ELSE '' END
     FROM `audit_logs` a WHERE a.record_id=`payment_requests`.`id` ORDER BY a.id DESC LIMIT 1),'')
WHERE EXISTS (SELECT 1 FROM `audit_logs` a WHERE a.record_id=`payment_requests`.`id`);
