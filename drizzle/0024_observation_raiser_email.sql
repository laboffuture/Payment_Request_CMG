-- The observation register only kept the raiser's display name, which cannot find a
-- login - so a reply or a resolution had nobody to tell. Same fix as audit tasks.
ALTER TABLE `wf_observations` ADD `raised_by_email` text DEFAULT '' NOT NULL;
