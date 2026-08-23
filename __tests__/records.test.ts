/**
 * Personal records.
 *
 * These are the definitions the Records tab prints and the logger's toast
 * fires on, so the ones worth pinning are the JUDGEMENT calls rather than the
 * arithmetic: what "heaviest" means when weights come in pairs, whether a
 * warm-up can set a record, and when an estimated 1RM stops being honest.
 */

import {
  EMPTY_RECORDS,
  estimatedOneRepMax,
  recordsBrokenBy,
  recordsFor,
  setVolume,
} from '../src/domain/records';
import type { SetLog } from '../src/domain/types';

let counter = 0;
const set = (over: Partial<SetLog> = {}): SetLog => ({
  id: `sl_${counter++}`,
  sessionId: 'se_1',
  exerciseId: 'ex_1',
  exerciseName: 'Curl bicipiti',
  stepId: 's1',
  roundIndex: 1,
  setIndex: 1,
  type: 'normal',
  completedAt: '2026-08-18T10:00:00.000Z',
  ...over,
});

describe('setVolume', () => {
  it('counts both hands and every rep', () => {
    // "2 × 3 kg" is a PAIR of 3 kg weights, so ten reps is 60 kg of work.
    expect(setVolume(set({ weightKg: 3, weightCount: 2, reps: 10 }))).toBe(60);
  });

  it('is zero without a load or without reps', () => {
    expect(setVolume(set({ reps: 20 }))).toBe(0);
    expect(setVolume(set({ weightKg: 10 }))).toBe(0);
  });
});

describe('estimatedOneRepMax', () => {
  it('is the weight itself for a single', () => {
    expect(estimatedOneRepMax(set({ weightKg: 20, reps: 1 }))).toBe(20);
  });

  it('applies Epley below the cutoff', () => {
    // 20 × (1 + 5/30)
    expect(estimatedOneRepMax(set({ weightKg: 20, reps: 5 }))).toBeCloseTo(23.333, 3);
  });

  it('refuses past twelve reps rather than guessing', () => {
    // The formula is fitted to low-rep sets and its error grows fast. A
    // confident number off a set of thirty is exactly the invented figure the
    // rest of the app refuses to print.
    expect(estimatedOneRepMax(set({ weightKg: 20, reps: 13 }))).toBeNull();
  });

  it('is null for a bodyweight set', () => {
    expect(estimatedOneRepMax(set({ reps: 10 }))).toBeNull();
  });
});

describe('recordsFor', () => {
  it('is empty for no logs', () => {
    expect(recordsFor([])).toEqual(EMPTY_RECORDS);
  });

  it('ranks heaviest by the weight in ONE hand, not the pair', () => {
    // Summing the pair would make 2 × 3 kg outrank a single 5 kg, which is
    // not how anybody reads it — or shops for it.
    const pair = set({ weightKg: 3, weightCount: 2, reps: 10 });
    const single = set({ weightKg: 5, weightCount: 1, reps: 10 });
    expect(recordsFor([pair, single]).heaviest?.id).toBe(single.id);
  });

  it('breaks a heaviest tie with the better set', () => {
    const fewer = set({ weightKg: 5, reps: 6 });
    const more = set({ weightKg: 5, reps: 10 });
    expect(recordsFor([fewer, more]).heaviest?.id).toBe(more.id);
  });

  it('excludes warm-ups from every record', () => {
    // A warm-up is by definition not an attempt at your best, and letting one
    // set a record would make the record meaningless.
    const warm = set({ weightKg: 50, reps: 10, type: 'warmup' });
    const working = set({ weightKg: 20, reps: 10 });
    const records = recordsFor([warm, working]);
    expect(records.heaviest?.id).toBe(working.id);
    expect(records.bestSet?.id).toBe(working.id);
  });

  it('counts failure and drop sets — they are real work at real load', () => {
    const failure = set({ weightKg: 30, reps: 4, type: 'failure' });
    expect(recordsFor([set({ weightKg: 20, reps: 10 }), failure]).heaviest?.id).toBe(failure.id);
  });

  it('sums volume per session and reports the best', () => {
    const logs = [
      set({ sessionId: 'a', weightKg: 5, reps: 10 }),
      set({ sessionId: 'a', weightKg: 5, reps: 10 }),
      set({ sessionId: 'b', weightKg: 5, reps: 30 }),
    ];
    const best = recordsFor(logs).bestSessionVolume;
    expect(best?.sessionId).toBe('b');
    expect(best?.volume).toBe(150);
  });

  it('keeps the max weight for each rep count', () => {
    const logs = [
      set({ weightKg: 5, reps: 10 }),
      set({ weightKg: 7, reps: 10 }),
      set({ weightKg: 9, reps: 5 }),
    ];
    expect(recordsFor(logs).setRecords).toEqual([
      { reps: 5, log: expect.objectContaining({ weightKg: 9 }) },
      { reps: 10, log: expect.objectContaining({ weightKg: 7 }) },
    ]);
  });

  it('only lets unloaded sets compete on rep count', () => {
    // Mixing them would let a light set beat a heavy one on a scoreboard that
    // says nothing about load.
    const bodyweight = set({ reps: 25 });
    const loaded = set({ weightKg: 10, reps: 40 });
    expect(recordsFor([bodyweight, loaded]).mostReps?.id).toBe(bodyweight.id);
  });
});

describe('recordsBrokenBy', () => {
  const history = [set({ sessionId: 'old', weightKg: 5, reps: 10 })];

  it('reports nothing the first time an exercise is ever logged', () => {
    // Everything is a personal best when there is nothing to beat, and a
    // screen that says so three times is a screen you learn to ignore.
    expect(recordsBrokenBy(set({ weightKg: 100, reps: 10 }), [])).toEqual([]);
  });

  it('reports a heavier set', () => {
    const broken = recordsBrokenBy(set({ weightKg: 6, reps: 10 }), history);
    expect(broken.map((b) => b.kind)).toContain('heaviest');
  });

  it('reports more volume even at the same weight', () => {
    const broken = recordsBrokenBy(set({ weightKg: 5, reps: 12 }), history);
    expect(broken.map((b) => b.kind)).toEqual(['volume']);
  });

  it('reports nothing for a set that matches but does not beat', () => {
    expect(recordsBrokenBy(set({ weightKg: 5, reps: 10 }), history)).toEqual([]);
  });

  it('never fires for a warm-up', () => {
    expect(recordsBrokenBy(set({ weightKg: 500, reps: 10, type: 'warmup' }), history)).toEqual(
      [],
    );
  });

  it('can report several records from one set', () => {
    const broken = recordsBrokenBy(set({ weightKg: 9, reps: 12 }), history);
    expect(broken.map((b) => b.kind).sort()).toEqual(['heaviest', 'volume']);
  });
});
