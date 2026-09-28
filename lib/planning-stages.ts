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
/* Management approves procurement (the checker of maker-checker), so it reads every plan
   too, though it acts on none of the stages. */
export const APPROVER_ROLES=["Management","Administrator"];
export const PLAN_READ_ROLES=[...RECEIVABLE_ROLES,"Management"];

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
  /* Project Planning, as its field specification sets out the mandatory fields. */
  "Project Schedule and Planning":["startDate","endDate","planningStatus"],
  /* The BOM lines themselves are checked on the server: at least one is needed. */
  "Detailed BOM - Procurement Planning":[],
  "Audit Verification":[],
  "Verified":[]};

export const FIELD_LABEL:Record<string,string>={
  pmEmail:"Project manager",startDate:"Start date",endDate:"Target completion date",
  planNotes:"Planning notes",bomSummary:"BOM summary",bomCost:"Estimated procurement cost",
  procurementNotes:"Procurement notes",remarks:"Audit remarks",planningStatus:"Planning status"};

/* A plan's status, for monitoring progress and ageing. Fixed here because the code reads
   the values; an editable list would let a renamed status stop being counted. */
export const PLANNING_STATUSES=["Not started","In progress","On hold","Completed"] as const;

/* The people on a plan besides the project manager, as the planning form names them. */
export const PLAN_PEOPLE=[
  {key:"siteEngineer",label:"Site engineer"},
  {key:"qsController",label:"QS / cost controller"},
  {key:"procurementPerson",label:"Procurement responsible person"},
  {key:"financeSpoc",label:"Finance SPOC"}] as const;

/* An activity on the project schedule has the same statuses as the plan. */
export const ACTIVITY_STATUSES=PLANNING_STATUSES;

/** Whether this reader may add to or change a plan's schedule: its project manager or
    accounts, as for the schedule stage itself, except while audit is verifying it. */
export const mayEditSchedule=(stage:string,roles:string[]=[],isManager=false)=>
  stage!==("Audit Verification" as Stage)&&(isManager||ACCOUNTS_ROLES.some(r=>roles.includes(r)));

/** An activity past its planned completion date and not completed - for ageing. */
export const isOverdue=(a:{plannedEnd:string;status:string},today:string)=>
  !!a.plannedEnd&&a.status!=="Completed"&&a.plannedEnd<today;

/* The starting lists for the BOM's material category and unit. Administrators edit
   them under Settings; these apply until they do. */
export const MATERIAL_CATEGORIES=["Joinery","Flooring","Ceiling","Partitions & drywall","Paint & finishes",
  "Glass & aluminium","Tiles & stone","Sanitaryware","Hardware & ironmongery","Furniture","Lighting",
  "Electrical","Plumbing","HVAC","Civil","Other"];
export const BOM_UNITS=["Nos","Sqm","Sqft","Rm","Lm","Cum","Kg","Ton","Ltr","Set","Lot","Roll","Sheet","Box","Pair"];

/* The worked-out figures of a BOM line, as the server stores and the form shows them:
   BOQ value = quantity x rate; balance = required - purchased; variance = estimated
   cost - actual cost, so a negative variance is an overrun. Null when an input is absent. */
const r2=(n:number)=>Math.round(n*100)/100;
export const bomFigures=(l:{boqQty:number;boqRate:number;requiredQty:number;purchasedQty:number|null;
  estimatedCost:number|null;actualCost:number|null})=>({
  boqValue:r2(l.boqQty*l.boqRate),
  balanceQty:l.purchasedQty===null?null:r2(l.requiredQty-l.purchasedQty),
  variance:l.estimatedCost===null||l.actualCost===null?null:r2(l.estimatedCost-l.actualCost)});

/* Procurement planning. A purchase moves through these statuses; the ones from "PO
   issued" on need the management approval first. Fixed here because the code reads them. */
export const PROCUREMENT_STATUSES=["Requested","Quotations received","Awaiting approval","PO issued",
  "Partly delivered","Delivered","Cancelled"] as const;
export const NEEDS_APPROVAL=["PO issued","Partly delivered","Delivered"];
export const APPROVALS=["Pending","Approved","Rejected"] as const;

/** Where audit may send an entry back: every stage after the job and before audit. */
export const RETURNABLE_TO=STAGES.slice(1,4) as readonly Stage[];
