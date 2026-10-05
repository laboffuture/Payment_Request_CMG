'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CURRENCIES,
  CURRENCY_LABELS,
  MAX_LOGO_BYTES,
  MSG,
  TAX_MODES,
  TAX_MODE_LABELS,
  type CompanyDto,
  type TaxMode,
} from '@cm/shared';
import { del, get, post, put, upload } from '@mm/lib/api';
import { Btn, Card, PageHeader, Stack } from '@mm/components/ui';
import { useToast } from '@mm/components/Toast';

/**
 * Prototype: VIEWS.company, A.saveCompany, A.newCompany, A.rmLogo.
 * One profile per billing entity — the selected one is what prints on a PO.
 */
const blank = (): Omit<CompanyDto, 'id' | 'rv' | 'createdAt' | 'updatedAt' | 'logoUrl'> => ({
  name: 'New company',
  legalName: '',
  address: '',
  taxLabel: 'TRN',
  taxNo: '',
  phone: '',
  email: '',
  currency: 'AED',
  taxMode: 'VAT',
  defaultTax: 5,
  poTerms: '',
  isDefault: false,
});

export default function CompanyPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const companies = useQuery({
    queryKey: ['admin', 'companies'],
    queryFn: () => get<CompanyDto[]>('/admin/companies'),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(blank());

  const selected =
    companies.data?.find((c) => c.id === selectedId) ?? companies.data?.[0] ?? null;

  useEffect(() => {
    if (!selected) return;
    setSelectedId(selected.id);
    const { id, rv, createdAt, updatedAt, logoUrl, ...rest } = selected;
    setForm(rest);
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'companies'] });
    void queryClient.invalidateQueries({ queryKey: ['reference'] });
  };

  const save = useMutation({
    mutationFn: () =>
      selected
        ? put<CompanyDto>(`/admin/companies/${selected.id}`, form)
        : post<CompanyDto>('/admin/companies', form),
    onSuccess: (company) => {
      toast('Company saved — it prints on POs');
      setSelectedId(company.id);
      invalidate();
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Could not save'),
  });

  const addCompany = useMutation({
    mutationFn: () => post<CompanyDto>('/admin/companies', blank()),
    onSuccess: (company) => {
      setSelectedId(company.id);
      invalidate();
    },
  });

  const uploadLogo = useMutation({
    mutationFn: (file: File) => {
      if (file.size > MAX_LOGO_BYTES) throw new Error(MSG.logoTooLarge);
      const body = new FormData();
      body.append('logo', file);
      return upload<CompanyDto>(`/admin/companies/${selected!.id}/logo`, body);
    },
    onSuccess: () => {
      toast('Logo updated');
      invalidate();
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Could not upload'),
  });

  const removeLogo = useMutation({
    mutationFn: () => del<CompanyDto>(`/admin/companies/${selected!.id}/logo`),
    onSuccess: invalidate,
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <>
      <PageHeader
        title="Company & PO print"
        subtitle="Name, logo, address and tax number printed on every PO. Add one profile per billing entity."
        actions={
          <>
            <select
              aria-label="Company"
              value={selected?.id ?? ''}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {(companies.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.isDefault ? ' (default)' : ''}
                </option>
              ))}
            </select>
            <Btn onClick={() => addCompany.mutate()}>+ Add company</Btn>
          </>
        }
      />

      <Card className="max-w-[760px]">
        <Stack>
          <div className="grid gap-3 desk:grid-cols-2">
            <label className="field">
              Short name *
              <input value={form.name} onChange={(e) => set('name', e.target.value)} />
            </label>
            <label className="field">
              Legal name (on PO)
              <input value={form.legalName} onChange={(e) => set('legalName', e.target.value)} />
            </label>
            <label className="field">
              Tax label
              <input
                placeholder="TRN / GSTIN"
                value={form.taxLabel}
                onChange={(e) => set('taxLabel', e.target.value)}
              />
            </label>
            <label className="field">
              Tax number
              <input value={form.taxNo} onChange={(e) => set('taxNo', e.target.value)} />
            </label>
            <label className="field">
              Phone
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </label>
            <label className="field">
              Email
              <input value={form.email} onChange={(e) => set('email', e.target.value)} />
            </label>
            <label className="field">
              Currency
              <select
                value={form.currency}
                onChange={(e) => set('currency', e.target.value)}
              >
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {CURRENCY_LABELS[code]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Default tax type
              <select
                value={form.taxMode}
                onChange={(e) => set('taxMode', e.target.value as TaxMode)}
              >
                {TAX_MODES.map((m) => (
                  <option key={m} value={m}>
                    {TAX_MODE_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Default tax %
              <input
                type="number"
                min={0}
                step="any"
                value={form.defaultTax}
                onChange={(e) => set('defaultTax', Number(e.target.value))}
              />
            </label>
          </div>

          <label className="field">
            Address
            <textarea rows={3} value={form.address} onChange={(e) => set('address', e.target.value)} />
          </label>

          <label className="field">
            PO terms & conditions
            <textarea rows={4} value={form.poTerms} onChange={(e) => set('poTerms', e.target.value)} />
          </label>

          <div className="flex flex-wrap items-end gap-[10px]">
            {selected?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selected.logoUrl}
                alt="Company logo"
                className="max-h-16 max-w-[200px] object-contain"
              />
            ) : (
              <span className="text-mut text-sm">No logo</span>
            )}
            <label className="field">
              Logo (PNG/JPG, max 300 KB)
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={!selected}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadLogo.mutate(file);
                  if (fileInput.current) fileInput.current.value = '';
                }}
              />
            </label>
            {selected?.logoUrl ? (
              <Btn variant="danger" small onClick={() => removeLogo.mutate()}>
                Remove logo
              </Btn>
            ) : null}
          </div>

          <label className="inline-flex items-center gap-[6px]">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => set('isDefault', e.target.checked)}
            />
            Default company for new POs
          </label>

          <div className="flex justify-end">
            <Btn variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
              Save company
            </Btn>
          </div>
        </Stack>
      </Card>
    </>
  );
}
