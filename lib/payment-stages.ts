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
  // with the requestor: never sent, or sent back to them
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

/* Finished, as the requestor counts it: nothing further is expected of anyone. */
export const isFinished=(status:string)=>
  ["Payment Released","Reconciliation","Audit Closed"].includes(status);
