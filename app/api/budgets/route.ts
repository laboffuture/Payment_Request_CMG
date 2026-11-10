import{asc,eq}from"drizzle-orm";
import{getDb}from"../../../db";
import{paymentRequests,settingOptions,wfJobBudgets,wfLogs}from"../../../db/schema";
import{requireAuth}from"../../../lib/auth";
import{BUDGET_CURRENCY,DEFAULT_JOB_BUDGET,countsAsSpent,isReleased,jobKey,stateOf}from"../../../lib/budget";
import type{JobBudget}from"../../../lib/budget";
import{parseJobs}from"../../../lib/jobs";
import{audit,bad,oops,str}from"../../../lib/workforce-api";

/* Job budgets. Every job on the Jobs list has a budget - 2 Cr until an administrator sets
   another - and its spend is added up here from the payment requests booked to its JB code,
   so the figure is always current. Read by every payment user (the request form, the
   request panel and the queues show it); changed only by an administrator. */

export async function GET(req:Request){
  try{
    const{response}=await requireAuth(req,"read");
    if(response)return response;
    const db=await getDb();
    const[opts,saved,pays]=await Promise.all([
      db.select({name:settingOptions.name}).from(settingOptions)
        .where(eq(settingOptions.listId,"payment.job")).orderBy(asc(settingOptions.position)),
      db.select().from(wfJobBudgets),
      db.select({jbCode:paymentRequests.jbCode,projectCode:paymentRequests.projectCode,amount:paymentRequests.amount,
        currency:paymentRequests.currency,status:paymentRequests.status}).from(paymentRequests)]);
    const budgetOf=new Map(saved.map(b=>[b.code,b.budget]));
    const jobs=new Map<string,JobBudget>();
    const add=(code:string,project="",location="")=>{const k=jobKey(code);if(!k)return;
      if(!jobs.has(k)){const custom=budgetOf.has(k);const budget=custom?budgetOf.get(k)!:DEFAULT_JOB_BUDGET;
        jobs.set(k,{code:code.trim(),project,location,budget,custom,spent:0,released:0,inProcess:0,requests:0,balance:budget,state:"ok"})}};
    for(const j of parseJobs(opts.map(o=>o.name)))add(j.code,j.project,j.location);
    for(const b of saved)add(b.code);
    let otherCurrency=0;
    for(const p of pays){
      const j=jobs.get(jobKey(p.jbCode))||jobs.get(jobKey(p.projectCode));
      if(!j||!countsAsSpent(p.status))continue;
      if(p.currency!==BUDGET_CURRENCY){otherCurrency+=1;continue}
      const amt=Number(p.amount)||0;
      j.spent+=amt;j.requests+=1;
      if(isReleased(p.status))j.released+=amt;else j.inProcess+=amt;
    }
    for(const j of jobs.values()){j.balance=j.budget-j.spent;j.state=stateOf(j.budget,j.spent)}
    return Response.json({defaultBudget:DEFAULT_JOB_BUDGET,currency:BUDGET_CURRENCY,otherCurrency,jobs:[...jobs.values()]});
  }catch(e){return oops(e)}}

/* An administrator sets a job's budget, or puts it back to the default. */
export async function PATCH(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"admin");
    if(response)return response;
    const body=await req.json().catch(()=>({})) as Record<string,unknown>;
    const code=jobKey(body.code);
    if(!code)return bad("Choose the job.");
    const db=await getDb();
    const log=(detail:string)=>db.insert(wfLogs).values(audit(actor!.email,"job-budget",code,"update",detail));
    if(body.reset===true){
      await db.batch([db.delete(wfJobBudgets).where(eq(wfJobBudgets.code,code)),log(`${code}: back to the default budget`)]);
      return Response.json({ok:true});
    }
    const budget=Number(str(body.budget).replace(/[,\s₹]/g,""));
    if(!Number.isFinite(budget)||budget<0)return bad("Enter the budget in rupees, 0 or more.");
    if(budget>1e12)return bad("That budget is too large.");
    const at=new Date().toISOString();
    await db.batch([
      db.insert(wfJobBudgets).values({code,budget,updatedBy:actor!.name||actor!.email,updatedAt:at})
        .onConflictDoUpdate({target:wfJobBudgets.code,set:{budget,updatedBy:actor!.name||actor!.email,updatedAt:at}}),
      log(`${code}: budget set to ${budget}`)]);
    return Response.json({ok:true});
  }catch(e){return oops(e)}}
