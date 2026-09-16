"use client";

/* Accounts Receivable.

   Named "Accounts received" when it was first stood up, which described the opposite
   movement of money - a receipt already collected, rather than an amount still owed to
   the company. The label is the accounting term now; the file and module key keep the
   original spelling because renaming them buys nothing a reader can see.

   The screen exists and the menu reaches it, for accounts, audit and administration.
   What it holds is not decided yet, so it says so rather than showing an empty table
   that looks like a working register with nothing in it - which is exactly how the old
   observations entry misled everybody until it was rebuilt. */

export default function AccountsReceived({role}:{role:string}){
  return <div className="page">
    <div className="intro"><div><small>ACCOUNTS</small><h2>Accounts Receivable</h2>
      {/* deliberately says less than the old line did: that one described money already
          received, which is not what a receivable is, and the format is still to come. */}
      <p>Amounts owed to the company and not yet collected.</p></div></div>
    <section className="panel awaiting-format">
      <h3>This module is set up but not yet designed</h3>
      <p>The fields, the list and who may record an entry are still to be decided. Send
        the format - the columns, which are required, and what each role may do - and it
        will be built here.</p>
      <p className="awaiting-note">Reachable now by administration, accounts and audit.
        You are signed in as <b>{role}</b>.</p>
    </section>
  </div>}
