/* Accounts Receivable, module 2: Planning & Procurement.

   A job verified in Job Notification is planned here: a project manager is assigned,
   who schedules the work and details the bill of materials to procure, and audit
   verifies the plan. Held in one place, as lib/receivable-stages.ts is for module 1,
   so the API route and the screen read the same flow.

   Work moves one stage at a time and only forwards, except that audit may send an entry
   back to any stage after the job itself - the project manager, the schedule or the BOM. */

export const STAGES=["Job Notification","Assign Project Manager","Project Schedule and Planning",
  "Detailed BOM - Procurement Planning","Audit Verification","Verified"] as const;
export type Stage=typeof STAGES[number];

/* Starting a plan is choosing its job, which completes the first stage there and then:
   an entry is created already waiting for its project manager. */
export const FIRST_OPEN:Stage="Assign Project Manager";

export const stageIndex=(stage:string)=>Math.max(0,STAGES.indexOf(stage as Stage));
export const isVerified=(stage:string)=>stage===("Verified" as Stage);

export const ACCOUNTS_ROLES=["Accountant","Administrator"];
export const AUDIT_ROLES=["Auditor","Audit Head","Administrator"];
/* The roles that see Accounts Receivable as a whole. Anybody else reaches this module
   only as the project manager of an entry, and sees only those entries. */
export const RECEIVABLE_ROLES=["Accountant","Administrator","Auditor","Audit Head"];

/* The schedule and the BOM are the project manager's work. Accounts may record them too,
   so a plan does not stall because the manager is away or does not use the portal. */
const PM_STAGES:Stage[]=["Project Schedule and Planning","Detailed BOM - Procurement Planning"];

/** Whether someone with these roles - and, if they are it, the entry's project manager -
    may act on an entry at this stage. */
export const mayAct=(stage:string,roles:string[]=[],isManager=false)=>{
  const at=STAGES[stageIndex(stage)];
  if(at==="Verified"||at==="Job Notification")return false;
  if(at==="Audit Verification")return AUDIT_ROLES.some(r=>roles.includes(r));
  if(PM_STAGES.includes(at)&&isManager)return true;
  return ACCOUNTS_ROLES.some(r=>roles.includes(r))};

export const ACTION_LABEL:Record<Stage,string>={
  "Job Notification":"",
  "Assign Project Manager":"Assign project manager",
  "Project Schedule and Planning":"Submit schedule & plan",
  "Detailed BOM - Procurement Planning":"Send for audit verification",
  "Audit Verification":"Verify",
  "Verified":""};

/* What must be filled in before an entry may leave a stage. Checked on the server; the
   form marks the same fields as required. */
export const REQUIRED_TO_LEAVE:Record<Stage,string[]>={
  "Job Notification":[],
  "Assign Project Manager":["pmEmail"],
  "Project Schedule and Planning":["startDate","endDate","planNotes"],
  "Detailed BOM - Procurement Planning":["bomSummary","bomCost"],
  "Audit Verification":[],
  "Verified":[]};

export const FIELD_LABEL:Record<string,string>={
  pmEmail:"Project manager",startDate:"Start date",endDate:"Target completion date",
  planNotes:"Planning notes",bomSummary:"BOM summary",bomCost:"Estimated procurement cost",
  procurementNotes:"Procurement notes",remarks:"Audit remarks"};

/** Where audit may send an entry back: every stage after the job and before audit. */
export const RETURNABLE_TO=STAGES.slice(1,4) as readonly Stage[];
