/**
 * Display formatting.
 * Prototype origin: fmtD, fmtDT, money, qf, dueText, pastDue.
 * §11: dates read `12 Sep 2026` / `12 Sep, 14:30`; money has two decimals.
 */

export const fmtDate = (value?: string | null): string => {
  if (!value) return '—';
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export const fmtDateTime = (value?: string | null): string => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const money = (value?: number | null): string =>
  (value ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Quantities print without trailing zeros, as the prototype's qf() does. */
export const qty = (value?: number | null): string => String(Number(value ?? 0));

export const today = (): string => new Date().toISOString().slice(0, 10);

export const addDays = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export const isPastDue = (due?: string | null): boolean =>
  !!due && new Date(due).getTime() < Date.now();

/** Prototype: dueText(due) — "Due in 1d 4h" / "Closed — due time passed …". */
export function dueText(due?: string | null): {
  text: string;
  tone: 'late' | 'soon' | 'ok';
} {
  if (!due) return { text: '', tone: 'ok' };
  const ms = new Date(due).getTime() - Date.now();
  const abs = Math.abs(ms);
  const days = Math.floor(abs / 864e5);
  const hours = Math.floor((abs % 864e5) / 36e5);
  const minutes = Math.floor((abs % 36e5) / 6e4);

  const parts =
    (days ? `${days}d ` : '') +
    (days < 2 ? `${hours}h ` : '') +
    (days ? '' : `${minutes}m`);
  const text = parts.trim();

  if (ms < 0) return { text: `Closed — due time passed ${text} ago`, tone: 'late' };
  return { text: `Due in ${text}`, tone: ms < 864e5 ? 'soon' : 'ok' };
}

/** A `datetime-local` value n hours from now. Prototype: dtLocal(h). */
export function dateTimeLocal(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3600e3);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
