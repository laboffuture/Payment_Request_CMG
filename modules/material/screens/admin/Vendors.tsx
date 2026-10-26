'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { VendorDto } from '@cm/shared';
import VendorMaster from '@/app/VendorMaster';
import { get, post, put } from '@mm/lib/api';
import { useSession } from '@mm/lib/session';
import { DataTable, type Column } from '@mm/components/DataTable';
import { Btn, PageHeader } from '@mm/components/ui';
import { Modal } from '@mm/components/Modal';
import { useToast } from '@mm/components/Toast';

/**
 * Prototype: VIEWS.vendors, vendorModalHtml(), A.saveVendor.
 * New vendors are registered and approved in the Vendor Master shown on top; once
 * Active they join the list below. The vendors kept from before stay as they are,
 * and only those can still be corrected here (by the administrator).
 */
/** Logins belong to the application's own Users & access screen. */
const openUsersAndAccess = () =>
  window.dispatchEvent(new CustomEvent('cmg:open-module', { detail: 'users' }));

export default function VendorsPage() {
  const { me } = useSession();
  const isAdmin = me.role === 'ADMIN';
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<VendorDto | null>(null);

  const vendors = useQuery({
    queryKey: ['admin', 'vendors'],
    queryFn: () => get<VendorDto[]>('/admin/vendors'),
  });

  // Pull the Vendor Master on opening, and after every step taken in it, so a vendor
  // approved a moment ago is offered for POs without waiting for the 15-minute sync.
  const refresh = () =>
    post('/admin/vendors/sync', {})
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ['admin', 'vendors'] });
        void queryClient.invalidateQueries({ queryKey: ['reference'] });
      })
      .catch(() => undefined);
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Every word typed must appear somewhere on the vendor: "plywood coimbatore" narrows to
  // the plywood suppliers there.
  const [search, setSearch] = useState('');
  const shown = useMemo(() => {
    const all = vendors.data ?? [];
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return all;
    return all.filter((v) => {
      const text = [v.code, v.name, v.category, v.contactPerson, v.phone, v.email, v.taxNo, v.city, v.address]
        .join(' ')
        .toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [vendors.data, search]);

  const columns: Column<VendorDto>[] = [
    { key: 'code', header: 'Vendor No', render: (v) => <span className="font-mono">{v.code || '—'}</span> },
    {
      key: 'name',
      header: 'Vendor',
      render: (v) => (
        <span>
          <b>{v.name}</b>
          {v.category ? <span className="block text-mut text-xs">{v.category}</span> : null}
        </span>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (v) =>
        v.contactPerson || v.phone ? (
          <span>
            {v.contactPerson || '—'}
            {v.phone ? <span className="block text-mut text-xs whitespace-nowrap">{v.phone}</span> : null}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'email',
      header: 'Email',
      render: (v) => <span style={{ overflowWrap: 'anywhere' }}>{v.email || '—'}</span>,
    },
    {
      key: 'taxNo',
      header: 'GSTIN',
      render: (v) => <span className="font-mono whitespace-nowrap">{v.taxNo || '—'}</span>,
    },
    {
      key: 'city',
      header: 'Location',
      render: (v) => <span title={v.address || undefined}>{v.city || v.country || '—'}</span>,
    },
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
      // Logins and corrections are the administrator's.
      render: (v) =>
        isAdmin ? (
          <div className="flex gap-[6px] justify-end">
            <Btn small title="Create a portal login for this vendor" onClick={() => openUsersAndAccess()}>
              + Login
            </Btn>
            {v.source === 'LOCAL' ? (
              <Btn small onClick={() => setEditing(v)}>
                Edit
              </Btn>
            ) : null}
          </div>
        ) : null,
    },
  ];

  return (
    <>
      <VendorMaster
        embedded
        flash={(msg) => {
          toast(msg);
          void refresh();
        }}
      />

      <section className="vm-kept">
        <PageHeader
          title="Vendor list"
          subtitle="Suppliers who receive enquiries and POs: every Active vendor from the Vendor Master above, and the vendors kept from before. A vendor's portal login is made under Users & access, with the Vendor role and this supplier."
          actions={
            <input
              type="search"
              aria-label="Search vendors"
              placeholder="Search name, category, city or GSTIN"
              className="min-w-[250px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          }
        />

        {vendors.isLoading ? (
          <div className="text-mut">Loading…</div>
        ) : (
          <DataTable
            columns={columns}
            rows={shown}
            rowKey={(v) => v.id}
            emptyText={search.trim() ? 'No vendor matches the search' : 'No vendors yet'}
          />
        )}
      </section>

      {editing ? <VendorModal vendor={editing} onClose={() => setEditing(null)} /> : null}

    </>
  );
}

function VendorModal({
  vendor,
  onClose,
}: {
  vendor: VendorDto;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: vendor.name ?? '',
    country: vendor.country ?? '',
    email: vendor.email ?? '',
    phone: vendor.phone ?? '',
    taxNo: vendor.taxNo ?? '',
    address: vendor.address ?? '',
    contactPerson: vendor.contactPerson ?? '',
    category: vendor.category ?? '',
    city: vendor.city ?? '',
  });

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = useMutation({
    mutationFn: () => put<VendorDto>(`/admin/vendors/${vendor.id}`, form),
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
      title="Edit vendor"
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
      <div className="grid gap-3 desk:grid-cols-[1fr_2fr_1fr]">
        <label className="field">
          Vendor No
          <input
            value={vendor.code || '—'}
            readOnly
            disabled
            title="Vendor numbers are system-generated"
          />
        </label>
        <label className="field">
          Vendor name *
          <input value={form.name} onChange={set('name')} />
        </label>
        <label className="field">
          Country
          <input value={form.country} onChange={set('country')} />
        </label>
      </div>
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
          GST No
          <input value={form.taxNo} onChange={set('taxNo')} />
        </label>
      </div>
      <div className="grid gap-3 desk:grid-cols-3">
        <label className="field">
          Category
          <input
            placeholder="Plywood, Electrical Material…"
            value={form.category}
            onChange={set('category')}
          />
        </label>
        <label className="field">
          Contact person
          <input value={form.contactPerson} onChange={set('contactPerson')} />
        </label>
        <label className="field">
          Location (city)
          <input value={form.city} onChange={set('city')} />
        </label>
      </div>
      <label className="field">
        Address
        <textarea rows={2} value={form.address} onChange={set('address')} />
      </label>
    </Modal>
  );
}
