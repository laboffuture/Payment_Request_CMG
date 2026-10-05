'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { VendorDto } from '@cm/shared';
import { get, post, put } from '@mm/lib/api';
import { DataTable, type Column } from '@mm/components/DataTable';
import { Btn, PageHeader } from '@mm/components/ui';
import { Modal } from '@mm/components/Modal';
import { useToast } from '@mm/components/Toast';

/**
 * Prototype: VIEWS.vendors, vendorModalHtml(), A.saveVendor.
 * Payment-app vendors are read-only here (§10) — only the portal-login button
 * is offered for them.
 */
/** Logins belong to the application's own Users & access screen. */
const openUsersAndAccess = () =>
  window.dispatchEvent(new CustomEvent('cmg:open-module', { detail: 'users' }));

export default function VendorsPage() {
  const [editing, setEditing] = useState<VendorDto | null>(null);
  const [adding, setAdding] = useState(false);

  const vendors = useQuery({
    queryKey: ['admin', 'vendors'],
    queryFn: () => get<VendorDto[]>('/admin/vendors'),
  });

  const columns: Column<VendorDto>[] = [
    { key: 'name', header: 'Vendor', render: (v) => <b>{v.name}</b> },
    { key: 'email', header: 'Email', render: (v) => v.email || '—' },
    { key: 'phone', header: 'Phone', render: (v) => v.phone || '—' },
    { key: 'taxNo', header: 'Tax no.', render: (v) => v.taxNo || '—' },
    { key: 'source', header: 'Source', render: (v) => v.sourceLabel },
    {
      key: 'logins',
      header: 'Portal logins',
      render: (v) =>
        v.portalLogins.length ? (
          <span className="font-mono">{v.portalLogins.join(', ')}</span>
        ) : (
          'None'
        ),
    },
    {
      key: 'actions',
      header: '',
      render: (v) => (
        <div className="flex gap-[10px]">
          <Btn small onClick={() => openUsersAndAccess()}>
            + Portal login
          </Btn>
          {v.source === 'LOCAL' ? (
            <Btn small onClick={() => setEditing(v)}>
              Edit
            </Btn>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Vendors"
        subtitle="Suppliers who receive enquiries and POs. A vendor's portal login is made under Users & access, with the Vendor role and this supplier."
        actions={
          <Btn variant="primary" onClick={() => setAdding(true)}>
            + Add vendor
          </Btn>
        }
      />

      {vendors.isLoading ? (
        <div className="text-mut">Loading…</div>
      ) : (
        <DataTable
          columns={columns}
          rows={vendors.data ?? []}
          rowKey={(v) => v.id}
          emptyText="No vendors yet"
        />
      )}

      {editing || adding ? (
        <VendorModal
          vendor={editing}
          onClose={() => {
            setEditing(null);
            setAdding(false);
          }}
        />
      ) : null}

    </>
  );
}

function VendorModal({
  vendor,
  onClose,
}: {
  vendor: VendorDto | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: vendor?.name ?? '',
    email: vendor?.email ?? '',
    phone: vendor?.phone ?? '',
    taxNo: vendor?.taxNo ?? '',
    address: vendor?.address ?? '',
  });

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = useMutation({
    mutationFn: () =>
      vendor
        ? put<VendorDto>(`/admin/vendors/${vendor.id}`, form)
        : post<VendorDto>('/admin/vendors', form),
    onSuccess: () => {
      toast('Vendor saved');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'vendors'] });
      void queryClient.invalidateQueries({ queryKey: ['reference'] });
      onClose();
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Could not save'),
  });

  return (
    <Modal
      title={vendor ? 'Edit vendor' : 'Add vendor'}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
            Save vendor
          </Btn>
        </>
      }
    >
      <label className="field">
        Vendor name *
        <input value={form.name} onChange={set('name')} />
      </label>
      <div className="grid gap-3 desk:grid-cols-3">
        <label className="field">
          Email
          <input type="email" value={form.email} onChange={set('email')} />
        </label>
        <label className="field">
          Phone
          <input value={form.phone} onChange={set('phone')} />
        </label>
        <label className="field">
          TRN / GSTIN
          <input value={form.taxNo} onChange={set('taxNo')} />
        </label>
      </div>
      <label className="field">
        Address
        <textarea rows={2} value={form.address} onChange={set('address')} />
      </label>
    </Modal>
  );
}
