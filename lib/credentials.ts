
/* Authentication for the hosted build.

   Passwords are never stored or compared in clear text: each account keeps a random
   salt and a PBKDF2-SHA256 hash, verified with a constant-time comparison. Sessions
   are rows in D1 rather than signed tokens, so revoking one — a sign-out, a
   deactivation, a password change — takes effect on the very next request instead of
   waiting for a token to expire. */

const enc=new TextEncoder();
export const SESSION_COOKIE="cot_session";
export const SESSION_HOURS=12;          // idle time before a session stops working
/* The cookie is kept far longer than the session it carries. It is only a bearer
   token - the row in wf_sessions decides whether it still works, and that row moves
   forward as the person keeps working. On the same twelve-hour clock the browser would
   throw the cookie away mid-session and renewing the row could not help. */
export const COOKIE_DAYS=30;
export const DEFAULT_ITERATIONS=120000;

const toHex=(buf:ArrayBuffer)=>Array.from(new Uint8Array(buf))
  .map(b=>b.toString(16).padStart(2,"0")).join("");
const fromHex=(hex:string)=>{
  const out=new Uint8Array(hex.length/2);
  for(let i=0;i<out.length;i++)out[i]=parseInt(hex.slice(i*2,i*2+2),16);
  return out};

export const randomHex=(bytes=32)=>toHex(crypto.getRandomValues(new Uint8Array(bytes)).buffer);

export async function hashPassword(password:string,salt:string,iterations=DEFAULT_ITERATIONS){
  const key=await crypto.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits(
    {name:"PBKDF2",salt:fromHex(salt),iterations,hash:"SHA-256"},key,256);
  return toHex(bits)}

/* Compares every byte regardless of where the first difference is, so the time taken
   cannot be used to guess the hash. */
export function safeEqual(a:string,b:string){
  if(a.length!==b.length)return false;
  let diff=0;
  for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0}

export async function newPasswordFields(password:string){
  const salt=randomHex(16);
  return{salt,hash:await hashPassword(password,salt),iterations:DEFAULT_ITERATIONS}}

export function passwordProblem(password:string){
  const v=String(password||"");
  if(v.length<10)return "Password must be at least 10 characters.";
  if(!/[A-Za-z]/.test(v))return "Password must contain a letter.";
  if(!/[0-9]/.test(v))return "Password must contain a number.";
  return ""}

/* ---------- cookies ---------- */
export const readCookie=(req:Request,name:string)=>{
  const raw=req.headers.get("cookie")||"";
  for(const part of raw.split(";")){
    const [k,...rest]=part.trim().split("=");
    if(k===name)return decodeURIComponent(rest.join("="))}
  return ""};

/* A native app has no cookie jar for this site: the page inside a webview is served from
   its own origin, so the session cookie is never sent with a call to the API. The same
   session token is accepted from an Authorization header instead.

   This is a second way of carrying the credential, not a second credential. The row in
   wf_sessions still decides whether it works, so signing out, deactivating an account or
   changing a password stops the app on its very next request exactly as it stops a
   browser. Nothing here is signed or self-describing.

   The shape is checked before the value is used, so a malformed header is treated as no
   credential rather than being looked up. */
export const readBearer=(req:Request)=>{
  const raw=(req.headers.get("authorization")||"").trim();
  const m=/^Bearer\s+([A-Fa-f0-9]{32,128})$/.exec(raw);
  return m?m[1]:""};

export const sessionCookie=(token:string,maxAgeSeconds:number)=>
  `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; `+
  `Max-Age=${maxAgeSeconds}`;
export const clearCookie=()=>`${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;

