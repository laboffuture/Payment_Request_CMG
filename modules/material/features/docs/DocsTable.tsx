'use client';

import { useState } from 'react';
import { DOC_ST, MSG, chipFor, type VendorDocDto } from '@cm/shared';
import { post } from '@mm/lib/api';
import { DataTable, type Column } from '@mm/components/DataTable';
import { Btn, Chip, Stack } from '@mm/components/ui';
import { useToast } from '@mm/components/Toast';
import { useAction } from '@mm/lib/hooks';
import { fmtDate, money } from '@mm/lib/format';

/** Prototype: docTable(list) — shared by the PO page and Invoices & DOs. */
export function DocsTable({
  rows,
  canCheck,
}: {
  rows: VendorDocDto[];
  canCheck: boolean;
}) {
  const toast = useToast();
  const [rejecting, setRejecting] = useState<VendorDocDto | null>(null);
  const [remark, setRemark] = useState('');

  const invalidate = [['docs'], ['po'], ['pos']];
  const verify = useAction((docId: string) => post(`/docs/${docId}/verify`), {
    success: 'Document verified',
    invalidate,
  });
  const reject = useAction(
    (docId: string) => post(`/docs/${docId}/reject`, { remark }),
    {
      success: 'Document rejected',
      invalidate,
      onDone: () => {
        setRejecting(null);
        setRemark('');
      },
    },
  );

  const columns: Column<VendorDocDto>[] = [
    {
      key: 'type',
      header: 'Type',
      render: (d) => (d.docType === 'DO' ? 'Delivery order' : 'Invoice'),
    },
    { key: 'no', header: 'No.', render: (d) => <span className="font-mono">{d.docNo}</span> },
    { key: 'date', header: 'Date', render: (d) => fmtDate(d.docDate) },
    { key: 'po', header: 'PO', render: (d) => <span className="font-mono">{d.poNo}</span> },
    { key: 'vendor', header: 'Vendor', render: (d) => d.vendorName },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (d) => (d.amount ? money(d.amount) : '—'),
    },
    {
      key: 'file',
      header: 'File',
      render: (d) => (
        <a
          className="text-ac underline font-semibold"
          href={`/api/docs/${d.id}/file`}
          target="_blank"
          rel="noreferrer"
        >
          {d.fileName || 'Open'}
        </a>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (d) => (
        <span>
          <Chip spec={chipFor(DOC_ST, d.status)} />
          {d.remark ? <div className="text-mut text-xs">{d.remark}</div> : null}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (d) =>
        canCheck && d.status === 'SUBMITTED' ? (
          <div className="flex gap-2">
            <Btn small variant="primary" onClick={() => verify.mutate(d.id)}>
              Verify
            </Btn>
            <Btn small variant="danger" onClick={() => setRejecting(d)}>
              Reject
            </Btn>
          </div>
        ) : null,
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(d) => d.id}
        emptyText="Nothing here"
      />

      {rejecting ? (
        <div className="card mt-3">
          <Stack>
            <label className="field">
              Reason (the vendor sees this)
              <input value={remark} onChange={(e) => setRemark(e.target.value)} />
            </label>
            <div className="flex justify-end gap-[10px]">
              <Btn onClick={() => setRejecting(null)}>Cancel</Btn>
              <Btn
                variant="danger"
                onClick={() =>
                  remark.trim()
                    ? reject.mutate(rejecting.id)
                    : toast(MSG.docRejectReason)
                }
              >
                Reject {rejecting.docNo}
              </Btn>
            </div>
          </Stack>
        </div>
      ) : null}
    </>
  );
}
