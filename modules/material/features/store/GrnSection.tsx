'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MSG, PO_ST, chipFor, type GrnOpenPoDto, type OpenPoRowDto, type PoStatus } from '@cm/shared';
import { get, newIdempotencyKey, post, postWithFiles } from '@mm/lib/api';
import { Btn, Card, Chip, Stack, Tag } from '@mm/components/ui';
import { useToast } from '@mm/components/Toast';
import { useAction } from '@mm/lib/hooks';
import { fmtDate, qty } from '@mm/lib/format';
import { useSession } from '@mm/lib/session';
import { ReceiptFiles } from './ReceiptFiles';

/**
 * Receiving against a PO.
 * Prototype origin: grnSection(loc), A.findPO, A.postGRN.
 *
 * The same component serves the store (`STORE`) and the site (`SITE`); a site
 * delivery posts stock in and out together and counts as accepted at site.
 */
export function GrnSection({ location }: { location: 'STORE' | 'SITE' }) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [selectedNo, setSelectedNo] = useState('');
  const [receive, setReceive] = useState<Record<string, { now: string; rejected: string }>>({});
  const [header, setHeader] = useState({ dnNo: '', invNo: '', remark: '' });
  // Delivery note / photos. Required when receiving at site, optional in the store.
  const [files, setFiles] = useState<File[]>([]);
  const filesRequired = location === 'SITE';

  const params = new URLSearchParams({ location });
  if (selectedNo) params.set('no', selectedNo);

  const data = useQuery({
    queryKey: ['grn-open', location, selectedNo],
    queryFn: () =>
      get<{ pos: OpenPoRowDto[]; selected: GrnOpenPoDto | null }>(
        `/grn/open-pos?${params}`,
      ),
    retry: false,
  });

  const selected = data.data?.selected ?? null;

  // Fill the form the moment a PO is chosen: receive the balance by default.
  const pick = (no: string) => {
    setSelectedNo(no);
    setSearch(no);
    setReceive({});
    setHeader({ dnNo: '', invNo: '', remark: '' });
    setFiles([]);
  };

  const rowsFor = (po: GrnOpenPoDto) =>
    po.lines.map((line) => ({
      line,
      now: receive[line.poAllocId]?.now ?? String(line.balance),
      rejected: receive[line.poAllocId]?.rejected ?? '0',
    }));

  const postGrn = useAction(
    (po: GrnOpenPoDto) =>
      (files.length
        ? (body: unknown, key: string) => postWithFiles<{ no: string }>('/grns', body, files, key)
        : (body: unknown, key: string) => post<{ no: string }>('/grns', body, key))(
        {
          poId: po.po.id,
          location,
          dnNo: header.dnNo || po.suggestedDnNo,
          invNo: header.invNo,
          remark: header.remark,
          lines: rowsFor(po).map((r) => ({
            poAllocId: r.line.poAllocId,
            qtyReceived: Number(r.now) || 0,
            qtyRejected: Number(r.rejected) || 0,
          })),
        },
        newIdempotencyKey(),
      ),
    {
      invalidate: [['grn-open'], ['grns'], ['pos'], ['inventory'], ['mrs'], ['issues']],
      onDone: (result) => {
        toast(`${result.no} posted`);
        setSelectedNo('');
        setSearch('');
        setFiles([]);
      },
    },
  );

  const submit = (po: GrnOpenPoDto) => {
    const dn = header.dnNo || po.suggestedDnNo;
    if (!dn.trim()) return toast(MSG.grnDnRequired);

    const rows = rowsFor(po);
    for (const row of rows) {
      const now = Number(row.now) || 0;
      if (now > row.line.balance) {
        return toast(MSG.grnOverBalance(qty(row.line.balance)));
      }
    }
    if (!rows.some((r) => (Number(r.now) || 0) > 0)) return toast(MSG.grnQtyRequired);
    if (filesRequired && !files.length) return toast(MSG.receiptFileRequired);

    postGrn.mutate(po);
  };

  return (
    <>
      <Card>
        <Stack>
          <div className="flex flex-wrap gap-[10px]">
            <input
              list={`po-list-${location}`}
              className="font-mono flex-1 min-w-[200px]"
              placeholder="Search PO number"
              aria-label="PO number"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && pick(search)}
            />
            <datalist id={`po-list-${location}`}>
              {(data.data?.pos ?? []).map((po) => (
                <option key={po.id} value={po.no} />
              ))}
            </datalist>
            <Btn variant="primary" onClick={() => pick(search)}>
              Find PO
            </Btn>
          </div>

          <OpenPoList
            location={location}
            rows={data.data?.pos ?? []}
            loading={data.isLoading}
            onPick={pick}
          />

          {data.isError ? (
            <div className="errb">
              {data.error instanceof Error ? data.error.message : MSG.poNotFound}
            </div>
          ) : null}
        </Stack>
      </Card>

      {selected ? (
        <Card className="mt-3">
          <Stack>
            <div className="flex justify-between items-center gap-3 flex-wrap">
              <div>
                <b className="font-mono">{selected.po.displayNo}</b> ·{' '}
                {selected.po.vendorName}
              </div>
              {selected.projectCount > 1 ? (
                <Tag label={`${selected.projectCount} PROJECTS IN ONE GRN`} tone="ac" />
              ) : null}
            </div>

            {selected.vendorDoNos.length ? (
              <div className="text-mut text-sm">
                Vendor DOs on portal: {selected.vendorDoNos.join(', ')}
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <table className="t">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Project · MR</th>
                    <th className="text-right">Ordered</th>
                    <th className="text-right">Received before</th>
                    <th className="text-right">Balance</th>
                    <th>Receive now</th>
                    <th>Rejected</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsFor(selected).map(({ line, now, rejected }) => (
                    <tr key={line.poAllocId}>
                      <td data-label="Item">
                        <b>{line.itemName}</b>
                      </td>
                      <td data-label="Project · MR">
                        {line.projectCode} ·{' '}
                        <span className="font-mono text-xs">{line.mrNo}</span>
                      </td>
                      <td data-label="Ordered" className="desk:text-right">
                        {qty(line.ordered)} {line.unit}
                      </td>
                      <td data-label="Received before" className="desk:text-right">
                        {qty(line.receivedBefore)}
                      </td>
                      <td data-label="Balance" className="desk:text-right">
                        {qty(line.balance)}
                      </td>
                      <td data-label="Receive now">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          aria-label={`Receive now for ${line.itemName}`}
                          className="w-24 font-semibold"
                          disabled={!line.balance}
                          value={now}
                          onChange={(e) =>
                            setReceive({
                              ...receive,
                              [line.poAllocId]: { now: e.target.value, rejected },
                            })
                          }
                        />
                      </td>
                      <td data-label="Rejected">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          aria-label={`Rejected for ${line.itemName}`}
                          className="w-24"
                          disabled={!line.balance}
                          value={rejected}
                          onChange={(e) =>
                            setReceive({
                              ...receive,
                              [line.poAllocId]: { now, rejected: e.target.value },
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-[10px]">
              <label className="field flex-1 min-w-[200px]">
                Delivery note / DO no. *
                <input
                  value={header.dnNo || selected.suggestedDnNo}
                  onChange={(e) => setHeader({ ...header, dnNo: e.target.value })}
                />
              </label>
              <label className="field flex-1 min-w-[200px]">
                Vendor invoice no.
                <input
                  value={header.invNo}
                  onChange={(e) => setHeader({ ...header, invNo: e.target.value })}
                />
              </label>
            </div>

            <label className="field">
              Remark (rejections, damage)
              <input
                value={header.remark}
                onChange={(e) => setHeader({ ...header, remark: e.target.value })}
              />
            </label>

            <ReceiptFiles files={files} onChange={setFiles} required={filesRequired} />

            <div className="text-mut text-sm">
              {location === 'STORE'
                ? 'Posting adds stock to the main store. Received quantity then becomes issuable to each project.'
                : 'Site delivery posts stock in and out together and counts as accepted at site.'}{' '}
              Rejected qty stays open on the PO.
            </div>

            <div className="flex justify-end gap-[10px]">
              <Btn
                onClick={() => {
                  setSelectedNo('');
                  setSearch('');
                }}
              >
                Cancel
              </Btn>
              <Btn
                variant="primary"
                disabled={postGrn.isPending}
                onClick={() => submit(selected)}
              >
                Post GRN
              </Btn>
            </div>
          </Stack>
        </Card>
      ) : null}
    </>
  );
}

/**
 * The POs still to be received. A site engineer sees only the POs raised from their own
 * MRs; anyone who sees every engineer's POs gets them grouped by who raised the MR.
 */
function OpenPoList({
  location,
  rows,
  loading,
  onPick,
}: {
  location: 'STORE' | 'SITE';
  rows: OpenPoRowDto[];
  loading: boolean;
  onPick: (no: string) => void;
}) {
  const { me } = useSession();
  const where = location === 'STORE' ? 'store' : 'site';
  if (loading) return <div className="text-mut text-sm">Loading open POs…</div>;
  if (!rows.length) {
    return (
      <div className="text-mut text-sm">
        {me.role === 'SITE'
          ? `No open POs for ${where} delivery from the MRs you raised. A PO shows here once it is approved.`
          : `No open POs for ${where} delivery.`}
      </div>
    );
  }

  // One group per site engineer, unless the viewer is that engineer.
  const grouped = me.role !== 'SITE' && location === 'SITE';
  const groups = new Map<string, OpenPoRowDto[]>();
  for (const row of rows) {
    const key = grouped ? row.raisedBy.join(', ') || '—' : '';
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return (
    <div className="flex flex-col gap-3">
      <b>
        Open POs for {where} delivery ({rows.length})
      </b>
      {[...groups.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([who, list]) => (
          <div key={who || 'all'}>
            {grouped ? (
              <div className="font-semibold mb-1">
                {who} <span className="text-mut font-normal">· {list.length} PO(s)</span>
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <table className="t">
                <thead>
                  <tr>
                    <th>PO</th>
                    <th>Vendor</th>
                    <th>Project</th>
                    <th>MR</th>
                    {grouped ? null : <th>Raised by</th>}
                    <th>PO date</th>
                    <th>Delivery</th>
                    <th className="text-right">Received</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.map((po) => (
                    <tr key={po.id}>
                      <td data-label="PO" className="font-mono font-semibold">
                        {po.no}
                      </td>
                      <td data-label="Vendor">{po.vendorName}</td>
                      <td data-label="Project">{po.projectCodes.join(', ')}</td>
                      <td data-label="MR" className="font-mono text-xs">
                        {po.mrNos.join(', ') || '—'}
                      </td>
                      {grouped ? null : <td data-label="Raised by">{po.raisedBy.join(', ') || '—'}</td>}
                      <td data-label="PO date">{fmtDate(po.createdAt)}</td>
                      <td data-label="Delivery">{po.deliveryDate ? fmtDate(po.deliveryDate) : '—'}</td>
                      <td data-label="Received" className="desk:text-right">
                        {qty(po.received)} / {qty(po.ordered)}
                      </td>
                      <td data-label="Status">
                        <Chip spec={chipFor(PO_ST, po.status as PoStatus)} />
                      </td>
                      <td>
                        <Btn small variant="primary" onClick={() => onPick(po.no)}>
                          Receive
                        </Btn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
    </div>
  );
}
