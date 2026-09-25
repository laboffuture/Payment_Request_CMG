"use client";
/* Client helpers for the audit and accounts endpoints.

   These screens previously kept their rows in localStorage, so nothing was shared
   between people and nothing survived a different browser. The tables and routes
   already existed and were tested; this is the wiring that was missing. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const asJson=async<T=any>(res:Response):Promise<T>=>{
  const body=await res.json().catch(()=>({})) as Record<string,unknown>;
  if(!res.ok)throw new Error(String(body?.error||`Request failed (${res.status})`));
  return body as T};

const send=async(path:string,method:string,body?:unknown)=>
  asJson(await fetch(path,{method,headers:{"content-type":"application/json"},
    body:body===undefined?undefined:JSON.stringify(body)}));

export type Company={extra?:string;id:string;name:string;code:string;currency:string;country:string;
  reminderDays:number;escalationDays:number;managementEmail:string;active:boolean;position:number};
export type AuditRow={frequency?:string;recurDay?:string;recurUntil?:string;seriesId?:string;id:string;ref:string;title:string;kind:string;companyId:string;department:string;
  status:string;attendees?:string;assignedTo:string;due:string;plannedStart:string;plannedEnd:string;notes:string;
  dataProvider:string;createdAt:string;acceptedAt:string;completedAt:string};
export type Batch={extra?:string;id:string;vendor:string;requested:number;approved:number|null;currency:string;
  companyId:string;statement:string;reconciliation:string;gl:string;status:string;reason:string;
  proof:string;raisedBy:string;createdAt:string;releasedAt:string};
export type Message={id:string;authorId:string;authorName:string;authorEmail:string;authorRole:string;
  toEmployee:string;body:string;at:string};
export type Account={id:string;email:string;name:string;employeeId:string;roles:string[];
  visibleRaisers?:string[];
  /* How many payment requests this person has raised. Read-only, from the users
     endpoint, so the assignment picker can show who actually raises work. */
  requestCount?:number;
  active:boolean;mustChange:boolean;lastLoginAt:string};

export const companiesApi={
  load:async()=>(await asJson<{companies:Company[]}>(await fetch("/api/audit/companies"))).companies,
  create:async(c:Partial<Company>)=>(await send("/api/audit/companies","POST",c)).company as Company,
  update:async(c:Partial<Company>)=>(await send("/api/audit/companies","PATCH",c)).company as Company,
  remove:async(id:string)=>await asJson(await fetch(`/api/audit/companies?id=${encodeURIComponent(id)}`,
    {method:"DELETE"}))};

export const auditTasksApi={
  load:async(params:Record<string,string|number>={})=>{
    const u=new URLSearchParams();
    for(const[k,v]of Object.entries(params))if(v!==""&&v!==undefined)u.set(k,String(v));
    return await asJson<{tasks:AuditRow[];total:number}>(await fetch(`/api/audit/tasks?${u}`))},
  create:async(t:Partial<AuditRow>)=>(await send("/api/audit/tasks","POST",t)).task as AuditRow,
  update:async(t:Partial<AuditRow>&{action?:string})=>(await send("/api/audit/tasks","PATCH",t)).task as AuditRow,
  remove:async(id:string)=>await asJson(await fetch(`/api/audit/tasks?id=${encodeURIComponent(id)}`,
    {method:"DELETE"}))};

export const batchesApi={
  load:async(status?:string)=>await asJson<{batches:Batch[];total:number}>(
    await fetch(`/api/audit/batches${status?`?status=${encodeURIComponent(status)}`:""}`)),
  create:async(b:Record<string,unknown>)=>(await send("/api/audit/batches","POST",b)).batch as Batch,
  act:async(b:Record<string,unknown>)=>(await send("/api/audit/batches","PATCH",b)).batch as Batch};

export const messagesApi={
  load:async()=>await asJson<{messages:Message[]}>(await fetch("/api/audit/messages")),
  post:async(body:string,toEmployee="")=>(await send("/api/audit/messages","POST",{body,toEmployee})).message as Message,
  remove:async(id:string)=>await asJson(await fetch(`/api/audit/messages?id=${encodeURIComponent(id)}`,
    {method:"DELETE"}))};

export const accountsApi={
  /* The route has always accepted q, limit and offset and returned a total; this never
     passed them, so the screen showed whatever the default page happened to be. */
  load:async(params:Record<string,string|number>={})=>{
    const u=new URLSearchParams();
    Object.entries(params).forEach(([k,v])=>{if(v!==""&&v!==undefined)u.set(k,String(v))});
    const q=u.toString();
    return asJson<{users:Account[];total:number}>(
      await fetch(`/api/auth/users${q?`?${q}`:""}`))},
  create:async(u:{name:string;email:string;employeeId:string;roles:string[]})=>
    await send("/api/auth/users","POST",u) as {created:boolean;email:string;temporaryPassword:string},
  update:async(body:Record<string,unknown>)=>await send("/api/auth/users","PATCH",body),
  remove:async(id:string)=>await asJson(await fetch(`/api/auth/users?id=${encodeURIComponent(id)}`,
    {method:"DELETE"}))};

export type Receivable={id:string;ref:string;stage:string;customer:string;companyId:string;
  department:string;description:string;notifiedOn:string;crmJobNo:string;crmOwner:string;crmAt:string;
  soNo:string;amount:number;currency:string;soAt:string;submittedAt:string;verifiedBy:string;
  verifiedAt:string;remarks:string;returnNote:string;returnedAt:string;raisedByEmail:string;
  createdAt:string;updatedAt:string;
  jobName:string;projectName:string;jobCode:string;jobLocation:string;pmName:string;pmEmail:string;
  startDate:string;endDate:string;poNumber:string;contractValue:number;contractCurrency:string;jobType:string;
  scope:string;boqAvailable:string;managementApproval:string;priority:string;remarksNote:string;
  clientContact:string;clientAddress:string;projectType:string;contractDate:string;salesPersonName:string;
  salesPersonEmail:string;estimationPersonName:string;estimationPersonEmail:string;jobStatus:string;boqValue:number;
  estimatedCost:number;estimatedMargin:number;marginPercent:number;paymentTerms:string;retentionPercent:number;
  advancePercent:number};

/* Accounts Receivable, module 4: Debt Collection - missed invoices, and the calls, emails,
   statuses and payments logged against each. */
export type Collection={id:string;ref:string;stage:string;completionId:string;billingJobId:string;jobRef:string;
  customer:string;pmName:string;invoiceNo:string;invoiceDate:string;invoiceAmount:number;currency:string;
  creditDays:number;dueDate:string;status:string;promisedDate:string;amountReceived:number;followUps:number;
  lastFollowUpAt:string;collectorName:string;collectorEmail:string;submittedAt:string;verifiedBy:string;
  verifiedAt:string;remarks:string;returnNote:string;returnedAt:string;source:string;createdAt:string;updatedAt:string};
export type CollectionEvent={id:string;caseId:string;kind:string;at:string;byName:string;byEmail:string;
  contact:string;notes:string;status:string;amount:number;promisedDate:string};
export const collectionApi={
  load:async()=>(await asJson<{cases:Collection[]}>(await fetch("/api/collection"))).cases,
  events:async(id:string)=>(await asJson<{events:CollectionEvent[]}>(await fetch(`/api/collection?case=${encodeURIComponent(id)}`))).events,
  add:async(fields:Record<string,unknown>)=>(await send("/api/collection","POST",{action:"add",...fields})).case as Collection,
  log:async(id:string,fields:Record<string,unknown>)=>(await send("/api/collection","POST",{action:"log",id,...fields})).case as Collection,
  terms:async(id:string,creditDays:number)=>(await send("/api/collection","POST",{action:"terms",id,creditDays})).case as Collection,
  move:async(id:string,action:"submit"|"verify"|"return",fields:Record<string,unknown>={})=>
    (await send("/api/collection","PATCH",{id,action,...fields})).case as Collection};

/* Accounts Receivable, module 3: Completion and Billing - the jobs register and the
   completion cycles each active job produces. */
export type BillingJob={id:string;ref:string;jobId:string;planId:string;jobRef:string;customer:string;
  companyId:string;description:string;pmName:string;pmEmail:string;contractValue:number;currency:string;
  active:number;everyDays:number;lastRequestedAt:string;nextRequestAt:string;createdAt:string;updatedAt:string};
export type Cycle={id:string;ref:string;stage:string;billingJobId:string;jobRef:string;customer:string;
  pmName:string;pmEmail:string;contractValue:number;currency:string;requestedAt:string;requestedBy:string;
  percentComplete:number;completionNotes:string;updatedBy:string;pmUpdatedAt:string;certifiedPercent:number;
  certificationNotes:string;certifiedBy:string;certifiedAt:string;approvalNotes:string;approvedBy:string;
  approvedAt:string;invoiceNo:string;invoiceDate:string;invoiceAmount:number;invoicedBy:string;invoicedAt:string;
  verifiedBy:string;verifiedAt:string;remarks:string;returnNote:string;returnedAt:string;createdAt:string;updatedAt:string};
export const completionApi={
  load:async()=>asJson<{jobs:BillingJob[];cycles:Cycle[];totals:Record<string,{invoiced:number;certified:number}>}>(
    await fetch("/api/completion")),
  request:async(id:string)=>send("/api/completion","POST",{action:"request",id}),
  setJob:async(id:string,fields:{active?:boolean;everyDays?:number})=>
    (await send("/api/completion","POST",{action:"job",id,...fields})).job as BillingJob,
  advance:async(id:string,fields:Record<string,unknown>={})=>
    (await send("/api/completion","PATCH",{id,action:"advance",...fields})).cycle as Cycle,
  sendBack:async(id:string,stage:string,note:string)=>
    (await send("/api/completion","PATCH",{id,action:"return",stage,note})).cycle as Cycle};

/* Accounts Receivable, module 2: Planning & Procurement. As with the receivables, the
   server decides every stage move. */
export type Plan={id:string;ref:string;stage:string;jobId:string;jobRef:string;customer:string;
  companyId:string;description:string;pmName:string;pmEmail:string;pmAt:string;startDate:string;
  endDate:string;planNotes:string;planAt:string;bomSummary:string;bomCost:number;currency:string;
  procurementNotes:string;bomAt:string;submittedAt:string;verifiedBy:string;verifiedAt:string;
  remarks:string;returnNote:string;returnedAt:string;raisedByEmail:string;createdAt:string;updatedAt:string};
export type PlanJob={id:string;ref:string;customer:string;description:string;companyId:string};
export const planningApi={
  load:async()=>asJson<{plans:Plan[]}>(await fetch("/api/planning?limit=200")),
  jobs:async()=>(await asJson<{jobs:PlanJob[]}>(await fetch("/api/planning?jobs=1"))).jobs,
  people:async()=>(await asJson<{people:{name:string;email:string}[]}>(await fetch("/api/planning?people=1"))).people,
  assigned:async()=>(await asJson<{count:number}>(await fetch("/api/planning?assigned=me"))).count,
  start:async(jobId:string)=>(await send("/api/planning","POST",{jobId})).plan as Plan,
  advance:async(id:string,fields:Partial<Plan>={})=>
    (await send("/api/planning","PATCH",{id,action:"advance",...fields})).plan as Plan,
  sendBack:async(id:string,stage:string,note:string)=>
    (await send("/api/planning","PATCH",{id,action:"return",stage,note})).plan as Plan};

/* Accounts Receivable. The stage moves are a PATCH rather than a field the client
   sets, because the server decides what the next stage is - see the route. */
export const receivablesApi={
  load:async(params:Record<string,string|number>={})=>{
    const u=new URLSearchParams();
    Object.entries(params).forEach(([k,v])=>{if(v!==""&&v!==undefined)u.set(k,String(v))});
    const q=u.toString();
    return asJson<{receivables:Receivable[];total:number}>(
      await fetch(`/api/receivables${q?`?${q}`:""}`))},
  create:async(r:Partial<Receivable>)=>(await send("/api/receivables","POST",r)).receivable as Receivable,
  next:async()=>asJson<{jobNo:string;jobCode:string}>(await fetch("/api/receivables?next=1")),
  remove:async(id:string)=>asJson<{deleted:boolean;ref:string;documents:number}>(
    await fetch(`/api/receivables?id=${encodeURIComponent(id)}`,{method:"DELETE"})),
  advance:async(id:string,fields:Partial<Receivable>={})=>
    (await send("/api/receivables","PATCH",{id,action:"advance",...fields})).receivable as Receivable,
  sendBack:async(id:string,stage:string,note:string)=>
    (await send("/api/receivables","PATCH",{id,action:"return",stage,note})).receivable as Receivable};
