'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { InventoryRowDto, LedgerRowDto } from '@cm/shared';
import { downloadFile, get } from '@mm/lib/api';
import { DataTable, type Column } from '@mm/components/DataTable';
import { Btn, PageHeader } from '@mm/components/ui';
import { Modal } from '@mm/components/Modal';
import { fmtDate, qty } from '@mm/lib/format';
import { useReference } from '@mm/lib/reference';

/**
 * Prototype: VIEWS.inventory and A.ledger.
 *
 * The header spells the formula out, as the prototype does — it is the answer
 * to "why can I not issue this?" and it saves a phone call.
 */
export default function InventoryPage() {
  const reference = useReference();
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [ledgerFor, setLedgerFor] = useState<InventoryRowDto | null>(null);

  const query = new URLSearchParams();
  if (category) query.set('category', category);
  if (search) query.set('q', search);
  const suffix = query.toString() ? `?${query}` : '';

  const rows = useQuery({
    queryKey: ['inventory', category, search],
    queryFn: () => get<InventoryRowDto[]>(`/inventory${suffix}`),
  });

  const columns: Column<InventoryRowDto>[] = [
    { key: 'code', header: 'Code', render: (r) => <span className="font-mono">{r.code}</span> },
    {
      key: 'name',
      header: 'Item',
      render: (r) => (
        <span>
          <b>{r.name}</b>
          {r.subCategory ? <span className="text-mut"> {r.subCategory}</span> : null}
        </span>
      ),
    },
    { key: 'unit', header: 'Unit', render: (r) => r.unit },
    { key: 'opening', header: 'Opening', align: 'right', render: (r) => qty(r.opening) },
    {
      key: 'in',
      header: 'In',
      align: 'right',
      render: (r) => <span className="text-grn">{qty(r.in)}</span>,
    },
    {
      key: 'out',
      header: 'Out',
      align: 'right',
      render: (r) => <span className="text-red">{qty(r.out)}</span>,
    },
    { key: 'onHand', header: 'On hand', align: 'right', render: (r) => <b>{qty(r.onHand)}</b> },
    {
      key: 'reserved',
      header: 'Reserved',
      align: 'right',
      render: (r) => <span className="text-amb">{qty(r.reserved)}</span>,
    },
    {
      key: 'available',
      header: 'Available',
      align: 'right',
      render: (r) => (
        <b className={r.available <= 0 ? 'text-red' : ''}>{qty(r.available)}</b>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Inventory — main store"
        subtitle={
          <span className="font-mono text-xs">
            On hand = Opening + In (GRN vs PO, returns) − Out (issue vs MR) · Available
            = On hand − Reserved for approved MRs
          </span>
        }
        actions={
          <>
            <select
              aria-label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All categories</option>
              {reference.categories.map((c) => (
                <option key={c.id}>{c.name}</option>
              ))}
            </select>
            <input
              aria-label="Search item"
              placeholder="Search item"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Btn onClick={() => downloadFile(`/inventory/export.csv${suffix}`)}>
              Export CSV
            </Btn>
          </>
        }
      />

      {rows.isLoading ? (
        <div className="text-mut">Loading…</div>
      ) : (
        <DataTable
          columns={columns}
          rows={rows.data ?? []}
          rowKey={(r) => r.id}
          onRowClick={setLedgerFor}
          groupBy={(r) => r.category}
          emptyText="No items yet — load the item list under Import inventory."
        />
      )}

      {ledgerFor ? (
        <LedgerModal row={ledgerFor} onClose={() => setLedgerFor(null)} />
      ) : null}
    </>
  );
}

/** Prototype: A.ledger — every movement with a running balance. */
function LedgerModal({
  row,
  onClose,
}: {
  row: InventoryRowDto;
  onClose: () => void;
}) {
  const ledger = useQuery({
    queryKey: ['ledger', row.id],
    queryFn: () => get<LedgerRowDto[]>(`/items/${row.id}/ledger`),
  });

  const columns: Column<LedgerRowDto>[] = [
    { key: 'at', header: 'Date', render: (r) => fmtDate(r.at) },
    {
      key: 'doc',
      header: 'Document',
      render: (r) => (
        <span>
          <span className="font-mono">{r.docNo || r.docType}</span>
          <div className="text-mut text-xs">
            {r.docType}
            {r.refNo ? ` · ${r.refNo}` : ''}
          </div>
        </span>
      ),
    },
    { key: 'project', header: 'Project', render: (r) => r.projectCode ?? '—' },
    {
      key: 'in',
      header: 'In',
      align: 'right',
      render: (r) => (r.qtyIn ? <span className="text-grn">{qty(r.qtyIn)}</span> : ''),
    },
    {
      key: 'out',
      header: 'Out',
      align: 'right',
      render: (r) => (r.qtyOut ? <span className="text-red">{qty(r.qtyOut)}</span> : ''),
    },
    { key: 'balance', header: 'Balance', align: 'right', render: (r) => <b>{qty(r.balance)}</b> },
  ];

  return (
    <Modal title={`${row.name} — ledger`} onClose={onClose} wide>
      {ledger.isLoading ? (
        <div className="text-mut">Loading…</div>
      ) : (
        <DataTable
          columns={columns}
          rows={ledger.data ?? []}
          rowKey={(r) => r.id}
          emptyText="No movements"
        />
      )}
    </Modal>
  );
}
