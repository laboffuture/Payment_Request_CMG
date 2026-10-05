'use client';

import { useState } from 'react';
import { useRouter } from '@mm/lib/nav';
import { useQuery } from '@tanstack/react-query';
import type { PoDto } from '@cm/shared';
import { get } from '@mm/lib/api';
import { DataTable, type Column } from '@mm/components/DataTable';
import { Btn, Chip, PageHeader } from '@mm/components/ui';
import { VendorDocUpload } from '@mm/features/vendor/VendorDocUpload';
import { fmtDate, money } from '@mm/lib/format';

/**
 * Prototype: VIEWS.vpos (the second definition) — approved POs, whether each
 * is acknowledged, and the upload button.
 */
export default function VendorPosPage() {
  const router = useRouter();
  const [uploadFor, setUploadFor] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['vendor-pos'],
    queryFn: () => get<{ rows: PoDto[] }>('/pos'),
  });

  const columns: Column<PoDto>[] = [
    { key: 'no', header: 'PO no.', render: (p) => <span className="font-mono">{p.displayNo}</span> },
    { key: 'date', header: 'Date', render: (p) => fmtDate(p.approvedAt ?? p.createdAt) },
    { key: 'deliver', header: 'Deliver by', render: (p) => fmtDate(p.deliveryDate) },
    { key: 'total', header: 'Total', align: 'right', render: (p) => money(p.total) },
    { key: 'recd', header: 'Received', align: 'right', render: (p) => `${p.receivedPct}%` },
    {
      key: 'ack',
      header: 'Acknowledged',
      render: (p) =>
        p.vendorAckAt ? (
          <Chip spec={{ label: 'Yes', tone: 'grn' }} />
        ) : (
          <Chip spec={{ label: 'Not yet', tone: 'amb' }} />
        ),
    },
    {
      key: 'upload',
      header: '',
      render: (p) => (
        <Btn small variant="primary" onClick={() => setUploadFor(p.id)}>
          Upload invoice / DO
        </Btn>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="My purchase orders"
        subtitle="Approved POs from Chandramari. Acknowledge each PO and upload your invoice / delivery order against it."
      />
      {list.isLoading ? (
        <div className="text-mut">Loading…</div>
      ) : (
        <DataTable
          columns={columns}
          rows={list.data?.rows ?? []}
          rowKey={(p) => p.id}
          onRowClick={(p) => router.push(`/pos/${p.id}`)}
          emptyText="No approved POs yet."
        />
      )}

      {uploadFor ? (
        <VendorDocUpload poId={uploadFor} onClose={() => setUploadFor(null)} />
      ) : null}
    </>
  );
}
