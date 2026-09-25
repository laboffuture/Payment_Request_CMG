/* Which dropdowns an administrator may edit.

   The registry lives in code, not the database, because each entry is wired to a
   particular place in a particular form - inventing a new one here would give the
   administrator a list nothing reads.

   Only pure vocabulary appears. A work status, a query status, a task frequency and
   every payment workflow status are deliberately absent: the code branches on those
   values, so an administrator renaming "Completed" would not rename a label, it would
   stop tasks being counted as finished. */
export const OPTION_LISTS=[
  {id:"payment.nature",   label:"Nature of payment", where:"Payment request form"},
  {id:"payment.currency", label:"Currency",          where:"Payment request and scheduled payments"},
  {id:"payment.tds",      label:"TDS applicable",    where:"Payment request form"},
  {id:"payment.terms",    label:"Payment terms",     where:"Payment request form"},
  {id:"payment.mode",     label:"Mode of payment",   where:"Payment request form"},
  {id:"attachment.kind",  label:"Document type",     where:"Every attachment upload"},
  {id:"task.priority",    label:"Task priority",     where:"Tasks and work"},
  {id:"audittask.frequency",label:"How often",        where:"Meetings, tasks, tokens and training"},
  /* The group address audit notifications are emailed to. Empty or inactive means no
     email goes to auditors, so this entry is the switch as well as the address. */
  {id:"mail.auditor",     label:"Audit team email group", where:"Email notifications to auditors"},
  /* One row per job, as "JB code | Project | Job location". The three are kept together
     because a code names one project at one site; separate lists would let a payment be
     booked against the wrong one. */
  {id:"payment.job",      label:"Jobs (code | project | location)", where:"Payment request form"},
  {id:"receivable.client",label:"Clients / customers", where:"Job notification form"},
  {id:"receivable.jobType",label:"Job type",          where:"Job notification form"},
  {id:"receivable.projectType",label:"Project type",  where:"CRM job creation form"},
] as const;

export const isKnownList=(id:string)=>OPTION_LISTS.some(l=>l.id===id);

/* Forms that accept extra fields. Same reasoning: the form has to render them. */
export const FIELD_FORMS=[
  {id:"payment",   label:"Payment request"},
  {id:"scheduled", label:"Scheduled payment"},
  {id:"audittask", label:"Audit task and meeting"},
  {id:"task",      label:"Task"},
  {id:"token",     label:"Token"},
  {id:"query",     label:"Query"},
  {id:"employee",  label:"Employee"},
  {id:"training",  label:"Training request"},
  {id:"company",   label:"Company"},
] as const;

export const isKnownForm=(id:string)=>FIELD_FORMS.some(f=>f.id===id);

export const FIELD_TYPES=["text","number","date","dropdown","yesno"] as const;
export type FieldType=typeof FIELD_TYPES[number];
