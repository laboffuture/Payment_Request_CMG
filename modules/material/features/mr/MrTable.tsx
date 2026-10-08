'use client';

import { useRouter } from '@mm/lib/nav';
import { MR_ST, chipFor, type MrDto } from '@cm/shared';
import { DataTable, type Column } from '@mm/components/DataTable';
import { Btn, Chip, Tag } from '@mm/components/ui';
import { fmtDate } from '@mm/lib/format';

/**
 * The MR register.
 * Prototype origin: mrTable(list) — used by the home page, My MRs / All MRs
 * and the QS queue.
 */
export function MrTable({ rows }: { rows: MrDto[] }) {
  const router = useRouter();

  const columns: Column<MrDto>[] = [
    {
      key: 'no',
      header: 'MR no.',
      // Kept on one line so the number never breaks beside a long project name.
      render: (m) => (
        <span className="font-mono" style={{ whiteSpace: 'nowrap' }}>
          {m.no || 'Draft'}
        </span>
      ),
    },
    {
      key: 'project',
      header: 'Project',
      render: (m) => <span style={{ whiteSpace: 'nowrap' }}>{m.projectCode}</span>,
    },
    { key: 'projectName', header: 'Project name', render: (m) => m.projectName || '—' },
    {
      key: 'required',
      header: 'Required',
      render: (m) => (
        <span className="flex items-center gap-2 justify-end desk:justify-start">
          {fmtDate(m.requiredDate)}
          {m.overdue ? <Tag label="OVERDUE" tone="red" /> : null}
        </span>
      ),
    },
    {
      key: 'lines',
      header: 'Lines',
      render: (m) =>
        `${m.lineCount}${m.newItemCount ? ` · ${m.newItemCount} new` : ''}`,
    },
    { key: 'by', header: 'Raised by', render: (m) => m.createdByName },
    {
      key: 'status',
      header: 'Status',
      render: (m) => <Chip spec={chipFor(MR_ST, m.status)} />,
    },
    {
      key: 'pdf',
      header: '',
      render: (m) => (
        <Btn small onClick={() => router.push(`/mrs/print?ids=${m.id}`)}>
          PDF
        </Btn>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(m) => m.id}
      onRowClick={(m) => router.push(`/mrs/${m.id}`)}
      emptyText="No material requests"
    />
  );
}
