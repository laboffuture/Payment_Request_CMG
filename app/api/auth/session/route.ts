import{eq}from"drizzle-orm";
import{getDb}from"../../../../db";
import{wfUsers}from"../../../../db/schema";
import{clearCookie,createSession,currentActor,destroySession,hashPassword,readBearer,
  readCookie,safeEqual,SESSION_COOKIE,sessionCookie}from"../../../../lib/auth";

/* Who am I? Used by the client on load to decide whether to show the sign-in screen. */
export async function GET(req:Request){
  const actor=await currentActor(req);
  return Response.json({actor});
}

/* Sign in. The same message is returned for an unknown address and a wrong password,
   so the response cannot be used to discover which accounts exist. */
export async function POST(req:Request){
  try{
    const body=await req.json() as{email?:string;password?:string;client?:string};
    const email=String(body.email||"").trim().toLowerCase();
    const password=String(body.password||"");
    if(!email||!password)
      return Response.json({error:"Email and password are required."},{status:400});
    const db=await getDb();
    const [user]=await db.select().from(wfUsers).where(eq(wfUsers.email,email)).limit(1);
    const generic={error:"That email address and password do not match."};
    if(!user)return Response.json(generic,{status:401});
    if(!user.active)return Response.json({error:"That account has been deactivated."},{status:403});
    const attempt=await hashPassword(password,user.salt,user.iterations);
    if(!safeEqual(attempt,user.hash))return Response.json(generic,{status:401});
    const{token,maxAge}=await createSession(user);
    await db.update(wfUsers).set({lastLoginAt:new Date().toISOString()})
      .where(eq(wfUsers.id,user.id));
    /* The token is handed back only to a client that asks for one. A browser never sends
       this, so an ordinary sign-in still returns nothing a script could read - which is
       the whole point of the cookie being HttpOnly. A native app cannot use that cookie
       and says so, and keeps the token in the platform's secure storage.

       The cookie is still set either way: it costs nothing where it is ignored, and it
       means a webview that does keep cookies carries on working. */
    const wantsToken=String(body.client||"").toLowerCase()==="app";
    return Response.json({actor:{userId:user.id,email:user.email,name:user.name,
      employeeId:user.employeeId,roles:JSON.parse(user.roles||"[]")},
      mustChange:!!user.mustChange,
      ...(wantsToken?{token,expiresInSeconds:maxAge}:{})},
      {headers:{"set-cookie":sessionCookie(token,maxAge)}});
  }catch(e){
    return Response.json({error:e instanceof Error?e.message:"Sign in failed."},{status:500});
  }}

/* Sign out. The session row is deleted, so the cookie is worthless immediately. */
export async function DELETE(req:Request){
  /* Either transport can end the session. The cookie name was written out by hand here,
     which would have drifted the day the constant changed. */
  await destroySession(readCookie(req,SESSION_COOKIE)||readBearer(req));
  return Response.json({signedOut:true},{headers:{"set-cookie":clearCookie()}});
}
