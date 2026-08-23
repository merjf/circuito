/**
 * The consistency grid and the sets-per-tag bars.
 *
 * Two things worth pinning here that are easy to get wrong and invisible when
 * you do: the grid's Monday-first alignment (a calendar that disagreed with
 * `startOfWeek` would put one workout in two different weeks on one screen),
 * and the fact that day boundaries are LOCAL — a session finished at half past
 * midnight belongs to the day you were awake for, not the UTC one.
 */

import { dayKey, daysInMonth, leadingBlanks, startOfMonth } from '../src/domain/dates';
import { monthGrid, monthSummary, setsByTag } from '../src/domain/stats';
import type { Exercise, Session, SetLog } from '../src/domain/types';

let counter = 0;
const session = (startedAt: string): Session => ({
  id: `se_${counter++}`,
  trainingId: 'tr_1',
  trainingName: 'Circuito Braccia',
  startedAt,
  endedAt: startedAt,
  elapsedSeconds: 1800,
  workSeconds: 0,
  restSeconds: 0,
  roundsCompleted: 3,
  roundsPlanned: 3,
  skippedRests: 0,
  completed: true,
});

const log = (exerciseId: string): SetLog => ({
  id: `sl_${counter++}`,
  sessionId: 'se_1',
  exerciseId,
  exerciseName: 'x',
  roundIndex: 1,
  setIndex: 1,
  type: 'normal',
  completedAt: '2026-08-18T10:00:00.000Z',
});

const exercise = (id: string, tags: string[]): Exercise => ({
  id,
  name: id,
  type: 'weightReps',
  tags,
  createdAt: '',
  updatedAt: '',
});

describe('date helpers', () => {
  it('counts the days in a month, leap years included', () => {
    expect(daysInMonth(new Date(2026, 7, 15))).toBe(31); // August
    expect(daysInMonth(new Date(2026, 1, 5))).toBe(28); // Feb 2026
    expect(daysInMonth(new Date(2028, 1, 5))).toBe(29); // Feb 2028, a leap year
  });

  it('pads to Monday, not Sunday', () => {
    // 1 August 2026 is a Saturday, so a Monday-first grid needs five blanks.
    // Sunday-first would need six, and would disagree with `startOfWeek` —
    // which the streak and the week bars already use.
    expect(startOfMonth(new Date(2026, 7, 20)).getDay()).toBe(6);
    expect(leadingBlanks(new Date(2026, 7, 20))).toBe(5);
  });

  it('keys days by LOCAL date, not UTC', () => {
    // The bug this prevents: `toISOString().slice(0,10)` on a session finished
    // at 00:30 in Rome reports the previous day, and the calendar shows a gap
    // on a day you trained.
    const justAfterMidnight = new Date(2026, 7, 18, 0, 30);
    expect(dayKey(justAfterMidnight)).toBe('2026-08-18');
  });
});

describe('monthGrid', () => {
  const now = new Date(2026, 7, 18, 12, 0); // Tue 18 August 2026

  it('is blanks plus one cell per day', () => {
    const cells = monthGrid([], now);
    expect(cells).toHaveLength(5 + 31);
    expect(cells.slice(0, 5).every((c) => c.day === null)).toBe(true);
    expect(cells[5]!.day).toBe(1);
    expect(cells[cells.length - 1]!.day).toBe(31);
  });

  it('renders in full for an empty month rather than not at all', () => {
    // An empty grid teaches the model — this is a thing that fills in when you
    // train. A missing one reads as a screen still loading.
    expect(monthGrid([], now).filter((c) => c.day != null)).toHaveLength(31);
  });

  it('counts sessions onto their day', () => {
    const cells = monthGrid(
      [
        session(new Date(2026, 7, 17, 9, 0).toISOString()),
        session(new Date(2026, 7, 17, 18, 0).toISOString()),
        session(new Date(2026, 7, 3, 9, 0).toISOString()),
      ],
      now,
    );
    const day = (n: number) => cells.find((c) => c.day === n)!;
    expect(day(17).sessions).toBe(2);
    expect(day(3).sessions).toBe(1);
    expect(day(4).sessions).toBe(0);
  });

  it('ignores sessions from other months', () => {
    const cells = monthGrid([session(new Date(2026, 6, 17, 9, 0).toISOString())], now);
    expect(cells.every((c) => c.sessions === 0)).toBe(true);
  });

  it('marks today, and tells future days from empty past ones', () => {
    const cells = monthGrid([], now);
    const day = (n: number) => cells.find((c) => c.day === n)!;
    expect(day(18).isToday).toBe(true);
    // An empty Tuesday next week is not a Tuesday you missed.
    expect(day(17).isFuture).toBe(false);
    expect(day(19).isFuture).toBe(true);
  });
});

describe('setsByTag', () => {
  const library = [
    exercise('ex_1', ['Gambe']),
    exercise('ex_2', ['Braccia']),
    exercise('ex_3', ['Gambe', 'Core']),
  ];

  it('counts sets, not kilograms', () => {
    // Kilograms cannot compare a bodyweight plank to a weighted curl, and a
    // chart where half the work is invisible is worse than no chart.
    const result = setsByTag([log('ex_1'), log('ex_1'), log('ex_2')], library);
    expect(result).toEqual([
      { tag: 'Gambe', sets: 2 },
      { tag: 'Braccia', sets: 1 },
    ]);
  });

  it('counts a two-tag exercise toward BOTH', () => {
    // Which is why the screen draws independent bars and never a pie: the
    // parts deliberately do not sum to the work done.
    expect(setsByTag([log('ex_3')], library)).toEqual([
      { tag: 'Core', sets: 1 },
      { tag: 'Gambe', sets: 1 },
    ]);
  });

  it('sorts by count, then alphabetically for a tie', () => {
    const result = setsByTag([log('ex_1'), log('ex_2'), log('ex_2')], library);
    expect(result.map((r) => r.tag)).toEqual(['Braccia', 'Gambe']);
  });

  it('ignores logs whose exercise has no tags, or is gone', () => {
    expect(setsByTag([log('ex_deleted')], library)).toEqual([]);
    expect(setsByTag([log('ex_1')], [exercise('ex_1', [])])).toEqual([]);
  });

  it('is empty for no logs', () => {
    expect(setsByTag([], library)).toEqual([]);
  });
});

describe('monthSummary', () => {
  const now = new Date(2026, 7, 18, 12, 0); // Tue 18 August 2026

  const at = (y: number, m: number, d: number, seconds = 1800): Session => ({
    ...session(new Date(y, m, d, 9, 0).toISOString()),
    elapsedSeconds: seconds,
  });

  it('counts sessions, minutes and DISTINCT days', () => {
    // Two sessions on one day is two sessions but one day trained — the
    // distinction is the whole point of showing both numbers.
    const summary = monthSummary(
      [at(2026, 7, 3, 1800), at(2026, 7, 17, 600), at(2026, 7, 17, 600)],
      now,
    );
    expect(summary.sessions).toBe(3);
    expect(summary.minutes).toBe(50);
    expect(summary.daysTrained).toBe(2);
  });

  it('reports days elapsed, not days in the month', () => {
    // "4 of 18" on the 18th is a fact. "4 of 31" would be a comparison
    // against a month that has not happened yet.
    expect(monthSummary([], now).daysElapsed).toBe(18);
  });

  it('counts the whole of last month for comparison', () => {
    const summary = monthSummary([at(2026, 6, 2), at(2026, 6, 28), at(2026, 7, 1)], now);
    expect(summary.sessions).toBe(1);
    expect(summary.sessionsLastMonth).toBe(2);
  });

  it('crosses the year boundary when looking back', () => {
    const january = new Date(2026, 0, 10, 12, 0);
    const summary = monthSummary([at(2025, 11, 20)], january);
    expect(summary.sessionsLastMonth).toBe(1);
  });

  it('is all zeros with no history', () => {
    const summary = monthSummary([], now);
    expect(summary.sessions).toBe(0);
    expect(summary.minutes).toBe(0);
    expect(summary.daysTrained).toBe(0);
    expect(summary.sessionsLastMonth).toBe(0);
  });
});
