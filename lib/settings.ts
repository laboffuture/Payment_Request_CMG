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
  {id:"attachment.kind",  label:"Document type",     where:"Every attachment upload"},
  {id:"task.priority",    label:"Task priority",     where:"Tasks and work"},
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
