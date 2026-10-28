"use client";
import {useState} from "react";
import {Eye,EyeOff,LockKeyhole} from "lucide-react";

export type Actor={userId:string;email:string;name:string;roles:string[];employeeId:string};

/* Sign-in goes to /api/auth/session, which checks the password against wf_users and
   sets an HttpOnly session cookie. Nothing about the signed-in user is written to
   browser storage: the cookie is the session, and the server decides on every single
   request whether it is still valid, so a deactivation or a password change takes
   effect immediately rather than whenever the tab is next closed. */
export default function LoginOverlay({onLogin,note=""}:{onLogin:(actor:Actor)=>void;note?:string}){
  const [email,setEmail]=useState(""),[password,setPassword]=useState("");
  const [show,setShow]=useState(false),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  // the account was created with a temporary password and cannot be used until it is replaced
  const [mustChange,setMustChange]=useState(false);
  const [next,setNext]=useState(""),[confirm,setConfirm]=useState("");

  const signIn=async(mail:string,pass:string)=>{
    const r=await fetch("/api/auth/session",{method:"POST",
      headers:{"content-type":"application/json"},body:JSON.stringify({email:mail,password:pass})});
    const data=await r.json().catch(()=>({})) as {actor?:Actor;mustChange?:boolean;error?:string};
    if(!r.ok||!data.actor)throw new Error(data.error||"Sign in failed.");
    return data};

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();setError("");setBusy(true);
    try{
      const data=await signIn(email.trim().toLowerCase(),password);
      if(data.mustChange){setMustChange(true);return}
      onLogin(data.actor as Actor)}
    catch(err){setError(err instanceof Error?err.message:"Sign in failed.")}
    finally{setBusy(false)}};

  /* Changing a password drops every session for that account, this one included, so
     the new password is immediately used to sign in again. */
  const change=async(e:React.FormEvent)=>{
    e.preventDefault();setError("");setBusy(true);
    try{
      const r=await fetch("/api/auth/change-password",{method:"POST",
        headers:{"content-type":"application/json"},body:JSON.stringify({current:password,next})});
      const data=await r.json().catch(()=>({})) as {error?:string};
      if(!r.ok)throw new Error(data.error||"Could not set that password.");
      const back=await signIn(email.trim().toLowerCase(),next);
      onLogin(back.actor as Actor)}
    catch(err){setError(err instanceof Error?err.message:"Could not set that password.")}
    finally{setBusy(false)}};

  // mirrors passwordProblem() on the server so the rule is visible before submitting
  const weak=next.length<10?"At least 10 characters.":!/[A-Za-z]/.test(next)?"Include a letter."
    :!/[0-9]/.test(next)?"Include a number.":"";
  const ready=!weak&&next===confirm;

  return <div className="login-screen">
    <section className="login-story">
      <div className="login-brand"><b>CMG</b><div><strong>CMG Control</strong><span>Payments · Audit · Material</span></div></div>
      <div className="login-pitch">
        <h1>Every payment, audit and material request — in one controlled system.</h1>
        <p className="login-lead">Request, accounts verification, audit approval, observations and payment release,
          with material requests, POs and receipts beside them.</p>
      </div>
      <div className="login-strip">
        <div><b>Payments</b><span>Request to release</span></div>
        <div><b>Audit</b><span>Pre, post &amp; special</span></div>
        <div><b>Material</b><span>MR, PO, GRN, issue</span></div>
      </div>
      <footer className="login-credit"><span>Developed By</span><img src="/developed-by-lof-light.png" alt="LOF"/></footer>
    </section>
    <section className="login-card"><div className="login-form">
      <img className="login-logo" src="/logo.png" alt="Chandramari Group"/>
      {mustChange?<>
        <h2>Choose your password</h2>
        <p>This account was opened with a temporary password. Set your own to continue.</p>
        <form onSubmit={change}>
          <label>New password<div className="password">
            <input required aria-label="New password" value={next} onChange={e=>setNext(e.target.value)}
              type={show?"text":"password"} autoComplete="new-password"/>
            <button type="button" aria-label="Show password" onClick={()=>setShow(!show)}>
              {show?<EyeOff/>:<Eye/>}</button></div></label>
          <label>Confirm new password<input required aria-label="Confirm new password" value={confirm}
            onChange={e=>setConfirm(e.target.value)} type="password" autoComplete="new-password"/></label>
          {next&&weak&&<div className="login-error">{weak}</div>}
          {confirm&&next!==confirm&&<div className="login-error">Both entries must match.</div>}
          {error&&<div className="login-error">{error}</div>}
          <button className="login-submit" disabled={busy||!ready}>
            <LockKeyhole/>{busy?"Saving…":"Set password and continue"}</button>
        </form>
      </>:<>
        <h2>Sign in</h2>
        <p>Your dashboard and the actions your role allows open automatically.</p>
        <form onSubmit={submit}>
          <label>Work email<input required aria-label="Work email" value={email}
            onChange={e=>setEmail(e.target.value)} type="email" autoComplete="username"/></label>
          <label>Password<div className="password">
            <input required aria-label="Password" value={password} onChange={e=>setPassword(e.target.value)}
              type={show?"text":"password"} autoComplete="current-password"/>
            <button type="button" aria-label="Show password" onClick={()=>setShow(!show)}>
              {show?<EyeOff/>:<Eye/>}</button></div></label>
          {!!note&&!error&&<div className="login-note">{note}</div>}
          {error&&<div className="login-error">{error}</div>}
          <button className="login-submit" disabled={busy}>
            <LockKeyhole/>{busy?"Signing in…":"Sign in"}</button>
        </form>
        <p className="login-foot">No account yet, or forgotten your password? Ask an administrator.</p>
      </>}
    </div></section>
  </div>}
