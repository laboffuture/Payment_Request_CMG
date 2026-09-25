/* The Accounts Receivable flow: job notification to audit verification.

   One reading of the flow, shared by the API route and the screen, so a stage
   cannot mean one thing to the server and another to the list - which is exactly
   how the payment statuses drifted apart before lib/payment-stages.ts pulled them
   back together.

   Work moves one stage at a time and only forwards. The single exception is the
   auditor sending an entry back, which may land on any earlier stage, because the
   thing that is wrong is not always the thing done last: a wrong customer on the
   job notification is still wrong after a sales order is cut against it. */

export const STAGES=["Job Notification","CRM JOB Creation","Sales Order","Audit Verification","Verified"] as const;
export type Stage=typeof STAGES[number];

/** Where an entry sits. An unknown stage reads as the first one rather than pretending to progress. */
export const stageIndex=(stage:string)=>Math.max(0,STAGES.indexOf(stage as Stage));

/** Nothing further is expected of anyone. */
export const isVerified=(stage:string)=>stage===("Verified" as Stage);

/* Who may act. Accounts carries an entry to the auditor's desk; audit decides.
   An administrator is deliberately in both: they are the ones who unstick a flow
   when somebody is away, and the audit trail records who actually did it. */
export const ACCOUNTS_ROLES=["Accountant","Administrator"];
export const AUDIT_ROLES=["Auditor","Audit Head","Administrator"];

const ACTS_AT:Record<Stage,string[]>={
  "Job Notification":ACCOUNTS_ROLES,
  "CRM JOB Creation":ACCOUNTS_ROLES,
  "Sales Order":ACCOUNTS_ROLES,
  "Audit Verification":AUDIT_ROLES,
  // Verified is the end of the line: nobody acts on it again.
  "Verified":[]};

export const mayAct=(stage:string,roles:string[]=[])=>
  (ACTS_AT[STAGES[stageIndex(stage)]]||[]).some(r=>roles.includes(r));

/** What the button at this stage says, so the screen and the API agree on the verb. */
export const ACTION_LABEL:Record<Stage,string>={
  "Job Notification":"Record CRM job",
  "CRM JOB Creation":"Record sales order",
  "Sales Order":"Send for audit verification",
  "Audit Verification":"Verify",
  "Verified":""};

/* What must be filled in before an entry may leave a stage. Checked on the server;
   the form uses the same list so the two cannot disagree about what is required. */
export const REQUIRED_TO_LEAVE:Record<Stage,string[]>={
  "Job Notification":["crmJobNo"],
  "CRM JOB Creation":["soNo","amount"],
  "Sales Order":[],
  "Audit Verification":[],
  "Verified":[]};

export const FIELD_LABEL:Record<string,string>={
  crmJobNo:"CRM job number",crmOwner:"CRM job owner",soNo:"Sales order number",
  amount:"Sales order amount",currency:"Currency",remarks:"Audit remarks",
  customer:"Customer",description:"Job description",notifiedOn:"Notified on"};

/** The stages an auditor may send an entry back to: everything before verification. */
export const RETURNABLE_TO=STAGES.slice(0,3) as readonly Stage[];

/* The departments a job notification can be raised for. A deliberate short list rather
   than the organisation's full department list, which runs to forty entries, most of
   which never notify a job. The form offers these and the server accepts only these. */
export const JOB_DEPARTMENTS=["Project","Procurement","Sales","Management","Marketing"] as const;
