'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from '@mm/lib/nav';
import { useQuery } from '@tanstack/react-query';
import {
  MSG,
  RFQ_ST,
  RV_ST,
  chipFor,
  isBuyer,
  type RfqDetailDto,
} from '@cm/shared';
import { get, newIdempotencyKey, post } from '@mm/lib/api';
import { DataTable } from '@mm/components/DataTable';
import {
  Btn,
  Card,
  Chip,
  DueCountdown,
  EmptyState,
  Grid,
  PageHeader,
  Stack,
  Tag,
  Trail,
} from '@mm/components/ui';
import { Modal } from '@mm/components/Modal';
import { useToast } from '@mm/components/Toast';
import { useAction } from '@mm/lib/hooks';
import { useSession } from '@mm/lib/session';
import { dateTimeLocal, fmtDate, fmtDateTime, money, qty } from '@mm/lib/format';

/**
 * Prototype: VIEWS.rfqview — what is being asked, the vendor table, the
 * comparison matrix with the L1 highlight, and the award panel.
 */
export default function RfqDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { me } = useSession();

  const [award, setAward] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [extendOpen, setExtendOpen] = useState(false);

  const rfq = useQuery({
    queryKey: ['rfq', id],
    queryFn: () => get<RfqDetailDto>(`/rfqs/${id}`),
  });

  // Start from the lowest quote per line, as the prototype does.
  useEffect(() => {
    if (!rfq.data) return;
    setAward((current) =>
      Object.keys(current).length
        ? current
        : Object.fromEntries(
            Object.entries(rfq.data!.l1).filter(([, v]) => v) as [string, string][],
          ),
    );
  }, [rfq.data]);

  const invalidate = [['rfq', id], ['rfqs'], ['pool'], ['pos']];

  const cancel = useAction(() => post(`/rfqs/${id}/cancel`), {
    success: 'Enquiry cancelled',
    invalidate,
  });

  const doAward = useAction(
    (submit: boolean) =>
      post<{ poNos: string[]; submitted: boolean }>(
        `/rfqs/${id}/award`,
        {
          awards: Object.entries(award).map(([rfqLineId, vendorId]) => ({
            rfqLineId,
            vendorId,
          })),
          reason,
          submit,
          rv: rfq.data?.rv,
        },
        newIdempotencyKey(),
      ),
    {
      invalidate,
      onDone: (result) => {
        toast(
          result.submitted
            ? `${result.poNos.length} PO(s) sent to the Procurement Manager: ${result.poNos.join(', ')}`
            : `${result.poNos.length} draft PO(s): ${result.poNos.join(', ')} — open each, check and submit`,
        );
        router.push(`/pos?status=${result.submitted ? 'PENDING_APPROVAL' : 'DRAFT'}`);
      },
    },
  );

  if (rfq.isLoading) return <div className="text-mut">Loading…</div>;
  if (!rfq.data) return <div className="errb">Not found</div>;

  const data = rfq.data;
  const quoting = data.vendors.filter((v) => v.status === 'QUOTED');
  const open = data.status === 'OPEN' && isBuyer(me.role);

  // How many chosen lines are not the lowest quote — a reason is then required.
  const notLowest = Object.entries(award).filter(
    ([lineId, vendorId]) => data.l1[lineId] && data.l1[lineId] !== vendorId,
  ).length;

  const awardTotal = Object.entries(award).reduce((sum, [lineId, vendorId]) => {
    const cell = data.quotes[lineId]?.find((c) => c.vendorId === vendorId);
    return sum + (cell?.amount ?? 0);
  }, 0);

  const byVendor = new Map<string, number>();
  for (const [lineId, vendorId] of Object.entries(award)) {
    const cell = data.quotes[lineId]?.find((c) => c.vendorId === vendorId);
    byVendor.set(vendorId, (byVendor.get(vendorId) ?? 0) + (cell?.amount ?? 0));
  }

  const vendorName = (vendorId: string) =>
    data.vendors.find((v) => v.vendorId === vendorId)?.vendorName ?? '';

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3 flex-wrap">
            <span className="font-mono">{data.no}</span>
            <Chip spec={chipFor(RFQ_ST, data.status)} />
          </span>
        }
        subtitle={
          <>
            {data.lineCount} item(s) · projects {data.projectCodes.join(', ')} · by{' '}
            {data.createdByName}
            <div className="text-ink mt-1">
              Quotes due <b>{fmtDateTime(data.dueAt)}</b> ·{' '}
              {data.status === 'OPEN' ? <DueCountdown due={data.dueAt} /> : null}
            </div>
            {data.note ? <div className="mt-1">Note: {data.note}</div> : null}
          </>
        }
        actions={
          <>
            <Btn onClick={() => router.push(`/rfqs/${id}/print`)}>RFQ / PDF</Btn>
            {quoting.length ? (
              <Btn onClick={() => router.push(`/rfqs/${id}/print?kind=cmp`)}>
                Comparative statement / PDF
              </Btn>
            ) : null}
            {open ? (
              <>
                <Btn onClick={() => setExtendOpen(true)}>Change due time</Btn>
                <Btn variant="danger" onClick={() => cancel.mutate()}>
                  Cancel enquiry
                </Btn>
              </>
            ) : null}
          </>
        }
      />

      <h2>What is being asked</h2>
      <DataTable
        columns={[
          { key: 'item', header: 'Item', render: (l) => <b>{l.itemName}</b> },
          {
            key: 'qty',
            header: 'Total qty',
            align: 'right',
            render: (l) => `${qty(l.qty)} ${l.unit}`,
          },
          {
            key: 'from',
            header: 'From MRs',
            render: (l) => (
              <span>
                {l.allocs.map((a) => (
                  <div key={a.mrLineId}>
                    {a.projectCode} {a.mrNo}: {qty(a.qty)}
                  </div>
                ))}
              </span>
            ),
          },
        ]}
        rows={data.lines}
        rowKey={(l) => l.id}
        emptyText="No items"
      />

      <h2>Vendors</h2>
      <DataTable
        columns={[
          { key: 'vendor', header: 'Vendor', render: (v) => v.vendorName },
          {
            key: 'status',
            header: 'Status',
            render: (v) => <Chip spec={chipFor(RV_ST, v.status)} />,
          },
          {
            key: 'lead',
            header: 'Lead time',
            render: (v) => (v.leadDays !== null ? `${v.leadDays} days` : '—'),
          },
          { key: 'valid', header: 'Valid till', render: (v) => fmtDate(v.validity) },
          { key: 'terms', header: 'Payment terms', render: (v) => v.terms || '—' },
          {
            key: 'submitted',
            header: 'Submitted',
            render: (v) => (
              <span className="flex items-center gap-2 justify-end desk:justify-start">
                {fmtDateTime(v.submittedAt)}
                {v.late ? <Tag label="LATE" tone="red" /> : null}
              </span>
            ),
          },
        ]}
        rows={data.vendors}
        rowKey={(v) => v.id}
        emptyText="No vendors invited"
      />

      <h2>Comparison</h2>
      {!quoting.length ? (
        <EmptyState text="Waiting for vendor quotes." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="t">
              <thead>
                <tr>
                  <th>Item · qty</th>
                  <th className="text-right">Last rate</th>
                  {quoting.map((v) => (
                    <th key={v.vendorId} className="text-right">
                      {v.vendorName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.lines.map((line) => (
                  <tr key={line.id}>
                    <td data-label="Item">
                      <b>{line.itemName}</b>
                      <div className="text-mut text-sm">
                        {qty(line.qty)} {line.unit}
                      </div>
                    </td>
                    <td data-label="Last rate" className="desk:text-right">
                      {line.lastRate ? money(line.lastRate) : '—'}
                    </td>
                    {quoting.map((vendor) => {
                      const cell = data.quotes[line.id]?.find(
                        (c) => c.vendorId === vendor.vendorId,
                      );
                      const quoted = !!cell && cell.rate > 0;
                      return (
                        <td
                          key={vendor.vendorId}
                          data-label={vendor.vendorName}
                          className={`desk:text-right ${cell?.isL1 ? 'l1' : ''}`}
                        >
                          {quoted ? (
                            <label className="flex items-center gap-2 justify-end">
                              {open ? (
                                <input
                                  type="radio"
                                  name={`award-${line.id}`}
                                  aria-label={`Award ${line.itemName} to ${vendor.vendorName}`}
                                  checked={award[line.id] === vendor.vendorId}
                                  onChange={() =>
                                    setAward({ ...award, [line.id]: vendor.vendorId })
                                  }
                                />
                              ) : null}
                              <span>
                                <b>{money(cell!.rate)}</b>{' '}
                                {cell!.isL1 ? <Tag label="L1" tone="grn" /> : null}
                                <div className="text-mut text-xs">
                                  {money(cell!.amount)} · tax {vendor.vatPct ?? 0}%
                                  {cell!.remark ? ` · ${cell!.remark}` : ''}
                                </div>
                              </span>
                            </label>
                          ) : (
                            <span className="text-mut">no quote</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td data-label="Total">
                    <b>Total before tax</b>
                  </td>
                  <td />
                  {quoting.map((v) => (
                    <td
                      key={v.vendorId}
                      data-label={v.vendorName}
                      className="desk:text-right"
                    >
                      <b>{money(data.totalsByVendor[v.vendorId] ?? 0)}</b>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {open ? (
            <>
              <Card className="flex flex-wrap justify-between items-center gap-3 mt-[14px]">
                <span>
                  <b>Choose quickly:</b>{' '}
                  <span className="text-mut text-sm">
                    L1 = lowest rate per item (can split across vendors)
                  </span>
                </span>
                <div className="flex flex-wrap gap-[10px]">
                  <Btn
                    onClick={() =>
                      setAward(
                        Object.fromEntries(
                          Object.entries(data.l1).filter(([, v]) => v) as [
                            string,
                            string,
                          ][],
                        ),
                      )
                    }
                  >
                    Lowest (L1) per item
                  </Btn>
                  <Btn
                    onClick={() => {
                      // The cheapest vendor who quoted every single line.
                      const complete = quoting.filter((v) =>
                        data.lines.every((l) =>
                          data.quotes[l.id]?.some(
                            (c) => c.vendorId === v.vendorId && c.rate > 0,
                          ),
                        ),
                      );
                      if (!complete.length) return toast(MSG.rfqNoSingleVendor);
                      const best = complete.reduce((a, b) =>
                        (data.totalsByVendor[a.vendorId] ?? 0) <=
                        (data.totalsByVendor[b.vendorId] ?? 0)
                          ? a
                          : b,
                      );
                      setAward(
                        Object.fromEntries(
                          data.lines.map((l) => [l.id, best.vendorId]),
                        ),
                      );
                      toast(`${best.vendorName} has the lowest total for all items`);
                    }}
                  >
                    Lowest single vendor
                  </Btn>
                  <Btn
                    variant="primary"
                    disabled={doAward.isPending}
                    onClick={() => {
                      if (notLowest && !reason.trim()) {
                        return toast(MSG.rfqReasonNotLowest);
                      }
                      doAward.mutate(true);
                    }}
                  >
                    Award L1 &amp; send POs for approval
                  </Btn>
                </div>
              </Card>

              <Grid className="mt-[14px]">
                <Card>
                  <Stack>
                    <span className="text-mut text-sm">Award → POs</span>
                    {byVendor.size ? (
                      [...byVendor.entries()].map(([vendorId, total]) => (
                        <div key={vendorId} className="flex justify-between gap-3">
                          <span>
                            {vendorName(vendorId)} ·{' '}
                            {
                              Object.values(award).filter((v) => v === vendorId).length
                            }{' '}
                            item(s)
                          </span>
                          <b>{money(total)}</b>
                        </div>
                      ))
                    ) : (
                      <span className="text-mut">Pick a vendor per line</span>
                    )}
                    <div className="flex justify-between border-t border-line2 pt-2">
                      <span>Total</span>
                      <b>{money(awardTotal)}</b>
                    </div>
                  </Stack>
                </Card>

                <Card>
                  <Stack>
                    <span className="text-mut text-sm">Against last purchase rates</span>
                    {data.lastRatesTotal ? (
                      <>
                        <span
                          className={`text-[26px] font-bold ${
                            awardTotal <= data.lastRatesTotal ? 'text-grn' : 'text-red'
                          }`}
                        >
                          {awardTotal <= data.lastRatesTotal ? '−' : '+'}
                          {money(Math.abs(data.lastRatesTotal - awardTotal))}
                        </span>
                        <span className="text-mut text-sm">
                          last rates total {money(data.lastRatesTotal)}
                        </span>
                      </>
                    ) : (
                      <span className="text-mut">No purchase history</span>
                    )}
                  </Stack>
                </Card>

                <Card>
                  <Stack>
                    <label className="field">
                      Reason if not lowest
                      {notLowest ? ` (required — ${notLowest} line(s) not L1)` : ''}
                      <input value={reason} onChange={(e) => setReason(e.target.value)} />
                    </label>
                    <Btn
                      variant="primary"
                      disabled={doAward.isPending}
                      onClick={() => {
                        if (notLowest && !reason.trim()) {
                          return toast(MSG.rfqReasonNotLowest);
                        }
                        doAward.mutate(false);
                      }}
                    >
                      Create {byVendor.size} draft PO(s)
                    </Btn>
                    <span className="text-mut text-sm">
                      Drafts open in Create PO so you can check company, tax and
                      delivery before approval.
                    </span>
                  </Stack>
                </Card>
              </Grid>
            </>
          ) : null}
        </>
      )}

      <Trail rows={data.trail} />

      {extendOpen ? (
        <ExtendModal rfqId={id} rv={data.rv} onClose={() => setExtendOpen(false)} />
      ) : null}
    </>
  );
}

/** Prototype: A.extendRFQ / A.doExtend — vendors are re-notified. */
function ExtendModal({
  rfqId,
  rv,
  onClose,
}: {
  rfqId: string;
  rv: number;
  onClose: () => void;
}) {
  const toast = useToast();
  const [dueAt, setDueAt] = useState(dateTimeLocal(48));

  const extend = useAction(
    () => post(`/rfqs/${rfqId}/extend`, { dueAt: new Date(dueAt).toISOString(), rv }),
    {
      success: 'Due time updated',
      invalidate: [['rfq', rfqId], ['rfqs']],
      onDone: onClose,
    },
  );

  return (
    <Modal
      title="Change due time"
      onClose={onClose}
      footer={
        <Btn
          variant="primary"
          disabled={extend.isPending}
          onClick={() =>
            !dueAt || new Date(dueAt).getTime() <= Date.now()
              ? toast(MSG.rfqDueFuturePick)
              : extend.mutate()
          }
        >
          Save and notify vendors
        </Btn>
      }
    >
      <label className="field">
        New due time
        <input
          type="datetime-local"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
        />
      </label>
    </Modal>
  );
}

