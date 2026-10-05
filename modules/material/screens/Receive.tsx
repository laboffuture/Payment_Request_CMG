'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MSG, type IssueDetailDto, type IssueDto } from '@cm/shared';
import { get, newIdempotencyKey, post } from '@mm/lib/api';
import { Btn, Card, EmptyState, PageHeader, Stack } from '@mm/components/ui';
import { useToast } from '@mm/components/Toast';
import { useAction } from '@mm/lib/hooks';
import { GrnSection } from '@mm/features/store/GrnSection';
import { fmtDateTime, qty } from '@mm/lib/format';

/**
 * Prototype: VIEWS.receive — accept store issues, and receive a PO delivered
 * straight to site.
 *
 * A shortfall on acceptance returns to store stock as a RETURN ledger row, and
 * the MR closes once everything approved has been accepted.
 */
export default function ReceivePage() {
  const pending = useQuery({
    queryKey: ['issues', 'to-accept'],
    queryFn: () => get<IssueDto[]>('/issues'),
  });

  const waiting = (pending.data ?? []).filter((i) => i.status === 'ISSUED');

  return (
    <>
      <PageHeader
        title="Receive at site"
        subtitle="Accept store issues, or receive a PO delivered straight to site by searching its number."
      />

      <h2>Store issues to accept ({waiting.length})</h2>

      {pending.isLoading ? <div className="text-mut">Loading…</div> : null}
      {!pending.isLoading && !waiting.length ? (
        <EmptyState text="Nothing waiting." />
      ) : null}

      <div className="flex flex-col gap-3">
        {waiting.map((issue) => (
          <AcceptCard key={issue.id} issueId={issue.id} />
        ))}
      </div>

      <h2>PO delivered to site</h2>
      <GrnSection location="SITE" />
    </>
  );
}

function AcceptCard({ issueId }: { issueId: string }) {
  const toast = useToast();
  const [accepted, setAccepted] = useState<Record<string, string>>({});
  const [remark, setRemark] = useState('');

  const issue = useQuery({
    queryKey: ['issue', issueId],
    queryFn: () => get<IssueDetailDto>(`/issues/${issueId}`),
  });

  const accept = useAction(
    () =>
      post(
        `/issues/${issueId}/accept`,
        {
          rv: issue.data?.rv,
          remark,
          lines: (issue.data?.lines ?? []).map((line) => ({
            issueLineId: line.id,
            qtyAccepted: Number(accepted[line.id] ?? line.qtyIssued) || 0,
          })),
        },
        newIdempotencyKey(),
      ),
    {
      success: `${issue.data?.no ?? 'Issue'} accepted`,
      invalidate: [['issues'], ['issue', issueId], ['inventory'], ['mrs']],
    },
  );

  if (!issue.data) return null;
  const data = issue.data;

  const submit = () => {
    for (const line of data.lines) {
      const value = Number(accepted[line.id] ?? line.qtyIssued) || 0;
      if (value < 0 || value > line.qtyIssued) return toast(MSG.acceptRange);
    }
    accept.mutate();
  };

  return (
    <Card>
      <Stack>
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <b className="font-mono">{data.no}</b>
          <span className="text-mut text-sm">
            {data.projectCode} · {data.mrNo} · {fmtDateTime(data.createdAt)}
          </span>
        </div>

        {data.lines.map((line) => (
          <div
            key={line.id}
            className="flex justify-between items-end gap-3 flex-wrap border-t border-line2 pt-2"
          >
            <div>
              <b>{line.itemName}</b>
              <div className="text-mut text-sm">
                Issued {qty(line.qtyIssued)} {line.unit}
              </div>
            </div>
            <label className="field">
              Accepted
              <input
                type="number"
                min={0}
                step="any"
                aria-label={`Accepted quantity for ${line.itemName}`}
                className="w-24 font-semibold"
                value={accepted[line.id] ?? String(line.qtyIssued)}
                onChange={(e) => setAccepted({ ...accepted, [line.id]: e.target.value })}
              />
            </label>
          </div>
        ))}

        <input
          placeholder="Remark (short / damaged)"
          aria-label={`Remark for ${data.no}`}
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
        />

        <div className="flex justify-end">
          <Btn variant="dark" disabled={accept.isPending} onClick={submit}>
            Accept
          </Btn>
        </div>
      </Stack>
    </Card>
  );
}
