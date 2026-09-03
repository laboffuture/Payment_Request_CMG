"use client";
import { useEffect, useState } from "react";
import type { AuditTask } from "./page";
import { TaskBlock } from "./AuditTaskQueue";
import ScheduledPayments from "./ScheduledPayments";
import { batchesApi } from "./audit-api";
export default function AuditQueueHub({
  payments,
  tasks,
  openPayment,
}: {
  payments: any[];
  tasks: AuditTask[];
  openPayment: (p: any) => void;
  accept: (id: string) => void;
}) {
  const [tab, setTab] = useState<"audit" | "scheduled">("audit"),
    [scheduledCount, setScheduledCount] = useState(0),
    payAvailable = payments.filter((p) => p.status === "Pre-Audit Queue"),
    payMine = payments.filter((p) => p.status === "Audit Accepted");
  // the count on the tab comes from the server, like the queue behind it
  useEffect(() => {
    let dead = false;
    batchesApi.load("Audit Queue")
      .then(d => { if (!dead) setScheduledCount(d.total ?? d.batches.length) })
      .catch(() => { if (!dead) setScheduledCount(0) });
    return () => { dead = true };
  }, []);
  return (
    <>
      <div className="audit-main-tabs">
        <button
          className={tab === "audit" ? "active" : ""}
          onClick={() => setTab("audit")}
        >
          Payment & Audit Task Queue
        </button>
        <button
          className={tab === "scheduled" ? "active" : ""}
          onClick={() => setTab("scheduled")}
        >
          Scheduled Payment Queue <span>{scheduledCount}</span>
        </button>
      </div>
      {tab === "scheduled" ? (
        <ScheduledPayments role="Auditor" auditQueueView flash={() => {}} />
      ) : (
        <div className="page">
          <div className="intro">
            <div>
              <small>COMPLETE AUDIT QUEUE</small>
              <h2>All audit work</h2>
              <p>
                Payment, pre-audit, post-audit, meetings and special
                audits—available and accepted.
              </p>
            </div>
          </div>
          <div className="audit-hub-grid">
            <PaymentBlock
              title="Payment audit queue"
              rows={payAvailable}
              open={openPayment}
              action="Accept to start"
            />
            <PaymentBlock
              title="My accepted payments"
              rows={payMine}
              open={openPayment}
              action="Continue audit"
            />
            {(
              [
                "Pre-Audit",
                "Post-Audit",
                "Meeting",
                "Special Audit",
              ] as AuditTask["kind"][]
            ).map((k) => (
              <TaskBlock
                key={k}
                title={`${k} · ${tasks.filter((t) => t.kind === k && t.status === "Available").length} available / ${tasks.filter((t) => t.kind === k && t.status !== "Available").length} active`}
                rows={tasks.filter((t) => t.kind === k)}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
function PaymentBlock({
  title,
  rows,
  open,
  action,
}: {
  title: string;
  rows: any[];
  open: (p: any) => void;
  action: string;
}) {
  return (
    <section className="panel rd-panel">
      <div className="panel-head">
        <h2>{title}</h2>
        <span>{rows.length}</span>
      </div>
      {rows.map((p) => (
        <button className="rd-row" key={p.id} onClick={() => open(p)}>
          <span>
            <b>{p.requestNo}</b>
            <small>
              {p.vendor} · {p.company} · Due {p.due}
            </small>
          </span>
          <strong>
            {p.currency} {p.amount.toLocaleString()}
          </strong>
          <em>{action}</em>
        </button>
      ))}
    </section>
  );
}
