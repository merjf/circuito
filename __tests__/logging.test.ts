/**
 * Reading a session's set log back.
 *
 * The definitions here decide what History, the streak and the summary say
 * about a workout, so they are worth pinning independently of the screen that
 * produces them — the screen can be rewritten; "a round is done when every
 * exercise in it has been logged" should not quietly change with it.
 */

import {
  formatLog,
  formatSetClock,
  hasAnyLog,
  logsForSlot,
  previousFor,
  roundsCompletedFrom,
  rowsNeeded,
} from '../src/domain/logging';
import type { Block, SetLog, Step, Training } from '../src/domain/types';

const step = (id: string): Step => ({
  id,
  exerciseId: `ex-${id}`,
  workSeconds: 45,
  restAfterSeconds: 20,
});

const block = (id: string, steps: Step[], repeat = 3): Block => ({
  id,
  label: 'Block A',
  repeat,
  restBetweenRoundsSeconds: 60,
  steps,
});

const training = (blocks: Block[]): Training => ({
  id: 'tr',
  name: 'Circuito',
  prepareSeconds: 0,
  blocks,
  createdAt: '',
  updatedAt: '',
});

let counter = 0;
const log = (over: Partial<SetLog> = {}): SetLog => ({
  id: `sl_${counter++}`,
  sessionId: 'se_1',
  exerciseId: 'ex-s1',
  exerciseName: 'Curl bicipiti',
  stepId: 's1',
  roundIndex: 1,
  setIndex: 1,
  type: 'normal',
  completedAt: '2026-08-18T10:00:00.000Z',
  ...over,
});

describe('roundsCompletedFrom', () => {
  const t = training([block('b1', [step('s1'), step('s2')])]);

  it('counts a round only when EVERY step in it is logged', () => {
    // The loose reading — any log at all — would make one tick equal a whole
    // round, and every figure downstream would inherit the inflation.
    const partial = [log({ stepId: 's1', roundIndex: 1 })];
    expect(roundsCompletedFrom(t, partial)).toBe(0);

    const whole = [...partial, log({ stepId: 's2', roundIndex: 1 })];
    expect(roundsCompletedFrom(t, whole)).toBe(1);
  });

  it('counts rounds independently, in any order', () => {
    const logs = [
      log({ stepId: 's1', roundIndex: 3 }),
      log({ stepId: 's2', roundIndex: 3 }),
      log({ stepId: 's1', roundIndex: 1 }),
      log({ stepId: 's2', roundIndex: 1 }),
    ];
    // Rounds 1 and 3 are done; round 2 was skipped entirely.
    expect(roundsCompletedFrom(t, logs)).toBe(2);
  });

  it('is zero for a session where nothing was ticked', () => {
    expect(roundsCompletedFrom(t, [])).toBe(0);
    expect(hasAnyLog([])).toBe(false);
  });

  it('sums across blocks', () => {
    const two = training([block('b1', [step('s1')], 2), block('b2', [step('s2')], 2)]);
    const logs = [
      log({ stepId: 's1', roundIndex: 1 }),
      log({ stepId: 's1', roundIndex: 2 }),
      log({ stepId: 's2', roundIndex: 1 }),
    ];
    expect(roundsCompletedFrom(two, logs)).toBe(3);
  });
});

describe('rowsNeeded', () => {
  it('shows one row per exercise per round by default', () => {
    // One set per exercise per round is what a circuit IS.
    expect(rowsNeeded([], 's1', 1, 0)).toBe(1);
  });

  it('grows with added rows', () => {
    expect(rowsNeeded([], 's1', 1, 2)).toBe(3);
  });

  it('keeps rows for sets already logged above the base', () => {
    const logs = [log({ setIndex: 1 }), log({ setIndex: 2 }), log({ setIndex: 3 })];
    // Unticking set 2 must not make set 3's row disappear underneath it.
    const withoutSecond = logs.filter((l) => l.setIndex !== 2);
    expect(rowsNeeded(withoutSecond, 's1', 1, 0)).toBe(3);
  });

  it('counts only the slot it was asked about', () => {
    const logs = [log({ setIndex: 4, roundIndex: 2 })];
    expect(rowsNeeded(logs, 's1', 1, 0)).toBe(1);
    expect(logsForSlot(logs, 's1', 2)).toHaveLength(1);
  });
});

describe('previousFor', () => {
  const history = [
    log({ roundIndex: 1, setIndex: 1, reps: 12, weightKg: 3 }),
    log({ roundIndex: 2, setIndex: 1, reps: 10, weightKg: 3 }),
    log({ roundIndex: 3, setIndex: 1, reps: 8, weightKg: 3 }),
  ];

  it('prefers the same round — that is the comparison worth making', () => {
    expect(previousFor(history, 2, 1)?.reps).toBe(10);
  });

  it('falls back to the last logged set when the round has no match', () => {
    // Two trainings need not agree about how many rounds they run, so a
    // fourth round here has no round four there. The closest reference is
    // where that session finished, not where it started.
    expect(previousFor(history, 4, 1)?.reps).toBe(8);
  });

  it('is undefined when the exercise has never been logged', () => {
    // Blank, not zero: a dash would read as "you did none", which is a
    // different and wrong claim.
    expect(previousFor(undefined, 1, 1)).toBeUndefined();
    expect(previousFor([], 1, 1)).toBeUndefined();
  });
});

describe('formatLog', () => {
  it('reads weight and reps together', () => {
    expect(formatLog({ reps: 12, weightKg: 3, weightCount: 1 })).toBe('3 kg  × 12');
  });

  it('keeps the pair convention for more than one weight', () => {
    // "2 × 3 kg" is a pair of 3 kg weights, not a single 6 kg one — the same
    // distinction domain/weight.ts exists to preserve.
    expect(formatLog({ reps: 12, weightKg: 3, weightCount: 2 })).toBe('3 kg ×2  × 12');
  });

  it('drops the half that is absent', () => {
    expect(formatLog({ reps: 12 })).toBe('× 12');
    expect(formatLog({ weightKg: 3 })).toBe('3 kg');
  });

  it('is null when a set records nothing at all', () => {
    // Possible, and honest: ticking a row says "I did this set" even when you
    // did not stop to say with what.
    expect(formatLog({})).toBeNull();
  });

  it('reads a duration', () => {
    expect(formatLog({ seconds: 45 })).toBe('0:45');
    expect(formatLog({ seconds: 90 })).toBe('1:30');
  });

  it('reads a distance, and a distance with a time', () => {
    expect(formatLog({ distanceKm: 5 })).toBe('5 km');
    expect(formatLog({ distanceKm: 2.5, seconds: 750 })).toBe('2.5 km  12:30');
  });

  it('reads a weighted carry', () => {
    // Farmer's walk: the two fields that type uses, in column order.
    expect(formatLog({ weightKg: 24, weightCount: 2, distanceKm: 0.04 })).toBe(
      '24 kg ×2  0.04 km',
    );
  });

  it('does not print a field the set never recorded', () => {
    // A plank's log has no reps and no weight, and the line must not invent
    // a zero for either.
    const line = formatLog({ seconds: 60 })!;
    expect(line).not.toContain('kg');
    expect(line).not.toContain('×');
  });
});

describe('formatSetClock', () => {
  it('is m:ss, zero-padded on the seconds only', () => {
    expect(formatSetClock(0)).toBe('0:00');
    expect(formatSetClock(9)).toBe('0:09');
    expect(formatSetClock(60)).toBe('1:00');
    expect(formatSetClock(605)).toBe('10:05');
  });

  it('grows an hours field rather than counting to 90 minutes', () => {
    expect(formatSetClock(3600)).toBe('1:00:00');
    expect(formatSetClock(3725)).toBe('1:02:05');
  });

  it('rounds, and never renders a negative', () => {
    expect(formatSetClock(44.6)).toBe('0:45');
    expect(formatSetClock(-5)).toBe('0:00');
  });
});
