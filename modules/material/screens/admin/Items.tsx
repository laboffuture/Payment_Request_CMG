'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UNITS, UNIT_NAMES, type ItemDto, type Unit } from '@cm/shared';
import { del, get, post, put } from '@mm/lib/api';
import { Modal } from '@mm/components/Modal';
import { useAction } from '@mm/lib/hooks';
import { DataTable, type Column } from '@mm/components/DataTable';
import { Btn, Card, PageHeader } from '@mm/components/ui';
import { useToast } from '@mm/components/Toast';
import { subCategoriesOf, useReference, type Reference } from '@mm/lib/reference';
import { money } from '@mm/lib/format';

/**
 * Prototype: VIEWS.items, A.addMaster.
 * New items approved by QS land here; bulk loading is the import page.
 */
interface ItemsResponse {
  items: ItemDto[];
  pendingNewItems: number;
}

const ITEM_KEYS = [['admin', 'items'], ['inventory'], ['items']];

/** Corrects an item. The code is shown but not changed: documents know the item by it. */
function EditItem({
  item,
  reference,
  onClose,
}: {
  item: ItemDto;
  reference: Reference;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: item.name,
    unit: item.unit,
    category: item.category,
    subCategory: item.subCategory,
    brand: item.brand,
    packing: item.packing,
    hsn: item.hsn,
    gstRate: item.gstRate == null ? '' : String(item.gstRate),
    lastRate: item.lastRate ? String(item.lastRate) : '',
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  // An item may carry a category or sub-category that is no longer in the list; keep it selectable.
  const categories = [...new Set([item.category, ...reference.categories.map((c) => c.name)])];
  const subCategories = [
    ...new Set([
      ...(form.category === item.category && item.subCategory ? [item.subCategory] : []),
      ...subCategoriesOf(reference, form.category),
    ]),
  ];

  const save = useAction(
    () =>
      put<ItemDto>(`/admin/items/${item.id}`, {
        name: form.name,
        unit: form.unit,
        category: form.category,
        subCategory: form.subCategory,
        spec: item.spec,
        brand: form.brand,
        packing: form.packing,
        hsn: form.hsn,
        gstRate: form.gstRate === '' ? null : Number(form.gstRate),
        ...(form.lastRate === '' ? {} : { lastRate: Number(form.lastRate) }),
      }),
    { success: (i) => `${i.code} saved`, invalidate: ITEM_KEYS, onDone: onClose },
  );

  return (
    <Modal
      title={`Edit ${item.code}`}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn
            variant="primary"
            disabled={save.isPending || !form.name.trim()}
            onClick={() => save.mutate(undefined)}
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </Btn>
        </>
      }
    >
      <div className="grid gap-3 desk:grid-cols-2">
        <label className="field desk:col-span-2">
          Item name *
          <input value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="field">
          Unit
          <select value={form.unit} onChange={(e) => set({ unit: e.target.value as Unit })}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_NAMES[u]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Category
          <select
            value={form.category}
            onChange={(e) => set({ category: e.target.value, subCategory: '' })}
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Sub-category
          <select value={form.subCategory} onChange={(e) => set({ subCategory: e.target.value })}>
            <option value="">—</option>
            {subCategories.map((sub) => (
              <option key={sub}>{sub}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Brand
          <input value={form.brand} onChange={(e) => set({ brand: e.target.value })} />
        </label>
        <label className="field">
          Packing
          <input value={form.packing} onChange={(e) => set({ packing: e.target.value })} />
        </label>
        <label className="field">
          HSN
          <input value={form.hsn} onChange={(e) => set({ hsn: e.target.value })} />
        </label>
        <label className="field">
          GST %
          <input
            type="number"
            min={0}
            max={100}
            step="any"
            value={form.gstRate}
            onChange={(e) => set({ gstRate: e.target.value })}
          />
        </label>
        <label className="field">
          Last rate
          <input
            type="number"
            min={0}
            step="any"
            value={form.lastRate}
            onChange={(e) => set({ lastRate: e.target.value })}
          />
        </label>
      </div>
    </Modal>
  );
}

/** Asks before removing an item. The server refuses one that a document already uses. */
function DeleteItem({ item, onClose }: { item: ItemDto; onClose: () => void }) {
  const remove = useAction(() => del<{ code: string }>(`/admin/items/${item.id}`), {
    success: (r) => `${r.code} deleted`,
    invalidate: ITEM_KEYS,
    onDone: onClose,
  });

  return (
    <Modal
      title={`Delete ${item.code}?`}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={remove.isPending} onClick={() => remove.mutate(undefined)}>
            {remove.isPending ? 'Deleting…' : 'Delete item'}
          </Btn>
        </>
      }
    >
      <p>
        <b>{item.name}</b> is removed from the item master and from the list site engineers
        pick from. This cannot be undone.
      </p>
      <p className="text-mut text-sm">
        An item already used on an MR, an enquiry, a PO or in stock cannot be deleted — edit
        it instead.
      </p>
    </Modal>
  );
}

export default function ItemsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const reference = useReference();
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ItemDto | null>(null);
  const [deleting, setDeleting] = useState<ItemDto | null>(null);

  const firstCategory = reference.categories[0]?.name ?? '';
  const [form, setForm] = useState({
    name: '',
    unit: 'Nos' as Unit,
    category: '',
    subCategory: '',
    lastRate: '',
  });

  const activeCategory = form.category || firstCategory;

  const data = useQuery({
    queryKey: ['admin', 'items', category],
    queryFn: () =>
      get<ItemsResponse>(`/admin/items${category ? `?category=${encodeURIComponent(category)}` : ''}`),
  });

  const add = useMutation({
    mutationFn: () =>
      post<ItemDto>('/admin/items', {
        name: form.name,
        unit: form.unit,
        category: activeCategory,
        subCategory: form.subCategory,
        lastRate: form.lastRate ? Number(form.lastRate) : undefined,
      }),
    onSuccess: (item) => {
      toast(`${item.code} added`);
      setForm((f) => ({ ...f, name: '', lastRate: '' }));
      void queryClient.invalidateQueries({ queryKey: ['admin', 'items'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Could not add'),
  });

  // Every word typed must appear somewhere in the item: "cement 53" finds "OPC 53 Grade Cement".
  const shown = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    const items = data.data?.items ?? [];
    if (!words.length) return items;
    return items.filter((i) => {
      const text = [i.code, i.name, i.brand, i.packing, i.category, i.subCategory, i.hsn]
        .join(' ')
        .toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [data.data, search]);

  const columns: Column<ItemDto>[] = [
    { key: 'code', header: 'Code', render: (i) => <span className="font-mono">{i.code}</span> },
    {
      key: 'name',
      header: 'Item',
      render: (i) => (
        <>
          <b>{i.name}</b>
          {i.brand || i.packing ? (
            <div className="text-mut text-xs">{[i.brand, i.packing].filter(Boolean).join(' · ')}</div>
          ) : null}
        </>
      ),
    },
    { key: 'unit', header: 'Unit', render: (i) => i.unit },
    { key: 'category', header: 'Category', render: (i) => i.category },
    { key: 'sub', header: 'Sub-category', render: (i) => i.subCategory || '—' },
    { key: 'hsn', header: 'HSN', render: (i) => <span className="font-mono">{i.hsn || '—'}</span> },
    {
      key: 'gst',
      header: 'GST %',
      align: 'right',
      render: (i) => (i.gstRate == null ? '—' : `${i.gstRate}%`),
    },
    {
      key: 'lastRate',
      header: 'Last rate',
      align: 'right',
      render: (i) => (i.lastRate ? money(i.lastRate) : '—'),
    },
    { key: 'lastVendor', header: 'Last vendor', render: (i) => i.lastVendorName ?? '—' },
    {
      key: 'actions',
      header: 'Actions',
      render: (i) => (
        <span className="inline-flex gap-2 whitespace-nowrap">
          <Btn onClick={() => setEditing(i)}>Edit</Btn>
          <Btn onClick={() => setDeleting(i)}>
            <span className="text-[#b42318]">Delete</span>
          </Btn>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Item master"
        subtitle="New items approved by QS land here. Bulk load with Import inventory."
        actions={
          <>
            <input
              type="search"
              aria-label="Search items"
              placeholder="Search item name or code"
              className="min-w-[220px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
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
          </>
        }
      />

      {data.data?.pendingNewItems ? (
        <div className="warn mb-3">
          {data.data.pendingNewItems} new item request(s) waiting for QS.
        </div>
      ) : null}

      <Card className="mb-3">
        <div className="flex flex-wrap items-end gap-[10px]">
          <input
            aria-label="Item name"
            placeholder="Item name"
            className="flex-[2] min-w-[180px]"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <select
            aria-label="Unit"
            value={form.unit}
            onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value as Unit }))}
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_NAMES[u]}
              </option>
            ))}
          </select>
          <select
            aria-label="Category"
            value={activeCategory}
            onChange={(e) =>
              setForm((f) => ({ ...f, category: e.target.value, subCategory: '' }))
            }
          >
            {reference.categories.map((c) => (
              <option key={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            aria-label="Sub-category"
            value={form.subCategory}
            onChange={(e) => setForm((f) => ({ ...f, subCategory: e.target.value }))}
          >
            <option value="">Sub-category</option>
            {subCategoriesOf(reference, activeCategory).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <input
            aria-label="Last rate"
            type="number"
            min={0}
            step="any"
            placeholder="Last rate"
            className="w-[110px]"
            value={form.lastRate}
            onChange={(e) => setForm((f) => ({ ...f, lastRate: e.target.value }))}
          />
          <Btn variant="primary" disabled={add.isPending} onClick={() => add.mutate()}>
            Add item
          </Btn>
        </div>
      </Card>

      {data.isLoading ? (
        <div className="text-mut">Loading…</div>
      ) : (
        <>
          {search.trim() ? (
            <div className="text-mut text-xs mb-2">
              {shown.length} of {data.data?.items.length ?? 0} items match
            </div>
          ) : null}
          <DataTable
            columns={columns}
            rows={shown}
            rowKey={(i) => i.id}
            emptyText={
              search.trim()
                ? 'No item matches that search.'
                : 'No items yet — add one above or use Import inventory.'
            }
          />
        </>
      )}

      {editing ? (
        <EditItem item={editing} reference={reference} onClose={() => setEditing(null)} />
      ) : null}
      {deleting ? <DeleteItem item={deleting} onClose={() => setDeleting(null)} /> : null}
    </>
  );
}
