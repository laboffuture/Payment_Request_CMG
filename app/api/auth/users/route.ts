import{asc,count,eq,like,or}from"drizzle-orm";
import{getDb}from"../../../../db";
import{wfEmployees,wfSessions,wfUsers}from"../../../../db/schema";
import{newPasswordFields,randomHex,requireAuth}from"../../../../lib/auth";
import{bad,oops,page,search,str}from"../../../../lib/workforce-api";

const shape=(u:Record<string,unknown>)=>({id:str(u.id),email:str(u.email).toLowerCase(),
  name:str(u.name),employeeId:str(u.employeeId),roles:Array.isArray(u.roles)?u.roles as string[]:["Requestor"]});

export async function GET(req:Request){
  try{
    const{response}=await requireAuth(req,"admin");
    if(response)return response;
    const url=new URL(req.url);
    const{limit,offset}=page(url);
    const q=search(url.searchParams.get("q"));
    const db=await getDb();
    const where=q?or(like(wfUsers.name,q),like(wfUsers.email,q)):undefined;
    const [rows,[total]]=await Promise.all([
      db.select({id:wfUsers.id,email:wfUsers.email,name:wfUsers.name,roles:wfUsers.roles,
        employeeId:wfUsers.employeeId,active:wfUsers.active,mustChange:wfUsers.mustChange,
        lastLoginAt:wfUsers.lastLoginAt}).from(wfUsers).where(where)
        .orderBy(asc(wfUsers.name)).limit(limit).offset(offset),
      db.select({n:count()}).from(wfUsers).where(where)]);
    return Response.json({users:rows.map(r=>({...r,roles:JSON.parse(r.roles||"[]"),
      active:!!r.active,mustChange:!!r.mustChange})),total:total?.n??0});
  }catch(e){return oops(e)}}

/* A login can only exist for somebody already on an organisation chart, and each
   person gets at most one. */
export async function POST(req:Request){
  try{
    const{response}=await requireAuth(req,"admin");
    if(response)return response;
    const body=await req.json() as Record<string,unknown>;
    const row=shape(body);
    if(!row.email||!row.name)return bad("name and email are required");
    if(!row.employeeId)return bad("Pick the person on the organisation chart",422);
    const db=await getDb();
    const [person]=await db.select().from(wfEmployees)
      .where(eq(wfEmployees.id,row.employeeId)).limit(1);
    if(!person)return bad("That employee is not on any organisation chart",422);
    const [clashEmail]=await db.select().from(wfUsers).where(eq(wfUsers.email,row.email)).limit(1);
    if(clashEmail)return bad("That email already has an account",409);
    const [clashPerson]=await db.select().from(wfUsers)
      .where(eq(wfUsers.employeeId,row.employeeId)).limit(1);
    if(clashPerson)return bad(`${person.name} already signs in as ${clashPerson.email}`,409);

    const temporary=`Cot-${randomHex(3)}-${Math.floor(1000+Math.random()*9000)}`;
    const fields=await newPasswordFields(temporary);
    const now=new Date().toISOString();
    await db.insert(wfUsers).values({id:`u-${Date.now().toString(36)}`,email:row.email,
      name:row.name,employeeId:row.employeeId,roles:JSON.stringify(row.roles),
      ...fields,mustChange:1,active:1,createdAt:now,passwordSetAt:now,lastLoginAt:""});
    // the temporary password is returned once, to be handed over out of band
    return Response.json({created:true,email:row.email,temporaryPassword:temporary},{status:201});
  }catch(e){return oops(e)}}

/* Administrator reset. Returns the temporary password once and forces a change. */
export async function PATCH(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"admin");
    if(response)return response;
    const body=await req.json() as Record<string,unknown>;
    const id=str(body.id);
    if(!id)return bad("id is required");
    const db=await getDb();
    const [user]=await db.select().from(wfUsers).where(eq(wfUsers.id,id)).limit(1);
    if(!user)return bad("Not found",404);

    if(str(body.action)==="reset"){
      const temporary=`Cot-${randomHex(3)}-${Math.floor(1000+Math.random()*9000)}`;
      const fields=await newPasswordFields(temporary);
      await db.update(wfUsers).set({...fields,mustChange:1,
        passwordSetAt:new Date().toISOString()}).where(eq(wfUsers.id,id));
      await db.delete(wfSessions).where(eq(wfSessions.userId,id));
      return Response.json({reset:true,email:user.email,temporaryPassword:temporary,
        by:actor?.name||""});
    }
    if(str(body.action)==="deactivate"||str(body.action)==="activate"){
      const active=str(body.action)==="activate"?1:0;
      /* Two ways an administrator could lock the whole organisation out of its own
         system, both of which happened before these guards existed: disabling your own
         account while signed in, and disabling the last administrator left. Neither is
         recoverable from the interface, because signing in is what the interface needs.
         Both are refused here rather than in the browser, so the rule holds however the
         request arrives. */
      if(!active&&id===actor?.userId)
        return bad("You cannot disable your own account. Ask another administrator.",409);
      if(!active){
        const admins=await db.select({id:wfUsers.id,roles:wfUsers.roles})
          .from(wfUsers).where(eq(wfUsers.active,1));
        const others=admins.filter(u=>u.id!==id&&
          (JSON.parse(u.roles||"[]") as string[]).some(r=>r==="Administrator"||r==="Audit Head"));
        const target=(JSON.parse(user.roles||"[]") as string[])
          .some(r=>r==="Administrator"||r==="Audit Head");
        if(target&&!others.length)
          return bad("This is the last active administrator. Give somebody else that role first.",409);
      }
      await db.update(wfUsers).set({active}).where(eq(wfUsers.id,id));
      if(!active)await db.delete(wfSessions).where(eq(wfSessions.userId,id));
      return Response.json({active:!!active});
    }
    if(Array.isArray(body.roles)){
      await db.update(wfUsers).set({roles:JSON.stringify(body.roles)}).where(eq(wfUsers.id,id));
      return Response.json({roles:body.roles});
    }
    return bad("Nothing to change");
  }catch(e){return oops(e)}}

/* Removes a login for good. The person stays on the organisation chart and their
   history is untouched: tasks, observations and audit entries record a name, not a
   foreign key, and chat messages carry the author's name and address on the row. Only
   the ability to sign in goes.

   The same two lockouts guarded on deactivate apply here and are refused for the same
   reason - deleting yourself, or deleting the last administrator, cannot be undone from
   an interface you can no longer sign in to. Use deactivate to suspend somebody you may
   want back; this is for a login raised by mistake or a person who has left. */
export async function DELETE(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"admin");
    if(response)return response;
    const id=new URL(req.url).searchParams.get("id")||"";
    if(!id)return bad("id is required");
    const db=await getDb();
    const [user]=await db.select().from(wfUsers).where(eq(wfUsers.id,id)).limit(1);
    if(!user)return bad("Not found",404);

    if(id===actor?.userId)
      return bad("You cannot delete the account you are signed in with.",409);

    const active=await db.select({id:wfUsers.id,roles:wfUsers.roles})
      .from(wfUsers).where(eq(wfUsers.active,1));
    const otherAdmins=active.filter(u=>u.id!==id&&
      (JSON.parse(u.roles||"[]") as string[]).some(r=>r==="Administrator"||r==="Audit Head"));
    const targetIsAdmin=(JSON.parse(user.roles||"[]") as string[])
      .some(r=>r==="Administrator"||r==="Audit Head");
    if(targetIsAdmin&&!otherAdmins.length)
      return bad("This is the last active administrator. Give somebody else that role first.",409);

    // sessions first, so a live cookie stops working even if the second write fails
    await db.delete(wfSessions).where(eq(wfSessions.userId,id));
    await db.delete(wfUsers).where(eq(wfUsers.id,id));
    return Response.json({deleted:true,email:user.email,by:actor?.name||""});
  }catch(e){return oops(e)}}
