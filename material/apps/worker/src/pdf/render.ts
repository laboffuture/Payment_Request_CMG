import puppeteer, { type Browser } from 'puppeteer';
import { logger } from '@cm/api';

/**
 * HTML → PDF, for the documents attached to emails (§1).
 *
 * One browser is kept warm and reused: launching Chromium costs about a second,
 * and an approved PO should not wait for that. It is relaunched automatically
 * if it dies.
 */
let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser?.connected) return browser;
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    ...(process.env.PUPPETEER_EXECUTABLE_PATH
      ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
      : {}),
  });
  logger.info('pdf renderer started');
  return browser;
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const page = await (await getBrowser()).newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', right: '10mm', bottom: '14mm', left: '10mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => undefined);
  }
}

export async function closeRenderer(): Promise<void> {
  await browser?.close().catch(() => undefined);
  browser = null;
}
