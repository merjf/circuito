import { startOfWeek } from '../src/domain/dates';
import { minutesPerWeek, peakMinutes, sessionsThisMonth, weekStreak } from '../src/domain/stats';
import type { Session } from '../src/domain/types';

const NOW = new Date('2026-08-15T10:00:00'); // a Saturday

function session(startedAt: string, elapsedSeconds = 600): Session {
  return {
    id: `se_${startedAt}`,
    trainingId: 'tr',
    trainingName: 'Circuito solo gambe',
    startedAt,
    endedAt: startedAt,
    elapsedSeconds,
    workSeconds: Math.round(elapsedSeconds * 0.6),
    restSeconds: Math.round(elapsedSeconds * 0.4),
    roundsCompleted: 3,
    roundsPlanned: 3,
    skippedRests: 0,
    completed: true,
  };
}

describe('startOfWeek', () => {
  it('treats Monday as the first day', () => {
    // 2026-08-15 is a Saturday; its week starts Monday the 10th.
    expect(startOfWeek(NOW).getDate()).toBe(10);
  });

  it('does not roll a Sunday forward into the next week', () => {
    const sunday = new Date('2026-08-16T10:00:00');
    expect(startOfWeek(sunday).getDate()).toBe(10);
  });
});

describe('weekStreak', () => {
  it('is zero with no sessions', () => {
    expect(weekStreak([], NOW)).toBe(0);
  });

  it('counts consecutive weeks back from this one', () => {
    const sessions = [
      session('2026-08-11T10:00:00'), // this week
      session('2026-08-05T10:00:00'), // last week
      session('2026-07-29T10:00:00'), // the week before
    ];
    expect(weekStreak(sessions, NOW)).toBe(3);
  });

  it('does not break just because this week has not started yet', () => {
    // Nothing this week, but the two before are covered — the streak survives
    // Monday morning rather than resetting to zero.
    const sessions = [session('2026-08-05T10:00:00'), session('2026-07-29T10:00:00')];
    expect(weekStreak(sessions, NOW)).toBe(2);
  });

  it('stops at the first missed week', () => {
    const sessions = [
      session('2026-08-11T10:00:00'),
      // 2026-08-03 week skipped
      session('2026-07-29T10:00:00'),
    ];
    expect(weekStreak(sessions, NOW)).toBe(1);
  });

  it('counts several sessions in one week once', () => {
    const sessions = [session('2026-08-11T10:00:00'), session('2026-08-13T10:00:00')];
    expect(weekStreak(sessions, NOW)).toBe(1);
  });
});

describe('sessionsThisMonth', () => {
  it('counts only the current calendar month', () => {
    const sessions = [
      session('2026-08-01T10:00:00'),
      session('2026-08-14T10:00:00'),
      session('2026-07-31T10:00:00'),
    ];
    expect(sessionsThisMonth(sessions, NOW)).toBe(2);
  });
});

describe('minutesPerWeek', () => {
  it('returns eight weeks, oldest first, current last', () => {
    const bars = minutesPerWeek([], 8, NOW);
    expect(bars).toHaveLength(8);
    expect(bars[7]!.isCurrent).toBe(true);
    expect(bars[0]!.isCurrent).toBe(false);
    expect(bars[0]!.weekStart.getTime()).toBeLessThan(bars[7]!.weekStart.getTime());
  });

  it('keeps empty weeks as zeroes so the chart shows the gap', () => {
    const bars = minutesPerWeek([session('2026-08-11T10:00:00', 1800)], 8, NOW);
    expect(bars[7]!.minutes).toBe(30);
    expect(bars.slice(0, 7).every((b) => b.minutes === 0)).toBe(true);
  });

  it('sums several sessions in the same week', () => {
    const bars = minutesPerWeek(
      [session('2026-08-11T10:00:00', 600), session('2026-08-13T10:00:00', 900)],
      8,
      NOW,
    );
    expect(bars[7]!.minutes).toBe(25);
  });

  it('ignores sessions older than the window', () => {
    const bars = minutesPerWeek([session('2025-01-01T10:00:00', 3600)], 8, NOW);
    expect(bars.every((b) => b.minutes === 0)).toBe(true);
  });
});

describe('peakMinutes', () => {
  it('never returns zero, so an empty chart cannot divide by it', () => {
    expect(peakMinutes(minutesPerWeek([], 8, NOW))).toBe(1);
  });
});
