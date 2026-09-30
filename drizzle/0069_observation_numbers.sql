-- Observations are numbered OBS-AUD-001, -002, ... in the order they were raised.
-- The id stays as it is, so tags, replies, and notifications keep pointing at their observation;
-- the number is the observation's ref, which is what the screens show.
UPDATE `wf_observations` SET `ref`='OBS-AUD-'||printf('%03d',(
  SELECT count(*) FROM `wf_observations` o2 WHERE
    (o2.`raised_at`<`wf_observations`.`raised_at` OR (o2.`raised_at`=`wf_observations`.`raised_at` AND o2.`id`<=`wf_observations`.`id`))));

UPDATE `wf_logs` SET `detail`=replace(`detail`, 'OBS-MUL6O2QY', 'OBS-AUD-001') WHERE `detail` LIKE '%OBS-MUL6O2QY%';
