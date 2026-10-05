/* How far a payment request has travelled.

   This existed twice and disagreed with itself: the request detail matched statuses
   exactly against Requested/Accounts/Audit/Correction/Recheck/Release, while the
   requestor's panel matched loosely against Requested/Accounts/Audit/Correction/
   Finance/Closed - so "Approved by Auditor - Ready to Release" was the last stage in one
   and the middle of audit in the other, because it contains the word "Audit". One
   reading, used everywhere, so a list and the request it opens cannot tell different
   stories. */

export const STAGES=["Requested","Accounts","Audit","Correction","Recheck","Release"];

const AT:Record<string,number>={
  // with the requestor: sent back to them with a query, to correct and resubmit
  "Query Raised":0,
  // waiting for management, before accounts (Top Rock Global's requests)
  "Management Approval":0,
  // closed by accounts or audit - the requestor raises a new request instead
  "Rejected":0,
  // accounts
  "Submitted":1,"Requested":1,"Accountant Accepted":1,"Accountant Review":1,
  // audit
  "Pre-Audit Queue":2,"Audit Accepted":2,
  // back to accounts to put something right
  "Observation - Audit Action":3,"Audit Query":3,"Audit Rejected":3,
  "Management Approval: No":3,
  // audit looks again
  "Audit Reconfirmation":4,
  // cleared for release, and beyond
  "Approved by Auditor – Ready to Release":5,"Management Approval: Yes":5,
  "Finance Queue":5,"Audit Cleared":5,"Payment Released":5,"Reconciliation":5,
  "Audit Closed":5};

/* 0 to 5. An unknown status sits at the start rather than pretending to progress. */
export const stageIndex=(status:string)=>AT[status]??0;
export const stageLabel=(status:string)=>STAGES[stageIndex(status)];

/* Management approval before accounts. A request raised for one of these companies goes
   first to management, and reaches the accounts queue only once management approves it;
   from there its flow is the same as any other. Matched on the name with case, spaces
   and punctuation ignored, so "TOP ROCK GLOBAL" and "TopRock Global" are one company. */
/* The companies are an administrator's setting (Settings -> Payment approvals, stored as
   payment.managementApproval); this is what applies before anyone has changed it. */
export const MANAGEMENT_FIRST_COMPANIES=["TOP ROCK GLOBAL"];
export const MANAGEMENT_APPROVAL="Management Approval";
export const MANAGEMENT_ROLES=["Management","Administrator"];
export const MANAGEMENT_SETTING="payment.managementApproval";
export type ManagementSetting={enabled:boolean;companies:string[]};
const squash=(s:string)=>String(s||"").toLowerCase().replace(/[^a-z0-9]/g,"");
export const needsManagementApproval=(company:string,setting:ManagementSetting={enabled:true,companies:MANAGEMENT_FIRST_COMPANIES})=>
  setting.enabled&&setting.companies.some(c=>squash(c)===squash(company));

/* Finished, as the requestor counts it: nothing further is expected of anyone. A rejected
   request is finished too - it is closed, and what follows it is a new request. */
export const isFinished=(status:string)=>
  ["Payment Released","Reconciliation","Audit Closed","Rejected"].includes(status);
