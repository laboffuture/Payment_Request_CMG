import{asc,eq}from"drizzle-orm";
import{getDb}from"../../../db";
import{wfTaskCatalogue}from"../../../db/schema";
import{requireAuth}from"../../../lib/auth";
import{auditors}from"../../../lib/auditors";
import{oops}from"../../../lib/workforce-api";

/* The task catalogue, for the pre-audit form's dropdowns: every active row, in the order
   it was imported, and the auditors a task can be audited by. Read-only here; the
   catalogue is master data loaded from the business's template. */
export async function GET(req:Request){
  try{
    const{response}=await requireAuth(req,"read");
    if(response)return response;
    const db=await getDb();
    const tasks=await db.select({id:wfTaskCatalogue.id,title:wfTaskCatalogue.title,description:wfTaskCatalogue.description,
      category:wfTaskCatalogue.category,entity:wfTaskCatalogue.entity,assigneeName:wfTaskCatalogue.assigneeName,
      assigneeEmail:wfTaskCatalogue.assigneeEmail,frequency:wfTaskCatalogue.frequency,dueRule:wfTaskCatalogue.dueRule,
      nextDue:wfTaskCatalogue.nextDue,nextDueDate:wfTaskCatalogue.nextDueDate,status:wfTaskCatalogue.status})
      .from(wfTaskCatalogue).where(eq(wfTaskCatalogue.active,1)).orderBy(asc(wfTaskCatalogue.position));
    return Response.json({tasks,auditors:await auditors()});
  }catch(e){return oops(e)}}
