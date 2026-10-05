'use client';

import { useParams } from '@mm/lib/nav';
import { useQuery } from '@tanstack/react-query';
import { IS_ST, chipFor, type IssueDetailDto } from '@cm/shared';
import { get } from '@mm/lib/api';
import { DataTable, type Column } from '@mm/components/DataTable';
import { Chip, PageHeader } from '@mm/components/ui';
import { fmtDateTime, qty } from '@mm/lib/format';

/**
 * Prototype: A.showIssue — the modal, given its own route so the `iss:<id>`
 * deep link in an email works for site users too (plan decision (d)(8)).
 */
export default function IssueDetailPage() {
  const { id } = useParams<{ id: string }>();

  const issue = useQuery({
    queryKey: ['issue', id],
    queryFn: () => get<IssueDetailDto>(`/issues/${id}`),
  });

  if (issue.isLoading) return <div className="text-mut">Loading…</div>;
  if (!issue.data) return <div className="errb">Not found</div>;

  const data = issue.data;

  const columns: Column<IssueDetailDto['lines'][number]> = [] as never;
  void columns;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3 flex-wrap">
            <span className="font-mono">{data.no}</span>
            <Chip spec={chipFor(IS_ST, data.status)} />
          </span>
        }
        subtitle={
          <>
            {data.projectCode} · {data.mrNo} · issued by {data.createdByName}{' '}
            {fmtDateTime(data.createdAt)}
            {data.vehicle ? ` · ${data.vehicle}` : ''}
            {data.acceptedByName ? (
              <div>
                Accepted by {data.acceptedByName} {fmtDateTime(data.acceptedAt)}
                {data.remark ? ` · ${data.remark}` : ''}
              </div>
            ) : null}
          </>
        }
      />

      <DataTable
        columns={[
          { key: 'item', header: 'Item', render: (l) => <b>{l.itemName}</b> },
          {
            key: 'issued',
            header: 'Issued',
            align: 'right',
            render: (l) => `${qty(l.qtyIssued)} ${l.unit}`,
          },
          {
            key: 'accepted',
            header: 'Accepted',
            align: 'right',
            render: (l) => (data.status === 'ACCEPTED' ? qty(l.qtyAccepted) : '—'),
          },
        ]}
        rows={data.lines}
        rowKey={(l) => l.id}
        emptyText="No lines"
      />
    </>
  );
}
