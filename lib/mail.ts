/* Sending mail, through Microsoft Graph.

   Graph rather than a transactional provider because the audit team is an Exchange
   distribution list, and a distribution list normally refuses senders it cannot
   authenticate. Mail from Resend or SendGrid arrives from outside the tenant and would be
   rejected unless somebody turned that protection off - which would then let anyone on the
   internet post to the list. Sending from an internal mailbox is authenticated, so the
   list accepts it with nothing weakened.

   A distribution list is not a mailbox, so it cannot be the sender. MAIL_FROM is a real
   mailbox; the list only ever receives.

   Nothing here throws. A notification that cannot be emailed must never undo, or report as
   failed, the payment approval or meeting it describes - the same rule the rest of
   lib/notify.ts already keeps.

   Until the four secrets are set this runs in report-only mode: it works out exactly what
   it would send and writes that to the log, so the traffic can be watched for a few days
   before a single message reaches anybody. Setting the secrets is the only switch. */

import{getBindings}from"../db";

type MailEnv={MAIL_TENANT_ID?:string;MAIL_CLIENT_ID?:string;MAIL_CLIENT_SECRET?:string;
  MAIL_FROM?:string;MAIL_REDIRECT_TO?:string};

export type MailConfig={tenantId:string;clientId:string;clientSecret:string;from:string;
  redirectTo:string};

export type MailResult={sent:boolean;reason:string;to:string[];subject:string};

export async function mailConfig():Promise<MailConfig|null>{
  try{
    const env=await getBindings() as MailEnv;
    const tenantId=String(env.MAIL_TENANT_ID||"").trim();
    const clientId=String(env.MAIL_CLIENT_ID||"").trim();
    const clientSecret=String(env.MAIL_CLIENT_SECRET||"").trim();
    const from=String(env.MAIL_FROM||"").trim();
    /* Every message goes here instead of to the real recipients while this is set. It is
       how the first day of live sending should be done: real traffic, one inbox. */
    const redirectTo=String(env.MAIL_REDIRECT_TO||"").trim();
    if(!tenantId||!clientId||!clientSecret||!from)return null;
    return{tenantId,clientId,clientSecret,from,redirectTo};
  }catch{return null}}

/* The token lasts about an hour, so it is held rather than fetched for each message. Kept
   in module scope, which on this runtime means per isolate - a new isolate simply fetches
   its own. Refreshed a minute early so a message is never sent with one about to expire. */
let held:{value:string;expiresAt:number}|null=null;

async function accessToken(c:MailConfig):Promise<string>{
  if(held&&held.expiresAt>Date.now())return held.value;
  const body=new URLSearchParams({
    client_id:c.clientId,client_secret:c.clientSecret,
    scope:"https://graph.microsoft.com/.default",grant_type:"client_credentials"});
  const res=await fetch(`https://login.microsoftonline.com/${encodeURIComponent(c.tenantId)}/oauth2/v2.0/token`,
    {method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body});
  const json=await res.json().catch(()=>({})) as{access_token?:string;expires_in?:number;error_description?:string};
  if(!res.ok||!json.access_token)
    throw new Error(json.error_description||`Could not get a mail token (${res.status})`);
  held={value:json.access_token,expiresAt:Date.now()+((json.expires_in||3600)-60)*1000};
  return held.value}

/* Plain text alongside the HTML is not offered: Graph takes one content type per message,
   and HTML is what every mail client here will render. The text is kept simple enough to
   read if one does not. */
export function template(title:string,body:string,link:string,footer:string){
  const esc=(s:string)=>String(s||"").replace(/[&<>"]/g,ch=>
    ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[ch]||ch));
  return`<div style="font-family:Segoe UI,Arial,sans-serif;color:#17312b;max-width:560px">
  <p style="font-size:15px;margin:0 0 10px"><b>${esc(title)}</b></p>
  ${body?`<p style="font-size:13px;color:#42584f;margin:0 0 14px">${esc(body)}</p>`:""}
  ${link?`<p style="margin:0 0 18px"><a href="${esc(link)}" style="background:#0b725d;color:#fff;text-decoration:none;padding:9px 14px;border-radius:6px;font-size:13px">Open in CMG Payment</a></p>`:""}
  <p style="font-size:11px;color:#8a978f;margin:0;border-top:1px solid #e2e9e6;padding-top:10px">${esc(footer)}</p>
</div>`}

/* Sends one message, or reports what it would have sent.

   `replyTo` is the person whose action caused this, so that replying to a notification
   reaches a human rather than a mailbox nobody reads. */
export async function sendMail(opts:{to:string[];subject:string;html:string;replyTo?:string}):Promise<MailResult>{
  const to=[...new Set(opts.to.map(e=>(e||"").trim().toLowerCase()).filter(Boolean))];
  const result=(sent:boolean,reason:string):MailResult=>({sent,reason,to,subject:opts.subject});
  if(!to.length)return result(false,"nobody to send to");
  try{
    const c=await mailConfig();
    if(!c){
      console.log(`[mail] would send to ${to.join(", ")} — ${opts.subject}`);
      return result(false,"not configured (report-only)")}
    const recipients=(c.redirectTo?[c.redirectTo]:to)
      .map(address=>({emailAddress:{address}}));
    const message:Record<string,unknown>={
      subject:opts.subject.slice(0,240),
      body:{contentType:"HTML",content:c.redirectTo
        ?`${opts.html}<p style="font-size:11px;color:#b3372a">Redirected. Would have gone to: ${to.join(", ")}</p>`
        :opts.html},
      toRecipients:recipients};
    if(opts.replyTo)message.replyTo=[{emailAddress:{address:opts.replyTo}}];
    const token=await accessToken(c);
    const res=await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(c.from)}/sendMail`,
      {method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},
       body:JSON.stringify({message,saveToSentItems:false})});
    if(!res.ok){
      const detail=await res.text().catch(()=>"");
      /* A rejected token is worth forgetting: the next message fetches a fresh one rather
         than repeating a failure that has already been answered. */
      if(res.status===401)held=null;
      console.error(`[mail] refused (${res.status})`,detail.slice(0,300));
      return result(false,`refused with ${res.status}`)}
    return result(true,"sent");
  }catch(e){
    console.error("[mail] failed",e);
    return result(false,e instanceof Error?e.message:"failed")}}
