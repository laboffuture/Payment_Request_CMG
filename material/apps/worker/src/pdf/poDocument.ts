import {
  Company,
  Mr,
  MrLine,
  Po,
  PoAlloc,
  PoLine,
  Project,
  Rfq,
  User,
  Vendor,
  Item,
} from '@cm/api';
import { num, r2 } from '@cm/calc';
import { PO_ST, TAX_MODE_LABELS, chipFor } from '@cm/shared';
import { BRAND_LOGO_DATA_URI } from './brandLogo.js';

/**
 * The logo to print. Puppeteer renders with no network and no page origin, so
 * only an absolute http(s) URL can be fetched — a locally stored company logo
 * (the dev fallback) or no logo at all both mean the group mark instead.
 */
const printableLogo = (url: string | undefined): string =>
  url && url.startsWith('http') ? url : BRAND_LOGO_DATA_URI;

/**
 * The printable purchase order, as standalone HTML.
 * Prototype origin: poDoc(p).
 *
 * The browser prints the same document from its own React component with
 * `@media print`; this is the server-side copy Puppeteer renders so an approved
 * PO can be attached to the vendor's email (§1). Both are driven by the same
 * stored figures, so they cannot disagree on totals.
 */

const esc = (value: unknown): string =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const money = (v: number): string =>
  v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (value?: string | Date | null): string => {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export async function renderPoHtml(poId: string): Promise<{ html: string; no: string }> {
  const po = await Po.findById(poId).lean();
  if (!po) throw new Error(`PO ${poId} not found`);

  const nameOf = (id: unknown) =>
    id ? User.findById(id).select('name').lean() : Promise.resolve(null);
  const [company, vendor, lines, allocs, creator, checker, verifier, approver, rfq] =
    await Promise.all([
      Company.findById(po.companyId).lean(),
      Vendor.findById(po.vendorId).lean(),
      PoLine.find({ poId: po._id }).lean(),
      PoAlloc.find({ poId: po._id }).lean(),
      nameOf(po.createdBy),
      nameOf(po.procMgrBy),
      nameOf(po.qsBy),
      nameOf(po.approvedBy),
      po.rfqId ? Rfq.findById(po.rfqId).select('no').lean() : null,
    ]);

  // The MR number(s) each PO line was bought for: alloc -> MR line -> MR.
  const mrLines = await MrLine.find({ _id: { $in: allocs.map((a) => a.mrLineId) } })
    .select('mrId')
    .lean();
  const mrs = await Mr.find({ _id: { $in: mrLines.map((l) => l.mrId) } })
    .select('no')
    .lean();
  const mrNosFor = (poLineId: unknown): string =>
    [
      ...new Set(
        allocs
          .filter((a) => String(a.poLineId) === String(poLineId))
          .map((a) => {
            const mrLine = mrLines.find((l) => String(l._id) === String(a.mrLineId));
            return mrs.find((m) => String(m._id) === String(mrLine?.mrId))?.no ?? '';
          })
          .filter(Boolean),
      ),
    ].join(', ');

  const items = await Item.find({ _id: { $in: lines.map((l) => l.itemId) } }).lean();
  const projects = await Project.find({
    _id: { $in: [...new Set(allocs.map((a) => String(a.projectId)))] },
  }).lean();

  const displayNo = po.no + (num(po.rev) > 0 ? ` Rev ${po.rev}` : '');
  // The order's own currency — a billing entity's default is only the starting point.
  const currency = po.currency || company?.currency || '';
  const split = po.taxMode === 'CGST_SGST';

  // One tax row per distinct rate, split into CGST/SGST when the mode says so.
  const byRate = new Map<number, number>();
  let subtotal = 0;
  let taxTotal = 0;

  const rows = lines.map((line, index) => {
    const item = items.find((i) => String(i._id) === String(line.itemId));
    const amount = num(line.qty) * num(line.rate);
    const tax = po.taxMode === 'NONE' ? 0 : (amount * num(line.gstPct)) / 100;
    subtotal += amount;
    taxTotal += tax;
    if (num(line.gstPct) > 0 && po.taxMode !== 'NONE') {
      byRate.set(num(line.gstPct), r2((byRate.get(num(line.gstPct)) ?? 0) + tax));
    }

    return `<tr>
      <td class="c">${index + 1}</td>
      <td><b>${esc(item?.name)}</b>${
        line.description && line.description.trim() !== (item?.name ?? '').trim()
          ? `<small class="desc">${esc(line.description)}</small>`
          : ''
      }</td>
      <td class="mono">${esc(mrNosFor(line._id))}</td>
      <td>${esc(item?.unit)}</td>
      <td class="r">${num(line.qty)}</td>
      <td class="r">${money(num(line.rate))}</td>
      <td class="r">${money(r2(amount))}</td>
    </tr>`;
  });

  // Optional extra charges (transport, cutting, round-off…): flat amounts, already in po.total.
  const chargeRows = ((po.charges ?? []) as { type: string; amount: number }[])
    .filter((c) => num(c.amount))
    .map(
      (c) =>
        `<tr><td colspan="6" class="r">${esc(c.type)}</td><td class="r">${money(r2(num(c.amount)))}</td></tr>`,
    );

  const chargesTotal = ((po.charges ?? []) as { amount: number }[]).reduce((sum, c) => sum + num(c.amount), 0);

  const taxRows = [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .flatMap(([rate, tax]) =>
      split
        ? [
            `<tr><td colspan="6" class="r">CGST ${rate / 2}%</td><td class="r">${money(r2(tax / 2))}</td></tr>`,
            `<tr><td colspan="6" class="r">SGST ${rate / 2}%</td><td class="r">${money(r2(tax / 2))}</td></tr>`,
          ]
        : [
            `<tr><td colspan="6" class="r">${
              po.taxMode === 'IGST' ? 'IGST' : po.taxMode === 'VAT' ? 'VAT' : 'Tax'
            } ${rate}%</td><td class="r">${money(tax)}</td></tr>`,
          ],
    );

  const projectCodes = [
    ...new Set(
      allocs.map(
        (a) =>
          projects.find((p) => String(p._id) === String(a.projectId))?.code ?? '',
      ),
    ),
  ]
    .filter(Boolean)
    .join(', ');
  const projectNames = [
    ...new Set(
      allocs.map(
        (a) =>
          projects.find((p) => String(p._id) === String(a.projectId))?.name ?? '',
      ),
    ),
  ]
    .filter(Boolean)
    .join(', ');

  const deliveryAddress =
    po.deliveryAddress || (po.deliverTo === 'SITE' ? `Site — ${projectCodes}` : 'Main store');
  const billingAddress =
    po.billingAddress ||
    [company?.legalName || company?.name, company?.address].filter(Boolean).join('\n');
  const info = (rows: [string, string][]) =>
    `<table class="info">${rows
      .map(([k, v]) => `<tr><th>${esc(k)}</th><td class="c">:</td><td>${esc(v || '—')}</td></tr>`)
      .join('')}</table>`;
  // Every column carries the designation line, filled or not, so the signature lines stay level.
  const sig = (label: string, name: string | null | undefined, designation = '') =>
    `<div class="sig"><b>${esc(label)}</b><em>${designation ? esc(designation) : '&nbsp;'}</em><span>${name ? esc(name) : '&nbsp;'}</span></div>`;

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(displayNo)}</title>
<style>
  body { font: 13px/1.45 'Helvetica Neue', Arial, sans-serif; color: #16191D; margin: 28px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 2px solid #16191D; padding-bottom: 12px; }
  .pv { display: grid; gap: 3px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 14px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
  th, td { border: 1px solid #D5D1C8; padding: 6px 8px; text-align: left; }
  th { background: #F5F3EE; }
  .r { text-align: right; }
  table:not(.info) td.c, table:not(.info) th.c { text-align: center; }
  .mono { font-family: ui-monospace, Consolas, monospace; font-size: 11px; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin: 16px 0; align-items: start; }
  table.info { margin: 0; font-size: 13px; }
  table.info th, table.info td { border: 0; padding: 2px 0; background: none; vertical-align: top; }
  table.info th { width: 120px; }
  table.info td.c { width: 12px; }
  table.info td:last-child { white-space: pre-line; }
  .sigs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 40px; font-size: 12px; }
  .sig { display: grid; gap: 4px; text-align: center; }
  small.desc { display: block; white-space: pre-line; font-size: 11px; line-height: 1.35; margin-top: 2px; color: #4b5563; }
  .sig em { font-style: normal; font-size: 12px; }
  .sig span { border-top: 1px solid #16191D; margin-top: 24px; padding-top: 4px; min-height: 18px; }
  .terms { white-space: pre-line; font-size: 11px; margin-top: 14px; }
  .logo { max-height: 64px; max-width: 200px; object-fit: contain; margin-right: 12px; }
</style></head>
<body>
  <div class="head">
    <div style="display:flex;align-items:flex-start">
      <img class="logo" src="${esc(printableLogo(company?.logo?.url))}" alt="Chandramari Group">
      <div class="pv">
        <b style="font-size:17px">${esc(company?.legalName || company?.name)}</b>
        <span style="white-space:pre-line">${esc(company?.address)}</span>
        ${company?.taxNo ? `<span>${esc(company.taxLabel)}: ${esc(company.taxNo)}</span>` : ''}
        ${
          company?.phone || company?.email
            ? `<span>${esc([company.phone, company.email].filter(Boolean).join(' · '))}</span>`
            : ''
        }
      </div>
    </div>
    <div class="pv" style="text-align:right">
      <b style="font-size:19px">PURCHASE ORDER</b>
      <span>Status: ${esc(chipFor(PO_ST, po.status).label)}</span>
    </div>
  </div>

  <div class="cols">
    ${info([
      ['Vendor No', vendor?.code ?? ''],
      ['Vendor Name', vendor?.name ?? ''],
      ['Country', vendor?.country ?? ''],
      ['Number', vendor?.phone ?? ''],
      ['Email', vendor?.email ?? ''],
      ['GST No', vendor?.taxNo ?? ''],
    ])}
    ${info([
      ['Order No', displayNo],
      ['Order Date', fmtDate(po.approvedAt ?? po.createdAt)],
      ['Project No', projectCodes],
      ['Project Name', projectNames],
      ['Delivery Address', deliveryAddress],
      ['Billing Address', billingAddress],
      ['Delivery Date', fmtDate(po.deliveryDate)],
    ])}
  </div>

  <table>
    <thead><tr>
      <th class="c" style="width:36px">S.No</th><th>Item Name</th><th>MR No.</th><th>UOM</th>
      <th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th>
    </tr></thead>
    <tbody>
      ${rows.join('')}
      <tr><td colspan="6" class="r">Subtotal</td><td class="r">${money(r2(subtotal))}</td></tr>
      ${taxRows.join('')}
      ${chargeRows.join('')}
      <tr><td colspan="6" class="r"><b>Total ${esc(currency)}</b></td>
          <td class="r"><b>${money(r2(subtotal + taxTotal + chargesTotal))}</b></td></tr>
    </tbody>
  </table>

  <p><b>Payment terms:</b> ${esc(po.terms || '—')} · <b>Tax:</b> ${esc(TAX_MODE_LABELS[po.taxMode])}${
    rfq ? ` · <b>Enquiry:</b> ${esc(rfq.no)}` : ''
  }</p>
  ${company?.poTerms ? `<div class="terms"><b>Terms and conditions</b>\n${esc(company.poTerms)}</div>` : ''}
  ${po.notes ? `<p style="white-space:pre-line"><b>Remarks:</b> ${esc(po.notes)}</p>` : ''}

  <div class="sigs">
    ${sig('Prepared by', creator?.name, 'Procurement Associate')}
    ${sig('Checked by', checker?.name, 'Procurement Manager')}
    ${sig('Verified by', verifier?.name, 'Quantity Survey')}
    ${sig('Approved by', po.status !== 'REJECTED' ? approver?.name : null, 'Executive Director')}
  </div>
</body></html>`;

  return { html, no: displayNo };
}

/** Used by the email worker's subject line and attachment name. */
export async function poNumberFor(poId: string): Promise<string> {
  const po = await Po.findById(poId).select('no rev').lean();
  if (!po) return 'purchase-order';
  return po.no + (num(po.rev) > 0 ? `-Rev${po.rev}` : '');
}

