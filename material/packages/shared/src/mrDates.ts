/**
 * The earliest "required date" a site engineer may put on an MR.
 *
 * Procurement needs time to buy: the next MR_BLOCKED_DAYS days cannot be chosen.
 * An MR raised on the 8th can ask for material from the 14th (9th–13th blocked).
 * Dates are counted in India time, so the form and the server agree whatever
 * clock the browser or the container keeps.
 */
export const MR_BLOCKED_DAYS = 5;

/** Today in India, as YYYY-MM-DD. */
export const indiaToday = (): string =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export function earliestRequiredDate(from: string = indiaToday()): string {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + MR_BLOCKED_DAYS + 1);
  return d.toISOString().slice(0, 10);
}
