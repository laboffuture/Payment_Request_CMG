'use client';

import { useQuery } from '@tanstack/react-query';
import type { GrnDto } from '@cm/shared';
import { get } from '@mm/lib/api';
import { DataTable, type Column } from '@mm/components/DataTable';
import { PageHeader } from '@mm/components/ui';
import { GrnSection } from '@mm/features/store/GrnSection';
import { fmtDateTime } from '@mm/lib/format';

/** Prototype: VIEWS.grn — receive against a PO, then the recent GRNs. */
export default function GrnPage() {
  const grns = useQuery({
    queryKey: ['grns'],
    queryFn: () => get<GrnDto[]>('/grns'),
  });

  const columns: Column<GrnDto>[] = [
    { key: 'no', header: 'GRN no.', render: (g) => <span className="font-mono">{g.no}</span> },
    { key: 'date', header: 'Date', render: (g) => fmtDateTime(g.createdAt) },
    { key: 'po', header: 'PO', render: (g) => <span className="font-mono">{g.poNo}</span> },
    { key: 'vendor', header: 'Vendor', render: (g) => g.vendorName },
    { key: 'at', header: 'At', render: (g) => (g.location === 'SITE' ? 'Site' : 'Store') },
    { key: 'projects', header: 'Projects', render: (g) => g.projectCodes.join(', ') },
    { key: 'dn', header: 'DN no.', render: (g) => g.dnNo },
  ];

  return (
    <>
      <PageHeader
        title="GRN — receive against PO"
        subtitle="Search the PO number. One GRN can receive lines for several projects."
      />
      <GrnSection location="STORE" />

      <h2>Recent GRNs</h2>
      <DataTable
        columns={columns}
        rows={grns.data ?? []}
        rowKey={(g) => g.id}
        emptyText="No GRNs yet"
      />
    </>
  );
}
