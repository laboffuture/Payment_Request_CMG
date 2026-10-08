'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '@mm/lib/nav';
import { useQuery } from '@tanstack/react-query';
import {
  CURRENCIES,
  CURRENCY_LABELS,
  DEFAULT_CURRENCY,
  DEFAULT_PAYMENT_TERMS,
  MSG,
  PO_DIRECT_REASONS,
  TAX_MODES,
  TAX_MODE_LABELS,
  TAX_RATES,
  type Currency,
  type PoDetailDto,
  type PoRecommendationsDto,
  type PoolRowDto,
  type TaxMode,
  type VendorSuggestionDto,
} from '@cm/shared';
import { get, newIdempotencyKey, post, put } from '@mm/lib/api';
import { Btn, Card, EmptyState, PageHeader, Stack, Stepper, StickyActionBar, Tag } from '@mm/components/ui';
import { useToast } from '@mm/components/Toast';
import { useAction } from '@mm/lib/hooks';
import { useReference } from '@mm/lib/reference';
import { addDays, fmtDate, money, qty } from '@mm/lib/format';
import { draftTotals, groupRows, usePoDraft, type PoDraftRow } from './draft';
import { PoDocument } from './PoDocument';

/**
 * The three-step purchase order wizard.
 * Prototype origin: VIEWS.poform, poStep1/2/3, A.poStep, A.savePO, poToForm().
 *
 * Step 1 picks MR items from the open pool, step 2 sets the vendor and one
 * rate per item, step 3 previews the printable PO before submitting.
 */
const STEPS = ['Pick MR items', 'Vendor & prices', 'Review & submit'] as const;

/** The wizard's header form. */
interface PoFormState {
  vendorId: string;
  currency: Currency;
  companyId: string;
  deliverTo: 'STORE' | 'SITE';
  deliveryDate: string;
  deliveryAddress: string;
  billingAddress: string;
  terms: string;
  notes: string;
  taxMode: TaxMode;
  reason: string;
  revisionReason: string;
}

export function PoWizard({
  existing,
  revise = false,
}: {
  existing?: PoDetailDto;
  revise?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const reference = useReference();
  const { rows, setRows, addRow, removeRow, patchRow, patchItem, clear } = usePoDraft();

  const [step, setStep] = useState(1);
  const defaultCompany =
    reference.companies.find((c) => c.isDefault) ?? reference.companies[0];

  const [form, setForm] = useState<PoFormState>({
    vendorId: existing?.vendorId ?? '',
    currency: existing?.currency ?? DEFAULT_CURRENCY,
    companyId: existing?.companyId ?? defaultCompany?.id ?? '',
    deliverTo: existing?.deliverTo ?? ('STORE' as 'STORE' | 'SITE'),
    deliveryDate: existing?.deliveryDate || addDays(7),
    deliveryAddress: existing?.deliveryAddress ?? '',
    billingAddress: existing?.billingAddress ?? '',
    terms: existing?.terms || DEFAULT_PAYMENT_TERMS,
    notes: existing?.notes ?? '',
    taxMode: (existing?.taxMode ?? defaultCompany?.taxMode ?? 'VAT') as TaxMode,
    reason: existing?.reason || PO_DIRECT_REASONS[0],
    revisionReason: '',
  });

  // Loading an existing PO replaces whatever the pool put in the draft.
  const savedRows = useQuery({
    queryKey: ['po-rows', existing?.id],
    queryFn: () => get<PoDraftRow[]>(`/pos/${existing!.id}/rows`),
    enabled: !!existing,
  });

  useEffect(() => {
    if (savedRows.data) {
      setRows(
        savedRows.data.map((r) => ({ ...r, openQty: r.openQty ?? r.qty + r.received })),
      );
    }
  }, [savedRows.data, setRows]);

  useEffect(() => {
    if (!form.companyId && defaultCompany) {
      setForm((f) => ({ ...f, companyId: defaultCompany.id }));
    }
  }, [defaultCompany, form.companyId]);

  const totals = draftTotals(rows, form.taxMode);
  const grouped = groupRows(rows);
  const currency = form.currency;

  const payload = (submit: boolean) => ({
    vendorId: form.vendorId,
    currency: form.currency,
    companyId: form.companyId,
    deliverTo: form.deliverTo,
    deliveryDate: form.deliveryDate,
    deliveryAddress: form.deliveryAddress,
    billingAddress: form.billingAddress,
    terms: form.terms,
    notes: form.notes,
    taxMode: form.taxMode,
    reason: form.reason,
    submit,
    rv: existing?.rv,
    ...(revise ? { revisionReason: form.revisionReason } : {}),
    rows: rows.map((r) => ({
      mrLineId: r.mrLineId,
      qty: r.qty,
      rate: r.rate,
      gstPct: form.taxMode === 'NONE' ? 0 : r.gstPct,
      description: r.description ?? '',
    })),
  });

  const save = useAction(
    (submit: boolean) => {
      if (revise && existing) {
        return post<{ id: string; no: string }>(
          `/pos/${existing.id}/revise`,
          payload(submit),
          newIdempotencyKey(),
        );
      }
      if (existing) {
        return put<{ id: string; no: string }>(`/pos/${existing.id}`, payload(submit));
      }
      return post<{ id: string; no: string }>('/pos', payload(submit), newIdempotencyKey());
    },
    {
      invalidate: [['pos'], ['pool'], ['mrs']],
      onDone: (po) => {
        clear();
        router.push(`/pos/${po.id}`);
      },
      success: (po) =>
        `${po.no} ${revise ? 'revision sent for approval' : 'saved'}`,
    },
  );

  /** Prototype: A.poStep — each step validates before letting you move on. */
  const goToStep = (target: number) => {
    if (target > 1) {
      if (!rows.length) return toast(MSG.poNoLines);
      for (const row of rows) {
        if (row.qty <= 0) return toast(MSG.poQtyAboveZero(row.itemName));
        if (row.qty > row.openQty + 1e-9) {
          return toast(MSG.poOnlyOpenOnLine(row.itemName, qty(row.openQty)));
        }
        if (row.qty < row.received) {
          return toast(MSG.poBelowReceived(row.itemName, qty(row.received)));
        }
      }
    }
    if (target === 3) {
      if (!form.vendorId) return toast(MSG.poNoVendor);
      if (!form.companyId) return toast(MSG.poNoCompanyShort);
      for (const group of grouped) {
        if (!(group.rate > 0)) return toast(MSG.poRateRequired(group.itemName));
      }
      const projects = new Set(rows.map((r) => r.projectCode));
      if (form.deliverTo === 'SITE' && projects.size > 1) {
        return toast(MSG.poDirectOneProjectShort);
      }
    }
    setStep(target);
    window.scrollTo(0, 0);
  };

  const submit = (isSubmit: boolean) => {
    if (!rows.length) return toast(MSG.poNoLines);
    if (!form.vendorId) return toast(MSG.poNoVendor);
    if (!form.companyId) return toast(MSG.poNoCompany);
    if (revise && !form.revisionReason.trim()) return toast(MSG.poRevisionReason);
    save.mutate(isSubmit);
  };

  const mrCount = new Set(rows.map((r) => r.mrNo)).size;
  const projectCount = new Set(rows.map((r) => r.projectCode)).size;

  return (
    <>
      <PageHeader
        title={
          revise
            ? `Revise ${existing?.displayNo}`
            : existing
              ? `Edit ${existing.displayNo}`
              : 'Create purchase order'
        }
        subtitle={`${rows.length} line(s) · ${mrCount} MR(s) · ${projectCount} project(s)${
          form.vendorId
            ? ` · ${reference.vendors.find((v) => v.id === form.vendorId)?.name ?? ''}`
            : ''
        }`}
      />

      {existing?.status === 'REJECTED' && existing.lastComment ? (
        <div className="errb mb-3">
          <b>Rejected by Procurement Manager:</b> {existing.lastComment}
        </div>
      ) : null}

      <Stepper steps={STEPS} current={step} onStep={goToStep} />

      {step === 1 ? (
        <StepPickItems
          rows={rows}
          onAdd={addRow}
          onRemove={removeRow}
          onPatch={patchRow}
          onNext={() => goToStep(2)}
          onCancel={() => {
            clear();
            router.push(existing ? `/pos/${existing.id}` : '/pos');
          }}
          defaultTax={defaultCompany?.defaultTax ?? 5}
        />
      ) : null}

      {step === 2 ? (
        <StepVendorPrices
          form={form}
          setForm={setForm}
          grouped={grouped}
          rows={rows}
          onPatchItem={patchItem}
          totals={totals}
          currency={currency}
          locked={revise}
          onBack={() => setStep(1)}
          onNext={() => goToStep(3)}
        />
      ) : null}

      {step === 3 ? (
        <StepReview
          form={form}
          setForm={setForm}
          existing={existing}
          revise={revise}
          rows={rows}
          totals={totals}
          currency={currency}
          busy={save.isPending}
          onBack={() => setStep(2)}
          onSave={submit}
        />
      ) : null}
    </>
  );
}

/** Prototype: poStep1(f, p) — what is on the PO, and the open pool below it. */
function StepPickItems({
  rows,
  onAdd,
  onRemove,
  onPatch,
  onNext,
  onCancel,
  defaultTax,
}: {
  rows: PoDraftRow[];
  onAdd: (row: PoDraftRow) => void;
  onRemove: (mrLineId: string) => void;
  onPatch: (mrLineId: string, patch: Partial<PoDraftRow>) => void;
  onNext: () => void;
  onCancel: () => void;
  defaultTax: number;
}) {
  const reference = useReference();
  const [projectId, setProjectId] = useState('');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');

  const params = new URLSearchParams();
  if (projectId) params.set('projectId', projectId);
  if (category) params.set('category', category);

  const pool = useQuery({
    queryKey: ['pool', projectId, category],
    queryFn: () => get<PoolRowDto[]>(`/pool?${params}`),
  });

  const taken = new Set(rows.map((r) => r.mrLineId));
  const available = (pool.data ?? [])
    .filter((r) => !taken.has(r.mrLineId))
    .filter(
      (r) =>
        !search ||
        `${r.itemName} ${r.mrNo}`.toLowerCase().includes(search.toLowerCase()),
    );

  const byMr = new Map<string, PoolRowDto[]>();
  for (const row of available) {
    byMr.set(row.mrNo, [...(byMr.get(row.mrNo) ?? []), row]);
  }

  const toDraft = (r: PoolRowDto): PoDraftRow => ({
    mrLineId: r.mrLineId,
    itemId: r.itemId,
    itemCode: r.itemCode,
    itemName: r.itemName,
    mrDescription: r.mrDescription,
    unit: r.unit,
    projectCode: r.projectCode,
    mrNo: r.mrNo,
    qty: r.openQty,
    rate: r.lastRate ?? 0,
    // the item's own GST from the item master, else the company default
    gstPct: r.gstRate ?? defaultTax,
    received: 0,
    openQty: r.openQty,
  });

  return (
    <>
      <Card>
        <Stack>
          <div className="flex justify-between items-center gap-3 flex-wrap">
            <h2 className="m-0">On this PO ({rows.length})</h2>
          </div>

          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="t">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Project · MR</th>
                    <th className="text-right">Open qty</th>
                    <th>PO qty</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.mrLineId}>
                      <td data-label="Item">
                        <b>{row.itemName}</b>
                        {row.mrDescription ? (
                          <div className="text-mut text-xs">{row.mrDescription}</div>
                        ) : null}
                      </td>
                      <td data-label="Project · MR">
                        {row.projectCode} ·{' '}
                        <span className="font-mono text-xs">{row.mrNo}</span>
                      </td>
                      <td data-label="Open qty" className="desk:text-right">
                        {qty(row.openQty)} {row.unit}
                        {row.received ? (
                          <div className="text-mut text-xs">received {qty(row.received)}</div>
                        ) : null}
                      </td>
                      <td data-label="PO qty">
                        <div className="flex gap-[6px] flex-nowrap justify-end desk:justify-start">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            aria-label={`PO quantity for ${row.itemName}`}
                            className="w-24 font-semibold"
                            value={row.qty}
                            onChange={(e) =>
                              onPatch(row.mrLineId, { qty: Number(e.target.value) || 0 })
                            }
                          />
                          <Btn
                            small
                            onClick={() => onPatch(row.mrLineId, { qty: row.openQty })}
                          >
                            Full
                          </Btn>
                        </div>
                      </td>
                      <td data-label="">
                        <Btn
                          small
                          variant="danger"
                          disabled={!!row.received}
                          title={row.received ? 'Already received' : undefined}
                          onClick={() => onRemove(row.mrLineId)}
                        >
                          Remove
                        </Btn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-mut text-sm">
              Nothing yet — add items from the open MRs below. You can change any
              quantity for a part order.
            </div>
          )}
        </Stack>
      </Card>

      <h2>Open MR items (approved by QS for purchase)</h2>

      <div className="flex flex-wrap gap-[10px] mb-[10px]">
        <select
          aria-label="Project"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">All projects</option>
          {reference.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code}
            </option>
          ))}
        </select>
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
          className="flex-1 min-w-[180px]"
          placeholder="Search item or MR no."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {byMr.size ? (
        [...byMr.entries()].map(([mrNo, group]) => (
          <Card key={mrNo} className="mb-[10px]">
            <Stack>
              <div className="flex justify-between items-center gap-3 flex-wrap">
                <div>
                  <b className="font-mono">{mrNo}</b> · {group[0]!.projectCode}{' '}
                  <span className="text-mut">
                    · need by {fmtDate(group[0]!.requiredDate)}
                  </span>{' '}
                  {group[0]!.overdue ? <Tag label="OVERDUE" tone="red" /> : null}
                </div>
                <Btn
                  small
                  variant="primary"
                  onClick={() => group.forEach((r) => onAdd(toDraft(r)))}
                >
                  + Add all {group.length}
                </Btn>
              </div>

              {group.map((row) => (
                <div
                  key={row.mrLineId}
                  className="flex justify-between items-center gap-3 border-t border-line2 pt-2 flex-wrap"
                >
                  <div>
                    <b>{row.itemName}</b>{' '}
                    <span className="text-mut">{row.category}</span>
                    {row.mrDescription ? (
                      <div className="text-[13px]">{row.mrDescription}</div>
                    ) : null}
                    <div className="text-mut text-[13px]">
                      Open {qty(row.openQty)} {row.unit}
                      {row.lastRate ? ` · last rate ${money(row.lastRate)}` : ''}
                    </div>
                  </div>
                  <Btn small onClick={() => onAdd(toDraft(row))}>
                    + Add
                  </Btn>
                </div>
              ))}
            </Stack>
          </Card>
        ))
      ) : (
        <EmptyState
          text={
            (pool.data ?? []).length
              ? 'No open items match the filter.'
              : 'No open MR items — everything approved for PO is already on a PO or enquiry.'
          }
        />
      )}

      <StickyActionBar>
        <Btn onClick={onCancel}>Cancel</Btn>
        <div className="flex items-center gap-[10px]">
          <span className="text-mut text-sm">{rows.length} line(s)</span>
          <Btn variant="primary" disabled={!rows.length} onClick={onNext}>
            Next: vendor &amp; prices →
          </Btn>
        </div>
      </StickyActionBar>
    </>
  );
}

/** Prototype: poStep2(f, p) — vendor, company, delivery, and one rate per item. */
function StepVendorPrices({
  form,
  setForm,
  grouped,
  rows,
  onPatchItem,
  totals,
  currency,
  locked,
  onBack,
  onNext,
}: {
  form: PoFormState;
  setForm: (updater: (f: PoFormState) => PoFormState) => void;
  grouped: ReturnType<typeof groupRows>;
  rows: PoDraftRow[];
  onPatchItem: (itemId: string, patch: Partial<PoDraftRow>) => void;
  totals: { subtotal: number; taxTotal: number; total: number };
  currency: string;
  locked: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const reference = useReference();
  const [taxForAll, setTaxForAll] = useState('5');

  return (
    <>
      <VendorSuggestions
        rows={rows}
        currency={currency}
        chosenVendorId={form.vendorId}
        locked={locked}
        onChoose={(vendorId) => setForm((f) => ({ ...f, vendorId }))}
      />

      <Card>
        <Stack>
          <div className="grid gap-3 desk:grid-cols-3">
            <label className="field">
              Vendor * <span className="text-mut font-normal">— type to search</span>
              <input
                list="vendor-list"
                disabled={locked}
                placeholder="Search vendor name"
                autoComplete="off"
                value={reference.vendors.find((v) => v.id === form.vendorId)?.name ?? ''}
                onChange={(e) => {
                  const match = reference.vendors.find((v) => v.name === e.target.value);
                  if (match) setForm((f) => ({ ...f, vendorId: match.id }));
                }}
              />
              <datalist id="vendor-list">
                {reference.vendors.map((v) => (
                  <option key={v.id} value={v.name} />
                ))}
              </datalist>
            </label>

            <label className="field">
              Company (billing entity) *
              <select
                value={form.companyId}
                onChange={(e) => setForm((f) => ({ ...f, companyId: e.target.value }))}
              >
                {reference.companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              Deliver to
              <select
                value={form.deliverTo}
                onChange={(e) =>
                  setForm((f) => ({ ...f, deliverTo: e.target.value as 'STORE' | 'SITE' }))
                }
              >
                <option value="STORE">Main store</option>
                <option value="SITE">Direct to site (one project only)</option>
              </select>
            </label>

            <label className="field">
              Delivery date
              <input
                type="date"
                value={form.deliveryDate}
                onChange={(e) => setForm((f) => ({ ...f, deliveryDate: e.target.value }))}
              />
            </label>

            <label className="field">
              Delivery address
              <textarea
                rows={2}
                placeholder={form.deliverTo === 'SITE' ? 'Site address' : 'Main store'}
                value={form.deliveryAddress}
                onChange={(e) => setForm((f) => ({ ...f, deliveryAddress: e.target.value }))}
              />
            </label>

            <label className="field">
              Billing address
              <textarea
                rows={2}
                placeholder={
                  reference.companies.find((c) => c.id === form.companyId)?.address ||
                  "The billing company's address"
                }
                value={form.billingAddress}
                onChange={(e) => setForm((f) => ({ ...f, billingAddress: e.target.value }))}
              />
            </label>

            <label className="field">
              Payment terms
              <input
                value={form.terms}
                onChange={(e) => setForm((f) => ({ ...f, terms: e.target.value }))}
              />
            </label>

            <label className="field">
              Tax type
              <select
                value={form.taxMode}
                onChange={(e) =>
                  setForm((f) => ({ ...f, taxMode: e.target.value as TaxMode }))
                }
              >
                {TAX_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {TAX_MODE_LABELS[mode]}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              Currency *
              <select
                value={form.currency}
                onChange={(e) =>
                  setForm((f) => ({ ...f, currency: e.target.value as Currency }))
                }
              >
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {CURRENCY_LABELS[code]}
                  </option>
                ))}
              </select>
            </label>
          </div>

        </Stack>
      </Card>

      <div className="flex justify-between items-center gap-3 flex-wrap my-[18px]">
        <h2 className="m-0">Prices — one rate per item</h2>
        <div className="flex items-center gap-[10px] flex-wrap">
          <Btn
            small
            onClick={() => {
              // Prototype: "Use last rates" fills from the item master.
              for (const group of grouped) {
                const row = rows.find((r) => r.itemId === group.itemId);
                if (row) onPatchItem(group.itemId, { rate: row.rate });
              }
            }}
          >
            Use last rates
          </Btn>
          {form.taxMode === 'NONE' ? null : (
            <>
              <label className="inline-flex items-center gap-[6px]">
                Tax % for all
                <input
                  type="number"
                  min={0}
                  step="any"
                  list="tax-rates"
                  className="w-[70px]"
                  value={taxForAll}
                  onChange={(e) => setTaxForAll(e.target.value)}
                />
              </label>
              <Btn
                small
                onClick={() =>
                  grouped.forEach((g) =>
                    onPatchItem(g.itemId, { gstPct: Number(taxForAll) || 0 }),
                  )
                }
              >
                Apply
              </Btn>
            </>
          )}
        </div>
      </div>

      <datalist id="tax-rates">
        {TAX_RATES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <div className="overflow-x-auto">
        <table className="t">
          <thead>
            <tr>
              <th>Item</th>
              <th className="text-right">Total qty</th>
              <th>Rate *</th>
              <th>Tax %</th>
              <th className="text-right">Amount incl. tax</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((group) => {
              const amount = group.qty * group.rate;
              const tax = form.taxMode === 'NONE' ? 0 : (amount * group.gstPct) / 100;
              return (
                <tr key={group.itemId}>
                  <td data-label="Item" className="min-w-[280px]">
                    <b>{group.itemName}</b>
                    <div className="text-mut text-xs">{group.projects.join(', ')}</div>
                    {group.mrDescriptions.length ? (
                      <div className="text-xs mt-1">
                        <span className="text-mut">Site engineer wrote: </span>
                        {group.mrDescriptions.join(' · ')}
                      </div>
                    ) : null}
                    <textarea
                      rows={2}
                      maxLength={400}
                      className="w-full mt-2 text-sm"
                      aria-label={`Description on the PO for ${group.itemName}`}
                      placeholder="Description on the PO (make, size, specification…) — the item name prints if left empty"
                      value={group.description}
                      onChange={(e) => onPatchItem(group.itemId, { description: e.target.value })}
                    />
                  </td>
                  <td data-label="Total qty" className="desk:text-right">
                    {qty(group.qty)} {group.unit}
                  </td>
                  <td data-label="Rate">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      inputMode="decimal"
                      aria-label={`Rate for ${group.itemName}`}
                      className="w-24 font-semibold"
                      value={group.rate}
                      onChange={(e) =>
                        onPatchItem(group.itemId, { rate: Number(e.target.value) || 0 })
                      }
                    />
                  </td>
                  <td data-label="Tax %">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      list="tax-rates"
                      aria-label={`Tax percent for ${group.itemName}`}
                      className="w-20"
                      disabled={form.taxMode === 'NONE'}
                      value={group.gstPct}
                      onChange={(e) =>
                        onPatchItem(group.itemId, { gstPct: Number(e.target.value) || 0 })
                      }
                    />
                  </td>
                  <td data-label="Amount" className="desk:text-right">
                    {money(amount + tax)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Card className="flex flex-wrap justify-end gap-6 mt-[10px]">
        <span>
          Subtotal <b>{money(totals.subtotal)}</b>
        </span>
        {form.taxMode === 'CGST_SGST' ? (
          <>
            <span>
              CGST <b>{money(totals.taxTotal / 2)}</b>
            </span>
            <span>
              SGST <b>{money(totals.taxTotal / 2)}</b>
            </span>
          </>
        ) : (
          <span>
            {form.taxMode === 'NONE' ? 'Tax' : TAX_MODE_LABELS[form.taxMode]}{' '}
            <b>{money(totals.taxTotal)}</b>
          </span>
        )}
        <span className="text-[17px]">
          Total{' '}
          <b>
            {currency} {money(totals.total)}
          </b>
        </span>
      </Card>

      <StickyActionBar>
        <Btn onClick={onBack}>← Back</Btn>
        <Btn variant="primary" onClick={onNext}>
          Next: review →
        </Btn>
      </StickyActionBar>
    </>
  );
}

/** Prototype: poStep3(f, p) — the reason, the notes and the full PO preview. */
function StepReview({
  form,
  setForm,
  existing,
  revise,
  rows,
  totals,
  currency,
  busy,
  onBack,
  onSave,
}: {
  form: PoFormState;
  setForm: (updater: (f: PoFormState) => PoFormState) => void;
  existing?: PoDetailDto;
  revise: boolean;
  rows: PoDraftRow[];
  totals: { subtotal: number; taxTotal: number; total: number };
  currency: string;
  busy: boolean;
  onBack: () => void;
  onSave: (submit: boolean) => void;
}) {
  const reference = useReference();
  const company = reference.companies.find((c) => c.id === form.companyId) ?? null;
  const vendor = reference.vendors.find((v) => v.id === form.vendorId) ?? null;

  return (
    <>
      <Card className="mb-[14px]">
        <Stack>
          {!existing?.rfqId ? (
            <label className="field">
              Why this vendor without an enquiry?
              <select
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              >
                {PO_DIRECT_REASONS.map((reason) => (
                  <option key={reason}>{reason}</option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="field">
            Notes printed on the PO
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>

          {revise ? (
            <label className="field">
              Reason for revision *
              <input
                placeholder="e.g. rate negotiated, qty changed"
                value={form.revisionReason}
                onChange={(e) => setForm((f) => ({ ...f, revisionReason: e.target.value }))}
              />
            </label>
          ) : null}

          <div className="text-mut text-sm">
            On submit the PO goes to the <b>Procurement Manager</b> for approval. The
            vendor sees it only after approval.
          </div>
        </Stack>
      </Card>

      <PoDocument
        preview={{
          displayNo: existing ? existing.displayNo : 'PO-(new)',
          status: existing && !revise ? existing.status : 'DRAFT',
          company,
          vendor,
          deliverTo: form.deliverTo,
          deliveryDate: form.deliveryDate,
          deliveryAddress: form.deliveryAddress,
          billingAddress: form.billingAddress,
          terms: form.terms,
          notes: form.notes,
          taxMode: form.taxMode,
          currency,
          projectCodes: [...new Set(rows.map((r) => r.projectCode))],
          rfqNo: existing?.rfqNo ?? null,
          createdByName: existing?.createdByName ?? '',
          checkedByName: null,
          verifiedByName: null,
          approvedByName: null,
          lines: groupRows(rows).map((g) => ({
            id: g.itemId,
            itemId: g.itemId,
            itemCode: g.itemCode,
            itemName: g.itemName,
            description: g.description,
            mrNos: g.mrNos,
            unit: g.unit,
            qty: g.qty,
            rate: g.rate,
            gstPct: form.taxMode === 'NONE' ? 0 : g.gstPct,
          })),
          totals,
        }}
      />

      <StickyActionBar>
        <Btn onClick={onBack}>← Back</Btn>
        <div className="flex gap-[10px]">
          {revise ? null : (
            <Btn disabled={busy} onClick={() => onSave(false)}>
              Save draft
            </Btn>
          )}
          <Btn variant="primary" disabled={busy} onClick={() => onSave(true)}>
            {revise ? 'Submit revision for approval' : 'Submit for approval'}
          </Btn>
        </div>
      </StickyActionBar>
    </>
  );
}


/**
 * Two suggested vendors for the items in this order — the cheapest and the
 * quickest — worked out from rates those vendors have quoted or charged before
 * and from how long their past orders actually took to arrive.
 *
 * They are a shortcut, not a decision: the buyer can take one, or ignore both
 * and pick a vendor in the box underneath.
 */
function VendorSuggestions({
  rows,
  currency,
  chosenVendorId,
  locked,
  onChoose,
}: {
  rows: PoDraftRow[];
  currency: string;
  chosenVendorId: string;
  locked: boolean;
  onChoose: (vendorId: string) => void;
}) {
  // One request per distinct set of items and quantities.
  const body = {
    rows: rows
      .filter((r) => r.itemId && Number(r.qty) > 0)
      .map((r) => ({ itemId: r.itemId, qty: Number(r.qty) })),
  };

  const suggestions = useQuery({
    queryKey: ['po-recommendations', JSON.stringify(body.rows)],
    queryFn: () => post<PoRecommendationsDto>('/pos/recommendations', body),
    enabled: body.rows.length > 0 && !locked,
  });

  if (locked || !body.rows.length) return null;

  if (suggestions.isLoading) {
    return (
      <Card className="mb-3">
        <span className="text-mut">Looking at what these vendors have charged…</span>
      </Card>
    );
  }

  const data = suggestions.data;
  const byMoney = data?.byMoney ?? null;
  const byTime = data?.byTime ?? null;

  if (!byMoney && !byTime) {
    return (
      <Card className="mb-3">
        <span className="text-mut">{MSG.poNoRecommendation}</span>
      </Card>
    );
  }

  // When one vendor is both cheapest and quickest, say so once.
  const same = byMoney && byTime && byMoney.vendorId === byTime.vendorId;

  return (
    <>
      <h2 className="mt-0">Suggested vendors</h2>
      <div className="text-mut text-sm mb-2">
        From rates these vendors have quoted or charged for these items, and how
        long their past orders took to arrive. Take one, or choose your own below.
      </div>

      <div className="grid gap-3 desk:grid-cols-2 mb-4">
        {same ? (
          <SuggestionCard
            title="Best on price and time"
            tone="grn"
            suggestion={byMoney!}
            currency={currency}
            chosen={chosenVendorId === byMoney!.vendorId}
            onChoose={onChoose}
          />
        ) : (
          <>
            {byMoney ? (
              <SuggestionCard
                title="Best on price"
                tone="ac"
                suggestion={byMoney}
                currency={currency}
                chosen={chosenVendorId === byMoney.vendorId}
                onChoose={onChoose}
              />
            ) : null}
            {byTime ? (
              <SuggestionCard
                title="Fastest delivery"
                tone="amb"
                suggestion={byTime}
                currency={currency}
                chosen={chosenVendorId === byTime.vendorId}
                onChoose={onChoose}
              />
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

function SuggestionCard({
  title,
  tone,
  suggestion,
  currency,
  chosen,
  onChoose,
}: {
  title: string;
  tone: 'ac' | 'amb' | 'grn';
  suggestion: VendorSuggestionDto;
  currency: string;
  chosen: boolean;
  onChoose: (vendorId: string) => void;
}) {
  const days = suggestion.measuredDays ?? suggestion.leadDays;

  return (
    <div
      className={`card flex flex-col gap-3 ${
        chosen ? 'border-[1.5px] border-ac bg-[#F2F6FC]' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Tag label={title.toUpperCase()} tone={tone} />
        {chosen ? <Tag label="CHOSEN" tone="grn" /> : null}
      </div>

      <div>
        <b className="text-lg">{suggestion.vendorName}</b>
        <div className="text-mut text-sm">{suggestion.reason}</div>
      </div>

      <div className="flex gap-6 flex-wrap text-sm">
        <span>
          <span className="text-mut">At past rates</span>
          <div className="font-semibold">
            {money(suggestion.estimatedTotal)} {currency}
          </div>
        </span>
        <span>
          <span className="text-mut">Delivery</span>
          <div className="font-semibold">
            {days === null ? 'not known yet' : `${days} day(s)`}
          </div>
        </span>
        <span>
          <span className="text-mut">Items priced</span>
          <div className="font-semibold">
            {suggestion.itemsPriced} of {suggestion.itemsTotal}
          </div>
        </span>
      </div>

      <Btn
        variant={chosen ? undefined : 'primary'}
        disabled={chosen}
        onClick={() => onChoose(suggestion.vendorId)}
      >
        {chosen ? 'Using this vendor' : `Use ${suggestion.vendorName}`}
      </Btn>
    </div>
  );
}
