'use client';

import {
  BRAND_LOGO_URL,
  PO_ST,
  TAX_MODE_LABELS,
  chipFor,
  type CompanyDto,
  type DeliverTo,
  type PoLineDto,
  type PoStatus,
  type TaxMode,
  type VendorDto,
} from '@cm/shared';
import { fmtDate, money, qty } from '@mm/lib/format';

/**
 * The printable purchase order.
 * Prototype origin: poDoc(p, ov) — the same markup serves the wizard's step-3
 * preview and the saved PO, so what the buyer reviews is what prints.
 *
 * The worker renders an equivalent document for the vendor's email attachment
 * (apps/worker/src/pdf/poDocument.ts); both read the same stored figures.
 */
export interface PoDocumentData {
  displayNo: string;
  status: PoStatus;
  company: CompanyDto | null;
  vendor: VendorDto | null;
  deliverTo: DeliverTo;
  deliveryDate: string;
  terms: string;
  notes: string;
  taxMode: TaxMode;
  currency: string;
  projectCodes: string[];
  rfqNo: string | null;
  createdByName: string;
  approvedByName: string | null;
  date?: string;
  lines: PoLineDto[];
  totals: { subtotal: number; taxTotal: number; total: number };
}

export function PoDocument({ preview }: { preview: PoDocumentData }) {
  const {
    company,
    vendor,
    lines,
    totals,
    taxMode,
    currency,
    projectCodes,
  } = preview;

  const split = taxMode === 'CGST_SGST';

  // One tax row per distinct rate, as the prototype prints it (§7).
  const byRate = new Map<number, number>();
  for (const line of lines) {
    if (taxMode === 'NONE' || !line.gstPct) continue;
    const amount = line.qty * line.rate;
    byRate.set(
      line.gstPct,
      Math.round(((byRate.get(line.gstPct) ?? 0) + (amount * line.gstPct) / 100) * 100) /
        100,
    );
  }

  return (
    <div className="bg-white border border-line rounded-card p-7 max-w-[900px] print:border-0 print:p-0">
      <div className="flex justify-between items-start gap-3 border-b-2 border-ink pb-3 flex-wrap">
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={company?.logoUrl || BRAND_LOGO_URL}
            alt="Chandramari Group"
            className="max-h-16 max-w-[200px] object-contain"
          />
          <div className="grid gap-1 text-[13px]">
            <b className="text-lg">{company?.legalName || company?.name}</b>
            <span className="whitespace-pre-line">{company?.address}</span>
            {company?.taxNo ? (
              <span>
                {company.taxLabel}: {company.taxNo}
              </span>
            ) : null}
            {company?.phone || company?.email ? (
              <span>{[company?.phone, company?.email].filter(Boolean).join(' · ')}</span>
            ) : null}
          </div>
        </div>

        <div className="grid gap-1 text-right text-[13px]">
          <b className="text-xl">PURCHASE ORDER</b>
          <span className="font-mono">{preview.displayNo}</span>
          <span>Date: {fmtDate(preview.date ?? new Date().toISOString())}</span>
          <span>Status: {chipFor(PO_ST, preview.status).label}</span>
        </div>
      </div>

      <div className="grid gap-4 desk:grid-cols-3 my-[14px] text-[13px]">
        <div className="grid gap-1">
          <b>Vendor</b>
          <span>{vendor?.name}</span>
          {vendor?.address ? (
            <span className="whitespace-pre-line">{vendor.address}</span>
          ) : null}
          {vendor?.taxNo ? <span>Tax no: {vendor.taxNo}</span> : null}
          {vendor?.phone || vendor?.email ? (
            <span>{[vendor?.phone, vendor?.email].filter(Boolean).join(' · ')}</span>
          ) : null}
        </div>

        <div className="grid gap-1">
          <b>Deliver to</b>
          <span>
            {preview.deliverTo === 'SITE'
              ? `Site — ${projectCodes[0] ?? ''}`
              : 'Main store'}
          </span>
          <span>Delivery date: {fmtDate(preview.deliveryDate)}</span>
          <span>Projects: {projectCodes.join(', ')}</span>
        </div>

        <div className="grid gap-1">
          <b>Terms</b>
          <span>Payment: {preview.terms}</span>
          <span>Tax: {TAX_MODE_LABELS[taxMode]}</span>
          {preview.rfqNo ? <span>Enquiry: {preview.rfqNo}</span> : null}
        </div>
      </div>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            {['#', 'Item', 'Qty', 'Unit', 'Rate', 'Amount', 'Tax %', 'Tax', 'Total'].map(
              (h, i) => (
                <th
                  key={h}
                  className={`border border-[#D5D1C8] px-2 py-[6px] bg-bg ${
                    i >= 2 && i !== 3 ? 'text-right' : 'text-left'
                  }`}
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => {
            const amount = line.qty * line.rate;
            const tax = taxMode === 'NONE' ? 0 : (amount * line.gstPct) / 100;
            return (
              <tr key={line.id}>
                <Cell>{index + 1}</Cell>
                <Cell>
                  {line.itemName}{' '}
                  {line.itemCode ? (
                    <span className="font-mono text-[11px]">{line.itemCode}</span>
                  ) : null}
                </Cell>
                <Cell right>{qty(line.qty)}</Cell>
                <Cell>{line.unit}</Cell>
                <Cell right>{money(line.rate)}</Cell>
                <Cell right>{money(amount)}</Cell>
                <Cell right>{qty(line.gstPct)}</Cell>
                <Cell right>{money(tax)}</Cell>
                <Cell right>{money(amount + tax)}</Cell>
              </tr>
            );
          })}

          <tr>
            <Cell colSpan={8} right>
              Subtotal
            </Cell>
            <Cell right>{money(totals.subtotal)}</Cell>
          </tr>

          {[...byRate.entries()]
            .sort((a, b) => a[0] - b[0])
            .flatMap(([rate, tax]) =>
              split
                ? [
                    <tr key={`c${rate}`}>
                      <Cell colSpan={8} right>
                        CGST {rate / 2}%
                      </Cell>
                      <Cell right>{money(tax / 2)}</Cell>
                    </tr>,
                    <tr key={`s${rate}`}>
                      <Cell colSpan={8} right>
                        SGST {rate / 2}%
                      </Cell>
                      <Cell right>{money(tax / 2)}</Cell>
                    </tr>,
                  ]
                : [
                    <tr key={`t${rate}`}>
                      <Cell colSpan={8} right>
                        {taxMode === 'IGST' ? 'IGST' : taxMode === 'VAT' ? 'VAT' : 'Tax'}{' '}
                        {rate}%
                      </Cell>
                      <Cell right>{money(tax)}</Cell>
                    </tr>,
                  ],
            )}

          <tr>
            <Cell colSpan={8} right>
              <b>Total {currency}</b>
            </Cell>
            <Cell right>
              <b>{money(totals.total)}</b>
            </Cell>
          </tr>
        </tbody>
      </table>

      {preview.notes ? (
        <p className="mt-3 text-[13px]">
          <b>Notes:</b> {preview.notes}
        </p>
      ) : null}

      {company?.poTerms ? (
        <p className="whitespace-pre-line text-xs mt-3">
          <b>Terms and conditions</b>
          {'\n'}
          {company.poTerms}
        </p>
      ) : null}

      <div className="flex justify-between flex-wrap gap-4 mt-9 text-[13px]">
        <span>Prepared by: {preview.createdByName}</span>
        <span>
          Approved by:{' '}
          {preview.approvedByName && preview.status !== 'REJECTED'
            ? preview.approvedByName
            : '________________'}
        </span>
        <span>Vendor acceptance: ________________</span>
      </div>
    </div>
  );
}

const Cell = ({
  children,
  right,
  colSpan,
}: {
  children?: React.ReactNode;
  right?: boolean;
  colSpan?: number;
}) => (
  <td
    colSpan={colSpan}
    className={`border border-[#D5D1C8] px-2 py-[6px] ${right ? 'text-right' : 'text-left'}`}
  >
    {children}
  </td>
);
