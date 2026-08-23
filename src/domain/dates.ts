/**
 * Date formatting for history and session rows.
 *
 * The mock's dates read "Wed 12 Aug", "Thu 14 Aug, 9:41" and "Jun 23" — short,
 * mono, no year. Built on `toLocaleDateString` with an explicit `en-GB` locale
 * rather than the device locale, so the day-then-month order matches the mock
 * regardless of where the phone thinks it is. If the app is ever localised,
 * this is the one place that changes.
 */

const DAY_MONTH: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
const MONTH_DAY: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
const LOCALE = 'en-GB';

/** "Wed 12 Aug" */
export function formatDayDate(iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE, DAY_MONTH);
}

/** "Thu 14 Aug, 9:41" — the summary's timestamp line. */
export function formatDayDateTime(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit', hour12: false });
  return `${d.toLocaleDateString(LOCALE, DAY_MONTH)}, ${time}`;
}

/** "Jun 23" — the week captions under the history bars. */
export function formatShortDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString(LOCALE, MONTH_DAY);
}

/** Midnight on the Monday of the week containing `d`. Weeks start Monday. */
export function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  // getDay(): 0 = Sunday. Shift so Monday is 0.
  const offset = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - offset);
  return out;
}

export function addWeeks(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n * 7);
  return out;
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** Midnight on the 1st of the month containing `d`. */
export function startOfMonth(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(1);
  return out;
}

/** Days in the month containing `d`. Day 0 of the next month IS the last. */
export function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/**
 * How many blank cells precede the 1st in a Monday-first calendar grid.
 *
 * Monday-first to match `startOfWeek`, which the streak and the week bars
 * already depend on. A calendar that started on Sunday while the bars beside
 * it counted from Monday would put the same workout in two different weeks on
 * one screen.
 */
export function leadingBlanks(d: Date): number {
  return (startOfMonth(d).getDay() + 6) % 7;
}

/** "August 2026" — the calendar's caption. */
export function formatMonth(d: Date): string {
  return d.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });
}

/**
 * A local-time day key, `YYYY-MM-DD`.
 *
 * Deliberately NOT `toISOString().slice(0, 10)`: that converts to UTC first,
 * so a session finished at 00:30 in Rome lands on the previous day and the
 * calendar shows a gap on a day you trained. Timestamps are stored as UTC
 * ISO strings; days are a local-calendar idea.
 */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}
