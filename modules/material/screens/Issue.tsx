'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MSG, type IssuableMrDto } from '@cm/shared';
import { get, newIdempotencyKey, post } from '@mm/lib/api';
import { Btn, Card, EmptyState, PageHeader, Stack } from '@mm/components/ui';
import { useToast } from '@mm/components/Toast';
import { useAction } from '@mm/lib/hooks';
import { fmtDate, qty } from '@mm/lib/format';

/**
 * Prototype: VIEWS.issue / A.createIssue — issuable lines grouped by MR.
 *
 * Only QS-approved store quantity, plus PO quantity received at the store, can
 * be issued — and never more than stock on hand.
 */
export default function IssuePage() {
  const toast = useToast();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [vehicles, setVehicles] = useState<Record<string, string>>({});

  const list = useQuery({
    queryKey: ['issues', 'pending'],
    queryFn: () => get<IssuableMrDto[]>('/issues/pending'),
  });

  const create = useAction(
    (mr: IssuableMrDto) =>
      post<{ no: string }>(
        '/issues',
        {
          mrId: mr.mrId,
          vehicle: vehicles[mr.mrId] ?? '',
          lines: mr.lines.map((line) => ({
            mrLineId: line.mrLineId,
            qtyIssued: Number(amounts[line.mrLineId] ?? line.suggested) || 0,
          })),
        },
        newIdempotencyKey(),
      ),
    {
      invalidate: [['issues'], ['inventory'], ['mrs']],
      onDone: (result) => toast(`${result.no} created — waiting for site to accept`),
    },
  );

  const submit = (mr: IssuableMrDto) => {
    // Same checks as the API, for an instant answer (§8).
    const used = new Map<string, number>();
    let any = false;

    for (const line of mr.lines) {
      const value = Number(amounts[line.mrLineId] ?? line.suggested) || 0;
      if (!value) continue;
      any = true;

      if (value > line.issuable) {
        return toast(MSG.issueOverIssuable(line.itemName, qty(line.issuable)));
      }
      const total = (used.get(line.itemId) ?? 0) + value;
      used.set(line.itemId, total);
      if (total > line.onHand) return toast(MSG.issueNoStock(line.itemName));
    }

    if (!any) return toast(MSG.issueQtyRequired);
    create.mutate(mr);
  };

  const rows = list.data ?? [];

  return (
    <>
      <PageHeader
        title="Issue to site"
        subtitle="Only QS-approved store quantity, plus PO quantity received at the store, can be issued — never more than stock on hand."
      />

      {list.isLoading ? <div className="text-mut">Loading…</div> : null}

      {!list.isLoading && !rows.length ? (
        <EmptyState text="Nothing to issue right now." />
      ) : null}

      <div className="flex flex-col gap-3">
        {rows.map((mr) => (
          <Card key={mr.mrId}>
            <Stack>
              <div className="flex justify-between items-center gap-3 flex-wrap">
                <div>
                  <span className="font-mono font-semibold">{mr.mrNo}</span> ·{' '}
                  {mr.projectName}
                </div>
                <span className="text-mut text-sm">
                  Required {fmtDate(mr.requiredDate)}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="t">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="text-right">To issue</th>
                      <th className="text-right">On hand</th>
                      <th>Issue now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mr.lines.map((line) => (
                      <tr key={line.mrLineId}>
                        <td data-label="Item">
                          <b>{line.itemName}</b>{' '}
                          <span className="text-mut">{line.unit}</span>
                        </td>
                        <td data-label="To issue" className="desk:text-right">
                          {qty(line.issuable)}
                        </td>
                        <td data-label="On hand" className="desk:text-right">
                          {qty(line.onHand)}
                        </td>
                        <td data-label="Issue now">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            aria-label={`Issue quantity for ${line.itemName}`}
                            className="w-24 font-semibold"
                            value={amounts[line.mrLineId] ?? String(line.suggested)}
                            onChange={(e) =>
                              setAmounts({ ...amounts, [line.mrLineId]: e.target.value })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap gap-[10px]">
                <input
                  className="flex-1 min-w-[200px]"
                  placeholder="Vehicle / driver (optional)"
                  aria-label={`Vehicle for ${mr.mrNo}`}
                  value={vehicles[mr.mrId] ?? ''}
                  onChange={(e) => setVehicles({ ...vehicles, [mr.mrId]: e.target.value })}
                />
                <Btn
                  variant="dark"
                  disabled={create.isPending}
                  onClick={() => submit(mr)}
                >
                  Create issue note
                </Btn>
              </div>
            </Stack>
          </Card>
        ))}
      </div>
    </>
  );
}
