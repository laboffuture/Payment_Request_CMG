'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import type { StoreStockDto } from '@cm/shared';
import { del, downloadFile, get, post, put } from '@mm/lib/api';
import { DataTable, type Column } from '@mm/components/DataTable';
import { Modal } from '@mm/components/Modal';
import { Btn, PageHeader } from '@mm/components/ui';
import { useToast } from '@mm/components/Toast';
import { useAction } from '@mm/lib/hooks';
import { fmtDate, qty } from '@mm/lib/format';
import { unitsOf, useReference } from '@mm/lib/reference';
import { ItemSearchSelect } from '@mm/components/ItemSearchSelect';
import { useSession } from '@mm/lib/session';

/**
 * Store Stock: the register of what the main store holds, entered by hand by the
 * store or the administrator. A row linked to its item master item is that item's stock
 * in the store: an MR sees it as available, QS can send it from the store, and issuing it
 * to site takes the quantity off here.
 */
type Form = {
  name: string;
  category: string;
  specification: string;
  brand: string;
  unit: string;
  qty: string;
  itemId: string;
  itemLabel: string;
  location: string;
  remarks: string;
};

const EMPTY: Form = {
  name: '',
  category: '',
  specification: '',
  brand: '',
  unit: '',
  qty: '',
  itemId: '',
  itemLabel: '',
  location: '',
  remarks: '',
};

const formOf = (r: StoreStockDto): Form => ({
  name: r.name,
  category: r.category,
  specification: r.specification,
  brand: r.brand,
  unit: r.unit,
  qty: String(r.qty),
  itemId: r.itemId,
  itemLabel: r.itemId ? `${r.itemCode} · ${r.itemName}` : '',
  location: r.location,
  remarks: r.remarks,
});

export default function StoreStockPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  // null = closed; 'new' = adding; a row = editing that row
  const [editing, setEditing] = useState<StoreStockDto | 'new' | null>(null);
  const [removing, setRemoving] = useState<StoreStockDto | null>(null);
  // The store and the administrator keep the register; the head of QS edits and deletes entries too.
  const { me } = useSession();
  const keeper = me.role === 'STORE' || me.role === 'ADMIN';
  const editor = keeper || !!me.qsHead;

  const list = useQuery({
    queryKey: ['store-stock'],
    queryFn: () => get<StoreStockDto[]>('/store-stock'),
  });
  const all = useMemo(() => list.data ?? [], [list.data]);

  const categories = useMemo(
    () => [...new Set(all.map((r) => r.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [all],
  );

  // Every word typed must appear in the code, material, category, specification, brand,
  // unit, location or remarks.
  const rows = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter((r) => {
      if (category && r.category !== category) return false;
      if (!words.length) return true;
      const text = [r.code, r.name, r.category, r.specification, r.brand, r.unit, r.location, r.remarks, r.itemCode, r.itemName]
        .join(' ')
        .toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [all, search, category]);

  const remove = useAction((r: StoreStockDto) => del<{ code: string }>(`/store-stock/${r.id}`), {
    success: (res) => `${res.code} deleted`,
    invalidate: [['store-stock']],
    onDone: () => setRemoving(null),
  });

  const columns: Column<StoreStockDto>[] = [
    { key: 'code', header: 'Code', render: (r) => <span className="font-mono">{r.code}</span> },
    {
      key: 'name',
      header: 'Material',
      render: (r) => (
        <span>
          <b>{r.name}</b>
          {r.specification ? <span className="block text-mut text-xs">{r.specification}</span> : null}
        </span>
      ),
    },
    { key: 'category', header: 'Category', render: (r) => r.category || '—' },
    { key: 'brand', header: 'Brand', render: (r) => r.brand || '—' },
    { key: 'qty', header: 'Quantity', align: 'right', render: (r) => <b>{qty(r.qty)}</b> },
    { key: 'unit', header: 'Unit', render: (r) => r.unit || '—' },
    {
      key: 'item',
      header: 'Item master',
      render: (r) =>
        r.itemId ? (
          <span className="text-xs">
            <span className="font-mono">{r.itemCode}</span>
            <span className="block text-mut">{r.itemName}</span>
          </span>
        ) : (
          <span className="text-xs text-[#b42318]" title="Not linked: MRs cannot ask for it from the store">
            Not linked
          </span>
        ),
    },
    { key: 'location', header: 'Location', render: (r) => r.location || '—' },
    { key: 'remarks', header: 'Remarks', render: (r) => r.remarks || '—' },
    {
      key: 'updated',
      header: 'Last updated',
      render: (r) => (
        <span className="text-xs" style={{ whiteSpace: 'nowrap' }}>
          {fmtDate(r.updatedAt)}
          {r.updatedByName ? <span className="block text-mut">{r.updatedByName}</span> : null}
        </span>
      ),
    },
  ];
  if (editor) columns.push(
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <span className="flex gap-2" style={{ whiteSpace: 'nowrap' }}>
          <Btn small onClick={() => setEditing(r)}>
            Edit
          </Btn>
          <Btn small onClick={() => setRemoving(r)}>
            <span className="text-[#b42318]">Delete</span>
          </Btn>
        </span>
      ),
    },
  );

  const filtered = search.trim() || category;

  return (
    <>
      <PageHeader
        title="Store Stock"
        subtitle={
          filtered
            ? `${rows.length} of ${all.length} materials match`
            : `${all.length} material${all.length === 1 ? '' : 's'} in the store register. Linked to the item master, they show as available on MRs and come off here when the store issues them.`
        }
        actions={
          <>
            <input
              type="search"
              aria-label="Search store stock"
              placeholder="Search material, code, brand or location"
              className="min-w-[230px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {categories.length ? (
              <select
                aria-label="Category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            ) : null}
            <Btn
              title="Download the register to open in Excel"
              onClick={() => downloadFile('/store-stock/export.csv')}
            >
              <Download size={14} aria-hidden /> Excel (CSV)
            </Btn>
            {keeper ? (
              <Btn variant="primary" onClick={() => setEditing('new')}>
                + Add material
              </Btn>
            ) : null}
          </>
        }
      />

      {list.isLoading ? (
        <div className="text-mut">Loading…</div>
      ) : list.isError ? (
        <div className="errb">
          {list.error instanceof Error ? list.error.message : 'Could not load the store stock'}
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          emptyText={
            all.length ? 'No material matches the search' : 'No materials yet - use + Add material'
          }
        />
      )}

      {editing ? (
        <EntryModal
          entry={editing === 'new' ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {removing ? (
        <Modal
          title={`Delete ${removing.code}?`}
          onClose={() => setRemoving(null)}
          footer={
            <>
              <Btn onClick={() => setRemoving(null)}>Cancel</Btn>
              <Btn
                variant="primary"
                disabled={remove.isPending}
                onClick={() => remove.mutate(removing)}
              >
                {remove.isPending ? 'Deleting…' : 'Delete'}
              </Btn>
            </>
          }
        >
          <p>
            <b>{removing.name}</b> ({qty(removing.qty)} {removing.unit}) is removed from the
            Store Stock register. This cannot be undone.
          </p>
        </Modal>
      ) : null}
    </>
  );
}

function EntryModal({
  entry,
  categories,
  onClose,
}: {
  entry: StoreStockDto | null;
  categories: string[];
  onClose: () => void;
}) {
  const toast = useToast();
  const reference = useReference();
  const [form, setForm] = useState<Form>(entry ? formOf(entry) : EMPTY);
  const set = (key: keyof Form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [key]: e.target.value });

  const mainCategories = useMemo(
    () =>
      [...new Set([...reference.categories.map((c) => c.name), ...categories])].sort((a, b) =>
        a.localeCompare(b),
      ),
    [reference.categories, categories],
  );

  const save = useAction(
    () => {
      const { itemLabel: _label, ...rest } = form;
      const body = { ...rest, qty: Number(form.qty) || 0 };
      return entry
        ? put<StoreStockDto>(`/store-stock/${entry.id}`, { ...body, rv: entry.rv })
        : post<StoreStockDto>('/store-stock', body);
    },
    {
      success: (r) => (entry ? `${r.code} updated` : `${r.code} added`),
      invalidate: [['store-stock']],
      onDone: onClose,
    },
  );

  const submit = () => {
    if (!form.name.trim()) return toast('Enter the material name');
    if (form.qty.trim() && (!Number.isFinite(Number(form.qty)) || Number(form.qty) < 0)) {
      return toast('Quantity must be a number, 0 or more');
    }
    save.mutate(undefined);
  };

  return (
    <Modal
      wide
      title={entry ? `Edit ${entry.code}` : 'Add material to Store Stock'}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={save.isPending} onClick={submit}>
            {save.isPending ? 'Saving…' : entry ? 'Save changes' : 'Add material'}
          </Btn>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="field">
          Material name *
          <input autoFocus value={form.name} onChange={set('name')} maxLength={300} />
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="field flex-1 min-w-[180px]">
            Category
            <input list="ss-categories" value={form.category} onChange={set('category')} maxLength={120} />
            <datalist id="ss-categories">
              {mainCategories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="field flex-1 min-w-[180px]">
            Brand
            <input value={form.brand} onChange={set('brand')} maxLength={120} />
          </label>
        </div>
        <label className="field">
          Specification / size
          <input value={form.specification} onChange={set('specification')} maxLength={1000} />
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="field flex-1 min-w-[140px]">
            Quantity
            <input type="number" min={0} step="any" value={form.qty} onChange={set('qty')} />
          </label>
          <label className="field flex-1 min-w-[140px]">
            Unit
            <input list="ss-units" value={form.unit} onChange={set('unit')} maxLength={40} />
            <datalist id="ss-units">
              {unitsOf(reference).map((u) => (
                <option key={u.name} value={u.name} label={u.label} />
              ))}
            </datalist>
          </label>
          <label className="field flex-1 min-w-[180px]">
            Location in store
            <input
              placeholder="Rack / bin / room"
              value={form.location}
              onChange={set('location')}
              maxLength={200}
            />
          </label>
        </div>
        <label className="field">
          Remarks
          <input value={form.remarks} onChange={set('remarks')} maxLength={1000} />
        </label>
        <div className="field">
          <span>Item master item</span>
          {form.itemId && form.itemLabel ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm">
                <span className="font-mono">{form.itemLabel}</span>
              </span>
              <Btn small onClick={() => setForm({ ...form, itemId: '', itemLabel: '' })}>
                Change
              </Btn>
            </div>
          ) : (
            <ItemSearchSelect
              ariaLabel="Item master item"
              value={form.itemId}
              placeholder="Type the item name or code to link it"
              onChange={(itemId, item) =>
                setForm({
                  ...form,
                  itemId,
                  itemLabel: item ? `${item.code} · ${item.name}` : '',
                  // a new entry takes the item's wording where nothing is typed yet
                  name: form.name || item?.name || '',
                  unit: form.unit || item?.unit || '',
                  category: form.category || item?.category || '',
                })
              }
            />
          )}
          <span className="text-mut text-xs">
            Linked, it shows as available on MRs and comes off this register when the store
            issues it. Not linked, it stays a note in the register only.
          </span>
        </div>
      </div>
    </Modal>
  );
}
