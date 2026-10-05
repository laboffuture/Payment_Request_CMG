'use client';

import { useRouter } from '@mm/lib/nav';
import { useQuery } from '@tanstack/react-query';
import { IS_ST, chipFor, type IssueDto } from '@cm/shared';
import { get } from '@mm/lib/api';
import { DataTable, type Column } from '@mm/components/DataTable';
import { Chip, PageHeader } from '@mm/components/ui';
import { fmtDateTime } from '@mm/lib/format';

/** Prototype: VIEWS.issues / issueTable(list). */
export default function IssuesPage() {
  const router = useRouter();

  const list = useQuery({
    queryKey: ['issues'],
    queryFn: () => get<IssueDto[]>('/issues'),
  });

  const columns: Column<IssueDto>[] = [
    { key: 'no', header: 'Issue no.', render: (i) => <span className="font-mono">{i.no}</span> },
    { key: 'date', header: 'Date', render: (i) => fmtDateTime(i.createdAt) },
    { key: 'mr', header: 'MR', render: (i) => <span className="font-mono">{i.mrNo}</span> },
    { key: 'project', header: 'Project', render: (i) => i.projectCode },
    { key: 'lines', header: 'Lines', align: 'right', render: (i) => i.lineCount },
    {
      key: 'status',
      header: 'Status',
      render: (i) => <Chip spec={chipFor(IS_ST, i.status)} />,
    },
  ];

  return (
    <>
      <PageHeader title="Issue notes" />
      {list.isLoading ? (
        <div className="text-mut">Loading…</div>
      ) : (
        <DataTable
          columns={columns}
          rows={list.data ?? []}
          rowKey={(i) => i.id}
          onRowClick={(i) => router.push(`/issues/${i.id}`)}
          emptyText="No issue notes"
        />
      )}
    </>
  );
}
