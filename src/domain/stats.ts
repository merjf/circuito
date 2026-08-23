/**
 * History aggregation for 1l. Pure functions over the session list.
 *
 * All three figures on that screen — the streak, the month count and the
 * eight-bar chart — are derived from `Session[]` on read. Nothing is cached or
 * stored, because at this scale (a few hundred sessions over years) the whole
 * table is cheap to sweep and a stale cached streak is worse than no streak.
 */

import { addWeeks, dayKey, daysInMonth, isSameMonth, leadingBlanks, startOfWeek } from './dates';
import type { Exercise, Session, SetLog } from './types';

export interface WeekBar {
  weekStart: Date;
  minutes: number;
  isCurrent: boolean;
}

/**
 * Consecutive weeks with at least one session, counting back from this week.
 *
 * The current week counts only if it already has a session — otherwise the
 * streak would break every Monday morning and reappear on the first workout,
 * which reads as a bug. So an empty current week is skipped rather than
 * treated as a zero, and the streak is measured from last week instead.
 */
export function weekStreak(sessions: Session[], now = new Date()): number {
  if (sessions.length === 0) return 0;

  const weeks = new Set(
    sessions.map((s) => startOfWeek(new Date(s.startedAt)).getTime()),
  );

  const thisWeek = startOfWeek(now);
  let cursor = weeks.has(thisWeek.getTime()) ? thisWeek : addWeeks(thisWeek, -1);

  let streak = 0;
  while (weeks.has(cursor.getTime())) {
    streak++;
    cursor = addWeeks(cursor, -1);
  }
  return streak;
}

/** Sessions started in the current calendar month. */
export function sessionsThisMonth(sessions: Session[], now = new Date()): number {
  return sessions.filter((s) => isSameMonth(new Date(s.startedAt), now)).length;
}

/**
 * Minutes trained per week for the last `count` weeks, oldest first, with the
 * current week last and flagged so it can be drawn in `ink-strong`.
 * Weeks with no sessions are present with zero — the chart needs the gap.
 */
export function minutesPerWeek(sessions: Session[], count = 8, now = new Date()): WeekBar[] {
  const thisWeek = startOfWeek(now);
  const bars: WeekBar[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const weekStart = addWeeks(thisWeek, -i);
    bars.push({ weekStart, minutes: 0, isCurrent: i === 0 });
  }

  const byWeek = new Map(bars.map((b) => [b.weekStart.getTime(), b]));
  for (const s of sessions) {
    const key = startOfWeek(new Date(s.startedAt)).getTime();
    const bar = byWeek.get(key);
    if (bar) bar.minutes += s.elapsedSeconds / 60;
  }

  for (const bar of bars) bar.minutes = Math.round(bar.minutes);
  return bars;
}

/** Longest bar in the set, floored at 1 so an all-zero chart doesn't divide by zero. */
export function peakMinutes(bars: WeekBar[]): number {
  return Math.max(1, ...bars.map((b) => b.minutes));
}

// ── The consistency grid ───────────────────────────────────────────────────

export interface CalendarCell {
  /** 1-based day of the month, or null for a leading blank. */
  day: number | null;
  /** Sessions started on this day. */
  sessions: number;
  isToday: boolean;
  /** A day that has not happened yet — drawn fainter than an empty past day. */
  isFuture: boolean;
}

/**
 * One month as a Monday-first grid, blanks included.
 *
 * Answers "am I showing up", which the eight-week minutes chart cannot: a
 * fortnight of long sessions followed by a fortnight of nothing draws the same
 * total as four steady weeks.
 *
 * A future day is marked rather than omitted, because a half-drawn month reads
 * as a rendering bug. An empty PAST day is the information here; an empty
 * future day is just a day.
 */
export function monthGrid(sessions: Session[], now = new Date()): CalendarCell[] {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    const started = new Date(session.startedAt);
    if (!isSameMonth(started, now)) continue;
    const key = dayKey(started);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const cells: CalendarCell[] = [];
  for (let i = 0; i < leadingBlanks(now); i++) {
    cells.push({ day: null, sessions: 0, isToday: false, isFuture: false });
  }

  const today = now.getDate();
  for (let day = 1; day <= daysInMonth(now); day++) {
    const date = new Date(now.getFullYear(), now.getMonth(), day);
    cells.push({
      day,
      sessions: counts.get(dayKey(date)) ?? 0,
      isToday: day === today,
      isFuture: day > today,
    });
  }
  return cells;
}

// ── The month in one object ────────────────────────────────────────────────

export interface MonthSummary {
  sessions: number;
  minutes: number;
  /** Distinct days trained this month. */
  daysTrained: number;
  /** Days of the month that have actually happened, today included. */
  daysElapsed: number;
  /** The same count for the whole of last month, for comparison. */
  sessionsLastMonth: number;
}

/**
 * The numbers behind the expandable "This month" card.
 *
 * Deliberately NOT a separate report screen. A monthly review is something you
 * glance at while you are already looking at History; giving it its own route
 * makes it a destination you have to remember to visit, and a destination you
 * forget is worse than a card you did not expand.
 *
 * `sessionsLastMonth` covers the WHOLE previous month, not the same number of
 * days into it. That makes the comparison unfair early in a month and the card
 * says so rather than hiding it — a fair-but-invented "pace" figure would be a
 * projection, and this app does not print projections as facts.
 */
export function monthSummary(sessions: Session[], now = new Date()): MonthSummary {
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  let count = 0;
  let seconds = 0;
  let previous = 0;
  const days = new Set<string>();

  for (const session of sessions) {
    const started = new Date(session.startedAt);
    if (isSameMonth(started, now)) {
      count++;
      seconds += session.elapsedSeconds;
      days.add(dayKey(started));
    } else if (isSameMonth(started, lastMonth)) {
      previous++;
    }
  }

  return {
    sessions: count,
    minutes: Math.round(seconds / 60),
    daysTrained: days.size,
    daysElapsed: now.getDate(),
    sessionsLastMonth: previous,
  };
}

// ── Sets per tag ───────────────────────────────────────────────────────────

export interface TagVolume {
  tag: string;
  sets: number;
}

/**
 * How many sets each tag took, over the logs given.
 *
 * This is Hevy's muscle-group chart, built on a taxonomy the user already
 * authors: `Exercise.tags` drives the library's filter pills, so no second
 * classification has to be invented or kept in step with the first.
 *
 * SETS rather than kilograms, deliberately. Volume in kg cannot compare a
 * bodyweight plank to a weighted curl, and a chart where half the work is
 * invisible is worse than no chart. Counting sets treats every exercise as
 * something you did.
 *
 * An exercise carrying two tags counts once toward EACH, so the totals are
 * per-tag answers rather than slices of a whole. That is why the screen draws
 * them as independent bars and never as a pie: the parts do not sum to the
 * work done.
 *
 * Warm-ups count here. This measures where the work went, and a warm-up set is
 * still work aimed at that part of the body — records exclude them because
 * that is a different question (see `domain/records.ts`).
 */
export function setsByTag(logs: SetLog[], exercises: Iterable<Exercise>): TagVolume[] {
  const tagsById = new Map<string, string[]>();
  for (const exercise of exercises) tagsById.set(exercise.id, exercise.tags);

  const totals = new Map<string, number>();
  for (const log of logs) {
    for (const tag of tagsById.get(log.exerciseId) ?? []) {
      totals.set(tag, (totals.get(tag) ?? 0) + 1);
    }
  }

  return [...totals.entries()]
    .map(([tag, sets]) => ({ tag, sets }))
    .sort((a, b) => b.sets - a.sets || a.tag.localeCompare(b.tag));
}
