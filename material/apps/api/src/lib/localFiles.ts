import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { env } from '../env.js';
import { logger } from '../logger.js';

/**
 * Local disk storage, used only when Cloudinary is not configured.
 *
 * Why it exists: the same reason as the in-memory Redis stand-in — a developer
 * without cloud credentials could not upload a BOQ, a logo or an invoice at
 * all, which makes half the app impossible to try. `env.ts` refuses to start
 * production without Cloudinary, so this never runs there.
 *
 * Files land under `.local/uploads`, which is git-ignored. The "public id" is
 * the relative path, and it is validated on the way back out so a crafted id
 * cannot read a file elsewhere on the disk.
 */
const ROOT = resolve(process.cwd(), '../../.local/uploads');

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'text/csv': 'csv',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

export interface LocalStored {
  publicId: string;
  url: string;
}

export async function storeLocally(
  folder: string,
  buffer: Buffer,
  mime: string,
): Promise<LocalStored> {
  const extension = EXTENSIONS[mime] ?? 'bin';
  const publicId = `${folder}/${randomBytes(16).toString('hex')}.${extension}`;
  const target = join(ROOT, publicId);

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, buffer);

  logger.info({ publicId, bytes: buffer.length }, 'stored file on local disk');
  // Served by the API's own download route after a permission check.
  return { publicId, url: `local:${publicId}` };
}

/** Refuses anything that would escape the uploads directory. */
function safePath(publicId: string): string {
  const target = resolve(ROOT, publicId);
  if (!target.startsWith(resolve(ROOT))) {
    throw new Error('Refusing to read outside the uploads directory');
  }
  return target;
}

export const isLocalFile = (url: string | undefined): boolean =>
  !!url && url.startsWith('local:');

export async function readLocally(publicId: string): Promise<Buffer> {
  return readFile(safePath(publicId));
}

export async function removeLocally(publicId: string): Promise<void> {
  const target = safePath(publicId);
  if (existsSync(target)) await unlink(target).catch(() => undefined);
}

/**
 * A short-lived token so a local file behaves like a signed URL: the link the
 * browser gets expires, exactly as the Cloudinary one does.
 */
const TOKEN_TTL_MS = 5 * 60_000;

export function signLocal(publicId: string): string {
  const expires = Date.now() + TOKEN_TTL_MS;
  const signature = createHash('sha256')
    .update(`${publicId}:${expires}:${env.JWT_ACCESS_SECRET}`)
    .digest('hex')
    .slice(0, 32);
  return `${expires}.${signature}`;
}

export function verifyLocal(publicId: string, token: string): boolean {
  const [expiresRaw, signature] = token.split('.');
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || expires < Date.now()) return false;

  const expected = createHash('sha256')
    .update(`${publicId}:${expires}:${env.JWT_ACCESS_SECRET}`)
    .digest('hex')
    .slice(0, 32);
  return signature === expected;
}
