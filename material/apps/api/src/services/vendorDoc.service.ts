import { num } from '@cm/calc';
import {
  MSG,
  type DocListQuery,
  type RejectDocInput,
  type VendorDocDto,
  type VendorDocInput,
} from '@cm/shared';
import { inTransaction } from '../db.js';
import { AUDIT, writeAudit } from '../lib/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { emit } from '../lib/notify.js';
import { bumpSyncStamp } from '../lib/sync.js';
import { buildLookups } from '../lib/lookups.js';
import { deleteFile, signedUrlFor, uploadDocument } from '../lib/files.js';
import { enqueueEmails } from '../jobs/queues.js';
import { Po, VendorDoc } from '../models/po.js';
import { isBuyer } from '@cm/shared';
import type { Actor } from '../middleware/auth.js';

/**
 * Vendor invoices and delivery orders.
 * Prototype origin: VIEWS.docs / vdocs, docForm(), A.uploadDoc (the second
 * definition), A.docOk, A.doDocNo, A.viewFile.
 */

async function toDto(
  doc: Record<string, any>,
  poNo: string,
  vendorName: string,
): Promise<VendorDocDto> {
  return {
    id: String(doc._id),
    rv: doc.rv ?? 0,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    poId: String(doc.poId),
    poNo,
    vendorId: String(doc.vendorId),
    vendorName,
    docType: doc.docType,
    docNo: doc.docNo,
    docDate: doc.docDate ?? '',
    amount: num(doc.amount),
    fileName: doc.file?.name ?? '',
    status: doc.status,
    remark: doc.remark ?? '',
    uploadedAt: doc.uploadedAt.toISOString(),
  };
}

export async function listDocs(
  actor: Actor,
  query: DocListQuery,
): Promise<VendorDocDto[]> {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;

  // A vendor sees only its own documents (§3).
  if (actor.role === 'VENDOR') {
    if (!actor.vendorId) throw forbidden();
    filter.vendorId = actor.vendorId;
  } else if (!isBuyer(actor.role) && actor.role !== 'ADMIN' && actor.role !== 'MGMT') {
    throw forbidden();
  }

  const [docs, lookups] = await Promise.all([
    VendorDoc.find(filter).sort({ uploadedAt: -1 }).lean(),
    buildLookups(),
  ]);

  const pos = await Po.find({ _id: { $in: docs.map((d) => d.poId) } })
    .select('no rev')
    .lean();

  return Promise.all(
    docs.map((doc) => {
      const po = pos.find((p) => String(p._id) === String(doc.poId));
      return toDto(
        doc,
        po ? po.no + (num(po.rev) > 0 ? ` Rev ${po.rev}` : '') : '',
        lookups.vendorName(doc.vendorId),
      );
    }),
  );
}

/** Prototype: A.uploadDoc — a vendor attaches an invoice or DO to one of its POs. */
export async function uploadVendorDoc(
  actor: Actor,
  input: VendorDocInput,
  file: Express.Multer.File | undefined,
): Promise<VendorDocDto> {
  if (actor.role !== 'VENDOR' || !actor.vendorId) throw forbidden();
  if (!file) throw badRequest(MSG.docFileRequired);

  const po = await Po.findById(input.poId).lean();
  if (!po) throw badRequest(MSG.docChoosePo);
  if (String(po.vendorId) !== actor.vendorId) throw forbidden();
  if (!['APPROVED', 'PARTIAL', 'RECEIVED'].includes(po.status)) {
    throw conflict('You can only upload against an approved PO');
  }
  if (input.docType === 'INVOICE' && num(input.amount) <= 0) {
    throw badRequest(MSG.docAmountRequired);
  }

  // Validates the MIME *and* the magic bytes, and enforces the 1 MB cap (§13).
  const stored = await uploadDocument(file, 'vendor-docs');

  const lookups = await buildLookups();
  const display = po.no + (num(po.rev) > 0 ? ` Rev ${po.rev}` : '');

  try {
    const result = await inTransaction(async (session) => {
      const [doc] = await VendorDoc.create(
        [
          {
            poId: po._id,
            vendorId: actor.vendorId,
            docType: input.docType,
            docNo: input.docNo,
            docDate: input.docDate,
            amount: num(input.amount),
            file: stored,
            status: 'SUBMITTED',
            uploadedBy: actor.id,
            uploadedAt: new Date(),
          },
        ],
        { session, ordered: true },
      );

      await writeAudit(
        session,
        'PO',
        po._id,
        AUDIT.PO_DOC_UPLOADED(input.docType),
        actor.id,
        input.docNo,
      );

      const outbox = await emit(session, 'VENDOR_DOC', {
        title: `${lookups.vendorName(po.vendorId)} uploaded ${
          input.docType === 'DO' ? 'delivery order' : 'invoice'
        } ${input.docNo} for ${display}`,
        body: input.docType === 'INVOICE' ? `Amount ${num(input.amount)}` : '',
        link: `po:${String(po._id)}`,
        to: [{ role: 'PROC' }],
        actorId: actor.id,
      });

      await bumpSyncStamp(session);
      return { doc: doc!, outbox };
    });

    await enqueueEmails(result.outbox);
    return toDto(result.doc.toObject(), display, lookups.vendorName(po.vendorId));
  } catch (err) {
    // Do not leave an orphan file behind if the write failed.
    await deleteFile(stored.publicId, 'raw');
    throw err;
  }
}

export async function verifyDoc(actor: Actor, id: string): Promise<void> {
  if (!isBuyer(actor.role)) throw forbidden();

  await inTransaction(async (session) => {
    const doc = await VendorDoc.findById(id).session(session);
    if (!doc) throw notFound();
    if (doc.status !== 'SUBMITTED') throw conflict('That document has already been checked');

    doc.status = 'VERIFIED';
    doc.remark = '';
    doc.checkedBy = actor.id as never;
    await doc.save({ session });

    await writeAudit(session, 'PO', doc.poId, AUDIT.PO_DOC_VERIFIED, actor.id, doc.docNo);
    await bumpSyncStamp(session);
  });
}

export async function rejectDoc(
  actor: Actor,
  id: string,
  input: RejectDocInput,
): Promise<void> {
  if (!isBuyer(actor.role)) throw forbidden();

  await inTransaction(async (session) => {
    const doc = await VendorDoc.findById(id).session(session);
    if (!doc) throw notFound();
    if (doc.status !== 'SUBMITTED') throw conflict('That document has already been checked');

    doc.status = 'REJECTED';
    doc.remark = input.remark;
    doc.checkedBy = actor.id as never;
    await doc.save({ session });

    await writeAudit(
      session,
      'PO',
      doc.poId,
      AUDIT.PO_DOC_REJECTED,
      actor.id,
      `${doc.docNo} · ${input.remark}`,
    );
    await bumpSyncStamp(session);
  });
}

/**
 * §13: the file is served through a short-lived signed URL, and only after the
 * permission check — never by handing out the storage URL.
 */
export async function fileUrlFor(actor: Actor, id: string): Promise<string> {
  const doc = await VendorDoc.findById(id).lean();
  if (!doc) throw notFound();

  const allowed =
    isBuyer(actor.role) ||
    actor.role === 'ADMIN' ||
    (actor.role === 'VENDOR' && String(doc.vendorId) === actor.vendorId);
  if (!allowed) throw forbidden();

  return signedUrlFor(doc.file.publicId);
}
