'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UNITS, UNIT_NAMES, type ItemDto, type Unit } from '@cm/shared';
import { get, post } from '@mm/lib/api';
import { DataTable, type Column } from '@mm/components/DataTable';
import { Btn, Card, PageHeader } from '@mm/components/ui';
import { useToast } from '@mm/components/Toast';
import { subCategoriesOf, useReference } from '@mm/lib/reference';
import { money } from '@mm/lib/format';

/**
 * Prototype: VIEWS.items, A.addMaster.
 * New items approved by QS land here; bulk loading is the import page.
 */
interface ItemsResponse {
  items: ItemDto[];
  pendingNewItems: number;
}

export default function ItemsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const reference = useReference();
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');

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
    </>
  );
}
