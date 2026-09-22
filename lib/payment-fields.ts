/* What a payment request must carry, by payment type.

   M - must be filled in. C - offered, optional. H - not shown at all.

   The rules live here rather than in the database because the form has to render each
   field and the server has to enforce it; a rule for a field nothing draws would be a
   rule nobody keeps. The payment types themselves stay in the administrator's list, so
   one can be renamed or added - a type with no rules here falls back to BASE, which is
   the common set every type shares. */

export type Need="M"|"C"|"H";
export type FieldKey="company"|"department"|"nature"|"tds"|"vendor"|"poNumber"|"amount"
  |"due"|"currency"|"paymentMode"|"projectCode"|"paymentTerms"|"invoiceNumber"
  |"invoiceDate"|"period"|"jobNo"|"jbCode"|"project"|"jobLocation"|"workType"
  |"description"|"documents";

/* Always required, whatever the type. */
const BASE:Record<FieldKey,Need>={
  company:"M",department:"M",nature:"M",amount:"M",due:"M",currency:"M",
  /* Mandatory here rather than against any one type, because it is asked of every nature
     of payment. No rule below overrides it. */
  paymentMode:"M",
  description:"M",documents:"M",vendor:"M",tds:"C",
  poNumber:"H",projectCode:"H",paymentTerms:"H",invoiceNumber:"H",invoiceDate:"H",period:"H",
  /* Hidden by default. Only the natures tied to a job ask for these, and hidden means the
     server clears the value rather than trusting it - so a job number typed under one
     nature cannot travel into another that has nothing to do with a job. */
  jobNo:"H",jbCode:"H",project:"H",jobLocation:"H",workType:"H"};

/* The job details, as the natures tied to project work ask for them. Written once and
   spread into each, so the five cannot drift apart - which is the whole reason they are
   here rather than repeated five times.

   The job number and the project are required, because without them the payment cannot be
   attributed to anything. The rest are conditional: a location or a work type is often
   obvious from the project, and demanding them would only invite anything typed to get
   past the check. */
const JOB_FIELDS={jobNo:"M",jbCode:"C",project:"M",jobLocation:"C",workType:"C"} as const;

type Rule={need:Partial<Record<FieldKey,Need>>;labels?:Partial<Record<FieldKey,string>>;
  departments:string};

export const PAYMENT_TYPES:Record<string,Rule>={
  "Vendor Payment":{
    departments:"Procurement / Project / Admin / IT / Sales / Other",
    need:{tds:"M",poNumber:"M",projectCode:"C",paymentTerms:"C",invoiceNumber:"M",invoiceDate:"M",
      ...JOB_FIELDS}},
  "HR / Payroll Payment":{
    departments:"HR",
    labels:{vendor:"Employee / beneficiary",period:"Payroll month / period"},
    need:{tds:"C",period:"M"}},
  "Admin Payment":{
    departments:"Admin",
    need:{tds:"C",poNumber:"C",projectCode:"C",paymentTerms:"C"}},
  "Sales / Marketing Payment":{
    departments:"Sales / Marketing",
    need:{tds:"C",poNumber:"C",projectCode:"C",paymentTerms:"C"}},
  "Project Expense":{
    departments:"Project / Operations",
    need:{tds:"C",poNumber:"M",projectCode:"M",paymentTerms:"M",...JOB_FIELDS}},
  /* The remaining natures tied to a job. They ask for the job details and little else:
     petty cash and labour payments are settled against a job rather than an invoice. */
  "Project Petty Cash":{
    departments:"Project / Operations",
    need:{tds:"C",...JOB_FIELDS}},
  "OT Labour Payment":{
    departments:"Project / Operations / HR",
    labels:{vendor:"Paid to",period:"Overtime period"},
    need:{tds:"C",period:"M",...JOB_FIELDS}},
  "Sub Contractor":{
    departments:"Project / Operations",
    labels:{vendor:"Sub contractor"},
    need:{tds:"C",poNumber:"C",invoiceNumber:"C",invoiceDate:"C",paymentTerms:"C",...JOB_FIELDS}},
  "Employee Reimbursement / Claim":{
    departments:"All departments",
    labels:{vendor:"Employee / beneficiary",period:"Expense date / period"},
    need:{tds:"H",projectCode:"C",period:"M"}},
  "Statutory / Compliance Payment":{
    departments:"Accounts / Finance / HR / Admin",
    labels:{period:"Tax period"},
    need:{tds:"C",vendor:"C",period:"M"}},
  /* Was a module of its own, backed by wf_batches. What it asked for was a vendor, an
     amount, a currency and two statements - a vendor statement and a reconciliation -
     with the GL optional. Two separately mandated attachments cannot be expressed here,
     since the model has a single documents key, so the label names both and documents
     stays mandatory. No PO or invoice: these were settled against a statement, not an
     invoice. */
  "Scheduled Payment":{
    departments:"Accounts / Finance",
    labels:{documents:"Vendor statement and reconciliation statement",
      period:"Statement period"},
    need:{tds:"C",vendor:"M",period:"M",poNumber:"H",projectCode:"H",
      paymentTerms:"H",invoiceNumber:"H",invoiceDate:"H"}},
};

const LABELS:Record<FieldKey,string>={
  company:"Company",department:"Department",nature:"Nature of payment",tds:"TDS applicable",
  vendor:"Vendor / beneficiary",poNumber:"PO number",amount:"Amount",due:"Due date",
  currency:"Currency",paymentMode:"Mode of payment",
  projectCode:"Project code",paymentTerms:"Payment terms",
  invoiceNumber:"Invoice number",invoiceDate:"Invoice date",period:"Period",
  jobNo:"Job #",jbCode:"JB code",project:"Project",jobLocation:"Job location",
  workType:"Type of works",
  description:"Description",documents:"Supporting documents"};

export const ruleFor=(nature:string,field:FieldKey):Need=>
  PAYMENT_TYPES[nature]?.need[field]??BASE[field];

export const labelFor=(nature:string,field:FieldKey):string=>
  PAYMENT_TYPES[nature]?.labels?.[field]??LABELS[field];

export const departmentsFor=(nature:string)=>PAYMENT_TYPES[nature]?.departments||"";

/* Everything the form can draw, in the order it draws them. */
/* tds is deliberately absent. Both forms and the server's field check all walk this list,
   so dropping the key here stops it being asked for, validated or written anywhere -
   while the column and the ninety-five requests that carry a value keep them.

   Marking it "H" would have been the obvious move and the wrong one: hidden means the
   server clears the field, so the first correction to an old request would have wiped its
   TDS. The per-type rules below still mention it and are simply inert, which makes
   restoring the field a one-line change if it is ever wanted again. */
export const FIELD_ORDER:FieldKey[]=["company","department","nature","vendor",
  "poNumber","projectCode","invoiceNumber","invoiceDate","paymentTerms","period",
  /* The job details sit together, after the invoice fields and before the money. */
  "jobNo","jbCode","project","jobLocation","workType",
  "amount","due","currency","paymentMode","description"];

/* Fields the server checks on a new request. Documents are uploaded after the request
   exists, so they are required by the form rather than here. */
export const REQUIRED_ON_SAVE=FIELD_ORDER.filter(f=>f!=="nature");
