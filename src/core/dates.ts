// Dates are stored as local ISO date-times without zone ("2026-09-29T14:32:10"),
// because a photo taken at 23:30 belongs to that evening no matter where the
// phone travels later. `nowLocal()` produces the same format.

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

export function toLocalIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export const nowLocal = (now = new Date()) => toLocalIso(now);

/** Parses our local ISO format (and full ISO strings) into a Date. */
export function parseLocal(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  return new Date(s);
}

export const dayOf = (s: string) => s.slice(0, 10);
export const monthOf = (s: string) => s.slice(0, 7);

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

/** "September 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function monthShort(month: string): string {
  return MONTHS_SHORT[Number(month.split('-')[1]) - 1];
}

/** "29. September 2026" */
export function dateLabel(s: string): string {
  const d = parseLocal(s);
  return `${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "29.09.2026" */
export function dateShort(s: string): string {
  const d = parseLocal(s);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** Whole days between two local ISO strings (b - a). */
export function daysBetween(a: string, b: string): number {
  const da = parseLocal(dayOf(a));
  const db = parseLocal(dayOf(b));
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

/** "heute", "gestern", "vor 5 Tagen", "vor 3 Monaten", "vor 2 Jahren" */
export function relativeLabel(s: string, now: string): string {
  const days = daysBetween(s, now);
  if (days <= 0) return 'heute';
  if (days === 1) return 'gestern';
  if (days < 30) return `vor ${days} Tagen`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return months === 1 ? 'vor einem Monat' : `vor ${months} Monaten`;
  const years = Math.floor(days / 365.25);
  return years === 1 ? 'vor einem Jahr' : `vor ${years} Jahren`;
}

/** The last `n` months up to and including the month of `now`, oldest first ("2026-09"). */
export function lastMonths(now: string, n: number): string[] {
  const d = parseLocal(now);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${pad(m.getMonth() + 1)}`);
  }
  return out;
}
