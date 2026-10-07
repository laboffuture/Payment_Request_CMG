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
import { Fragment } from 'react';
import { fmtDate, money, qty } from '@mm/lib/format';

/**
 * The printable purchase order.
 * Prototype origin: poDoc(p, ov) — the same markup serves the wizard's step-3
 * preview and the saved PO, so what the buyer reviews is what prints.
 *
 * The worker renders an equivalent document for the vendor's email attachment
 * (apps/worker/src/pdf/poDocument.ts); both read the same stored figures.
 */
/** A PO line as printed: the MR(s) it was bought for ride along with it. */
export type PoDocumentLine = PoLineDto & { mrNos?: string[] };

export interface PoDocumentData {
  displayNo: string;
  status: PoStatus;
  company: CompanyDto | null;
  vendor: VendorDto | null;
  deliverTo: DeliverTo;
  deliveryDate: string;
  /** empty = "Main store" / the site */
  deliveryAddress?: string;
  /** empty = the billing company's own address */
  billingAddress?: string;
  terms: string;
  notes: string;
  taxMode: TaxMode;
  currency: string;
  projectCodes: string[];
  rfqNo: string | null;
  /** Procurement */
  createdByName: string;
  /** Procurement Manager */
  checkedByName?: string | null;
  /** QS */
  verifiedByName?: string | null;
  /** Management */
  approvedByName: string | null;
  date?: string;
  lines: PoDocumentLine[];
  totals: { subtotal: number; taxTotal: number; total: number };
}

/*
 * The document's own layout rules. They are plain class names on purpose: the
 * application's global stylesheet has a bare `.grid` rule (two uneven columns)
 * that would otherwise override utility classes here.
 */
const DOC_CSS = `
.po-doc-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;border-bottom:2px solid currentColor;padding-bottom:12px}
.po-doc-co{display:flex;align-items:flex-start;gap:12px}
.po-doc-stack{display:flex;flex-direction:column;gap:4px;font-size:13px}
.po-doc-title{display:flex;flex-direction:column;gap:4px;align-items:flex-end;text-align:right;font-size:13px}
.po-doc-info{display:grid;grid-template-columns:1fr 1fr;gap:12px 32px;align-items:start;margin:16px 0;font-size:13px}
.po-doc-rows{display:grid;grid-template-columns:120px 12px 1fr;row-gap:4px;align-content:start}
.po-doc-rows>span:nth-child(3n){white-space:pre-line;overflow-wrap:anywhere}
.po-doc-sign{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:40px;font-size:13px}
.po-doc-sign>div{display:flex;flex-direction:column;gap:4px;text-align:center}
.po-doc-sign>div>span{border-top:1px solid currentColor;margin-top:24px;padding-top:4px;min-height:22px}
@media (max-width:700px){.po-doc-info{grid-template-columns:1fr}.po-doc-sign{grid-template-columns:1fr 1fr}}
`;

const COLUMNS = ['Item Code', 'Description', 'MR No.', 'UOM', 'Qty', 'Rate', 'Amount'];
const NUMERIC = new Set(['Qty', 'Rate', 'Amount']);

export function PoDocument({ preview }: { preview: PoDocumentData }) {
  const { company, vendor, lines, totals, taxMode, currency, projectCodes } = preview;

  const split = taxMode === 'CGST_SGST';
  const span = COLUMNS.length - 1;

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

  const deliveryAddress =
    preview.deliveryAddress ||
    (preview.deliverTo === 'SITE' ? `Site — ${projectCodes.join(', ')}` : 'Main store');
  const billingAddress =
    preview.billingAddress ||
    [company?.legalName || company?.name, company?.address].filter(Boolean).join('\n');
  const approved =
    preview.status === 'REJECTED' ? null : preview.approvedByName;

  return (
    <div className="bg-white border border-line rounded-card p-7 max-w-[900px] print:border-0 print:p-0">
      <style>{DOC_CSS}</style>
      <div className="po-doc-head">
        <div className="po-doc-co">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={company?.logoUrl || BRAND_LOGO_URL}
            alt="Chandramari Group"
            className="max-h-16 max-w-[200px] object-contain"
          />
          <div className="po-doc-stack">
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

        <div className="po-doc-title">
          <b className="text-xl">PURCHASE ORDER</b>
          <span>Status: {chipFor(PO_ST, preview.status).label}</span>
        </div>
      </div>

      {/* Vendor on the left, the order on the right — label : value, colons aligned. */}
      <div className="po-doc-info">
        <InfoRows
          rows={[
            ['Vendor No', vendor?.code],
            ['Vendor Name', vendor?.name],
            ['Country', vendor?.country],
            ['Number', vendor?.phone],
            ['Email', vendor?.email],
            ['TRN No', vendor?.taxNo],
          ]}
        />
        <InfoRows
          rows={[
            ['Order No', <span key="no" className="font-mono">{preview.displayNo}</span>],
            ['Order Date', fmtDate(preview.date ?? new Date().toISOString())],
            ['Delivery Address', deliveryAddress],
            ['Billing Address', billingAddress],
            ['Delivery Date', fmtDate(preview.deliveryDate)],
          ]}
        />
      </div>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            {COLUMNS.map((h) => (
              <th
                key={h}
                className={`border border-[#D5D1C8] px-2 py-[6px] bg-bg ${
                  NUMERIC.has(h) ? 'text-right' : 'text-left'
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id}>
              <Cell>
                <span className="font-mono">{line.itemCode}</span>
              </Cell>
              <Cell>{line.itemName}</Cell>
              <Cell>
                <span className="font-mono">{(line.mrNos ?? []).join(', ')}</span>
              </Cell>
              <Cell>{line.unit}</Cell>
              <Cell right>{qty(line.qty)}</Cell>
              <Cell right>{money(line.rate)}</Cell>
              <Cell right>{money(line.qty * line.rate)}</Cell>
            </tr>
          ))}

          <tr>
            <Cell colSpan={span} right>
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
                      <Cell colSpan={span} right>
                        CGST {rate / 2}%
                      </Cell>
                      <Cell right>{money(tax / 2)}</Cell>
                    </tr>,
                    <tr key={`s${rate}`}>
                      <Cell colSpan={span} right>
                        SGST {rate / 2}%
                      </Cell>
                      <Cell right>{money(tax / 2)}</Cell>
                    </tr>,
                  ]
                : [
                    <tr key={`t${rate}`}>
                      <Cell colSpan={span} right>
                        {taxMode === 'IGST' ? 'IGST' : taxMode === 'VAT' ? 'VAT' : 'Tax'}{' '}
                        {rate}%
                      </Cell>
                      <Cell right>{money(tax)}</Cell>
                    </tr>,
                  ],
            )}

          <tr>
            <Cell colSpan={span} right>
              <b>Total {currency}</b>
            </Cell>
            <Cell right>
              <b>{money(totals.total)}</b>
            </Cell>
          </tr>
        </tbody>
      </table>

      <div className="mt-3 text-[13px]">
        <span>
          <b>Payment terms:</b> {preview.terms || '—'} · <b>Tax:</b> {TAX_MODE_LABELS[taxMode]}
          {preview.rfqNo ? (
            <>
              {' '}
              · <b>Enquiry:</b> {preview.rfqNo}
            </>
          ) : null}
        </span>
      </div>

      {company?.poTerms ? (
        <p className="whitespace-pre-line text-xs mt-3">
          <b>Terms and conditions</b>
          {'\n'}
          {company.poTerms}
        </p>
      ) : null}

      {preview.notes ? (
        <p className="whitespace-pre-line mt-3 text-[13px]">
          <b>Remarks:</b> {preview.notes}
        </p>
      ) : null}

      {/* Sign-off: who prepared, checked, verified and approved this PO, by name. */}
      <div className="po-doc-sign">
        {(
          [
            ['Prepared by', preview.createdByName],
            ['Checked by', preview.checkedByName],
            ['Verified by', preview.verifiedByName],
            ['Approved by', approved],
          ] as const
        ).map(([label, name]) => (
          <div key={label}>
            <b>{label}</b>
            <span>{name || '\u00a0'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Label : value rows; the fixed label column keeps every colon in one line. */
function InfoRows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <div className="po-doc-rows">
      {rows.map(([label, value]) => (
        <Fragment key={label}>
          <b>{label}</b>
          <span>:</span>
          <span>{value || '—'}</span>
        </Fragment>
      ))}
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
