'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from '@mm/lib/nav';
import { useQuery } from '@tanstack/react-query';
import {
  BRAND_LOGO_URL,
  IS_ST,
  MR_ST,
  MSG,
  PO_ST,
  RFQ_ST,
  ROLE_NAMES,
  UNIT_NAMES,
  UNITS,
  chipFor,
  type ItemDto,
  type LinkedPoDto,
  type MrDetailDto,
  type MrLineDetailDto,
  type Role,
  type Unit,
} from '@cm/shared';
import { get, post } from '@mm/lib/api';
import { DataTable, type Column } from '@mm/components/DataTable';
import {
  Btn,
  Card,
  Chip,
  PageHeader,
  ProgressBar,
  Stack,
  Tag,
  Trail,
} from '@mm/components/ui';
import { useToast } from '@mm/components/Toast';
import { useAction } from '@mm/lib/hooks';
import { fmtDate, fmtDateTime, money, qty } from '@mm/lib/format';
import { useSession } from '@mm/lib/session';

/**
 * Prototype: VIEWS.mrview — lines, progress bars, the approval panels, the
 * new-item panel, linked documents and the trail.
 *
 * The request is reviewed twice: first by the Project Manager, then by QS.
 * Both may change the quantity, the measurement and the unit, or drop a line,
 * and whatever they do is shown back to the site engineer on this page.
 */
export default function MrDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { me } = useSession();

  const mr = useQuery({
    queryKey: ['mr', id],
    queryFn: () => get<MrDetailDto>(`/mrs/${id}`),
  });

  if (mr.isLoading) return <div className="text-mut">Loading…</div>;
  if (!mr.data) return <div className="errb">Not found</div>;

  const data = mr.data;
  const approved = data.status === 'APPROVED' || data.status === 'CLOSED';
  const pending = data.lines.filter((l) => l.newStatus === 'PENDING');

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3 flex-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.companyLogoUrl || BRAND_LOGO_URL}
              alt="Chandramari Group"
              className="h-9 w-auto object-contain"
            />
            <span className="font-mono">{data.no || 'Draft'}</span>
            <Chip spec={chipFor(MR_ST, data.status)} />
          </span>
        }
        subtitle={
          <>
            {data.projectName} · raised by {data.createdByName} ·{' '}
            {fmtDateTime(data.submittedAt ?? data.createdAt)}
            <div className="mt-2 text-ink">
              Required date (all items): <b>{fmtDate(data.requiredDate)}</b>{' '}
              {data.overdue ? <Tag label="OVERDUE" tone="red" /> : null}
            </div>
          </>
        }
        actions={
          <>
            {data.canEdit ? (
              <Btn variant="primary" onClick={() => router.push(`/mrs/${id}/edit`)}>
                Edit{data.status === 'SENT_BACK' ? ' & resubmit' : ''}
              </Btn>
            ) : null}
            <Btn onClick={() => router.push(`/mrs/print?ids=${id}`)}>MR form / PDF</Btn>
          </>
        }
      />

      <ApprovalBanner mr={data} />
      <BoqBanner mr={data} />

      {data.canPm ? <PmPanel mr={data} /> : null}

      {data.canQs && pending.length ? <NewItemPanel lines={pending} mrId={id} /> : null}

      {data.canQs && !pending.length ? (
        <QsPanel mr={data} />
      ) : data.canPm ? null : (
        <>
          <LinesTable lines={data.lines} approved={approved} />
          {data.canQs ? (
            <QsDecisionPanel mr={data} pending={pending.length} review={null} />
          ) : null}
        </>
      )}

      {data.remarks ? (
        <Card className="mt-3">
          <span className="text-mut">MR remarks:</span> {data.remarks}
        </Card>
      ) : null}

      {approved ? <ProcurementProgress mr={data} /> : null}

      {approved && data.linkedIssues.length ? (
        <>
          <h2>Issues to site</h2>
          <div className="flex flex-wrap gap-[10px]">
            {data.linkedIssues.map((issue) => (
              <Btn key={issue.id} small onClick={() => router.push(`/issues/${issue.id}`)}>
                <span className="font-mono">{issue.no}</span>
                <Chip spec={chipFor(IS_ST, issue.status)} />
              </Btn>
            ))}
          </div>
        </>
      ) : null}

      {me.role !== 'VENDOR' ? <Trail rows={data.trail} /> : null}
    </>
  );
}

/** Who last acted on the request, and what they said about it. */
function ApprovalBanner({ mr }: { mr: MrDetailDto }) {
  const who = mr.lastCommentRole
    ? `${mr.lastCommentRole}${mr.lastCommentByName ? ` (${mr.lastCommentByName})` : ''}`
    : '';

  if (mr.status === 'REJECTED') {
    return (
      <div className="errb mb-3">
        <b>Rejected{who ? ` by ${who}` : ''}:</b> {mr.lastComment || 'No reason given'}
      </div>
    );
  }

  if (mr.status === 'SENT_BACK') {
    return (
      <div className="warn mb-3">
        <b>Sent back{who ? ` by ${who}` : ''}:</b> {mr.lastComment || 'No comment'}
      </div>
    );
  }

  // Once the PM has passed it on, everyone can see that they did and when.
  if (mr.pmByName && mr.lastComment) {
    return (
      <div className="warn mb-3">
        <b>Project Manager ({mr.pmByName}):</b> {mr.lastComment}
      </div>
    );
  }

  return null;
}

/** The optional bill of quantities — the requester, the PM and QS all see it. */
function BoqBanner({ mr }: { mr: MrDetailDto }) {
  if (!mr.boqFiles.length) return null;

  return (
    <Card className="mb-3">
      <div className="flex items-start gap-[10px] flex-wrap">
        <Tag label="BOQ" tone="ac" />
        <div className="min-w-0">
          <div className="flex flex-col gap-1">
            {mr.boqFiles.map((file) => (
              <a
                key={file.id}
                href={file.url}
                target="_blank"
                rel="noreferrer"
                className="font-semibold break-all"
              >
                {file.name}
              </a>
            ))}
          </div>
          <span className="text-mut text-sm">
            {mr.boqFiles.length} file(s) attached by the site engineer
          </span>
        </div>
      </div>
    </Card>
  );
}

/** "50 Nos (asked 70 Nos)" — the change, wherever a quantity is shown. */
function QtyWithRequest({ line }: { line: MrLineDetailDto }) {
  if (!line.changed) return <b>{qty(line.qty)}</b>;

  return (
    <span>
      <b>{qty(line.qty)}</b>
      <div className="text-mut text-xs">
        asked {qty(line.requestedQty)}
        {line.requestedUnit && line.requestedUnit !== line.unit
          ? ` ${line.requestedUnit}`
          : ''}
      </div>
    </span>
  );
}

/** Before approval the table is simply what was asked for. */
function LinesTable({
  lines,
  approved,
}: {
  lines: MrLineDetailDto[];
  approved: boolean;
}) {
  const requested: Column<MrLineDetailDto>[] = [
    { key: 'sn', header: '#', render: (l) => l.sn },
    { key: 'boq', header: 'BOQ ref', render: (l) => l.boqRef },
    {
      key: 'item',
      header: 'Item',
      render: (l) => (
        <span className="flex items-center gap-2 justify-end desk:justify-start">
          <b>{l.name}</b>
          {l.newStatus === 'PENDING' ? <Tag label="NEW" tone="amb" /> : null}
          {l.newStatus === 'APPROVED' ? <Tag label="NEW → MASTER" tone="grn" /> : null}
          {l.newStatus === 'MAPPED' ? <Tag label="MAPPED" tone="ac" /> : null}
          {l.changed ? <Tag label="CHANGED" tone="amb" /> : null}
          {l.lineStatus === 'REJECTED' ? <Tag label="LINE REJECTED" tone="red" /> : null}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (l) => <span className="whitespace-pre-line">{l.description || '—'}</span>,
    },
    {
      key: 'measurement',
      header: 'Measurement',
      render: (l) => (
        <span>
          {l.measurement || '—'}
          {l.changed && l.requestedMeasurement !== l.measurement ? (
            <div className="text-mut text-xs">asked {l.requestedMeasurement || '—'}</div>
          ) : null}
        </span>
      ),
    },
    { key: 'unit', header: 'Unit', render: (l) => l.unit },
    {
      key: 'qty',
      header: 'Qty',
      align: 'right',
      render: (l) => <QtyWithRequest line={l} />,
    },
    { key: 'remarks', header: 'Remarks', render: (l) => l.remarks },
  ];

  // After approval every line shows its whole journey (§7).
  const tracked: Column<MrLineDetailDto>[] = [
    {
      key: 'item',
      header: 'Item',
      render: (l) => (
        <span>
          <b>{l.name}</b>
          <div className="text-mut text-xs">
            {l.description ? <div>{l.description}</div> : null}
            {l.unit}
            {l.measurement ? ` · ${l.measurement}` : ''}
            {l.qsRemark ? ` · QS: ${l.qsRemark}` : ''}
          </div>
        </span>
      ),
    },
    {
      key: 'req',
      header: 'Approved qty',
      align: 'right',
      render: (l) => <QtyWithRequest line={l} />,
    },
    { key: 'store', header: 'From store', align: 'right', render: (l) => qty(l.calc.store) },
    { key: 'po', header: 'For PO', align: 'right', render: (l) => qty(l.calc.po) },
    {
      key: 'cut',
      header: 'Not approved',
      align: 'right',
      render: (l) => <span className={l.calc.cut ? 'text-red' : ''}>{qty(l.calc.cut)}</span>,
    },
    { key: 'onpo', header: 'On PO', align: 'right', render: (l) => qty(l.calc.poAlloc) },
    { key: 'recd', header: 'Received', align: 'right', render: (l) => qty(l.calc.received) },
    {
      key: 'issued',
      header: 'Issued',
      align: 'right',
      render: (l) => qty(l.calc.issuedGross),
    },
    { key: 'site', header: 'Site accepted', align: 'right', render: (l) => qty(l.calc.siteAcc) },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      render: (l) => <b>{qty(l.calc.balance)}</b>,
    },
    {
      key: 'progress',
      header: 'Progress',
      render: (l) => (
        <ProgressBar
          percent={l.calc.approved ? (l.calc.siteAcc / l.calc.approved) * 100 : 0}
          done={l.calc.closed}
        />
      ),
    },
  ];

  return (
    <DataTable
      columns={approved ? tracked : requested}
      rows={lines}
      rowKey={(l) => l.id}
      rowClassName={(l) => (l.lineStatus === 'REJECTED' ? 'opacity-55' : '')}
      emptyText="No items"
    />
  );
}

/** Prototype: newItemPanel(pend) — QS clears new items before approving. */
function NewItemPanel({ lines, mrId }: { lines: MrLineDetailDto[]; mrId: string }) {
  const [mapTo, setMapTo] = useState<Record<string, string>>({});
  const toast = useToast();

  const items = useQuery({
    queryKey: ['items', 'all'],
    queryFn: () => get<ItemDto[]>('/items?limit=200'),
  });

  const invalidate = [['mr', mrId], ['mrs'], ['items']];

  const approve = useAction((lineId: string) => post(`/mr-lines/${lineId}/approve-new`), {
    success: 'Added to the item master',
    invalidate,
  });
  const map = useAction(
    (lineId: string) => post(`/mr-lines/${lineId}/map`, { itemId: mapTo[lineId] }),
    { success: 'Mapped to the existing item', invalidate },
  );
  const reject = useAction((lineId: string) => post(`/mr-lines/${lineId}/reject`), {
    success: 'Line rejected',
    invalidate,
  });

  return (
    <div className="flex flex-col gap-3 mb-4">
      <h2 className="m-0">New items to clear</h2>
      {lines.map((line) => (
        <div
          key={line.id}
          className="card flex flex-col gap-3 border-[1.5px] border-[#C98A3E] bg-[#FFFBF5]"
        >
          <div className="flex justify-between items-center gap-3">
            <b>
              {line.sn} · {line.newItemName}
            </b>
            <Tag label="NEW" tone="amb" />
          </div>
          <div className="text-mut text-sm">
            Unit {line.unit} · {line.newCategory} · qty {qty(line.qty)}
            {line.measurement ? ` · ${line.measurement}` : ''}
            {line.remarks ? ` · ${line.remarks}` : ''}
          </div>

          <select
            aria-label={`Map ${line.newItemName} to an existing item`}
            value={mapTo[line.id] ?? ''}
            onChange={(e) => setMapTo({ ...mapTo, [line.id]: e.target.value })}
          >
            <option value="">Map to existing item…</option>
            {(items.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} · {item.name} ({item.unit})
              </option>
            ))}
          </select>

          <div className="flex flex-wrap gap-[10px]">
            <Btn small variant="primary" onClick={() => approve.mutate(line.id)}>
              Approve to item master
            </Btn>
            <Btn
              small
              onClick={() =>
                mapTo[line.id] ? map.mutate(line.id) : toast(MSG.qsChooseMapTarget)
              }
            >
              Map to existing
            </Btn>
            <Btn small variant="danger" onClick={() => reject.mutate(line.id)}>
              Reject line
            </Btn>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The shared review grid — the PM and QS edit the same three fields
// ---------------------------------------------------------------------------

interface ReviewRow {
  qty: string;
  measurement: string;
  unit: string;
  rejected: boolean;
  remark: string;
}

const reviewFrom = (lines: MrLineDetailDto[]): Record<string, ReviewRow> =>
  Object.fromEntries(
    lines.map((line) => [
      line.id,
      {
        qty: String(line.qty ?? ''),
        measurement: line.measurement ?? '',
        unit: line.unit || 'Nos',
        rejected: false,
        remark: '',
      },
    ]),
  );

const reviewPayload = (review: Record<string, ReviewRow>) =>
  Object.entries(review).map(([id, row]) => ({
    id,
    qty: Number(row.qty) || 0,
    measurement: row.measurement,
    unit: row.unit as Unit,
    rejected: row.rejected,
    remark: row.remark,
  }));

/** The editable Qty / Unit / Measurement columns both approvers get. */
function reviewColumns(
  review: Record<string, ReviewRow>,
  patch: (id: string, change: Partial<ReviewRow>) => void,
): Column<MrLineDetailDto>[] {
  return [
    {
      key: 'item',
      header: 'Item',
      render: (l) => (
        <span>
          <b>{l.name}</b>
          <div className="text-mut text-xs">
            {l.description ? <div className="text-ink">{l.description}</div> : null}
            asked {qty(l.requestedQty)} {l.requestedUnit || l.unit}
            {l.requestedMeasurement ? ` · ${l.requestedMeasurement}` : ''}
            {l.remarks ? ` · ${l.remarks}` : ''}
          </div>
        </span>
      ),
    },
    {
      key: 'qty',
      header: 'Qty',
      render: (l) => (
        <input
          type="number"
          min={0}
          step="any"
          aria-label={`Quantity for ${l.name}`}
          className="w-24 font-semibold"
          disabled={review[l.id]?.rejected}
          value={review[l.id]?.qty ?? ''}
          onChange={(e) => patch(l.id, { qty: e.target.value })}
        />
      ),
    },
    {
      key: 'unit',
      header: 'Unit',
      render: (l) => (
        <select
          aria-label={`Unit for ${l.name}`}
          disabled={review[l.id]?.rejected}
          value={review[l.id]?.unit ?? 'Nos'}
          onChange={(e) => patch(l.id, { unit: e.target.value })}
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
                {UNIT_NAMES[u]}
              </option>
          ))}
        </select>
      ),
    },
    {
      key: 'measurement',
      header: 'Measurement',
      render: (l) => (
        <input
          aria-label={`Measurement for ${l.name}`}
          maxLength={120}
          placeholder="2400 × 1200 × 12.5 mm"
          disabled={review[l.id]?.rejected}
          value={review[l.id]?.measurement ?? ''}
          onChange={(e) => patch(l.id, { measurement: e.target.value })}
        />
      ),
    },
    {
      key: 'remark',
      header: 'Reason for the change',
      render: (l) => (
        <input
          aria-label={`Reason for ${l.name}`}
          maxLength={250}
          placeholder="Seen by the site engineer"
          value={review[l.id]?.remark ?? ''}
          onChange={(e) => patch(l.id, { remark: e.target.value })}
        />
      ),
    },
    {
      key: 'reject',
      header: 'Drop line',
      render: (l) => (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            aria-label={`Drop ${l.name}`}
            checked={review[l.id]?.rejected ?? false}
            onChange={(e) => patch(l.id, { rejected: e.target.checked })}
          />
          <span className="text-mut text-xs">Not needed</span>
        </label>
      ),
    },
  ];
}

/**
 * The Project Manager's review: the first stop after site. Approving sends it
 * on to QS; a dropped line never reaches QS at all.
 */
function PmPanel({ mr }: { mr: MrDetailDto }) {
  const toast = useToast();
  const active = useMemo(
    () => mr.lines.filter((l) => l.lineStatus !== 'REJECTED'),
    [mr.lines],
  );

  const [review, setReview] = useState<Record<string, ReviewRow>>(() => reviewFrom(active));
  const [comment, setComment] = useState('');

  const patch = (id: string, change: Partial<ReviewRow>) =>
    setReview((rows) => ({ ...rows, [id]: { ...rows[id]!, ...change } }));

  const invalidate = [['mr', mr.id], ['mrs'], ['counts']];

  const approve = useAction(
    () =>
      post(`/mrs/${mr.id}/pm-approve`, {
        rv: mr.rv,
        comment,
        lines: reviewPayload(review),
      }),
    { success: `${mr.no} passed to QS`, invalidate },
  );

  const sendBack = useAction(
    () => post(`/mrs/${mr.id}/pm-send-back`, { comment, rv: mr.rv }),
    { success: 'Sent back to the site engineer', invalidate },
  );

  const reject = useAction(() => post(`/mrs/${mr.id}/pm-reject`, { comment, rv: mr.rv }), {
    success: 'MR rejected',
    invalidate,
  });

  const withComment = (run: () => void) =>
    comment.trim() ? run() : toast(MSG.pmCommentRequired);

  const keeping = Object.values(review).filter((r) => !r.rejected).length;

  return (
    <>
      <h2>Project Manager review</h2>
      <DataTable
        columns={reviewColumns(review, patch)}
        rows={active}
        rowKey={(l) => l.id}
        rowClassName={(l) => (review[l.id]?.rejected ? 'opacity-55' : '')}
        emptyText="No lines to review"
      />
      <div className="text-mut text-sm mt-2">
        Change the quantity, the unit or the measurement as needed — the site
        engineer sees what you asked for alongside what they requested.
      </div>

      <Card className="mt-3">
        <Stack>
          <label className="field">
            Comment for the site engineer (required for Send back / Reject)
            <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>

          {!keeping ? (
            <div className="warn">{MSG.pmNothingApproved}</div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-[10px]">
            <Btn variant="danger" onClick={() => withComment(() => reject.mutate())}>
              Reject MR
            </Btn>
            <Btn onClick={() => withComment(() => sendBack.mutate())}>Send back</Btn>
            <Btn
              variant="primary"
              disabled={!keeping || approve.isPending}
              onClick={() => approve.mutate()}
            >
              Approve &amp; send to QS
            </Btn>
          </div>
        </Stack>
      </Card>
    </>
  );
}

interface SplitRow {
  storeQty: string;
  poQty: string;
  qsRemark: string;
}

/**
 * Prototype: qsForm(ls), with the decision box beneath it.
 *
 * One component owns both the review and the split, so what the table shows
 * and what gets posted cannot drift apart.
 */
function QsPanel({ mr }: { mr: MrDetailDto }) {
  const active = useMemo(
    () => mr.lines.filter((l) => l.lineStatus !== 'REJECTED'),
    [mr.lines],
  );

  const [review, setReview] = useState<Record<string, ReviewRow>>(() => reviewFrom(active));
  const [split, setSplit] = useState<Record<string, SplitRow>>(() =>
    Object.fromEntries(
      active.map((line) => {
        // Prototype default: take what the store has, buy the rest.
        const store = line.storeQty ?? Math.min(line.qty, Math.max(0, line.available));
        const po = line.poQty ?? line.qty - store;
        return [
          line.id,
          { storeQty: String(store), poQty: String(po), qsRemark: line.qsRemark },
        ];
      }),
    ),
  );

  const patchReview = (id: string, change: Partial<ReviewRow>) =>
    setReview((rows) => ({ ...rows, [id]: { ...rows[id]!, ...change } }));

  const patch = (id: string, change: Partial<SplitRow>) =>
    setSplit((rows) => ({ ...rows, [id]: { ...rows[id]!, ...change } }));

  const columns: Column<MrLineDetailDto>[] = [
    ...reviewColumns(review, patchReview).slice(0, 4),
    {
      key: 'avail',
      header: 'Store available',
      align: 'right',
      render: (l) => (
        <span>
          {qty(l.available)}{' '}
          <span className="text-mut text-xs">(on hand {qty(l.onHand)})</span>
        </span>
      ),
    },
    {
      key: 'store',
      header: 'From store',
      render: (l) => (
        <input
          type="number"
          min={0}
          step="any"
          aria-label={`From store for ${l.name}`}
          className="w-24 font-semibold"
          disabled={review[l.id]?.rejected}
          value={split[l.id]?.storeQty ?? '0'}
          onChange={(e) => patch(l.id, { storeQty: e.target.value })}
        />
      ),
    },
    {
      key: 'po',
      header: 'For PO',
      render: (l) => (
        <input
          type="number"
          min={0}
          step="any"
          aria-label={`For PO for ${l.name}`}
          className="w-24 font-semibold"
          disabled={review[l.id]?.rejected}
          value={split[l.id]?.poQty ?? '0'}
          onChange={(e) => patch(l.id, { poQty: e.target.value })}
        />
      ),
    },
    {
      key: 'cut',
      header: 'Not approved',
      align: 'right',
      render: (l) => {
        const store = Number(split[l.id]?.storeQty ?? 0);
        const po = Number(split[l.id]?.poQty ?? 0);
        // Judged against the quantity QS is approving, not the one requested.
        const approving = Number(review[l.id]?.qty ?? l.qty) || 0;
        const cut = approving - store - po;
        const overcommitted = cut < 0 || store > l.available;
        return (
          <span className={overcommitted ? 'text-red font-semibold' : ''}>
            {cut < 0 ? `over by ${qty(-cut)}` : qty(cut)}
          </span>
        );
      },
    },
    {
      key: 'qsRemark',
      header: 'QS remark',
      render: (l) => (
        <input
          aria-label={`QS remark for ${l.name}`}
          placeholder="Reason if cut"
          value={split[l.id]?.qsRemark ?? ''}
          onChange={(e) => patch(l.id, { qsRemark: e.target.value })}
        />
      ),
    },
    {
      key: 'reject',
      header: 'Drop line',
      render: (l) => (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            aria-label={`Drop ${l.name}`}
            checked={review[l.id]?.rejected ?? false}
            onChange={(e) => patchReview(l.id, { rejected: e.target.checked })}
          />
          <span className="text-mut text-xs">Not needed</span>
        </label>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={active}
        rowKey={(l) => l.id}
        rowClassName={(l) => (review[l.id]?.rejected ? 'opacity-55' : '')}
        emptyText="No lines to split"
      />
      <div className="text-mut text-sm mt-2">
        Rule: from store + for PO ≤ the quantity you approve, and from store ≤
        available stock. Changing a quantity, a unit or a measurement here is
        shown to the site engineer and to the Project Manager.
      </div>
      <QsDecisionPanel mr={mr} pending={0} review={{ review, split }} />
    </>
  );
}

/** Prototype: the QS comment box with Reject / Send back / Approve split. */
function QsDecisionPanel({
  mr,
  pending,
  review,
}: {
  mr: MrDetailDto;
  pending: number;
  review: {
    review: Record<string, ReviewRow>;
    split: Record<string, SplitRow>;
  } | null;
}) {
  const toast = useToast();
  const [comment, setComment] = useState('');

  const invalidate = [['mr', mr.id], ['mrs'], ['pool'], ['inventory'], ['counts']];

  const approve = useAction(
    () =>
      post(`/mrs/${mr.id}/qs-approve`, {
        rv: mr.rv,
        comment,
        lines: reviewPayload(review?.review ?? {}).map((line) => ({
          ...line,
          storeQty: Number(review?.split[line.id]?.storeQty) || 0,
          poQty: Number(review?.split[line.id]?.poQty) || 0,
          qsRemark: review?.split[line.id]?.qsRemark ?? '',
        })),
      }),
    { success: `${mr.no} approved by QS`, invalidate },
  );

  const sendBack = useAction(() => post(`/mrs/${mr.id}/send-back`, { comment, rv: mr.rv }), {
    success: 'Sent back to requester',
    invalidate,
  });

  const reject = useAction(() => post(`/mrs/${mr.id}/reject`, { comment, rv: mr.rv }), {
    success: 'MR rejected',
    invalidate,
  });

  const withComment = (run: () => void) =>
    comment.trim() ? run() : toast(MSG.qsCommentRequired);

  return (
    <Card className="mt-3">
      <Stack>
        <label className="field">
          QS comment (required for Send back / Reject)
          <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
        </label>

        {pending ? (
          <div className="warn">Clear {pending} new item(s) above before approving.</div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-[10px]">
          <Btn variant="danger" onClick={() => withComment(() => reject.mutate())}>
            Reject MR
          </Btn>
          <Btn onClick={() => withComment(() => sendBack.mutate())}>Send back</Btn>
          <Btn
            variant="primary"
            disabled={!!pending || !review || approve.isPending}
            onClick={() => approve.mutate()}
          >
            Approve split
          </Btn>
        </div>
      </Stack>
    </Card>
  );
}

/**
 * What happened to this request after QS approved it — the enquiry, the
 * purchase order, and every gate the PO passed through.
 *
 * The site engineer and the Project Manager see exactly what procurement, the
 * Procurement Manager and management see: who did what, when, and what they
 * said if they stopped it. Nothing about the chain is withheld from the people
 * who asked for the material.
 */
function ProcurementProgress({ mr }: { mr: MrDetailDto }) {
  const router = useRouter();

  if (!mr.linkedRfqs.length && !mr.linkedPos.length) {
    return (
      <>
        <h2>Procurement</h2>
        <Card>
          <span className="text-mut">
            Approved, but procurement has not raised an enquiry or a purchase
            order for these lines yet.
          </span>
        </Card>
      </>
    );
  }

  return (
    <>
      <h2>Procurement</h2>

      {mr.linkedRfqs.length ? (
        <Card className="mb-3">
          <div className="flex flex-wrap items-center gap-[10px]">
            <span className="text-mut">Enquiries sent to vendors:</span>
            {mr.linkedRfqs.map((rfq) => (
              <Btn key={rfq.id} small onClick={() => router.push(`/rfqs/${rfq.id}`)}>
                <span className="font-mono">{rfq.no}</span>
                <Chip spec={chipFor(RFQ_ST, rfq.status)} />
              </Btn>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="flex flex-col gap-3">
        {mr.linkedPos.map((po) => (
          <PoProgressCard key={po.id} po={po} />
        ))}
      </div>
    </>
  );
}

/** One purchase order, with every gate it has passed or is waiting at. */
function PoProgressCard({ po }: { po: LinkedPoDto }) {
  const router = useRouter();

  const steps = [
    { label: 'Raised by procurement', by: po.raisedByName, at: po.raisedAt },
    { label: 'Procurement Manager', by: po.procMgrByName, at: po.procMgrAt },
    { label: 'QS validated', by: po.qsByName, at: po.qsAt },
    { label: 'Management approved', by: po.approvedByName, at: po.approvedAt },
  ];

  const waitingOn: Record<string, number> = {
    PENDING_APPROVAL: 1,
    QS_VALIDATION: 2,
    MGMT_APPROVAL: 3,
  };
  const current = waitingOn[po.status] ?? -1;
  const stopped = po.status === 'REJECTED' || po.status === 'CANCELLED';

  const who = po.lastCommentRole
    ? `${ROLE_NAMES[po.lastCommentRole as Role] ?? po.lastCommentRole}${
        po.lastCommentByName ? ` (${po.lastCommentByName})` : ''
      }`
    : '';

  return (
    <Card>
      <Stack>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="text-ac underline font-semibold font-mono"
            onClick={() => router.push(`/pos/${po.id}`)}
          >
            {po.no}
          </button>
          <Chip spec={chipFor(PO_ST, po.status)} />
          <span className="text-mut text-sm">
            {po.vendorName} · {qty(po.qty)} from this MR · {money(po.total)} total
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {steps.map((step, i) => {
            const done = !!step.at;
            const here = i === current && !stopped;
            return (
              <div
                key={step.label}
                className={`px-3 py-2 rounded-card border text-sm ${
                  done
                    ? 'border-line bg-white'
                    : here
                      ? 'border-[1.5px] border-[#C98A3E] bg-[#FFFBF5]'
                      : 'border-line2 bg-grys text-mut'
                }`}
              >
                <b>{step.label}</b>
                <div className="text-mut text-xs">
                  {done
                    ? `${step.by ?? ''} · ${fmtDateTime(step.at!)}`
                    : here
                      ? 'waiting'
                      : stopped
                        ? '—'
                        : 'not yet'}
                </div>
              </div>
            );
          })}
        </div>

        {stopped && po.lastComment ? (
          <div className="errb">
            <b>
              {po.status === 'CANCELLED' ? 'Cancelled' : 'Rejected'}
              {who ? ` by ${who}` : ''}:
            </b>{' '}
            {po.lastComment}
          </div>
        ) : null}

        {!stopped && po.qsRemark && po.qsAt ? (
          <div className="warn">
            <b>QS{po.qsByName ? ` (${po.qsByName})` : ''}:</b> {po.qsRemark}
          </div>
        ) : null}
      </Stack>
    </Card>
  );
}
