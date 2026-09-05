"use client";
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, FileCheck2, Plus, Upload, X } from "lucide-react";
import { batchesApi } from "./audit-api";
type Status =
  | "Audit Queue"
  | "Audit Accepted"
  | "Rejected – Accounts Action"
  | "Approved – Ready to Release"
  | "Released";
type Batch = {
  id: string;
  vendor: string;
  requested: number;
  approved?: number;
  statement: string;
  reconciliation: string;
  gl?: string;
  status: Status;
  reason?: string;
  proof?: string;
};
const seed: Batch[] = [];
const storageKey = "cmg-scheduled-payments";
/* Batches live in wf_batches and are shared. The server owns the state machine, not
   this screen: a batch must be accepted before it can be approved, cannot be approved
   above the vendor's request, needs a reason when approved for less or rejected, and
   cannot be released until an auditor has approved it and proof is attached. Those
   rules are enforced there, so two people working at once cannot disagree. */
export default function ScheduledPayments({
  role,
  flash,
  auditQueueView = false,
}: {
  role: string;
  flash: (s: string) => void;
  auditQueueView?: boolean;
}) {
  const [rows, setRows] = useState<Batch[]>([]),
    [form, setForm] = useState(false),
    [selected, setSelected] = useState<Batch>(),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState<"queue" | "progress" | "completed">("queue");
  const creator = role === "Accountant" || role === "Audit Head",
    auditor = role === "Auditor" || role === "Audit Head",
    release =
      role === "Accountant" || role === "Finance" || role === "Audit Head";
  const load = useCallback(async () => {
    try {
      const d = await batchesApi.load();
      setRows(d.batches as unknown as Batch[]);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not load scheduled payments");
    }
  }, [flash]);
  useEffect(() => { load() }, [load]);

  const create = async (b: Batch) => {
    setBusy(true);
    try {
      await batchesApi.create({ vendor: b.vendor, requested: b.requested, statement: b.statement,
        reconciliation: b.reconciliation, gl: b.gl || "" });
      await load(); setForm(false); flash("Batch raised and sent to the audit queue");
    } catch (e) { flash(e instanceof Error ? e.message : "Could not raise that batch") }
    finally { setBusy(false) }
  };

  /* Each button names the transition it wants; the server decides whether it is allowed
     and answers with the reason when it is not. */
  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!selected) return;
    setBusy(true);
    try {
      const b = await batchesApi.act({ id: selected.id, action, ...extra });
      setSelected(b as unknown as Batch);
      await load();
      flash(selected.id + " moved to " + b.status);
    } catch (e) { flash(e instanceof Error ? e.message : "That step was refused") }
    finally { setBusy(false) }
  };
  const update = (p: Partial<Batch>) => {
    const s = p.status;
    if (s === "Audit Accepted") return act("accept");
    if (s === "Rejected – Accounts Action") return act("reject", { reason: p.reason || "" });
    if (s === "Approved – Ready to Release") return act("approve", { approved: p.approved, reason: p.reason || "" });
    if (s === "Released") return act("release", { proof: p.proof || "" });
  };
  const visibleRows = rows.filter((b) =>
    tab === "queue"
      ? b.status === "Audit Queue" || b.status === "Rejected – Accounts Action"
      : tab === "progress"
        ? b.status === "Audit Accepted" || b.status === "Approved – Ready to Release"
        : b.status === "Released",
  );
  return (
    <div className="page scheduled">
      <div className="intro">
        <div>
          <small>SCHEDULED PAYMENT CONTROL</small>
          <h2>Scheduled payment requests</h2>
          <p>
            Any Accountant can attach vendor evidence and submit. Audit can
            accept, verify, approve an amount or reject to Accounts.
          </p>
        </div>
        {creator && !auditQueueView && (
          <button className="primary" onClick={() => setForm(true)}>
            <Plus />
            New schedule request
          </button>
        )}
      </div>
      <div className="schedule-metrics">
        {[
          ["Open", rows.filter((x) => x.status !== "Released").length],
          [
            "Audit queue",
            rows.filter((x) => x.status === "Audit Queue").length,
          ],
          [
            "Rejected",
            rows.filter((x) => x.status.startsWith("Rejected")).length,
          ],
          [
            "Ready to release",
            rows.filter((x) => x.status === "Approved – Ready to Release")
              .length,
          ],
        ].map((x) => (
          <article key={x[0]}>
            <span>{x[0]}</span>
            <b>{x[1]}</b>
          </article>
        ))}
      </div>
      <div className="schedule-tabs" role="tablist" aria-label="Scheduled payment stages">
        <button className={tab === "queue" ? "active" : ""} onClick={() => setTab("queue")}>
          Audit Queue <b>{rows.filter((x) => x.status === "Audit Queue").length}</b>
        </button>
        <button className={tab === "progress" ? "active" : ""} onClick={() => setTab("progress")}>
          Accepted &amp; In Progress <b>{rows.filter((x) => x.status === "Audit Accepted" || x.status === "Approved – Ready to Release").length}</b>
        </button>
        <button className={tab === "completed" ? "active" : ""} onClick={() => setTab("completed")}>
          Completed <b>{rows.filter((x) => x.status === "Released").length}</b>
        </button>
      </div>
      <section className="panel schedule-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>REQUEST</th>
                <th>VENDOR</th>
                <th>REQUESTED</th>
                <th>APPROVED</th>
                <th>FILES</th>
                <th>STATUS</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((b) => (
                <tr key={b.id}>
                  <td>
                    <b>{b.id}</b>
                  </td>
                  <td>{b.vendor}</td>
                  <td>
                    <b>AED {b.requested.toLocaleString()}</b>
                  </td>
                  <td>
                    {b.approved ? "AED " + b.approved.toLocaleString() : "—"}
                  </td>
                  <td>
                    <span className="doc-ok">
                      <FileCheck2 />
                      {2 + (b.gl ? 1 : 0)}
                    </span>
                  </td>
                  <td>
                    <span
                      className={
                        "badge " +
                        (b.status.startsWith("Rejected") ? "red" : "blue")
                      }
                    >
                      {b.status}
                    </span>
                  </td>
                  <td>
                    <button onClick={() => setSelected(b)}>
                      {b.status === "Audit Queue" && auditor
                        ? "Accept & verify"
                        : b.status === "Approved – Ready to Release" && release
                          ? "Release approved amount"
                          : "View"}
                    </button>
                  </td>
                </tr>
              ))}
              {!visibleRows.length && <tr><td colSpan={7} className="schedule-empty">No scheduled payments in this stage.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {form && (
        <Create
          close={() => setForm(false)}
          done={create}
        />
      )}
      {selected && (
        <Detail
          batch={selected}
          role={role}
          close={() => setSelected(undefined)}
          update={update}
        />
      )}
    </div>
  );
}
function FileBox({
  label,
  name,
  set,
  required = false,
}: {
  label: string;
  name: string;
  set: (x: string) => void;
  required?: boolean;
}) {
  return (
    <label className="upload">
      <Upload />
      <b>{label}</b>
      <input
        type="file"
        required={required}
        onChange={(e) => set(e.target.files?.[0]?.name || "")}
      />
      <small>{name || (required ? "Required" : "Optional")}</small>
    </label>
  );
}
function Create({
  close,
  done,
}: {
  close: () => void;
  done: (b: Batch) => void;
}) {
  const [vendor, setVendor] = useState(""),
    [amount, setAmount] = useState(0),
    [statement, setStatement] = useState(""),
    [recon, setRecon] = useState(""),
    [gl, setGl] = useState(""),
    [error, setError] = useState("");
  const valid = vendor && amount > 0 && statement && recon;
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!vendor.trim()) return setError("Enter the vendor name.");
    if (amount <= 0) return setError("Enter a valid payment amount.");
    if (!statement) return setError("Attach the Vendor Statement.");
    if (!recon) return setError("Attach the Reconciliation Statement.");
    setError("");
    done({id: "SCH-2026-" + Date.now().toString().slice(-6), vendor: vendor.trim(), requested: amount, statement, reconciliation: recon, gl: gl || undefined, status: "Audit Queue"});
  };
  return (
    <>
      <button className="overlay" onClick={close} />
      <form
        className="modal schedule-modal"
        onSubmit={submit}
      >
        <header>
          <div>
            <small>ANY ACCOUNTANT</small>
            <h2>New scheduled payment request</h2>
          </div>
          <button type="button" onClick={close}>
            <X />
          </button>
        </header>
        <div className="form">
          <label className="wide">
            Vendor name
            <input
              required
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
            />
          </label>
          <label>
            Amount
            <input
              required
              type="number"
              min="1"
              value={amount || ""}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </label>
          <label>
            Currency
            <select>
              <option>AED</option>
              <option>SAR</option>
              <option>INR</option>
              <option>USD</option>
            </select>
          </label>
          <FileBox
            label="Vendor statement"
            name={statement}
            set={setStatement}
            required
          />
          <FileBox
            label="Reconciliation statement"
            name={recon}
            set={setRecon}
            required
          />
          <FileBox label="Our GL" name={gl} set={setGl} />
          {error && <div className="schedule-error wide" role="alert"><AlertCircle />{error}</div>}
        </div>
        <footer>
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="primary" aria-disabled={!valid}>
            Submit to Auditor
          </button>
        </footer>
      </form>
    </>
  );
}
function Detail({
  batch,
  role,
  close,
  update,
}: {
  batch: Batch;
  role: string;
  close: () => void;
  update: (p: Partial<Batch>) => void;
}) {
  const auditor = role === "Auditor" || role === "Audit Head",
    releaser =
      role === "Accountant" || role === "Finance" || role === "Audit Head";
  const [checks, setChecks] = useState([false, false, false]),
    [approved, setApproved] = useState(batch.approved || batch.requested),
    [reason, setReason] = useState(""),
    [proof, setProof] = useState("");
  return (
    <>
      <button className="overlay" onClick={close} />
      <aside className="detail schedule-detail">
        <header>
          <div>
            <small>SCHEDULED PAYMENT</small>
            <h2>{batch.id}</h2>
          </div>
          <button onClick={close}>
            <X />
          </button>
        </header>
        <div className="detail-body">
          <span
            className={
              "badge " + (batch.status.startsWith("Rejected") ? "red" : "blue")
            }
          >
            {batch.status}
          </span>
          <h3>{batch.vendor}</h3>
          <b className="amount">
            Requested AED {batch.requested.toLocaleString()}
          </b>
          <section>
            <h4>Attachments</h4>
            <p>
              <FileCheck2 />
              Vendor statement: <b>{batch.statement}</b>
            </p>
            <p>
              <FileCheck2 />
              Reconciliation statement: <b>{batch.reconciliation}</b>
            </p>
            <p>
              <FileCheck2 />
              Our GL: <b>{batch.gl || "Not attached (optional)"}</b>
            </p>
          </section>
          {batch.status === "Audit Queue" && auditor && (
            <button
              className="primary wide-action"
              onClick={() => update({ status: "Audit Accepted" })}
            >
              Accept & start verification
            </button>
          )}
          {batch.status === "Audit Accepted" && auditor && (
            <section>
              <h4>Audit verification</h4>
              {[
                "Vendor statement verified",
                "Reconciliation verified",
                "Amount and balance verified",
              ].map((x, i) => (
                <label className="check" key={x}>
                  <input
                    type="checkbox"
                    checked={checks[i]}
                    onChange={() =>
                      setChecks((c) => c.map((v, n) => (n === i ? !v : v)))
                    }
                  />
                  {x}
                </label>
              ))}
              <label>
                Approved amount
                <input
                  type="number"
                  min="1"
                  max={batch.requested}
                  value={approved}
                  onChange={(e) => setApproved(Number(e.target.value))}
                />
              </label>
              <label>
                Rejection reason
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Required when rejecting"
                />
              </label>
              <div className="audit-decision">
                <button
                  disabled={!reason}
                  onClick={() =>
                    update({ status: "Rejected – Accounts Action", reason })
                  }
                >
                  Reject to Accounts
                </button>
                <button
                  className="primary"
                  disabled={
                    !checks.every(Boolean) ||
                    approved < 1 ||
                    approved > batch.requested
                  }
                  onClick={() =>
                    update({ status: "Approved – Ready to Release", approved })
                  }
                >
                  <CheckCircle2 />
                  Approve AED {approved.toLocaleString()}
                </button>
              </div>
            </section>
          )}
          {batch.status === "Rejected – Accounts Action" && (
            <section>
              <h4>Audit rejection</h4>
              <p>{batch.reason}</p>
              <p>Returned to Accounts for correction.</p>
            </section>
          )}
          {batch.status === "Approved – Ready to Release" && releaser && (
            <section>
              <h4>Release approved amount</h4>
              <b className="amount">
                AED {(batch.approved || 0).toLocaleString()}
              </b>
              <FileBox
                label="Payment proof"
                name={proof}
                set={setProof}
                required
              />
              <button
                className="primary wide-action"
                disabled={!proof}
                onClick={() => update({ status: "Released", proof })}
              >
                Mark approved amount released
              </button>
            </section>
          )}
          {batch.status === "Released" && (
            <section className="released-note">
              <CheckCircle2 />
              <div>
                <b>AED {(batch.approved || 0).toLocaleString()} released</b>
                <p>Proof: {batch.proof}</p>
              </div>
            </section>
          )}
        </div>
      </aside>
    </>
  );
}
