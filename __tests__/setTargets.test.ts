/**
 * Per-round rep targets — `Step.setTargets`.
 *
 * The rule the whole feature rests on: the array's length is either 1 (one
 * target for every round) or exactly `Block.repeat` (entry i is round i).
 * Nothing else is legal. That constraint is what stops a step's prescription
 * and its block's round count from meaning two different things, and it is
 * enforced in two places for two different audiences — `reconcileTargets` for
 * the builder, which fixes the draft as you type, and `validateTraining` as a
 * backstop for anything that did not come through the builder.
 *
 * These tests pin the resolution rules, the reconciliation, and the places a
 * per-round target has to survive to: the queue's cues and the meta lines.
 */

import { formatTargetReps, stepMetaLine } from '../src/domain/duration';
import { buildQueue } from '../src/domain/queue';
import {
  reconcileTargets,
  repsAt,
  targetAt,
  targetsVary,
  weightForRound,
  withRepsAt,
  withUniformReps,
} from '../src/domain/types';
import type { Block, Step, Training } from '../src/domain/types';
import { validateTraining } from '../src/domain/validation';

const step = (id: string, over: Partial<Step> = {}): Step => ({
  id,
  exerciseId: `ex-${id}`,
  workSeconds: 45,
  restAfterSeconds: 20,
  ...over,
});

const block = (steps: Step[], over: Partial<Block> = {}): Block => ({
  id: 'b1',
  label: 'Block A',
  repeat: 3,
  restBetweenRoundsSeconds: 60,
  steps,
  ...over,
});

const training = (blocks: Block[], over: Partial<Training> = {}): Training => ({
  id: 'tr',
  name: 'Circuito',
  prepareSeconds: 10,
  blocks,
  createdAt: '',
  updatedAt: '',
  ...over,
});

/**
 * Which type `ex-s1` is. Validation and gating both ask, so the tests below
 * have to say — and saying it twice, once each way, is what shows the LENGTH
 * rule applying regardless while the rep-count rule applies only to one.
 */
const REPS = new Map([['ex-s1', 'weightReps' as const]]);
const TIMED = new Map([['ex-s1', 'duration' as const]]);

describe('resolving a target for a round', () => {
  it('applies a single target to every round', () => {
    const s = step('s1', { setTargets: [{ reps: 12 }] });
    expect(repsAt(s, 1)).toBe(12);
    expect(repsAt(s, 3)).toBe(12);
    expect(targetsVary(s)).toBe(false);
  });

  it('reads entry i for round i when the prescription varies', () => {
    const s = step('s1', { setTargets: [{ reps: 12 }, { reps: 10 }, { reps: 8 }] });
    expect(repsAt(s, 1)).toBe(12);
    expect(repsAt(s, 2)).toBe(10);
    expect(repsAt(s, 3)).toBe(8);
    expect(targetsVary(s)).toBe(true);
  });

  it('falls back to the first entry for a round it has no answer for', () => {
    // Under-specified, not broken: the block just grew a round and the builder
    // has not reconciled yet. The first target is the best answer available,
    // and it is a better one than undefined — which would render as no target
    // at all, mid-workout.
    const s = step('s1', { setTargets: [{ reps: 12 }, { reps: 10 }] });
    expect(repsAt(s, 5)).toBe(12);
  });

  it('has no target at all when nothing is prescribed', () => {
    expect(targetAt(step('s1'), 1)).toBeUndefined();
    expect(repsAt(step('s1'), 1)).toBeUndefined();
  });
});

describe('weight per round', () => {
  it("uses the step's own weight when the round does not override it", () => {
    const s = step('s1', { setTargets: [{ reps: 12 }], weightKg: 3, weightCount: 2 });
    expect(weightForRound(s, 1)).toEqual({ weightKg: 3, weightCount: 2 });
  });

  it('lets a round override the weight, which is how a pyramid is expressed', () => {
    const s = step('s1', {
      setTargets: [{ reps: 12 }, { reps: 10, weightKg: 5 }],
      weightKg: 3,
      weightCount: 2,
    });
    expect(weightForRound(s, 1)).toEqual({ weightKg: 3, weightCount: 2 });
    // An override with no count means one weight, not "keep the step's two".
    // Half-inheriting a pair would silently double the load.
    expect(weightForRound(s, 2)).toEqual({ weightKg: 5, weightCount: 1 });
  });
});

describe('editing', () => {
  it('collapses to a single target when set uniformly', () => {
    const varied = step('s1', { setTargets: [{ reps: 12 }, { reps: 10 }, { reps: 8 }] });
    const flat = withUniformReps(varied, 10);
    expect(flat.setTargets).toEqual([{ reps: 10 }]);
    expect(targetsVary(flat)).toBe(false);
  });

  it('expands to one entry per round when a single round is edited', () => {
    const flat = step('s1', { setTargets: [{ reps: 12 }] });
    const varied = withRepsAt(flat, 3, 8, 3);
    expect(varied.setTargets).toEqual([{ reps: 12 }, { reps: 12 }, { reps: 8 }]);
  });

  it('clears the prescription entirely when reps are removed', () => {
    // Not an array of empty objects, which would keep reading as "varies"
    // forever and show a stepper the user can never get rid of.
    const s = step('s1', { setTargets: [{ reps: 12 }] });
    expect(withUniformReps(s, undefined).setTargets).toBeUndefined();
  });

  it('keeps a weight override when only the reps are cleared', () => {
    const s = step('s1', { setTargets: [{ reps: 12, weightKg: 5 }] });
    expect(withUniformReps(s, undefined).setTargets).toEqual([{ weightKg: 5 }]);
  });
});

describe('reconcileTargets — the builder fixing the draft as you type', () => {
  it('truncates when the round count drops', () => {
    // The case that would otherwise fail validation on Save, long after and
    // far from the repeat stepper that caused it.
    const s = step('s1', { setTargets: [{ reps: 12 }, { reps: 10 }, { reps: 8 }] });
    expect(reconcileTargets(s, 2).setTargets).toEqual([{ reps: 12 }, { reps: 10 }]);
  });

  it('pads with the LAST value when the round count grows', () => {
    // 12/10/8 taken to four rounds becomes 12/10/8/8 — the progression
    // continues rather than restarting at 12.
    const s = step('s1', { setTargets: [{ reps: 12 }, { reps: 10 }, { reps: 8 }] });
    expect(reconcileTargets(s, 4).setTargets).toEqual([
      { reps: 12 },
      { reps: 10 },
      { reps: 8 },
      { reps: 8 },
    ]);
  });

  it('leaves a uniform target alone whatever the round count', () => {
    // Length 1 already means "every round". Expanding it would turn an
    // unremarkable step into one that reads as varying.
    const s = step('s1', { setTargets: [{ reps: 12 }] });
    expect(reconcileTargets(s, 5)).toBe(s);
    expect(reconcileTargets(step('s1'), 5).setTargets).toBeUndefined();
  });
});

describe('validation', () => {
  it('accepts a length that matches the round count, and one that is 1', () => {
    const varied = training([
      block([step('s1', { setTargets: [{ reps: 12 }, { reps: 10 }, { reps: 8 }] })]),
    ]);
    const uniform = training([block([step('s1', { setTargets: [{ reps: 12 }] })])]);
    expect(validateTraining(varied)).toEqual([]);
    expect(validateTraining(uniform)).toEqual([]);
  });

  it('refuses a prescription that disagrees with the round count', () => {
    const t = training([block([step('s1', { setTargets: [{ reps: 12 }, { reps: 10 }] })])]);
    expect(validateTraining(t).join(' ')).toMatch(/2 rep targets but the block runs 3 rounds/);
  });

  it('requires a count for EVERY round, not just the first', () => {
    // A 12/10/— step is one whose third round nobody has decided yet, and
    // checking only entry 0 would let it save and surprise you mid-workout.
    const t = training([
      block([step('s1', { setTargets: [{ reps: 12 }, { reps: 10 }, {}] })]),
    ]);
    expect(validateTraining(t, REPS).join(' ')).toMatch(/set a rep count/);
  });

  it('checks the length on a timed exercise too', () => {
    // A timed step is never asked for a rep count, but a prescription that
    // contradicts the round count is unreadable whether or not there is a
    // clock involved — so the LENGTH rule applies to every type.
    const t = training([block([step('s1', { setTargets: [{ reps: 12 }, { reps: 10 }] })])]);
    expect(validateTraining(t, TIMED).join(' ')).toMatch(
      /2 rep targets but the block runs 3 rounds/,
    );
  });
});

describe('the target reaches the player', () => {
  it('puts each round s own target on its cue', () => {
    const t = training(
      [
        block([step('s1', { setTargets: [{ reps: 12 }, { reps: 10 }, { reps: 8 }] })], {
          repeat: 3,
        }),
      ],
    );
    const work = buildQueue(t, TIMED).filter((c) => c.kind === 'work');
    expect(work.map((c) => c.targetReps)).toEqual([12, 10, 8]);
  });

  it('carries a per-round weight override onto the cue', () => {
    const t = training(
      [
        block(
          [
            step('s1', {
              setTargets: [{ reps: 12 }, { reps: 10, weightKg: 5 }],
              weightKg: 3,
              weightCount: 2,
            }),
          ],
          { repeat: 2 },
        ),
      ],
    );
    const work = buildQueue(t, TIMED).filter((c) => c.kind === 'work');
    expect(work.map((c) => c.weightKg)).toEqual([3, 5]);
    expect(work.map((c) => c.weightCount)).toEqual([2, 1]);
  });
});

describe('formatting', () => {
  it('reads a single target as a multiplier and several as a sequence', () => {
    expect(formatTargetReps(step('s1', { setTargets: [{ reps: 12 }] }))).toBe('×12');
    expect(
      formatTargetReps(step('s1', { setTargets: [{ reps: 12 }, { reps: 10 }, { reps: 8 }] })),
    ).toBe('12 · 10 · 8');
  });

  it('is null rather than empty when nothing is prescribed', () => {
    // So callers drop the segment instead of printing a stray separator.
    expect(formatTargetReps(step('s1'))).toBeNull();
    expect(formatTargetReps(step('s1', { setTargets: [{ weightKg: 5 }] }))).toBeNull();
  });

  it('shows the whole sequence in a step meta line', () => {
    const s = step('s1', { setTargets: [{ reps: 12 }, { reps: 10 }, { reps: 8 }] });
    expect(stepMetaLine(s, 'bodyweightReps')).toBe('12 · 10 · 8 reps  ·  20s rest');
    expect(stepMetaLine(s, 'weightReps')).toContain('12 · 10 · 8 reps');
  });
});
