'use client';

import { useRouter } from '@mm/lib/nav';
import { useQuery } from '@tanstack/react-query';
import { RFQ_ST, chipFor, type RfqDto } from '@cm/shared';
import { get } from '@mm/lib/api';
import { DataTable, type Column } from '@mm/components/DataTable';
import { Chip, DueCountdown, PageHeader } from '@mm/components/ui';
import { fmtDateTime } from '@mm/lib/format';

/** Prototype: VIEWS.rfqs — every enquiry, newest first. */
export default function RfqsPage() {
  const router = useRouter();

  const list = useQuery({
    queryKey: ['rfqs'],
    queryFn: () => get<RfqDto[]>('/rfqs'),
  });

  const columns: Column<RfqDto>[] = [
    { key: 'no', header: 'RFQ no.', render: (r) => <span className="font-mono">{r.no}</span> },
    { key: 'items', header: 'Items', align: 'right', render: (r) => r.lineCount },
    { key: 'projects', header: 'Projects', render: (r) => r.projectCodes.join(', ') },
    {
      key: 'vendors',
      header: 'Vendors',
      render: (r) => `${r.quotedCount} quoted / ${r.vendorCount}`,
    },
    {
      key: 'due',
      header: 'Due',
      render: (r) => (
        <span>
          {fmtDateTime(r.dueAt)}
          <br />
          {r.status === 'OPEN' ? <DueCountdown due={r.dueAt} /> : null}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <Chip spec={chipFor(RFQ_ST, r.status)} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Enquiries (RFQ)"
        subtitle="Sent to vendors on the portal and by email. Open one to compare quotes."
      />
      {list.isLoading ? (
        <div className="text-mut">Loading…</div>
      ) : (
        <DataTable
          columns={columns}
          rows={list.data ?? []}
          rowKey={(r) => r.id}
          onRowClick={(r) => router.push(`/rfqs/${r.id}`)}
          emptyText="No enquiries yet. Start from Consolidate MRs."
        />
      )}
    </>
  );
}
