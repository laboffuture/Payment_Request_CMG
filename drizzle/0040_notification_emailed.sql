-- When a notification was emailed, empty meaning it was not.
--
-- This does two jobs at once. It stops the same notification being emailed twice, and it
-- keeps the backlog in: there are well over two thousand notifications already stored and
-- nearly all of them unread, so switching email on without a mark like this would send
-- every one of them at once.
--
-- Existing rows default to empty, which reads as "not emailed" - true, and they never will
-- be, because only notifications created after the switch-on date are considered.
ALTER TABLE `wf_notifications` ADD `emailed_at` text DEFAULT '' NOT NULL;
