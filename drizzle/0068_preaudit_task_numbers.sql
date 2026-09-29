-- Pre-audit tasks are numbered Pre-Aud-Task-001, -002, ... in the order they were created.
-- The id stays as it is, so observations and remarks keep pointing at their task; the
-- number is the task's ref, which is what the screens show.
UPDATE `wf_audit_tasks` SET `ref`='Pre-Aud-Task-'||printf('%03d',(
  SELECT count(*) FROM `wf_audit_tasks` t2 WHERE t2.`kind`='Pre-Audit' AND
    (t2.`created_at`<`wf_audit_tasks`.`created_at` OR (t2.`created_at`=`wf_audit_tasks`.`created_at` AND t2.`id`<=`wf_audit_tasks`.`id`))))
WHERE `kind`='Pre-Audit';
