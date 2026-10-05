import { randomBytes } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { MAX_BOQ_BYTES, MAX_LOGO_BYTES, MAX_VENDOR_DOC_BYTES, MSG } from '@cm/shared';
import { badRequest } from './errors.js';
import { cloudinaryConfigured, env } from '../env.js';
import {
  isLocalFile,
  readLocally,
  removeLocally,
  signLocal,
  storeLocally,
} from './localFiles.js';
import { logger } from '../logger.js';

if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export interface StoredFile {
  publicId: string;
  url: string;
  name: string;
  mime: string;
  size: number;
}

/**
 * §13: check the declared MIME *and* the magic bytes. A file renamed to .pdf
 * is still whatever it actually is, and that is what we must judge it on.
 */
const SIGNATURES: { mime: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'application/pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/webp',
    test: (b) =>
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  { mime: 'image/gif', test: (b) => b.subarray(0, 3).toString('latin1') === 'GIF' },
  // .xlsx is a zip; .xls is an OLE compound file.
  {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    test: (b) => b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05),
  },
  {
    mime: 'application/vnd.ms-excel',
    test: (b) =>
      b.subarray(0, 8).equals(
        Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      ),
  },
];

/**
 * A CSV has no magic bytes at all, so the only honest check is that the
 * content really is text. Anything with a NUL byte or invalid UTF-8 is not.
 */
export function looksLikeText(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 4096);
  if (sample.includes(0)) return false;
  return Buffer.from(sample.toString('utf8'), 'utf8').equals(sample);
}

export function detectMime(buffer: Buffer): string | null {
  for (const sig of SIGNATURES) {
    try {
      if (sig.test(buffer)) return sig.mime;
    } catch {
      // a truncated buffer simply does not match
    }
  }
  return null;
}

export function assertAcceptable(
  file: Express.Multer.File,
  allowed: string[],
  maxBytes: number,
  tooLargeMessage: string,
): string {
  if (!file?.buffer?.length) throw badRequest(MSG.docFileRequired);
  if (file.size > maxBytes) throw badRequest(tooLargeMessage);

  const actual = detectMime(file.buffer);
  if (!actual || !allowed.includes(actual)) {
    throw badRequest('That file type is not accepted — use a PDF or an image');
  }
  return actual;
}

/** Random public ids: a document's URL must not be guessable (§13). */
const publicIdFor = (folder: string): string =>
  `${env.CLOUDINARY_FOLDER}/${folder}/${randomBytes(16).toString('hex')}`;

async function upload(
  file: Express.Multer.File,
  folder: string,
  resourceType: 'image' | 'raw',
  mime: string,
): Promise<StoredFile> {
  // Development without cloud credentials: keep it on disk instead, so the
  // feature can still be used. env.ts refuses that in production.
  if (!cloudinaryConfigured) {
    const stored = await storeLocally(folder, file.buffer, mime);
    return {
      publicId: stored.publicId,
      url: stored.url,
      name: file.originalname,
      mime,
      size: file.size,
    };
  }

  const publicId = publicIdFor(folder);
  const result = await new Promise<{ public_id: string; secure_url: string }>(
    (resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          resource_type: resourceType,
          // Documents are served through our own signed-URL endpoint only.
          type: resourceType === 'raw' ? 'authenticated' : 'upload',
          overwrite: false,
        },
        (err, res) => (err || !res ? reject(err) : resolve(res as never)),
      );
      stream.end(file.buffer);
    },
  );

  return {
    publicId: result.public_id,
    url: result.secure_url,
    name: file.originalname,
    mime,
    size: file.size,
  };
}

/** Company logos — PNG/JPG/WebP, ≤ 300 KB. */
export async function uploadImage(
  file: Express.Multer.File,
  folder: string,
): Promise<StoredFile> {
  const mime = assertAcceptable(
    file,
    ['image/png', 'image/jpeg', 'image/webp'],
    MAX_LOGO_BYTES,
    MSG.logoTooLarge,
  );
  return upload(file, folder, 'image', mime);
}

/** Vendor invoices and DOs — PDF or image, ≤ 1 MB. */
export async function uploadDocument(
  file: Express.Multer.File,
  folder: string,
): Promise<StoredFile> {
  const mime = assertAcceptable(
    file,
    ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
    MAX_VENDOR_DOC_BYTES,
    MSG.docTooLarge,
  );
  return upload(file, folder, 'raw', mime);
}

/**
 * The optional bill of quantities attached to an MR — a PDF, a photo of the
 * paper sheet, or a spreadsheet. Larger than a vendor invoice because a BOQ
 * routinely runs to many pages.
 */
export async function uploadBoq(
  file: Express.Multer.File,
  folder: string,
): Promise<StoredFile> {
  if (!file?.buffer?.length) throw badRequest(MSG.docFileRequired);
  if (file.size > MAX_BOQ_BYTES) throw badRequest(MSG.boqTooLarge);

  const detected = detectMime(file.buffer);
  const allowed = [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];

  // A CSV carries no signature, so accept it only when it really is text and
  // the browser said so too.
  const isCsv =
    !detected &&
    /csv|text\/plain/.test(file.mimetype ?? '') &&
    looksLikeText(file.buffer);

  if (!detected && !isCsv) throw badRequest(MSG.boqWrongType);
  if (detected && !allowed.includes(detected)) throw badRequest(MSG.boqWrongType);

  return upload(file, folder, 'raw', detected ?? 'text/csv');
}

/**
 * A short-lived signed URL, handed out only after a permission check (§13).
 */
export function signedUrlFor(publicId: string, seconds = 300): string {
  if (!cloudinaryConfigured) {
    // Served by our own download route, with an expiring token in the query.
    // Absolute from the site root, because the browser follows this link as-is.
    // Behind the gateway the site root is PUBLIC_BASE_PATH (e.g. /material).
    return `${env.PUBLIC_BASE_PATH}/api/files/${encodeURIComponent(publicId)}?t=${signLocal(publicId)}`;
  }
  return cloudinary.utils.private_download_url(publicId, '', {
    resource_type: 'raw',
    expires_at: Math.floor(Date.now() / 1000) + seconds,
  });
}

/** Reads a locally stored file back, for the download route. */
export const readLocalFile = readLocally;
export { isLocalFile };

export async function deleteFile(
  publicId: string,
  resourceType: 'image' | 'raw' = 'raw',
): Promise<void> {
  if (!cloudinaryConfigured) {
    await removeLocally(publicId);
    return;
  }
  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      type: resourceType === 'raw' ? 'authenticated' : 'upload',
    });
  } catch (err) {
    // A stale file costs a few kilobytes; failing the request costs the user.
    logger.warn({ err, publicId }, 'could not delete stored file');
  }
}
