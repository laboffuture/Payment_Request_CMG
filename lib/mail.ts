/* Sending mail, through the Gmail API on Google Workspace.

   A service account with domain-wide delegation, impersonating a real mailbox. That is
   the Workspace equivalent of a server application having its own login: the account
   signs a short assertion with its private key, Google exchanges it for a token, and the
   message is sent as the mailbox named in MAIL_FROM.

   Sent as an internal mailbox rather than through an outside relay, for the same reason
   the group address exists: auditteam@ is a Google Group, and a group decides who may
   post to it. An internal sender satisfies "anyone in the organisation" without the
   posting rule having to be opened up to the whole internet.

   The group can only receive. MAIL_FROM has to be an ordinary mailbox.

   SMTP is not an option here whichever provider is used - this runtime has no raw TCP, so
   smtp-relay.gmail.com cannot be reached. It has to be the HTTP API.

   Nothing here throws. A notification that cannot be emailed must never undo, or report as
   failed, the payment approval or meeting it describes.

   Until the service account details are set this runs in report-only mode: it works out
   exactly what it would send and writes that to the log, so the traffic can be watched
   before a single message reaches anybody. */

import{getBindings}from"../db";

type MailEnv={MAIL_CLIENT_EMAIL?:string;MAIL_PRIVATE_KEY?:string;MAIL_FROM?:string;
  MAIL_SEND_AS?:string;MAIL_FROM_NAME?:string;MAIL_REPLY_TO?:string;MAIL_REDIRECT_TO?:string;
  RELAY_URL?:string;RELAY_TOKEN?:string;MAIL_COPY_TO?:string};

/* Who gets a hidden copy of every message - one address or several, comma separated. It
   is how the people running the system see every flow the way its participants do,
   without being named on any of it. Addresses already on the message are not added again. */
async function copiesFor(recipients:string[]){
  const env=await getBindings() as MailEnv;
  const on=new Set(recipients.map(r=>r.toLowerCase()));
  return String(env.MAIL_COPY_TO||"").split(",").map(x=>x.trim().toLowerCase())
    .filter(x=>x&&!on.has(x))}

export type MailConfig={clientEmail:string;privateKey:string;from:string;sendAs:string;
  fromName:string;replyTo:string;redirectTo:string};
export type MailResult={sent:boolean;reason:string;to:string[];subject:string};

const SCOPE="https://www.googleapis.com/auth/gmail.send";
const TOKEN_URL="https://oauth2.googleapis.com/token";

export async function mailConfig():Promise<MailConfig|null>{
  try{
    const env=await getBindings() as MailEnv;
    const clientEmail=String(env.MAIL_CLIENT_EMAIL||"").trim();
    /* A PEM is multi-line and an environment value is not, so the newlines arrive
       escaped. Both forms are accepted rather than insisting on one. */
    const privateKey=String(env.MAIL_PRIVATE_KEY||"").replace(/\\n/g,"\n").trim();
    const from=String(env.MAIL_FROM||"").trim();
    /* The address that appears in From, when it should not be the mailbox being
       impersonated. Google only lets a message claim an address the account is entitled
       to - a verified "send as" alias of MAIL_FROM - and rewrites or refuses anything
       else, so this is not a free-text field however much it looks like one. */
    const sendAs=String(env.MAIL_SEND_AS||"").trim()||from;
    /* The name a recipient actually reads. This one is free text, and it is what makes a
       message look like it came from a system rather than from a person. */
    const fromName=String(env.MAIL_FROM_NAME||"CMG Payment Request").trim();
    /* "none" leaves the header off entirely, which is what makes a message a no-reply.
       An address here is used for every message; empty keeps the older behaviour of
       replying to whoever acted. */
    const replyTo=String(env.MAIL_REPLY_TO||"").trim();
    const redirectTo=String(env.MAIL_REDIRECT_TO||"").trim();
    if(!clientEmail||!privateKey||!from)return null;
    return{clientEmail,privateKey,from,sendAs,fromName,replyTo,redirectTo};
  }catch{return null}}

/* ---------- encoding ---------- */

const bytesToB64=(bytes:Uint8Array)=>{
  let s="";
  for(let i=0;i<bytes.length;i++)s+=String.fromCharCode(bytes[i]);
  return btoa(s)};
const b64url=(bytes:Uint8Array)=>
  bytesToB64(bytes).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const utf8=(s:string)=>new TextEncoder().encode(s);

/* A header may only carry plain ASCII. Anything else - an en dash in a status, an accent
   in a vendor's name - has to be encoded, or the subject arrives as mojibake. */
const headerValue=(s:string)=>
  /^[\x20-\x7E]*$/.test(s)?s:`=?UTF-8?B?${bytesToB64(utf8(s))}?=`;

/* `Name <address>`. A plain name is quoted, because an unquoted one may only be made of
   atoms and "CMG Payment Request" would be read as three of them. An encoded name must
   not be quoted - the quotes would become part of the decoded text - so the two cases are
   built differently rather than wrapped alike. */
const fromHeader=(address:string,name:string)=>{
  if(!name)return address;
  const plain=/^[\x20-\x7E]*$/.test(name);
  const shown=plain?`"${name.replace(/["\\]/g,"")}"`:headerValue(name);
  return`${shown} <${address}>`};

/* ---------- token ---------- */

/* The token lasts an hour, so it is held rather than fetched per message. Module scope
   means per isolate; a new isolate simply fetches its own. Refreshed a minute early so a
   message is never sent with one about to expire. */
let held:{value:string;expiresAt:number}|null=null;

async function signingKey(pem:string){
  const body=pem.replace(/-----[A-Z ]+-----/g,"").replace(/\s+/g,"");
  const der=Uint8Array.from(atob(body),c=>c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8",der,
    {name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"])}

async function accessToken(c:MailConfig):Promise<string>{
  if(held&&held.expiresAt>Date.now())return held.value;
  const now=Math.floor(Date.now()/1000);
  const header=b64url(utf8(JSON.stringify({alg:"RS256",typ:"JWT"})));
  /* `sub` is the mailbox being impersonated. Domain-wide delegation is what permits it,
     and it is granted in the Workspace admin console against this scope alone. */
  const claims=b64url(utf8(JSON.stringify({
    iss:c.clientEmail,sub:c.from,scope:SCOPE,aud:TOKEN_URL,iat:now,exp:now+3600})));
  const unsigned=`${header}.${claims}`;
  const key=await signingKey(c.privateKey);
  const signature=new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,utf8(unsigned)));
  const assertion=`${unsigned}.${b64url(signature)}`;
  const res=await fetch(TOKEN_URL,{method:"POST",
    headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({
      grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion})});
  const json=await res.json().catch(()=>({})) as
    {access_token?:string;expires_in?:number;error?:string;error_description?:string};
  if(!res.ok||!json.access_token)
    throw new Error(json.error_description||json.error||`Could not get a mail token (${res.status})`);
  held={value:json.access_token,expiresAt:Date.now()+((json.expires_in||3600)-60)*1000};
  return held.value}

/* ---------- the message ---------- */

export type Tone="normal"|"warning"|"good";
export type Detail={label:string;value:string};

const esc=(s:string)=>String(s||"").replace(/[&<>"]/g,ch=>
  ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[ch]||ch));

/* Laid out in tables with inline styles rather than a stylesheet, because Outlook renders
   mail through Word and drops most of what a browser would honour. Anything that fails to
   apply degrades to readable text rather than to a broken layout. */
export function template(o:{title:string;reference?:string;intro?:string;detail?:Detail[];
  action?:string;link?:string;footer:string;tone?:Tone}){
  const stripe=o.tone==="warning"?"#b3372a":o.tone==="good"?"#1e7a52":"#0b1d3a";
  const rows=(o.detail||[]).filter(d=>d&&d.value).map(d=>
    `<tr>
      <td style="padding:5px 14px 5px 0;font-size:12px;color:#8a978f;white-space:nowrap;vertical-align:top">${esc(d.label)}</td>
      <td style="padding:5px 0;font-size:13px;color:#17312b;vertical-align:top"><b>${esc(d.value)}</b></td>
    </tr>`).join("");
  return`<div style="background:#f4f7f5;padding:22px 0;font-family:Segoe UI,Helvetica,Arial,sans-serif">
 <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
  <tr><td align="center">
   <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#ffffff;border:1px solid #e2e9e6;border-radius:10px;overflow:hidden">
    <tr><td style="background:${stripe};height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>
    <tr><td style="padding:22px 26px 6px">
     <p style="margin:0;font-size:10px;letter-spacing:1.4px;color:#8a978f;font-weight:700">CMG PAYMENT REQUEST</p>
     <p style="margin:8px 0 0;font-size:19px;color:#17312b;font-weight:600">${esc(o.title)}</p>
     ${o.reference?`<p style="margin:4px 0 0;font-size:13px;color:#0b725d;font-weight:700">${esc(o.reference)}</p>`:""}
    </td></tr>
    ${o.intro?`<tr><td style="padding:12px 26px 0"><p style="margin:0;font-size:13px;color:#42584f;line-height:1.5">${esc(o.intro)}</p></td></tr>`:""}
    ${rows?`<tr><td style="padding:16px 26px 0">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid #eef1ef;padding-top:8px">${rows}</table>
    </td></tr>`:""}
    ${o.action?`<tr><td style="padding:16px 26px 0">
      <p style="margin:0;padding:11px 13px;background:#f4f7f5;border-left:3px solid ${stripe};font-size:12.5px;color:#42584f;line-height:1.5">${esc(o.action)}</p>
    </td></tr>`:""}
    ${o.link?`<tr><td style="padding:18px 26px 4px">
      <a href="${esc(o.link)}" style="display:inline-block;background:#0b725d;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:7px;font-size:13px;font-weight:600">Open in CMG Payment</a>
    </td></tr>`:""}
    <tr><td style="padding:20px 26px 22px">
     <p style="margin:0;border-top:1px solid #eef1ef;padding-top:12px;font-size:11px;color:#8a978f;line-height:1.5">${esc(o.footer)}</p>
    </td></tr>
   </table>
  </td></tr>
 </table>
</div>`}

/* Gmail takes a whole RFC 2822 message rather than a JSON body, so it is assembled here.
   The body is base64 so that line length and non-ASCII stop being a consideration at all. */
function rfc2822(o:{from:string;to:string[];subject:string;html:string;replyTo?:string;bcc?:string[]}){
  const headers=[
    `From: ${o.from}`,
    `To: ${o.to.join(", ")}`,
    /* Only for the Gmail API, which delivers to a Bcc header and removes it. The relay
       passes headers through untouched, so it puts copies on the envelope instead. */
    o.bcc?.length?`Bcc: ${o.bcc.join(", ")}`:"",
    o.replyTo?`Reply-To: ${o.replyTo}`:"",
    `Subject: ${headerValue(o.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=\"UTF-8\"",
    "Content-Transfer-Encoding: base64"].filter(Boolean).join("\r\n");
  const body=bytesToB64(utf8(o.html)).replace(/(.{76})/g,"$1\r\n");
  return`${headers}\r\n\r\n${body}`}

/* Hands the message to the local relay, if one is configured. Returns null when there is
   none, so the caller carries on to the Gmail API or to report-only.

   The relay listens on localhost and nginx does not proxy it, but a token is still
   required: everything else on this machine can reach localhost too. */
async function relay(to:string[],opts:{subject:string;html:string;replyTo?:string}):Promise<MailResult|null>{
  const env=await getBindings() as MailEnv;
  const url=String(env.RELAY_URL||"").trim();
  const token=String(env.RELAY_TOKEN||"").trim();
  const from=String(env.MAIL_FROM||"").trim();
  if(!url||!token||!from)return null;
  const result=(sent:boolean,reason:string):MailResult=>({sent,reason,to,subject:opts.subject});
  try{
    const name=String(env.MAIL_FROM_NAME||"CMG Payment Request").trim();
    const shownFrom=String(env.MAIL_SEND_AS||from).trim();
    const configured=String(env.MAIL_REPLY_TO||"").trim();
    const replyTo=configured==="none"?undefined:(configured||opts.replyTo);
    const redirect=String(env.MAIL_REDIRECT_TO||"").trim();
    const recipients=redirect?[redirect]:to;
    const html=redirect
      ?`${opts.html}<p style="font-size:11px;color:#b3372a">Redirected. Would have gone to: ${to.join(", ")}</p>`
      :opts.html;
    const raw=rfc2822({from:fromHeader(shownFrom,name),to:recipients,subject:opts.subject,
      html,replyTo});
    /* The copies go on the envelope only. SMTP delivers to every envelope address, and the
       To header - built above from the recipients alone - is all anybody reads, so the
       copy is blind without a Bcc header the relay would pass through verbatim. */
    const envelope=[...recipients,...await copiesFor(recipients)];
    const res=await fetch(url,{method:"POST",
      headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},
      body:JSON.stringify({from,to:envelope,raw})});
    if(!res.ok){
      const detail=await res.text().catch(()=>"");
      console.error(`[mail] relay refused (${res.status})`,detail.slice(0,300));
      return result(false,`relay refused with ${res.status}`)}
    return result(true,"sent via relay");
  }catch(e){
    console.error("[mail] relay unreachable",e);
    return result(false,e instanceof Error?e.message:"relay unreachable")}}

/* Sends one message, or reports what it would have sent.

   `replyTo` is the person whose action caused this, so replying reaches a human rather
   than a mailbox nobody reads. */
export async function sendMail(opts:{to:string[];subject:string;html:string;replyTo?:string}):Promise<MailResult>{
  const to=[...new Set(opts.to.map(e=>(e||"").trim().toLowerCase()).filter(Boolean))];
  const result=(sent:boolean,reason:string):MailResult=>({sent,reason,to,subject:opts.subject});
  if(!to.length)return result(false,"nobody to send to");
  try{
    /* The relay first, when there is one. It needs only an app password, which the owner
       of the sending account can generate themselves, where a service account needs a
       Google Cloud console and somebody who can reach it. Same message either way: the
       relay is a different road to the same mail server, not a different letter. */
    const viaRelay=await relay(to,opts);
    if(viaRelay)return viaRelay;
    const c=await mailConfig();
    if(!c){
      /* Report-only prints the headers it would have sent rather than a single line, so
         the sender, the recipients and the absence of a Reply-To can all be checked
         before any credential exists. Everything except the delivery itself is decided by
         this point, so everything except delivery can be read here. */
      const env=await getBindings() as MailEnv;
      const name=String(env.MAIL_FROM_NAME||"CMG Payment Request").trim();
      const shownFrom=String(env.MAIL_SEND_AS||env.MAIL_FROM||"(MAIL_FROM not set)").trim();
      const reply=String(env.MAIL_REPLY_TO||"").trim();
      console.log([`[mail] would send`,
        `        From: ${fromHeader(shownFrom,name)}`,
        `        To: ${to.join(", ")}`,
        `        Subject: ${opts.subject}`,
        `        Reply-To: ${reply==="none"?"(none — no-reply)":reply||opts.replyTo||"(none)"}`,
        `        Copy to: ${(await copiesFor(to)).join(", ")||"(none)"}`,
        `        Body: ${opts.html.length} bytes of HTML`].join("\n"));
      return result(false,"not configured (report-only)")}
    const recipients=c.redirectTo?[c.redirectTo]:to;
    const html=c.redirectTo
      ?`${opts.html}<p style="font-size:11px;color:#b3372a">Redirected. Would have gone to: ${to.join(", ")}</p>`
      :opts.html;
    /* A no-reply message carries no Reply-To at all, rather than one pointing at an
       address nobody reads. The footer already says where to go instead. */
    const replyTo=c.replyTo==="none"?undefined:(c.replyTo||opts.replyTo);
    const raw=b64url(utf8(rfc2822({from:fromHeader(c.sendAs,c.fromName),to:recipients,
      subject:opts.subject,html,replyTo,bcc:await copiesFor(recipients)})));
    const token=await accessToken(c);
    const res=await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(c.from)}/messages/send`,
      {method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},
       body:JSON.stringify({raw})});
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
