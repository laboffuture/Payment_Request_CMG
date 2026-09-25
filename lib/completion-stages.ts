/* Accounts Receivable, module 3: Completion and Billing.

   Every job whose plan is verified in Planning & Procurement is listed here, active or
   not. For each active job a completion request goes out on a schedule - weekly unless
   changed - and each request is one cycle: the project manager updates the completion,
   cost control certifies it, management approves it, accounts raise the invoice, and
   audit verifies. Held in one place so the API route and the screen read the same flow.

   Work moves one stage at a time and only forwards, except that management and audit
   may send a cycle back to an earlier stage with a reason. */

/* The flow as the business describes it. The first two are not stages a cycle sits at:
   "List of Jobs" is the register, and "Request for Project Completion" is the request
   being issued, which creates the cycle already waiting on the project manager. */
export const FLOW=["List of Jobs","Request for Project Completion","Project Manager Update",
  "Cost Control Certification","Management Approval","Raise Invoice","Audit Verification","Verified"] as const;

export const STAGES=["Project Manager Update","Cost Control Certification","Management Approval",
  "Raise Invoice","Audit Verification","Verified"] as const;
export type Stage=typeof STAGES[number];
export const FIRST:Stage="Project Manager Update";

export const stageIndex=(stage:string)=>Math.max(0,STAGES.indexOf(stage as Stage));
export const isVerified=(stage:string)=>stage===("Verified" as Stage);

export const ACCOUNTS_ROLES=["Accountant","Administrator"];
export const AUDIT_ROLES=["Auditor","Audit Head","Administrator"];
export const COST_CONTROL_ROLES=["Cost Control","Administrator"];
export const MANAGEMENT_ROLES=["Management","Administrator"];
/* Who sees the whole module. Anybody else reaches it as the project manager of a job and
   sees only their jobs. */
export const BILLING_ROLES=["Accountant","Administrator","Auditor","Audit Head","Cost Control","Management"];

/* The completion is the project manager's to report. Accounts may record it too, so a
   cycle does not stall when the manager is away or does not use the portal. */
export const mayAct=(stage:string,roles:string[]=[],isManager=false)=>{
  const at=STAGES[stageIndex(stage)];
  const any=(list:string[])=>list.some(r=>roles.includes(r));
  if(at==="Project Manager Update")return isManager||any(ACCOUNTS_ROLES);
  if(at==="Cost Control Certification")return any(COST_CONTROL_ROLES);
  if(at==="Management Approval")return any(MANAGEMENT_ROLES);
  if(at==="Raise Invoice")return any(ACCOUNTS_ROLES);
  if(at==="Audit Verification")return any(AUDIT_ROLES);
  return false};

export const ACTION_LABEL:Record<Stage,string>={
  "Project Manager Update":"Submit completion update",
  "Cost Control Certification":"Certify completion",
  "Management Approval":"Approve",
  "Raise Invoice":"Send invoice for audit verification",
  "Audit Verification":"Verify",
  "Verified":""};

export const REQUIRED_TO_LEAVE:Record<Stage,string[]>={
  "Project Manager Update":["percentComplete","completionNotes"],
  "Cost Control Certification":["certifiedPercent"],
  "Management Approval":[],
  "Raise Invoice":["invoiceNo","invoiceDate","invoiceAmount"],
  "Audit Verification":[],
  "Verified":[]};

export const FIELD_LABEL:Record<string,string>={
  percentComplete:"Completion %",completionNotes:"Completion notes",certifiedPercent:"Certified completion %",
  invoiceNo:"Invoice number",invoiceDate:"Invoice date",invoiceAmount:"Invoice amount"};

/* Where a cycle may be sent back from each approving stage: anything before it. */
export const RETURNABLE_FROM:Partial<Record<Stage,Stage[]>>={
  "Management Approval":["Project Manager Update","Cost Control Certification"],
  "Audit Verification":["Project Manager Update","Cost Control Certification","Management Approval","Raise Invoice"]};

export const DEFAULT_EVERY_DAYS=7;
