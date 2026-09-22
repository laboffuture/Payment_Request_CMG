-- The jobs a payment can be booked against.
--
-- The three fields are not independent: a JB code names exactly one project at one
-- location, so they are stored together as one row per job rather than as three separate
-- lists that could drift out of step. The form splits them on the pipe.
--
-- Rows in setting_options like every other dropdown here, so a new job is added from
-- Settings without a release.
--
-- Note for whoever maintains these: TRG-J02-008 and TRG-J02-010 are both VB WORLD at
-- VELACHERY, CHENNAI. Kept exactly as given - two codes against one site is ordinary
-- enough - but worth a look if that was not meant.
INSERT OR IGNORE INTO `setting_options` (`id`,`list_id`,`name`,`position`,`active`) VALUES
 ('so-job-trg-j02-001','payment.job','TRG-J02-001 | VANTHABAVAN | T.NAGAR, CHENNAI',0,1),
 ('so-job-trg-j02-002','payment.job','TRG-J02-002 | PUKO RESTAURANT | VADAPLANI, CHENNAI',1,1),
 ('so-job-trg-j02-003','payment.job','TRG-J02-003 | JUNIOR KUPPANNA | URAPAKKAM, CHENNAI',2,1),
 ('so-job-trg-j02-004','payment.job','TRG-J02-004 | JUNIOR KUPPANNA | ANNA NAGAR-Gents Camp, CHENNAI',3,1),
 ('so-job-trg-j02-005','payment.job','TRG-J02-005 | PONRAM RESTAURANT | ECR, CHENNAI',4,1),
 ('so-job-trg-j02-006','payment.job','TRG-J02-006 | KADARA RESTAURANT | ECR, CHENNAI',5,1),
 ('so-job-trg-j02-store','payment.job','TRG-J02-STORE | TRG-STORE | CHENNAI',6,1),
 ('so-job-trg-j02-007','payment.job','TRG-J02-007 | TRG-OFFICE | GUINDY, CHENNAI',7,1),
 ('so-job-trg-j02-008','payment.job','TRG-J02-008 | VB WORLD | VELACHERY, CHENNAI',8,1),
 ('so-job-trg-j02-009','payment.job','TRG-J02-009 | TRG-FACTORY | GUINDY, CHENNAI',9,1),
 ('so-job-trg-j02-010','payment.job','TRG-J02-010 | VB WORLD | VELACHERY, CHENNAI',10,1),
 ('so-job-trg-j02-011','payment.job','TRG-J02-011 | TRG-LOF FACTORY | GUINDY, CHENNAI',11,1),
 ('so-job-trg-j02-012','payment.job','TRG-J02-012 | VBW | ANNA NAGAR, CHENNAI',12,1),
 ('so-job-trg-j02-013','payment.job','TRG-J02-013 | JK (Central Kitchen) | VANAGARAM, CHENNAI',13,1);
