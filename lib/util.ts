// Small pure helpers: dates (all trip dates are YYYY-MM-DD, handled in UTC) and money formatting.

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const toDate = (ymd: string) => new Date(ymd + "T00:00:00Z");
export const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(date: string, n: number): string {
  const d = toDate(date);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}

export const weekday = (date: string) => toDate(date).getUTCDay();
export const monthOf = (date: string) => Number(date.slice(5, 7));

/** "Fri 16 Oct" */
export function shortDate(date: string): string {
  const d = toDate(date);
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}

/** "16 Oct 2026" */
export function longDate(date: string): string {
  const d = toDate(date);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Today's date in India (YYYY-MM-DD). */
export function todayIST(now: Date = new Date()): string {
  return ymd(new Date(now.getTime() + 5.5 * 3600_000));
}

/** "Sat 26 Sep, 9:00 PM IST" */
export function formatIST(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 5.5 * 3600_000);
  let h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}, ${h}:${String(m).padStart(2, "0")} ${ampm} IST`;
}

/** ISO timestamp for `date` at hh:mm IST. */
export function istToIso(date: string, hh = 21, mm = 0): string {
  const utc = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), hh, mm) - 5.5 * 3600_000;
  return new Date(utc).toISOString();
}

export const round50 = (x: number) => Math.round(x / 50) * 50;
export const round500 = (x: number) => Math.round(x / 500) * 500;

/** ₹18,000 (Indian grouping) */
export const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

/** "~₹2k", "~₹1.5k", "~₹500" — for gaps. */
export function approxK(n: number): string {
  const r = Math.max(500, round500(n));
  if (r < 1000) return `~₹${r}`;
  const k = r / 1000;
  return `~₹${Number.isInteger(k) ? k : k.toFixed(1)}k`;
}

export function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  const union = new Set([...A, ...B]).size;
  return union ? inter / union : 0;
}
