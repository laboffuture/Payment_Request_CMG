import{count,eq}from"drizzle-orm";
import{getDb}from"../../../db";
import{wfDepartments,wfEmployees,wfRoles}from"../../../db/schema";
import{oops}from"../../../lib/workforce-api";
import{requireAuth}from"../../../lib/auth";

/* Bootstrap payload: departments and roles (hundreds of rows at most) plus headcount.
   Deliberately excludes tasks, tokens, queries and photos — those are the unbounded
   tables and are fetched scoped to a screen, never all at once. */
export async function GET(req:Request){
  try{
    const{response}=await requireAuth(req,"read");
    if(response)return response;
    const db=await getDb();
    const [departments,roles,[headcount]]=await Promise.all([
      db.select().from(wfDepartments).orderBy(wfDepartments.position),
      db.select().from(wfRoles),
      db.select({n:count()}).from(wfEmployees).where(eq(wfEmployees.active,1))]);
    return Response.json({departments,roles,headcount:headcount?.n??0,ready:departments.length>0});
  }catch{
    return Response.json({departments:[],roles:[],headcount:0,ready:false});
  }}
