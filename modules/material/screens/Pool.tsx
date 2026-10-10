'use client';

import { useMemo, useState } from 'react';
import { useRouter } from '@mm/lib/nav';
import { useQuery } from '@tanstack/react-query';
import {
  DEFAULT_RFQ_DUE_HOURS,
  MSG,
  type PoolAnalysisDto,
  type PoolRowDto,
  type VendorDto,
} from '@cm/shared';
import { get, newIdempotencyKey, post } from '@mm/lib/api';
import { DataTable, type Column } from '@mm/components/DataTable';
import { Btn, EmptyState, PageHeader, StickyActionBar, Tag } from '@mm/components/ui';
import { Modal } from '@mm/components/Modal';
import { useToast } from '@mm/components/Toast';
import { useAction } from '@mm/lib/hooks';
import { useReference } from '@mm/lib/reference';
import { dateTimeLocal, fmtDate, money, qty } from '@mm/lib/format';
import { usePoDraft } from '@mm/features/po/draft';
import { ProcHolds } from '@mm/features/pool/ProcHolds';
import { AttachmentButton } from '@mm/features/mr/MrAttachments';

/**
 * Consolidate MRs.
 * Prototype origin: VIEWS.pool — QS-approved PO quantities from every project,
 * grouped by item; tick lines, adjust the take quantity, then send one enquiry
 * or raise one PO.
 */
export default function PoolPage() {
  const router = useRouter();
  const toast = useToast();
  const reference = useReference();
  const { setRows } = usePoDraft();

  const [projectId, setProjectId] = useState('');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [rfqOpen, setRfqOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [sendBack, setSendBack] = useState<'QUERY' | 'REJECT' | null>(null);

  const params = new URLSearchParams();
  if (projectId) params.set('projectId', projectId);
  if (category) params.set('category', category);

  const pool = useQuery({
    queryKey: ['pool', projectId, category],
    queryFn: () => get<PoolRowDto[]>(`/pool?${params}`),
  });

  const rows = pool.data ?? [];

  // Every word typed must appear somewhere on the line: "cpvc 0003" finds CPVC items on MR ...0003.
  const shown = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return rows;
    return rows.filter((r) => {
      const text = [r.mrNo, r.projectCode, r.itemName, r.itemCode, r.category, r.mrDescription]
        .join(' ')
        .toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [rows, search]);

  const selection = useMemo(
    () =>
      rows
        .filter((r) => picked[r.mrLineId] !== undefined)
        .map((r) => ({ row: r, take: Number(picked[r.mrLineId]) || 0 })),
    [rows, picked],
  );

  const summary = useMemo(
    () => ({
      lines: selection.length,
      mrs: new Set(selection.map((s) => s.row.mrId)).size,
      projects: new Set(selection.map((s) => s.row.projectId)).size,
      items: new Set(selection.map((s) => s.row.itemId)).size,
    }),
    [selection],
  );

  /** Prototype: poolSel() — the take quantity must be within what is open. */
  const picks = () => {
    for (const { row, take } of selection) {
      if (take <= 0 || take > row.openQty) {
        toast(MSG.poolTakeRange(row.mrNo, qty(row.openQty)));
        return null;
      }
    }
    if (!selection.length) {
      toast(MSG.poolSelectLine);
      return null;
    }
    return selection.map((s) => ({ mrLineId: s.row.mrLineId, qty: s.take }));
  };

  const toggle = (row: PoolRowDto, on: boolean) =>
    setPicked((current) => {
      const next = { ...current };
      if (on) next[row.mrLineId] = String(row.openQty);
      else delete next[row.mrLineId];
      return next;
    });

  const columns: Column<PoolRowDto>[] = [
    {
      key: 'pick',
      header: '',
      render: (r) => (
        <input
          type="checkbox"
          aria-label={`Select ${r.itemName} on ${r.mrNo}`}
          checked={picked[r.mrLineId] !== undefined}
          onChange={(e) => toggle(r, e.target.checked)}
        />
      ),
    },
    {
      key: 'mr',
      header: 'MR no.',
      render: (r) => (
        <span className="inline-flex flex-col items-start gap-1">
          <button className="text-ac underline font-semibold font-mono" onClick={() => router.push(`/mrs/${r.mrId}`)}>
            {r.mrNo}
          </button>
          <AttachmentButton mrId={r.mrId} count={r.attachments} />
        </span>
      ),
    },
    { key: 'project', header: 'Project', render: (r) => <span className="whitespace-nowrap">{r.projectCode}</span> },
    {
      key: 'asked',
      header: 'Site engineer asked for',
      render: (r) => (
        <>
          {r.mrDescription || '—'}
          {r.qsReply ? (
            <div className="text-xs mt-1" style={{ color: 'var(--pur)' }}>
              <b>QS{r.qsReplyBy ? ` (${r.qsReplyBy})` : ''}:</b> {r.qsReply}
              {r.procRemark ? <span className="text-mut"> — you asked: {r.procRemark}</span> : null}
            </div>
          ) : null}
        </>
      ),
    },
    {
      key: 'open',
      header: 'Open qty',
      align: 'right',
      render: (r) => `${qty(r.openQty)} ${r.unit}`,
    },
    {
      key: 'take',
      header: 'Take qty',
      render: (r) => (
        <input
          type="number"
          min={0}
          step="any"
          aria-label={`Take quantity for ${r.itemName}`}
          className="w-24 font-semibold"
          value={picked[r.mrLineId] ?? String(r.openQty)}
          onChange={(e) =>
            setPicked((current) => ({ ...current, [r.mrLineId]: e.target.value }))
          }
        />
      ),
    },
    {
      key: 'required',
      header: 'Required',
      render: (r) => (
        <span className="flex items-center gap-2 justify-end desk:justify-start">
          {fmtDate(r.requiredDate)}
          {r.overdue ? <Tag label="OVERDUE" tone="red" /> : null}
        </span>
      ),
    },
    {
      key: 'rate',
      header: 'Last rate',
      align: 'right',
      render: (r) => (r.lastRate ? money(r.lastRate) : '—'),
    },
  ];

  /** Prototype: the grouped header row per item. */
  const groupFor = (r: PoolRowDto): string => {
    const forItem = rows.filter((x) => x.itemId === r.itemId);
    const total = forItem.reduce((sum, x) => sum + x.openQty, 0);
    const projects = new Set(forItem.map((x) => x.projectId)).size;
    return `${r.itemName}  ${r.itemCode} · ${r.category} — total open ${qty(total)} ${r.unit} · ${projects} project(s)`;
  };

  const createPo = () => {
    const chosen = picks();
    if (!chosen) return;
    // Hand the picked lines to the wizard, which opens on step 1.
    setRows(
      selection.map((s) => ({
        mrLineId: s.row.mrLineId,
        itemId: s.row.itemId,
        itemCode: s.row.itemCode,
        itemName: s.row.itemName,
        mrDescription: s.row.mrDescription,
        unit: s.row.unit,
        projectCode: s.row.projectCode,
        mrNo: s.row.mrNo,
        qty: s.take,
        rate: s.row.lastRate ?? 0,
        gstPct: 5,
        received: 0,
        openQty: s.row.openQty,
      })),
    );
    router.push('/pos/new');
  };

  return (
    <>
      <PageHeader
        title="Consolidate MRs"
        subtitle="QS-approved PO quantities from every project. Tick lines from any MR — full or part qty — then send one enquiry or raise one PO."
        actions={
          <>
            <input
              type="search"
              aria-label="Search materials"
              placeholder="Search material, MR no. or project"
              className="min-w-[230px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label="Project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">All projects</option>
              {reference.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code}
                </option>
              ))}
            </select>
            <select
              aria-label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All categories</option>
              {reference.categories.map((c) => (
                <option key={c.id}>{c.name}</option>
              ))}
            </select>
            <Btn
              onClick={() =>
                setPicked((current) => ({
                  ...current,
                  ...Object.fromEntries(shown.map((r) => [r.mrLineId, String(r.openQty)])),
                }))
              }
            >
              Select shown
            </Btn>
            <Btn onClick={() => setPicked({})}>Clear</Btn>
            <Btn onClick={() => setAnalysisOpen(true)}>Site-wise analysis</Btn>
          </>
        }
      />

      <ProcHolds canAnswer={false} />

      {pool.isLoading ? (
        <div className="text-mut">Loading…</div>
      ) : rows.length && !shown.length ? (
        <EmptyState text="No material matches that search." />
      ) : rows.length ? (
        <DataTable
          columns={columns}
          rows={shown}
          rowKey={(r) => r.mrLineId}
          groupBy={groupFor}
          rowClassName={(r) => (picked[r.mrLineId] !== undefined ? 'bg-[#EEF5F4]' : '')}
          emptyText=""
        />
      ) : (
        <EmptyState text="Nothing waiting — all PO quantities are on an enquiry or PO." />
      )}

      <StickyActionBar>
        <div>
          <b>{summary.lines} line(s)</b> · {summary.mrs} MR(s) · {summary.projects} project(s) ·{' '}
          {summary.items} item(s)
        </div>
        <div className="flex flex-wrap gap-[10px]">
          <Btn onClick={() => setAnalysisOpen(true)}>Analysis</Btn>
          <Btn disabled={!summary.lines} onClick={() => setSendBack('QUERY')}>
            Send query
          </Btn>
          <Btn disabled={!summary.lines} onClick={() => setSendBack('REJECT')}>
            <span className={summary.lines ? 'text-[#b42318]' : ''}>Reject</span>
          </Btn>
          <Btn disabled={!summary.lines} onClick={createPo}>
            Create PO
          </Btn>
          <Btn variant="primary" disabled={!summary.lines} onClick={() => setRfqOpen(true)}>
            Send enquiry
          </Btn>
        </div>
      </StickyActionBar>

      {analysisOpen ? (
        <AnalysisModal
          picks={selection.map((s) => ({ mrLineId: s.row.mrLineId, qty: s.take }))}
          onClose={() => setAnalysisOpen(false)}
        />
      ) : null}

      {sendBack ? (
        <SendBackModal
          action={sendBack}
          rows={selection.map((s) => s.row)}
          onClose={() => setSendBack(null)}
          onSent={() => {
            setPicked({});
            setSendBack(null);
          }}
        />
      ) : null}

      {rfqOpen ? (
        <SendEnquiryModal
          picks={picks()}
          summary={summary}
          suggestedVendorIds={[
            ...new Set(selection.map((s) => s.row.lastVendorId).filter(Boolean) as string[]),
          ]}
          onClose={() => setRfqOpen(false)}
          onSent={() => {
            setPicked({});
            setRfqOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Procurement sends the ticked materials back to QS: a query, or a rejection. Remarks
 * are required either way; the lines leave this list until QS answers.
 */
function SendBackModal({
  action,
  rows,
  onClose,
  onSent,
}: {
  action: 'QUERY' | 'REJECT';
  rows: PoolRowDto[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [remark, setRemark] = useState('');
  const isQuery = action === 'QUERY';

  const send = useAction(
    () =>
      post<{ lines: number }>('/pool/hold', {
        mrLineIds: rows.map((r) => r.mrLineId),
        action,
        remark: remark.trim(),
      }),
    {
      success: (r) =>
        `${r.lines} material(s) ${isQuery ? 'sent to QS with your query' : 'rejected and sent back to QS'}`,
      invalidate: [['pool'], ['pool-holds'], ['pool-analysis']],
      onDone: onSent,
    },
  );

  return (
    <Modal
      title={isQuery ? 'Send query to QS' : 'Reject and send back to QS'}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn
            variant="primary"
            disabled={send.isPending || !remark.trim()}
            onClick={() => send.mutate(undefined)}
          >
            {send.isPending ? 'Sending…' : isQuery ? 'Send query' : 'Reject'}
          </Btn>
        </>
      }
    >
      <div className="text-mut text-sm">
        {rows.length} material(s) go back to QS and leave this list until QS answers.
      </div>
      <div className="flex flex-col border border-line rounded-xl overflow-hidden max-h-[220px] overflow-y-auto">
        {rows.map((r) => (
          <div key={r.mrLineId} className="px-[14px] py-2 border-b border-line2 bg-white">
            <b>{r.itemName}</b>{' '}
            <span className="text-mut text-xs">
              {r.mrNo} · {r.projectCode} · {qty(r.openQty)} {r.unit}
            </span>
          </div>
        ))}
      </div>
      <label className="field">
        Remarks *
        <textarea
          rows={3}
          maxLength={500}
          placeholder={
            isQuery
              ? 'What do you need QS to clarify?'
              : 'Why are you rejecting these materials?'
          }
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
        />
      </label>
    </Modal>
  );
}

/** Prototype: analysisHtml() — item × project, with value at last rates. */
function AnalysisModal({
  picks,
  onClose,
}: {
  picks: { mrLineId: string; qty: number }[];
  onClose: () => void;
}) {
  const analysis = useQuery({
    queryKey: ['pool-analysis', picks.length],
    queryFn: () => post<PoolAnalysisDto>('/pool/analysis', { picks }),
  });

  const data = analysis.data;

  return (
    <Modal title="Site-wise analysis" onClose={onClose} wide>
      <div className="text-mut text-sm">
        {picks.length ? 'Selected lines' : 'All open pool lines'} · quantity per project,
        value at last purchase rate
      </div>

      {analysis.isLoading || !data ? (
        <div className="text-mut">Loading…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="t">
            <thead>
              <tr>
                <th>Item</th>
                {data.projects.map((p) => (
                  <th key={p.id} className="text-right">
                    {p.code}
                  </th>
                ))}
                <th className="text-right">Total qty</th>
                <th className="text-right">Last rate</th>
                <th className="text-right">Est. value</th>
                <th>Earliest need</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.itemId}>
                  <td data-label="Item">
                    <b>{row.itemName}</b> <span className="text-mut">{row.unit}</span>
                  </td>
                  {data.projects.map((p) => (
                    <td key={p.id} data-label={p.code} className="desk:text-right">
                      {row.perProject[p.id] ? qty(row.perProject[p.id]!) : '—'}
                    </td>
                  ))}
                  <td data-label="Total" className="desk:text-right">
                    <b>{qty(row.totalQty)}</b>
                  </td>
                  <td data-label="Last rate" className="desk:text-right">
                    {row.lastRate ? money(row.lastRate) : '—'}
                  </td>
                  <td data-label="Est. value" className="desk:text-right">
                    {money(row.value)}
                  </td>
                  <td data-label="Earliest need">{fmtDate(row.earliestNeed)}</td>
                </tr>
              ))}
              <tr>
                <td data-label="Value by project">
                  <b>Est. value</b>
                </td>
                {data.projects.map((p) => (
                  <td key={p.id} data-label={p.code} className="desk:text-right">
                    <b>{money(data.valueByProject[p.id] ?? 0)}</b>
                  </td>
                ))}
                <td />
                <td />
                <td data-label="Total" className="desk:text-right">
                  <b>{money(data.grandTotal)}</b>
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/** Prototype: A.rfqModal / A.createRFQ — vendor search, due time, note. */
function SendEnquiryModal({
  picks,
  summary,
  suggestedVendorIds,
  onClose,
  onSent,
}: {
  picks: { mrLineId: string; qty: number }[] | null;
  summary: { lines: number; items: number; projects: number };
  suggestedVendorIds: string[];
  onClose: () => void;
  onSent: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const reference = useReference();

  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [dueAt, setDueAt] = useState(dateTimeLocal(DEFAULT_RFQ_DUE_HOURS));
  const [note, setNote] = useState('');

  const matches = reference.vendors.filter(
    (v) =>
      !chosen.includes(v.id) &&
      (!search ||
        [v.name, v.email, v.phone].join(' ').toLowerCase().includes(search.toLowerCase())),
  );

  const send = useAction(
    () =>
      post<{ id: string; no: string }>(
        '/rfqs',
        {
          picks,
          vendorIds: chosen,
          dueAt: new Date(dueAt).toISOString(),
          note,
        },
        newIdempotencyKey(),
      ),
    {
      invalidate: [['pool'], ['rfqs']],
      onDone: (rfq) => {
        toast(`${rfq.no} sent to vendors`);
        onSent();
        router.push(`/rfqs/${rfq.id}`);
      },
    },
  );

  const submit = () => {
    if (!picks) return;
    if (!chosen.length) return toast(MSG.rfqPickVendor);
    if (!dueAt || new Date(dueAt).getTime() <= Date.now()) return toast(MSG.rfqDueFuture);
    send.mutate();
  };

  const vendorName = (id: string) =>
    reference.vendors.find((v) => v.id === id)?.name ?? id;

  return (
    <Modal
      title="Send enquiry"
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={send.isPending} onClick={submit}>
            Send enquiry
          </Btn>
        </>
      }
    >
      <div className="text-mut text-sm">
        {summary.lines} line(s) · {summary.items} item(s) · {summary.projects} project(s)
        combined
      </div>

      <div>
        <b>Vendors added ({chosen.length})</b>
      </div>
      <div className="flex flex-wrap gap-[6px]">
        {chosen.length ? (
          chosen.map((id) => (
            <span
              key={id}
              className="chip inline-flex items-center gap-[6px] pl-3 pr-[6px] py-1"
              style={{ background: 'var(--purs)', color: 'var(--pur)' }}
            >
              {vendorName(id)}
              <button
                aria-label={`Remove ${vendorName(id)}`}
                className="text-base px-1"
                onClick={() => setChosen(chosen.filter((x) => x !== id))}
              >
                ×
              </button>
            </span>
          ))
        ) : (
          <span className="text-mut text-sm">
            No vendors added yet — search below and click Add.
          </span>
        )}
      </div>

      {suggestedVendorIds.length ? (
        <div className="flex flex-wrap items-center gap-[10px]">
          <span className="text-mut text-sm">Last bought from:</span>
          {suggestedVendorIds.map((id) => (
            <Btn
              key={id}
              small
              onClick={() => setChosen((c) => (c.includes(id) ? c : [...c, id]))}
            >
              + {vendorName(id)}
            </Btn>
          ))}
        </div>
      ) : null}

      <input
        placeholder="Search vendor by name, email or phone"
        aria-label="Search vendor"
        autoComplete="off"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="flex flex-col border border-line rounded-xl overflow-hidden max-h-[260px] overflow-y-auto">
        {matches.slice(0, 30).map((vendor) => (
          <button
            key={vendor.id}
            onClick={() => setChosen((c) => [...c, vendor.id])}
            className="flex justify-between items-center gap-2 min-h-[56px] px-[14px] py-2 border-b border-line2 bg-white text-left"
          >
            <span>
              <span className="font-semibold">{vendor.name}</span>
              <br />
              <span className="text-mut text-xs">
                {[vendor.email, vendor.phone].filter(Boolean).join(' · ') ||
                  'no contact on file'}{' '}
                · {vendor.portalLogins.length ? 'portal login' : 'email only'}
              </span>
            </span>
            <span className="text-ac font-semibold text-sm">+ Add</span>
          </button>
        ))}
        {!matches.length ? (
          <div className="p-[14px] text-mut">No vendor matches</div>
        ) : null}
      </div>

      <label className="field">
        Quotes due (date and time) *
        <input
          type="datetime-local"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
        />
      </label>

      <label className="field">
        Note to vendors
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
    </Modal>
  );
}

// Keeps the vendor type import meaningful for readers of this file.
export type { VendorDto };
