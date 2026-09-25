/* Accounts Receivable, module 4: Debt Collection.

   An invoice raised in Completion and Billing whose due date passes unpaid becomes a
   case here. Accounts follow up - calls and emails - and record what the customer says
   and pays, as often as it takes, until the invoice is collected; audit then verifies
   the collection. Held in one place so the API route and the screen read the same flow.

   The middle of this flow is a loop, not a line: a case sits at Follow Up or Status
   Update while calls, emails, promises and part-payments are logged against it, and only
   moves on once the payments recorded cover the invoice. */

export const STAGES=["Invoice Missed","Follow Up","Status Update","Audit Verification","Verified"] as const;
export type Stage=typeof STAGES[number];

/* The names the business gives the steps, shown on the flow. */
export const STEP_LABEL:Record<Stage,string>={
  "Invoice Missed":"List of Invoices Missed",
  "Follow Up":"Follow Up Call / Email",
  "Status Update":"Update Status (until collected)",
  "Audit Verification":"Audit Verification",
  "Verified":"Verified"};

export const stageIndex=(stage:string)=>Math.max(0,STAGES.indexOf(stage as Stage));
export const isVerified=(stage:string)=>stage===("Verified" as Stage);

export const ACCOUNTS_ROLES=["Accountant","Administrator"];
export const AUDIT_ROLES=["Auditor","Audit Head","Administrator"];

/* What can be logged against a case. A call or an email is a follow-up; the others are
   the customer's position, and a payment adds to what has been collected. */
export const FOLLOW_UPS=["Call","Email"] as const;
export const STATUSES=["Promised to pay","Partly paid","Disputed","No response"] as const;

/* Accounts work a case until it is collected; audit verifies it. */
export const mayLog=(stage:string,roles:string[]=[])=>
  ["Invoice Missed","Follow Up","Status Update"].includes(stage)&&ACCOUNTS_ROLES.some(r=>roles.includes(r));
export const mayVerify=(stage:string,roles:string[]=[])=>
  stage==="Audit Verification"&&AUDIT_ROLES.some(r=>roles.includes(r));

/* A penny's tolerance, so rounding on a part-payment cannot leave an invoice a fraction
   short of collected forever. */
export const isCollected=(received:number,amount:number)=>amount>0&&received>=amount-0.01;

export const DEFAULT_CREDIT_DAYS=30;
