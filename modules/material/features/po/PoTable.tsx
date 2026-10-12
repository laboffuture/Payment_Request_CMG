'use client';

import { useState } from 'react';
import { useRouter } from '@mm/lib/nav';
import { PO_ST, chipFor, type PoDto } from '@cm/shared';
import { DataTable, type Column } from '@mm/components/DataTable';
import { Btn, Chip, Tag } from '@mm/components/ui';
import { Modal } from '@mm/components/Modal';
import { del } from '@mm/lib/api';
import { useAction } from '@mm/lib/hooks';
import { fmtDate, money } from '@mm/lib/format';

/**
 * The PO register.
 * Prototype origin: poTable(list) — one PO can carry lines for several
 * projects and MRs, so the Projects column is a list.
 */
export function PoTable({
  rows,
  currency = '',
  canDelete = false,
}: {
  rows: PoDto[];
  currency?: string;
  /** Shows a Delete button on each row — the register passes this for an administrator. */
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<PoDto | null>(null);

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

  if (canDelete) {
    columns.push({
      key: 'actions',
      header: 'Actions',
      render: (p) => (
        <Btn
          small
          variant="danger"
          onClick={(e) => {
            // The row itself opens the PO; this button must not.
            e.stopPropagation();
            setDeleting(p);
          }}
        >
          Delete
        </Btn>
      ),
    });
  }

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        onRowClick={(p) => router.push(`/pos/${p.id}`)}
        emptyText="No purchase orders"
      />
      {deleting ? <DeletePo po={deleting} onClose={() => setDeleting(null)} /> : null}
    </>
  );
}

/** Asks before a PO is removed for good, and says what goes with it. */
function DeletePo({ po, onClose }: { po: PoDto; onClose: () => void }) {
  const remove = useAction(() => del<{ no: string }>(`/pos/${po.id}`), {
    success: (r) => `${r.no} deleted`,
    invalidate: [['*']],
    onDone: onClose,
  });

  return (
    <Modal
      title={`Delete ${po.displayNo}?`}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Keep the PO</Btn>
          <Btn variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(undefined)}>
            {remove.isPending ? 'Deleting…' : 'Delete PO'}
          </Btn>
        </>
      }
    >
      <p>
        <b>{po.displayNo}</b> for <b>{po.vendorName}</b> ({money(po.total)}) is removed from the
        register for everybody. This cannot be undone, and the PO number is not used again.
      </p>
      <p className="text-mut text-sm">
        The MR quantities on it go back to Consolidate MRs so they can be ordered again. A PO
        with goods already received cannot be deleted. To stop an order but keep the record,
        cancel it instead.
      </p>
    </Modal>
  );
}
