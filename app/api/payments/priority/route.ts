import{eq}from"drizzle-orm";
import{getDb}from"../../../../db";
import{auditLogs,paymentRequests}from"../../../../db/schema";
import{companyLock,departmentPeers,inCompany,requireAuth}from"../../../../lib/auth";
import{DEPT_PRIORITIES,DEPT_PRIORITY_ROLES,priorityOpen}from"../../../../lib/payment-stages";
import{bad,oops}from"../../../../lib/workforce-api";

/* A department head's priority on a payment request.

   Its own route, apart from the one that moves a request, on purpose: this changes three
   columns and nothing else. The status, the owner, the queues and the emails are not
   touched, so giving - or not giving - a priority cannot disturb the flow.

   Who: a Department Head, on the requests in his own scope (the same scope the list is
   held to), or an Administrator. When: once the request is past management approval and
   until it is closed. What: Critical, High, Medium, or empty to take it off again. */
export async function PATCH(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const{id,priority}=(await req.json()) as{id:number;priority:string};
    if(!Number.isFinite(Number(id)))return bad("id is required");
    const next=String(priority||"");
    if(next&&!(DEPT_PRIORITIES as readonly string[]).includes(next))
      return bad("Priority is Critical, High or Medium.",422);
    const roles=actor?.roles||[];
    if(!roles.some(r=>DEPT_PRIORITY_ROLES.includes(r)))
      return bad("Only the department head sets the priority of a request.",403);

    const db=await getDb();
    const[old]=await db.select().from(paymentRequests).where(eq(paymentRequests.id,Number(id))).limit(1);
    if(!old)return bad("Not found",404);
    /* Outside the reader's company or department is "not found", as it is on the list. */
    if(!inCompany(await companyLock(actor),{name:old.company}))return bad("Not found",404);
    const peers=await departmentPeers(actor);
    if(peers&&!peers.includes((old.raisedBy||"").toLowerCase()))return bad("Not found",404);

    if(!priorityOpen(old.status))
      return bad(old.status==="Management Approval"
        ?`${old.requestNo} is still waiting for management approval. The priority can be set once it is approved.`
        :`${old.requestNo} is closed (${old.status}), so its priority can no longer be changed.`,409);
    if((old.deptPriority||"")===next)return Response.json({payment:old});

    const by=actor?.name||actor?.email||"";
    const[payment]=await db.update(paymentRequests)
      .set({deptPriority:next,deptPriorityBy:next?by:"",deptPriorityAt:next?new Date().toISOString():""})
      .where(eq(paymentRequests.id,Number(id))).returning();
    /* On the request's trail like every other decision. Worded without the long dash the
       list reads remarks by, so it is not mistaken for one. */
    await db.insert(auditLogs).values({recordId:Number(id),
      action:next?"Priority set by department head":"Priority removed by department head",
      previousValue:old.deptPriority||"None",newValue:next||"None",actor:by||"system"});
    return Response.json({payment});
  }catch(e){return oops(e)}}
