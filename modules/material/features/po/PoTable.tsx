'use client';

import { useRouter } from '@mm/lib/nav';
import { PO_ST, chipFor, type PoDto } from '@cm/shared';
import { DataTable, type Column } from '@mm/components/DataTable';
import { Chip, Tag } from '@mm/components/ui';
import { fmtDate, money } from '@mm/lib/format';

/**
 * The PO register.
 * Prototype origin: poTable(list) — one PO can carry lines for several
 * projects and MRs, so the Projects column is a list.
 */
export function PoTable({ rows, currency = '' }: { rows: PoDto[]; currency?: string }) {
  const router = useRouter();

  const columns: Column<PoDto>[] = [
    {
      key: 'no',
      header: 'PO no.',
      render: (p) => <span className="font-mono">{p.displayNo}</span>,
    },
    { key: 'date', header: 'Date', render: (p) => fmtDate(p.createdAt) },
    { key: 'vendor', header: 'Vendor', render: (p) => p.vendorName },
    { key: 'projects', header: 'Projects', render: (p) => p.projectCodes.join(', ') },
    {
      key: 'basis',
      header: 'Basis',
      render: (p) =>
        p.rfqId ? <Tag label="COMPARED" tone="ac" /> : <Tag label="DIRECT" tone="gry" />,
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (p) => `${currency} ${money(p.total)}`.trim(),
    },
    {
      key: 'deliver',
      header: 'Deliver to',
      render: (p) => (p.deliverTo === 'SITE' ? 'Site' : 'Store'),
    },
    {
      key: 'received',
      header: 'Received',
      align: 'right',
      render: (p) => `${p.receivedPct}%`,
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => <Chip spec={chipFor(PO_ST, p.status)} />,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(p) => p.id}
      onRowClick={(p) => router.push(`/pos/${p.id}`)}
      emptyText="No purchase orders"
    />
  );
}
