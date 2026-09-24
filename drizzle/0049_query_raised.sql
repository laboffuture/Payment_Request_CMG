-- "Rejected" used to mean "sent back to the requestor to correct and resubmit". That is now
-- "Query Raised", and "Rejected" closes a request for good.
--
-- The requests already sitting in "Rejected" were sent back under the old meaning, and
-- their requestors were told to correct and resubmit them. Moving them to "Query Raised"
-- keeps that promise; leaving them would close them retroactively, with nobody told.
UPDATE `payment_requests` SET `status`='Query Raised' WHERE `status`='Rejected';
