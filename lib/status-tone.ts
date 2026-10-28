/* The colour a payment status is shown in, everywhere it is shown.

   Each screen used to carry its own guess - a lookup in the shell, a regular expression in
   the queue and another in the request panel - so one status could be blue in a list and
   amber in the panel it opened. One table now, matched on the status text exactly; the
   statuses themselves are not changed. Anything not listed is neutral. */

export type Tone="accounts"|"audit"|"correction"|"released"|"rejected"|"neutral";

const TONE:Record<string,Tone>={
  "Submitted":"accounts","Requested":"accounts","Accountant Accepted":"accounts","Accountant Review":"accounts",
  "Pre-Audit Queue":"audit","Audit Accepted":"audit","Audit Reconfirmation":"audit",
  "Query Raised":"correction","Audit Query":"correction","Observation - Audit Action":"correction",
  "Management Approval: No":"correction",
  "Management Approval":"neutral",
  "Approved by Auditor – Ready to Release":"released","Management Approval: Yes":"released","Finance Queue":"released",
  "Audit Cleared":"released","Payment Released":"released","Expenses Booked":"released","Reconciliation":"released",
  "Audit Closed":"released",
  "Rejected":"rejected","Audit Rejected":"rejected"};

export const toneOf=(status:string):Tone=>TONE[status]??"neutral";

/* The class for a status pill: `pill tone-<tone>`. */
export const pillClass=(status:string)=>`pill tone-${toneOf(status)}`;
