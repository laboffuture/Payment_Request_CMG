'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CategoryDto } from '@cm/shared';
import { get, post } from '@mm/lib/api';
import { DataTable, type Column } from '@mm/components/DataTable';
import { Btn, Card, Chip, PageHeader } from '@mm/components/ui';
import { useToast } from '@mm/components/Toast';

/**
 * Prototype: VIEWS.cats, A.addCat, A.toggleCat.
 * Categories are deactivated rather than deleted, so items and old reports keep
 * their classification.
 */
export default function CategoriesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');

  const categories = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: () => get<CategoryDto[]>('/admin/categories'),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
    void queryClient.invalidateQueries({ queryKey: ['reference'] });
  };

  const add = useMutation({
    mutationFn: () => post<CategoryDto[]>('/admin/categories', { name, parentId }),
    onSuccess: () => {
      toast('Category added');
      setName('');
      invalidate();
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Could not add'),
  });

  const toggle = useMutation({
    mutationFn: (id: string) => post<CategoryDto[]>(`/admin/categories/${id}/toggle`),
    onSuccess: invalidate,
  });

  const columns: Column<CategoryDto>[] = [
    {
      key: 'name',
      header: 'Category',
      render: (c) => (
        <span className="flex items-center gap-2">
          <b>{c.name}</b>
          {!c.active ? <Chip spec={{ label: 'Inactive', tone: 'gry' }} /> : null}
        </span>
      ),
    },
    {
      key: 'children',
      header: 'Sub-categories',
      render: (c) =>
        c.children?.length
          ? c.children.map((s) => s.name + (s.active ? '' : ' (inactive)')).join(', ')
          : '—',
    },
    { key: 'items', header: 'Items', align: 'right', render: (c) => c.itemCount ?? 0 },
    {
      key: 'toggle',
      header: '',
      render: (c) => (
        <Btn small onClick={() => toggle.mutate(c.id)}>
          {c.active ? 'Deactivate' : 'Activate'}
        </Btn>
      ),
    },
  ];

  const mains = categories.data ?? [];

  return (
    <>
      <PageHeader
        title="Categories"
        subtitle="Main categories (e.g. MEP, Civil, Finishes) and sub-categories (e.g. Electrical, Plumbing under MEP). Used for items, import and reports."
      />

      <Card className="mb-3">
        <div className="flex flex-wrap items-end gap-[10px]">
          <input
            aria-label="Category name"
            placeholder="Category name"
            className="flex-1 min-w-[160px]"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            aria-label="Parent category"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            <option value="">— Main category —</option>
            {mains.map((c) => (
              <option key={c.id} value={c.id}>
                Sub-category of {c.name}
              </option>
            ))}
          </select>
          <Btn variant="primary" disabled={add.isPending} onClick={() => add.mutate()}>
            Add
          </Btn>
        </div>
      </Card>

      {categories.isLoading ? (
        <div className="text-mut">Loading…</div>
      ) : (
        <DataTable
          columns={columns}
          rows={mains}
          rowKey={(c) => c.id}
          emptyText="No categories yet"
        />
      )}
    </>
  );
}
