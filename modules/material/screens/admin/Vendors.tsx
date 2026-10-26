'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { VendorDto } from '@cm/shared';
import VendorMaster, { type KeptVendor } from '@/app/VendorMaster';
import { get, post, put } from '@mm/lib/api';
import { useSession } from '@mm/lib/session';
import { Btn } from '@mm/components/ui';
import { Modal } from '@mm/components/Modal';
import { useToast } from '@mm/components/Toast';

/**
 * Prototype: VIEWS.vendors, vendorModalHtml(), A.saveVendor.
 * One list: the Vendor Master's register, and beside it the suppliers kept from before
 * it (still in use for POs, marked Existing). Procurement opens one of those to register
 * it - the form starts from what is known here - and takes it through the same flow; once
 * approved it replaces the old entry and keeps its vendor no. Until then the administrator
 * can still correct a kept supplier, and makes portal logins under Users & access.
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

  // The Vendor Master's own vendors come across as PAYMENT_APP; the rest are the kept ones.
  const kept = useMemo<KeptVendor[]>(
    () =>
      (vendors.data ?? [])
        .filter((v) => v.source === 'LOCAL')
        .map((v) => ({
          id: v.id,
          code: v.code ?? '',
          name: v.name,
          category: v.category ?? '',
          contactPerson: v.contactPerson ?? '',
          phone: v.phone ?? '',
          email: v.email ?? '',
          taxNo: v.taxNo ?? '',
          city: v.city ?? '',
          country: v.country ?? '',
          address: v.address ?? '',
        })),
    [vendors.data],
  );
  const byId = useMemo(() => new Map((vendors.data ?? []).map((v) => [v.id, v])), [vendors.data]);

  return (
    <>
      <VendorMaster
        embedded
        kept={kept}
        keptActions={
          isAdmin
            ? (k) => {
                const v = byId.get(k.id);
                return (
                  <span className="flex gap-[6px]">
                    <Btn small title="Create a portal login for this vendor" onClick={() => openUsersAndAccess()}>
                      + Login
                    </Btn>
                    {v ? (
                      <Btn small onClick={() => setEditing(v)}>
                        Edit as it is
                      </Btn>
                    ) : null}
                  </span>
                );
              }
            : undefined
        }
        flash={(msg) => {
          toast(msg);
          void refresh();
        }}
      />

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
