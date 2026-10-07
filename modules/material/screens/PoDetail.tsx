'use client';

import { useState } from 'react';
import { useParams, useRouter } from '@mm/lib/nav';
import { useQuery } from '@tanstack/react-query';
import {
  MSG,
  PO_ST,
  ROLE_NAMES,
  chipFor,
  isBuyer,
  type PoAllocDto,
  type PoDetailDto,
  type Role,
} from '@cm/shared';
import { get, post } from '@mm/lib/api';
import { DataTable, type Column } from '@mm/components/DataTable';
import { Btn, Card, Chip, Grid, PageHeader, Stack, Tag, Tile, Trail } from '@mm/components/ui';
import { Modal } from '@mm/components/Modal';
import { useToast } from '@mm/components/Toast';
import { useAction } from '@mm/lib/hooks';
import { useSession } from '@mm/lib/session';
import { fmtDateTime, money, qty } from '@mm/lib/format';
import { DocsTable } from '@mm/features/docs/DocsTable';
import { PoDocument } from '@mm/features/po/PoDocument';
import { VendorDocUpload } from '@mm/features/vendor/VendorDocUpload';

/**
 * Prototype: VIEWS.poview — the printable PO, approve/reject, the value check,
 * the split by project and MR, GRNs, documents, revision history and the trail.
 */
export default function PoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { me } = useSession();
  const toast = useToast();
  const [comment, setComment] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [validateOpen, setValidateOpen] = useState(false);

  const po = useQuery({
    queryKey: ['po', id],
    queryFn: () => get<PoDetailDto>(`/pos/${id}`),
  });

  const invalidate = [['po', id], ['pos'], ['pool'], ['mrs'], ['docs']];

  const approve = useAction(
    () => post(`/pos/${id}/approve`, { comment, rv: po.data?.rv }),
    { success: 'Approved — sent to QS for validation', invalidate },
  );
  const reject = useAction(() => post(`/pos/${id}/reject`, { comment, rv: po.data?.rv }), {
    success: 'PO rejected',
    invalidate,
  });
  const mgmtApprove = useAction(
    () => post(`/pos/${id}/mgmt-approve`, { comment, rv: po.data?.rv }),
    { success: 'PO approved — the vendor can see it', invalidate },
  );
  const mgmtReject = useAction(
    () => post(`/pos/${id}/mgmt-reject`, { comment, rv: po.data?.rv }),
    { success: 'PO rejected', invalidate },
  );
  const cancel = useAction(() => post(`/pos/${id}/cancel`), {
    success: 'PO cancelled',
    invalidate,
  });
  const acknowledge = useAction(() => post(`/vendor/pos/${id}/ack`), {
    success: 'Thank you — the order is acknowledged',
    invalidate,
  });

  if (po.isLoading) return <div className="text-mut">Loading…</div>;
  if (!po.data) return <div className="errb">Not found</div>;

  const data = po.data;
  const isVendor = me.role === 'VENDOR';
  const currency = data.currency;

  return (
    <>
      <div className="noprint">
        <PageHeader
          title={
            <span className="flex items-center gap-3 flex-wrap">
              <span className="font-mono">{data.displayNo}</span>
              <Chip spec={chipFor(PO_ST, data.status)} />
            </span>
          }
          subtitle={
            <>
              {data.vendorName} · {data.projectCodes.length} project(s) ·{' '}
              {data.rfqId ? 'from comparison' : `direct — ${data.reason}`} · raised by{' '}
              {data.createdByName} {fmtDateTime(data.createdAt)}
              {data.vendorAckAt ? (
                <div>Vendor acknowledged {fmtDateTime(data.vendorAckAt)}</div>
              ) : null}
            </>
          }
          actions={
            <>
              <Btn onClick={() => window.print()}>Print / PDF</Btn>
              {data.canEdit ? (
                <Btn variant="primary" onClick={() => router.push(`/pos/${id}/edit`)}>
                  Edit
                </Btn>
              ) : null}
              {data.canRevise ? (
                <Btn onClick={() => router.push(`/pos/${id}/revise`)}>Revise PO</Btn>
              ) : null}
              {data.canCancel ? (
                <Btn variant="danger" onClick={() => cancel.mutate()}>
                  Cancel PO
                </Btn>
              ) : null}
            </>
          }
        />

        <ApprovalChain po={data} />
      </div>

      <PoDocument
        preview={{
          displayNo: data.displayNo,
          status: data.status,
          company: data.company,
          vendor: data.vendor,
          deliverTo: data.deliverTo,
          deliveryDate: data.deliveryDate,
          deliveryAddress: data.deliveryAddress,
          billingAddress: data.billingAddress,
          terms: data.terms,
          notes: data.notes,
          taxMode: data.taxMode,
          currency,
          projectCodes: data.projectCodes,
          rfqNo: data.rfqNo,
          createdByName: data.createdByName,
          checkedByName: data.procMgrByName,
          verifiedByName: data.qsByName,
          approvedByName: data.approvedByName,
          date: data.approvedAt ?? data.createdAt,
          lines: data.lines.map((line) => ({
            ...line,
            mrNos: [
              ...new Set(data.allocs.filter((a) => a.poLineId === line.id).map((a) => a.mrNo)),
            ],
          })),
          totals: {
            subtotal: data.subtotal,
            taxTotal: data.taxTotal,
            total: data.total,
          },
        }}
      />

      {/* Step 2 — QS checks the PO against what QS approved on the MRs. */}
      {data.canValidate ? (
        <QsValidationPanel po={data} onValidate={() => setValidateOpen(true)} />
      ) : null}

      {/* Step 3 — management has the final word. */}
      {data.canMgmtApprove ? (
        <Card className="mt-[14px] noprint">
          <Stack>
            <div className="warn">
              Validated by QS{data.qsByName ? ` (${data.qsByName})` : ''}
              {data.qsRemark ? ` — ${data.qsRemark}` : ''}. Yours is the final word:
              approving releases the PO to the vendor.
            </div>
            <label className="field">
              Comment (required to reject)
              <textarea
                rows={2}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </label>
            <div className="flex justify-end gap-[10px]">
              <Btn
                variant="danger"
                onClick={() =>
                  comment.trim() ? mgmtReject.mutate() : toast(MSG.docRejectReason)
                }
              >
                Reject PO
              </Btn>
              <Btn variant="primary" onClick={() => mgmtApprove.mutate()}>
                Approve PO
              </Btn>
            </div>
          </Stack>
        </Card>
      ) : null}

      {/* Step 1 — the Procurement Manager. §3: never your own PO. */}
      {me.role === 'PROC_MGR' && data.status === 'PENDING_APPROVAL' ? (
        data.isOwnPo ? (
          <div className="warn mt-[14px] noprint">
            You raised this PO, so another Procurement Manager must approve it.
          </div>
        ) : (
          <Card className="mt-[14px] noprint">
            <Stack>
              {data.rev ? (
                <div className="warn">
                  Revision {data.rev}:{' '}
                  {data.revisions[data.revisions.length - 1]?.reason ?? ''}
                </div>
              ) : null}
              <label className="field">
                Comment (required to reject)
                <textarea
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </label>
              <div className="flex justify-end gap-[10px]">
                <Btn
                  variant="danger"
                  onClick={() =>
                    comment.trim() ? reject.mutate() : toast(MSG.docRejectReason)
                  }
                >
                  Reject PO
                </Btn>
                <Btn variant="primary" onClick={() => approve.mutate()}>
                  Approve &amp; send to QS
                </Btn>
              </div>
            </Stack>
          </Card>
        )
      ) : null}

      {isVendor ? (
        <div className="flex justify-end gap-[10px] mt-[14px] noprint">
          {['APPROVED', 'PARTIAL'].includes(data.status) && !data.vendorAckAt ? (
            <Btn variant="primary" onClick={() => acknowledge.mutate()}>
              Acknowledge PO
            </Btn>
          ) : null}
          <Btn variant="primary" onClick={() => setUploadOpen(true)}>
            Upload invoice / delivery order
          </Btn>
        </div>
      ) : null}

      {/* Everything below is internal — the serializer already withholds it
          from a vendor, and this hides the empty shells too. */}
      {!isVendor && data.valueCheck ? (
        <div className="noprint">
          <h2>Value check</h2>
          <Grid>
            <Tile label="PO total" value={money(data.valueCheck.poTotal)} />
            <Tile label="Received value (GRN)" value={money(data.valueCheck.receivedValue)} />
            <div className="card flex flex-col gap-1">
              <span className="text-mut text-sm">Invoiced</span>
              <span
                className={`text-[28px] font-bold leading-tight ${
                  data.valueCheck.invoiced > data.valueCheck.receivedValue + 0.01
                    ? 'text-red'
                    : ''
                }`}
              >
                {money(data.valueCheck.invoiced)}
              </span>
              {data.valueCheck.invoiced > data.valueCheck.receivedValue + 0.01 ? (
                <span className="text-red text-sm">More than received</span>
              ) : null}
            </div>
          </Grid>

          <h2>Split by project / MR</h2>
          <AllocTable rows={data.allocs} />

          {data.grns.length ? (
            <>
              <h2>GRNs</h2>
              <DataTable
                columns={[
                  {
                    key: 'no',
                    header: 'GRN no.',
                    render: (g) => <span className="font-mono">{g.no}</span>,
                  },
                  { key: 'date', header: 'Date', render: (g) => fmtDateTime(g.createdAt) },
                  {
                    key: 'at',
                    header: 'At',
                    render: (g) => (g.location === 'SITE' ? 'Site' : 'Store'),
                  },
                  {
                    key: 'projects',
                    header: 'Projects',
                    render: (g) => g.projectCodes.join(', '),
                  },
                  { key: 'dn', header: 'DN no.', render: (g) => g.dnNo },
                ]}
                rows={data.grns}
                rowKey={(g) => g.id}
                emptyText="No GRNs yet"
              />
            </>
          ) : null}
        </div>
      ) : null}

      {data.docs.length ? (
        <div className="noprint">
          <h2>Invoices &amp; DOs</h2>
          <DocsTable rows={data.docs} canCheck={isBuyer(me.role)} />
        </div>
      ) : null}

      {!isVendor && data.revisions.length ? (
        <div className="noprint">
          <h2>Revision history</h2>
          <DataTable
            columns={[
              { key: 'rev', header: 'Revision', render: (r) => `Rev ${r.rev}` },
              { key: 'reason', header: 'Reason', render: (r) => r.reason },
              { key: 'by', header: 'By', render: (r) => r.byName },
              { key: 'at', header: 'When', render: (r) => fmtDateTime(r.at) },
              {
                key: 'before',
                header: 'Total before',
                align: 'right',
                render: (r) => money(r.totalBefore),
              },
            ]}
            rows={data.revisions}
            rowKey={(r) => String(r.rev)}
            emptyText=""
          />
        </div>
      ) : null}

      {!isVendor ? <Trail rows={data.trail} /> : null}

      {validateOpen ? (
        <ValidateModal
          poId={id}
          rv={data.rv}
          onClose={() => setValidateOpen(false)}
          invalidate={invalidate}
        />
      ) : null}

      {uploadOpen ? (
        <VendorDocUpload poId={id} onClose={() => setUploadOpen(false)} />
      ) : null}
    </>
  );
}

function AllocTable({ rows }: { rows: PoAllocDto[] }) {
  const router = useRouter();

  const columns: Column<PoAllocDto>[] = [
    { key: 'project', header: 'Project', render: (a) => a.projectCode },
    {
      key: 'mr',
      header: 'MR',
      render: (a) => (
        <button
          className="text-ac underline font-semibold font-mono"
          onClick={() => router.push(`/mrs/${a.mrLineId}`)}
        >
          {a.mrNo}
        </button>
      ),
    },
    { key: 'qty', header: 'Qty', align: 'right', render: (a) => qty(a.qty) },
    { key: 'recd', header: 'Received', align: 'right', render: (a) => qty(a.received) },
    { key: 'bal', header: 'Balance', align: 'right', render: (a) => qty(a.balance) },
  ];

  return (
    <DataTable columns={columns} rows={rows} rowKey={(a) => a.id} emptyText="No lines" />
  );
}

/**
 * Where the PO has got to, shown to everyone who can open it — site engineer,
 * procurement, the Procurement Manager, QS, management and admin alike.
 */
function ApprovalChain({ po }: { po: PoDetailDto }) {
  const steps = [
    { label: 'Raised', by: po.createdByName, at: po.createdAt },
    { label: 'Procurement Manager', by: po.procMgrByName, at: po.procMgrAt },
    { label: 'QS validated', by: po.qsByName, at: po.qsAt },
    { label: 'Management', by: po.approvedByName, at: po.approvedAt },
  ];

  // Which step the PO is sitting on right now.
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
    <div className="noprint">
      <div className="flex flex-wrap gap-2 mb-3">
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

      {po.status === 'REJECTED' && po.lastComment ? (
        <div className="errb mb-3">
          <b>Rejected{who ? ` by ${who}` : ''}:</b> {po.lastComment}
        </div>
      ) : null}

      {po.status !== 'REJECTED' && po.qsRemark && po.qsAt ? (
        <div className="warn mb-3">
          <b>QS{po.qsByName ? ` (${po.qsByName})` : ''}:</b> {po.qsRemark}
        </div>
      ) : null}
    </div>
  );
}

/**
 * What QS asked for on each MR line, against what this PO actually orders.
 * QS validates from this table, so the question on the modal is one QS can
 * already answer from the screen.
 */
function QsValidationPanel({
  po,
  onValidate,
}: {
  po: PoDetailDto;
  onValidate: () => void;
}) {
  const short = po.allocs.filter((a) => a.qty < a.qsApprovedQty);

  const columns: Column<PoAllocDto>[] = [
    { key: 'project', header: 'Project', render: (a) => a.projectCode },
    { key: 'mr', header: 'MR', render: (a) => <span className="font-mono">{a.mrNo}</span> },
    {
      key: 'item',
      header: 'Item',
      render: (a) => (
        <span>
          <b>{a.itemName}</b>
          <div className="text-mut text-xs">{a.unit}</div>
        </span>
      ),
    },
    {
      key: 'asked',
      header: 'You approved for PO',
      align: 'right',
      render: (a) => qty(a.qsApprovedQty),
    },
    {
      key: 'ordered',
      header: 'On this PO',
      align: 'right',
      render: (a) => <b>{qty(a.qty)}</b>,
    },
    {
      key: 'gap',
      header: '',
      render: (a) =>
        a.qty < a.qsApprovedQty ? (
          <Tag label={`SHORT BY ${qty(a.qsApprovedQty - a.qty)}`} tone="red" />
        ) : a.qty > a.qsApprovedQty ? (
          <Tag label={`OVER BY ${qty(a.qty - a.qsApprovedQty)}`} tone="amb" />
        ) : (
          <Tag label="MATCHES" tone="grn" />
        ),
    },
  ];

  return (
    <div className="noprint mt-[14px]">
      <h2>QS validation</h2>
      <div className="text-mut text-sm mb-2">
        Check the PO against what you approved on each MR line. Approved by the
        Procurement Manager{po.procMgrByName ? ` (${po.procMgrByName})` : ''}.
      </div>

      <DataTable
        columns={columns}
        rows={po.allocs}
        rowKey={(a) => a.id}
        emptyText="This PO is not linked to any MR line"
      />

      {short.length ? (
        <div className="warn mt-2">
          {short.length} line(s) order less than you approved — say so if that is
          not right.
        </div>
      ) : null}

      <div className="flex justify-end mt-3">
        <Btn variant="primary" onClick={onValidate}>
          Validate
        </Btn>
      </div>
    </div>
  );
}

/**
 * The one question QS is asked, with a remark demanded for a "no" — because
 * procurement has to know what to put right.
 */
function ValidateModal({
  poId,
  rv,
  onClose,
  invalidate,
}: {
  poId: string;
  rv: number;
  onClose: () => void;
  invalidate: string[][];
}) {
  const toast = useToast();
  const [answer, setAnswer] = useState<'yes' | 'no' | null>(null);
  const [remark, setRemark] = useState('');

  const send = useAction(
    (ok: boolean) => post(`/pos/${poId}/validate`, { ok, remark, rv }),
    {
      invalidate,
      onDone: () => {
        toast(
          answer === 'yes'
            ? 'Validated — sent to management for approval'
            : 'Sent back to procurement with your remark',
        );
        onClose();
      },
    },
  );

  return (
    <Modal title="Validate this PO" onClose={onClose}>
      <div className="text-ink">
        Is everything you specified on this purchase order?
      </div>

      <div className="flex gap-[10px]">
        <Btn
          variant={answer === 'yes' ? 'primary' : undefined}
          onClick={() => setAnswer('yes')}
        >
          Yes — everything is there
        </Btn>
        <Btn
          variant={answer === 'no' ? 'danger' : undefined}
          onClick={() => setAnswer('no')}
        >
          No — something is missing
        </Btn>
      </div>

      {answer === 'no' ? (
        <label className="field">
          What is missing or wrong? *
          <textarea
            rows={3}
            autoFocus
            placeholder="e.g. MR-0114-26-0002 board: 50 approved, only 40 on the PO"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
          />
        </label>
      ) : null}

      {answer === 'yes' ? (
        <label className="field">
          Note (optional)
          <input value={remark} onChange={(e) => setRemark(e.target.value)} />
        </label>
      ) : null}

      <div className="flex justify-end gap-[10px]">
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn
          variant="primary"
          disabled={!answer || send.isPending}
          onClick={() => {
            if (answer === 'no' && !remark.trim()) return toast(MSG.poValidationRemark);
            send.mutate(answer === 'yes');
          }}
        >
          {answer === 'no' ? 'Send back to procurement' : 'Confirm validation'}
        </Btn>
      </div>
    </Modal>
  );
}
