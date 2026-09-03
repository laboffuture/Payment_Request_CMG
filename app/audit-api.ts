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

export type Company={id:string;name:string;code:string;currency:string;country:string;
  reminderDays:number;escalationDays:number;managementEmail:string;active:boolean;position:number};
export type AuditRow={id:string;ref:string;title:string;kind:string;companyId:string;department:string;
  status:string;assignedTo:string;due:string;plannedStart:string;plannedEnd:string;notes:string;
  dataProvider:string;createdAt:string;acceptedAt:string;completedAt:string};
export type Batch={id:string;vendor:string;requested:number;approved:number|null;currency:string;
  companyId:string;statement:string;reconciliation:string;gl:string;status:string;reason:string;
  proof:string;raisedBy:string;createdAt:string;releasedAt:string};
export type Message={id:string;authorId:string;authorName:string;authorEmail:string;authorRole:string;
  toEmployee:string;body:string;at:string};
export type Account={id:string;email:string;name:string;employeeId:string;roles:string[];
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
  load:async()=>await asJson<{users:Account[];total:number}>(await fetch("/api/auth/users")),
  create:async(u:{name:string;email:string;employeeId:string;roles:string[]})=>
    await send("/api/auth/users","POST",u) as {created:boolean;email:string;temporaryPassword:string},
  update:async(body:Record<string,unknown>)=>await send("/api/auth/users","PATCH",body),
  remove:async(id:string)=>await asJson(await fetch(`/api/auth/users?id=${encodeURIComponent(id)}`,
    {method:"DELETE"}))};
