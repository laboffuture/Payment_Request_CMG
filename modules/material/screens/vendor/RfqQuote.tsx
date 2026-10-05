'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from '@mm/lib/nav';
import { useQuery } from '@tanstack/react-query';
import {
  DEFAULT_QUOTE_VALIDITY_DAYS,
  MSG,
  RFQ_ST,
  RV_ST,
  TAX_RATES,
  chipFor,
  type VendorRfqDto,
} from '@cm/shared';
import { downloadFile, get, post } from '@mm/lib/api';
import {
  Btn,
  Card,
  Chip,
  DueCountdown,
  PageHeader,
  Stack,
  StickyActionBar,
} from '@mm/components/ui';
import { useToast } from '@mm/components/Toast';
import { useAction } from '@mm/lib/hooks';
import { addDays, fmtDateTime, money, qty } from '@mm/lib/format';

/**
 * The vendor's quotation sheet.
 * Prototype origin: VIEWS.vrfq (the second definition) — the same layout as
 * the paper form, with a downloadable CSV to fill offline and upload back.
 */
export default function VendorRfqPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const rfq = useQuery({
    queryKey: ['vendor-rfq', id],
    queryFn: () => get<VendorRfqDto>(`/vendor/rfqs/${id}`),
  });

  const [rates, setRates] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [meta, setMeta] = useState({
    leadDays: '',
    vatPct: '5',
    validity: addDays(DEFAULT_QUOTE_VALIDITY_DAYS),
    terms: '',
  });

  useEffect(() => {
    if (!rfq.data) return;
    setRates(
      Object.fromEntries(
        rfq.data.lines.map((l) => [l.id, l.rate ? String(l.rate) : '']),
      ),
    );
    setRemarks(Object.fromEntries(rfq.data.lines.map((l) => [l.id, l.remark])));
    setMeta({
      leadDays: rfq.data.leadDays !== null ? String(rfq.data.leadDays) : '',
      vatPct: String(rfq.data.vatPct ?? 5),
      validity: rfq.data.validity,
      terms: rfq.data.terms,
    });
  }, [rfq.data]);

  const invalidate = [['vendor-rfq', id], ['vendor-rfqs']];

  const accept = useAction(() => post(`/vendor/rfqs/${id}/accept`), {
    success: 'Accepted — fill in your prices below',
    invalidate,
  });
  const decline = useAction(() => post(`/vendor/rfqs/${id}/decline`), {
    success: 'Declined — thank you for letting us know',
    invalidate,
  });
  const quote = useAction(
    () =>
      post(`/vendor/rfqs/${id}/quote`, {
        leadDays: Number(meta.leadDays),
        vatPct: Number(meta.vatPct) || 0,
        validity: meta.validity,
        terms: meta.terms,
        lines: (rfq.data?.lines ?? []).map((line) => ({
          rfqLineId: line.id,
          rate: Number(rates[line.id]) || 0,
          remark: remarks[line.id] ?? '',
        })),
      }),
    {
      success: 'Quote submitted — Chandramari procurement has been notified',
      invalidate,
    },
  );

  if (rfq.isLoading) return <div className="text-mut">Loading…</div>;
  if (!rfq.data) return <div className="errb">Not found</div>;

  const data = rfq.data;

  const subtotal = data.lines.reduce(
    (sum, line) => sum + (Number(rates[line.id]) || 0) * line.qty,
    0,
  );
  const tax = (subtotal * (Number(meta.vatPct) || 0)) / 100;

  const submit = () => {
    if (data.pastDue) return toast(MSG.rfqClosed);
    if (meta.leadDays === '') return toast(MSG.vendorLeadTime);
    if (data.lines.some((l) => (Number(rates[l.id]) || 0) < 0)) {
      return toast(MSG.vendorRatesNegative);
    }
    if (!data.lines.some((l) => (Number(rates[l.id]) || 0) > 0)) {
      return toast(MSG.vendorQuoteAtLeastOne);
    }
    quote.mutate();
  };

  /** Prototype: vSheetFill(text) — read the filled sheet back into the form. */
  const loadSheet = async (file: File) => {
    const text = await file.text();
    const rows = text
      .replace(/^﻿/, '')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => line.split(',').map((cell) => cell.replace(/^"|"$/g, '')));

    const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
    const snIndex = header.indexOf('s.no');
    const rateIndex = header.indexOf('rate');
    const remarkIndex = header.indexOf('remarks');
    if (snIndex < 0 || rateIndex < 0) return toast(MSG.vendorSheetColumns);

    const nextRates = { ...rates };
    const nextRemarks = { ...remarks };
    let filled = 0;

    for (const row of rows.slice(1)) {
      const sn = parseInt(row[snIndex] ?? '', 10);
      const line = data.lines.find((l) => l.sn === sn);
      if (!line) continue;
      const value = (row[rateIndex] ?? '').trim();
      if (value !== '') {
        nextRates[line.id] = String(Number(value) || 0);
        filled += 1;
      }
      if (remarkIndex >= 0) nextRemarks[line.id] = row[remarkIndex] ?? '';
    }

    setRates(nextRates);
    setRemarks(nextRemarks);
    toast(MSG.vendorSheetFilled(filled));
  };

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3 flex-wrap">
            <span className="font-mono">{data.no}</span>
            <Chip spec={chipFor(RV_ST, data.myStatus)} />
          </span>
        }
        subtitle={
          <>
            Submit by <b>{fmtDateTime(data.dueAt)}</b> ·{' '}
            {data.status === 'OPEN' ? <DueCountdown due={data.dueAt} /> : null}
          </>
        }
        actions={
          <Btn onClick={() => window.print()}>Print RFQ / PDF</Btn>
        }
      />

      {data.myStatus === 'INVITED' && data.status === 'OPEN' && !data.pastDue ? (
        <Card className="mb-3">
          <div className="flex justify-between items-center gap-3 flex-wrap">
            <span>Will you quote for this enquiry?</span>
            <div className="flex gap-[10px]">
              <Btn variant="danger" onClick={() => decline.mutate()}>
                Decline
              </Btn>
              <Btn variant="primary" onClick={() => accept.mutate()}>
                Accept &amp; fill prices
              </Btn>
            </div>
          </div>
        </Card>
      ) : null}

      {data.status !== 'OPEN' ? (
        <div className="warn mb-3">
          This enquiry is {chipFor(RFQ_ST, data.status).label.toLowerCase()}.
        </div>
      ) : data.pastDue ? (
        <div className="warn mb-3">
          The due time has passed — quotes can no longer be submitted.
        </div>
      ) : null}

      <Card>
        <Stack>
          <b className="text-lg tracking-wide">QUOTATION SHEET</b>
          {data.note ? <div className="warn">{data.note}</div> : null}

          {data.canQuote ? (
            <div className="flex flex-wrap items-center gap-[10px] noprint">
              <span className="text-mut text-sm">Many items? Fill the sheet in Excel:</span>
              <Btn small onClick={() => downloadFile(`/vendor/rfqs/${id}/sheet.csv`)}>
                Download sheet (CSV)
              </Btn>
              <Btn small onClick={() => fileInput.current?.click()}>
                Upload filled sheet
              </Btn>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void loadSheet(file);
                  if (fileInput.current) fileInput.current.value = '';
                }}
              />
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="t">
              <thead>
                <tr>
                  <th>S.No.</th>
                  <th>Description of Materials</th>
                  <th className="text-right">Qty.</th>
                  <th>Unit</th>
                  <th>Rate *</th>
                  <th className="text-right">Amount</th>
                  <th>Brand / Remarks</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((line) => {
                  const rate = Number(rates[line.id]) || 0;
                  return (
                    <tr key={line.id}>
                      <td data-label="S.No.">{line.sn}</td>
                      <td data-label="Description">
                        <b>{line.itemName}</b>
                      </td>
                      <td data-label="Qty." className="desk:text-right">
                        {qty(line.qty)}
                      </td>
                      <td data-label="Unit">{line.unit}</td>
                      <td data-label="Rate">
                        {data.canQuote ? (
                          <input
                            type="number"
                            min={0}
                            step="any"
                            inputMode="decimal"
                            aria-label={`Rate for ${line.itemName}`}
                            className="w-24 font-semibold"
                            placeholder="Blank = not quoting"
                            value={rates[line.id] ?? ''}
                            onChange={(e) =>
                              setRates({ ...rates, [line.id]: e.target.value })
                            }
                          />
                        ) : rate ? (
                          money(rate)
                        ) : (
                          '—'
                        )}
                      </td>
                      <td data-label="Amount" className="desk:text-right">
                        {rate ? money(rate * line.qty) : ''}
                      </td>
                      <td data-label="Brand / Remarks">
                        {data.canQuote ? (
                          <input
                            aria-label={`Remarks for ${line.itemName}`}
                            placeholder="optional"
                            value={remarks[line.id] ?? ''}
                            onChange={(e) =>
                              setRemarks({ ...remarks, [line.id]: e.target.value })
                            }
                          />
                        ) : (
                          remarks[line.id]
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-4 flex-wrap">
            <span>
              Subtotal <b>{money(subtotal)}</b>
            </span>
            <span>
              Tax <b>{money(tax)}</b>
            </span>
            <span>
              Total <b>{money(subtotal + tax)}</b>
            </span>
          </div>

          {data.canQuote ? (
            <>
              <div className="grid gap-3 desk:grid-cols-4">
                <label className="field">
                  Tax % (GST / VAT)
                  <input
                    type="number"
                    min={0}
                    step="any"
                    list="vendor-tax-rates"
                    value={meta.vatPct}
                    onChange={(e) => setMeta({ ...meta, vatPct: e.target.value })}
                  />
                  <datalist id="vendor-tax-rates">
                    {TAX_RATES.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </label>
                <label className="field">
                  Lead time (days) *
                  <input
                    type="number"
                    min={0}
                    value={meta.leadDays}
                    onChange={(e) => setMeta({ ...meta, leadDays: e.target.value })}
                  />
                </label>
                <label className="field">
                  Valid till
                  <input
                    type="date"
                    value={meta.validity}
                    onChange={(e) => setMeta({ ...meta, validity: e.target.value })}
                  />
                </label>
                <label className="field">
                  Payment terms
                  <input
                    value={meta.terms}
                    onChange={(e) => setMeta({ ...meta, terms: e.target.value })}
                  />
                </label>
              </div>

              <div className="text-mut text-sm">
                Leave a rate blank for items you don&apos;t supply. You can update your
                quote until the due time.
              </div>
            </>
          ) : null}
        </Stack>
      </Card>

      {data.canQuote ? (
        <StickyActionBar>
          <span className="text-mut text-sm">
            {data.lines.length} item(s) · due {fmtDateTime(data.dueAt)}
          </span>
          <Btn variant="primary" disabled={quote.isPending} onClick={submit}>
            {data.myStatus === 'QUOTED' ? 'Update quote' : 'Submit quote'}
          </Btn>
        </StickyActionBar>
      ) : null}
    </>
  );
}
