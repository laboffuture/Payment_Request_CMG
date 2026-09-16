"use client";

/* Accounts received.

   The screen exists and the menu reaches it, for accounts, audit and administration.
   What it holds is not decided yet, so it says so rather than showing an empty table
   that looks like a working register with nothing in it - which is exactly how the old
   observations entry misled everybody until it was rebuilt. */

export default function AccountsReceived({role}:{role:string}){
  return <div className="page">
    <div className="intro"><div><small>ACCOUNTS</small><h2>Accounts received</h2>
      <p>Money received, recorded against the company and the payer.</p></div></div>
    <section className="panel awaiting-format">
      <h3>This module is set up but not yet designed</h3>
      <p>The fields, the list and who may record an entry are still to be decided. Send
        the format - the columns, which are required, and what each role may do - and it
        will be built here.</p>
      <p className="awaiting-note">Reachable now by administration, accounts and audit.
        You are signed in as <b>{role}</b>.</p>
    </section>
  </div>}
