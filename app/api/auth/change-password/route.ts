import{eq}from"drizzle-orm";
import{getDb}from"../../../../db";
import{wfSessions,wfUsers}from"../../../../db/schema";
import{currentActor,hashPassword,newPasswordFields,passwordProblem,safeEqual}
  from"../../../../lib/auth";

/* Change your own password. Every other session for the account is dropped, so a
   stolen cookie stops working the moment the real owner changes their password. */
export async function POST(req:Request){
  try{
    const actor=await currentActor(req);
    if(!actor)return Response.json({error:"Sign in to continue."},{status:401});
    const body=await req.json() as{current?:string;next?:string};
    const db=await getDb();
    const [user]=await db.select().from(wfUsers).where(eq(wfUsers.id,actor.userId)).limit(1);
    if(!user)return Response.json({error:"Account not found."},{status:404});

    // somebody forced onto a reset does not have to know the temporary password
    if(!user.mustChange){
      const attempt=await hashPassword(String(body.current||""),user.salt,user.iterations);
      if(!safeEqual(attempt,user.hash))
        return Response.json({error:"Your current password is not correct."},{status:403});
    }
    const problem=passwordProblem(String(body.next||""));
    if(problem)return Response.json({error:problem},{status:422});
    const reused=await hashPassword(String(body.next||""),user.salt,user.iterations);
    if(safeEqual(reused,user.hash))
      return Response.json({error:"Choose a password you have not used here before."},{status:422});

    const fields=await newPasswordFields(String(body.next));
    await db.update(wfUsers)
      .set({...fields,mustChange:0,passwordSetAt:new Date().toISOString()})
      .where(eq(wfUsers.id,user.id));
    await db.delete(wfSessions).where(eq(wfSessions.userId,user.id));
    return Response.json({changed:true,signOutRequired:true});
  }catch(e){
    return Response.json({error:e instanceof Error?e.message:"Could not change the password."},
      {status:500});
  }}
