-- Material Management scope for a login: which projects a Site Engineer works on and
-- which supplier a Vendor login belongs to, as JSON {"projectIds":[],"vendorId":""}.
-- The roles themselves live in wf_users.roles beside the payment roles.
ALTER TABLE `wf_users` ADD `material` text DEFAULT '{}' NOT NULL;
