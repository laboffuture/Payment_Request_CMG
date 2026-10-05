'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MSG, type GrnOpenPoDto } from '@cm/shared';
import { get, newIdempotencyKey, post } from '@mm/lib/api';
import { Btn, Card, Stack, Tag } from '@mm/components/ui';
import { useToast } from '@mm/components/Toast';
import { useAction } from '@mm/lib/hooks';
import { qty } from '@mm/lib/format';

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

  const params = new URLSearchParams({ location });
  if (selectedNo) params.set('no', selectedNo);

  const data = useQuery({
    queryKey: ['grn-open', location, selectedNo],
    queryFn: () =>
      get<{ pos: { id: string; no: string; vendorName: string }[]; selected: GrnOpenPoDto | null }>(
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
  };

  const rowsFor = (po: GrnOpenPoDto) =>
    po.lines.map((line) => ({
      line,
      now: receive[line.poAllocId]?.now ?? String(line.balance),
      rejected: receive[line.poAllocId]?.rejected ?? '0',
    }));

  const postGrn = useAction(
    (po: GrnOpenPoDto) =>
      post<{ no: string }>(
        '/grns',
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

          <div className="text-mut text-sm">
            Open POs for {location === 'STORE' ? 'store' : 'site'} delivery:{' '}
            {(data.data?.pos ?? []).length
              ? (data.data?.pos ?? []).map((po) => (
                  <button
                    key={po.id}
                    className="text-ac underline font-semibold font-mono mr-2"
                    onClick={() => pick(po.no)}
                  >
                    {po.no}
                  </button>
                ))
              : 'none'}
          </div>

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
