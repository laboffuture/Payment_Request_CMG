'use client';

import { useRouter } from '@mm/lib/nav';
import { useQuery } from '@tanstack/react-query';
import { RFQ_ST, RV_ST, chipFor, type RfqDto, type RfqVendorStatus } from '@cm/shared';
import { get } from '@mm/lib/api';
import { DataTable, type Column } from '@mm/components/DataTable';
import { Chip, DueCountdown, PageHeader } from '@mm/components/ui';
import { fmtDateTime } from '@mm/lib/format';
import { useSession } from '@mm/lib/session';

/**
 * Prototype: VIEWS.vhome — the vendor's enquiries.
 *
 * A vendor is never told which projects the material is for, nor who else was
 * invited; the API withholds both (§3).
 */
interface Row {
  rfq: RfqDto;
  myStatus: RfqVendorStatus;
}

export default function VendorHomePage() {
  const router = useRouter();
  const { me } = useSession();

  const list = useQuery({
    queryKey: ['vendor-rfqs'],
    queryFn: () => get<Row[]>('/vendor/rfqs'),
  });

  const columns: Column<Row>[] = [
    {
      key: 'no',
      header: 'Enquiry',
      render: (r) => <span className="font-mono">{r.rfq.no}</span>,
    },
    { key: 'items', header: 'Items', align: 'right', render: (r) => r.rfq.lineCount },
    {
      key: 'due',
      header: 'Due',
      render: (r) => (
        <span>
          {fmtDateTime(r.rfq.dueAt)}
          <br />
          {r.rfq.status === 'OPEN' ? <DueCountdown due={r.rfq.dueAt} /> : null}
        </span>
      ),
    },
    {
      key: 'mine',
      header: 'Your status',
      render: (r) => <Chip spec={chipFor(RV_ST, r.myStatus)} />,
    },
    {
      key: 'status',
      header: 'Enquiry',
      render: (r) => <Chip spec={chipFor(RFQ_ST, r.rfq.status)} />,
    },
  ];

  return (
    <>
      <PageHeader
        title={me.vendorName ?? 'Vendor portal'}
        subtitle="Vendor portal · enquiries from Chandramari"
      />
      {list.isLoading ? (
        <div className="text-mut">Loading…</div>
      ) : (
        <DataTable
          columns={columns}
          rows={list.data ?? []}
          rowKey={(r) => r.rfq.id}
          onRowClick={(r) => router.push(`/vendor/rfqs/${r.rfq.id}`)}
          emptyText="No enquiries yet."
        />
      )}
    </>
  );
}
