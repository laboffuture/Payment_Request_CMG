"use client";
import{AtSign,MessageCircle,RefreshCw,Send,Users}from"lucide-react";
import{useCallback,useEffect,useRef,useState}from"react";
import{messagesApi,type Message}from"./audit-api";

/* The shared thread, stored in wf_messages. It used to live in localStorage, which
   meant a "sent" message never left the sender's own browser — the one failure mode a
   chat screen must not have.

   A row with to_employee set is a direct message, and the server filters those in SQL
   so they never reach anyone but the author and the recipient. Leaving the picker on
   Everyone posts to the thread all users can see. */

const groups=["Everyone","Audit Head","Finance Manager","Procurement Head","HR Manager","Accounts Team"];
const initials=(n:string)=>n.split(" ").filter(Boolean).map(x=>x[0]).join("").slice(0,2).toUpperCase();
const clock=(iso:string)=>{const d=new Date(iso);
  return isNaN(d.getTime())?"":d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})};

export default function CommunityChat({user,flash}:{user:string;flash:(s:string)=>void}){
 const[messages,setMessages]=useState<Message[]>([]),[tag,setTag]=useState("Everyone");
 const[text,setText]=useState(""),[loading,setLoading]=useState(true);
 const[error,setError]=useState(""),[sending,setSending]=useState(false);
 const stream=useRef<HTMLDivElement|null>(null);

 const load=useCallback(async(quiet=false)=>{
   if(!quiet)setLoading(true);
   try{const d=await messagesApi.load();setMessages(d.messages);setError("")}
   catch(e){setError(e instanceof Error?e.message:"Could not load messages")}
   finally{if(!quiet)setLoading(false)}},[]);

 useEffect(()=>{load()},[load]);
 // a light poll so a reply from somebody else turns up without a manual refresh
 useEffect(()=>{const t=setInterval(()=>load(true),15000);return()=>clearInterval(t)},[load]);
 useEffect(()=>{const el=stream.current;if(el)el.scrollTop=el.scrollHeight},[messages.length]);

 const send=async()=>{
   const body=text.trim();
   if(!body||sending)return;
   setSending(true);
   try{
     // "Everyone" is the shared thread, so no recipient is attached
     await messagesApi.post(body,tag==="Everyone"?"":tag);
     setText("");await load(true);flash(tag==="Everyone"?"Posted to the thread":`Message sent to ${tag}`)}
   catch(e){setError(e instanceof Error?e.message:"Could not send the message")}
   finally{setSending(false)}};

 return <div className="page community-page">
  <div className="intro"><div><small>INTERNAL COMMUNITY</small><h2>Fast audit collaboration</h2>
    <p>Tag a team, request data, review evidence and respond internally. Messages are shared and saved.</p></div>
   <button type="button" className="wf-small intro-action" onClick={()=>load()}><RefreshCw/>Refresh</button></div>
  {error&&<div className="panel company-empty">{error}</div>}
  <div className="community-layout">
   <aside className="panel community-members"><div><Users/><h3>People &amp; teams</h3></div>
    {groups.map(p=><button className={tag===p?"active":""} key={p} onClick={()=>setTag(p)}>
      <span>{p==="Everyone"?"ALL":initials(p)}</span>{p}</button>)}</aside>
   <section className="panel community-chat">
    <div className="chat-head"><MessageCircle/><div><b>CMG Audit Community</b>
      <small>{loading?"Loading…":`${messages.length} message${messages.length===1?"":"s"} · shared with your colleagues`}</small></div></div>
    <div className="chat-stream" ref={stream}>
     {messages.map(m=><article className={m.authorName===user?"mine":""} key={m.id}>
       <div><b>{m.authorName||m.authorEmail||"Unknown"}</b><time>{clock(m.at)}</time></div>
       <span><AtSign/>{m.toEmployee||"Everyone"}</span><p>{m.body}</p></article>)}
     {!messages.length&&!loading&&<p className="queue-empty">No messages yet. Start the conversation below.</p>}
    </div>
    <div className="chat-compose">
     <label><AtSign/><select value={tag} onChange={e=>setTag(e.target.value)}>
       {groups.map(p=><option key={p}>{p}</option>)}</select></label>
     <textarea value={text} onChange={e=>setText(e.target.value)}
       placeholder="Write a message, request data or respond to an observation…"
       onKeyDown={e=>{if(e.key==="Enter"&&(e.metaKey||e.ctrlKey))send()}}/>
     <button className="primary" disabled={sending||!text.trim()} onClick={send}>
      <Send/>{sending?"Sending…":"Send"}</button></div>
   </section></div></div>}
