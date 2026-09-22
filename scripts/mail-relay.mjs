/* A small SMTP relay for the notification emails.
 *
 * The application runs on workerd, which has no raw TCP, so it cannot talk to an SMTP
 * server however willing Gmail is to accept the connection. It can make HTTP requests.
 * This sits between the two: an HTTP endpoint on localhost that the application posts a
 * message to, and an SMTP conversation with Gmail on the other side.
 *
 * It exists because a service account needs a Google Cloud console and an app password
 * does not. An app password is generated from the sending account's own security page,
 * so nobody else has to be involved.
 *
 * Bound to 127.0.0.1 and nothing else. Nginx does not proxy it, so it is reachable only
 * from this machine. A shared secret is still required, because "only from this machine"
 * includes every other process on it.
 *
 * Node's own net and tls are used rather than a mail library: the conversation is a
 * dozen lines and a dependency for it would be a dependency to keep current.
 */

import {createServer} from "node:http";
import {connect as tlsConnect} from "node:tls";
import {readFileSync} from "node:fs";

const ENV_FILE=new URL("../.dev.vars",import.meta.url);
function settings(){
  const out={};
  try{
    for(const line of readFileSync(ENV_FILE,"utf8").split("\n")){
      const m=/^([A-Z_]+)=(.*)$/.exec(line.trim());
      if(m)out[m[1]]=m[2].replace(/^["']|["']$/g,"");
    }
  }catch{}
  return out;
}

const s=settings();
const HOST=s.SMTP_HOST||"smtp.gmail.com";
const PORT=Number(s.SMTP_PORT||465);
const USER=s.SMTP_USER||s.MAIL_FROM||"";
const PASS=(s.SMTP_PASSWORD||"").replace(/\s+/g,"");   // Google prints app passwords in groups of four
const TOKEN=s.RELAY_TOKEN||"";
const LISTEN=Number(s.RELAY_PORT||8787);

if(!USER||!PASS){
  console.error("[relay] SMTP_USER and SMTP_PASSWORD are not set in .dev.vars — refusing to start.");
  process.exit(1);
}
if(!TOKEN){
  console.error("[relay] RELAY_TOKEN is not set — refusing to start without one.");
  process.exit(1);
}

/* One SMTP conversation. Resolves when the server has accepted the message, rejects with
   whatever it said if it did not - the reply text is the only useful diagnosis when mail
   is refused, so it is passed back rather than swallowed. */
function deliver(from,recipients,raw){
  return new Promise((resolve,reject)=>{
    const socket=tlsConnect({host:HOST,port:PORT,servername:HOST},()=>{});
    let buffer="";
    let step=0;
    const steps=[
      `EHLO paymentrequest.toprockglobal.com`,
      `AUTH LOGIN`,
      Buffer.from(USER).toString("base64"),
      Buffer.from(PASS).toString("base64"),
      `MAIL FROM:<${from}>`,
      ...recipients.map(r=>`RCPT TO:<${r}>`),
      `DATA`];
    const finish=(err)=>{try{socket.end()}catch{};err?reject(err):resolve()};
    socket.setTimeout(20000,()=>finish(new Error("timed out talking to the mail server")));
    socket.on("error",finish);
    socket.on("data",chunk=>{
      buffer+=chunk.toString();
      if(!/\r\n$/.test(buffer))return;                 // wait for a complete reply
      const reply=buffer.trim();
      buffer="";
      const code=Number(reply.slice(0,3));
      if(code>=400)return finish(new Error(reply));
      if(step<steps.length){
        /* 354 means the server is ready for the message itself. */
        socket.write(steps[step++]+"\r\n");
        if(steps[step-1]==="DATA"){
          const wait=()=>{
            socket.write(raw.replace(/\r?\n\./g,"\r\n..")+"\r\n.\r\n");
          };
          setTimeout(wait,50);
        }
        return;
      }
      if(code===250)return finish(null);               // accepted
    });
  });
}

createServer((req,res)=>{
  const reply=(status,body)=>{
    res.writeHead(status,{"content-type":"application/json"});
    res.end(JSON.stringify(body));
  };
  if(req.method!=="POST")return reply(405,{error:"post a message"});
  if(req.headers.authorization!==`Bearer ${TOKEN}`)return reply(401,{error:"bad token"});
  let body="";
  req.on("data",c=>{body+=c;if(body.length>2e6)req.destroy()});
  req.on("end",async()=>{
    try{
      const {from,to,raw}=JSON.parse(body||"{}");
      const recipients=(Array.isArray(to)?to:[]).map(x=>String(x||"").trim()).filter(Boolean);
      if(!recipients.length||!raw)return reply(400,{error:"to and raw are required"});
      await deliver(String(from||USER),recipients,String(raw));
      console.log(`[relay] sent to ${recipients.join(", ")}`);
      reply(200,{sent:true});
    }catch(e){
      console.error("[relay] failed:",e.message);
      reply(502,{error:e.message});
    }
  });
}).listen(LISTEN,"127.0.0.1",()=>{
  console.log(`[relay] listening on 127.0.0.1:${LISTEN}, sending as ${USER} via ${HOST}:${PORT}`);
});
