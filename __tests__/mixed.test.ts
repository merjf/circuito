/**
 * Mixed trainings — the thing the app could not do until 2026-08-18.
 *
 * This file replaces `reps.test.ts`, which was 226 lines pinning the OPPOSITE
 * property: that a reps training and a timed training were different species,
 * that `buildQueue` threw on one of them, and that `convertKind` could carry a
 * draft between the two without losing numbers. All of that existed to make a
 * split bearable. The split is gone, so what is worth pinning now is that a
 * single block can hold a bench press, a plank and a farmer's walk at once and
 * every derived number stays honest about which is which.
 *
 * The seed circuit's 655-second total survives the rewrite unchanged, which is
 * the strongest single check here: the arithmetic did not move, only the
 * question of who decides whether a step has a duration.
 */

import { buildQueue, exerciseTypesOf, isGated, type ExerciseTypes } from '../src/domain/queue';
import { trainingHeadline, trainingSeconds } from '../src/domain/duration';
import { SEED_EXERCISES, SEED_TRAININGS } from './fixtures/seed';
import { DEFAULT_PREPARE_SECONDS, NEW_STEP_DEFAULTS } from '../src/domain/types';
import type { Block, Step, Training } from '../src/domain/types';
import { validateTraining } from '../src/domain/validation';

const SEED_TYPES = exerciseTypesOf(SEED_EXERCISES);

const step = (id: string, over: Partial<Step> = {}): Step => ({
  id,
  exerciseId: `ex-${id}`,
  workSeconds: 45,
  restAfterSeconds: 20,
  ...over,
});

const block = (id: string, steps: Step[], over: Partial<Block> = {}): Block => ({
  id,
  label: 'Block A',
  repeat: 3,
  restBetweenRoundsSeconds: 60,
  steps,
  ...over,
});

const training = (over: Partial<Training> = {}): Training => ({
  id: 'tr',
  name: 'Circuito',
  prepareSeconds: 10,
  blocks: [
    block('b1', [
      step('s1', { setTargets: [{ reps: 12 }] }),
      step('s2', { setTargets: [{ reps: 10 }] }),
    ]),
  ],
  createdAt: '',
  updatedAt: '',
  ...over,
});

/**
 * Three exercises, three shapes — the user's own example: weight and reps,
 * timed, and timed with a weight, all in one block.
 */
const THREE: ExerciseTypes = new Map([
  ['ex-s1', 'weightReps'],
  ['ex-s2', 'duration'],
  ['ex-s3', 'durationWeight'],
]);

const threeExercises = training({
  blocks: [
    block(
      'b1',
      [
        step('s1', { setTargets: [{ reps: 12 }], weightKg: 10 }),
        step('s2', { workSeconds: 45 }),
        step('s3', { workSeconds: 30, weightKg: 4, weightCount: 1 }),
      ],
      { repeat: 1, restBetweenRoundsSeconds: 0 },
    ),
  ],
  prepareSeconds: 0,
});

describe('one block, three kinds of exercise', () => {
  it('builds a queue rather than refusing one', () => {
    // `buildQueue` used to throw outright on anything rep-counted. It cannot
    // now, because there is no training-level fact left for it to refuse.
    expect(() => buildQueue(threeExercises, THREE)).not.toThrow();
  });

  it('gates only the rep-counted step, and times the other two', () => {
    const work = buildQueue(threeExercises, THREE).filter((c) => c.kind === 'work');
    expect(work.map((c) => c.seconds)).toEqual([null, 45, 30]);
  });

  it('totals what it knows and flags what it does not', () => {
    // 45 + 30 of work, plus the two rests that separate three exercises
    // (the last step's rest is never played). The rep-counted step
    // contributes nothing but the flag.
    expect(trainingSeconds(threeExercises, THREE)).toEqual({
      seconds: 45 + 30 + 20 + 20,
      hasUntimed: true,
    });
  });

  it('carries each step its own prescription', () => {
    const work = buildQueue(threeExercises, THREE).filter((c) => c.kind === 'work');
    expect(work[0]!.targetReps).toBe(12);
    expect(work[0]!.weightKg).toBe(10);
    // The timed step has no rep target, and does not borrow the previous one.
    expect(work[1]!.targetReps).toBeUndefined();
    // The timed-and-weighted step keeps its load.
    expect(work[2]!.weightKg).toBe(4);
  });

  it('the gated cue is the rep-counted one', () => {
    const gated = buildQueue(threeExercises, THREE).filter(isGated);
    expect(gated).toHaveLength(1);
    expect(gated[0]!.targetReps).toBe(12);
  });
});

describe('the seed circuit is unchanged by the rewrite', () => {
  it('still totals 655 seconds', () => {
    expect(trainingHeadline(SEED_TRAININGS[0]!, SEED_TYPES)).toEqual({
      seconds: 655,
      hasUntimed: false,
    });
  });

  it('reads its durations from the exercises, not from the training', () => {
    // Same training, no type information: every step becomes tap-gated. This
    // is the one line that shows where the answer now lives.
    // Nine work cues — three exercises, three rounds — each worth 45s.
    expect(trainingHeadline(SEED_TRAININGS[0]!, new Map())).toEqual({
      seconds: 655 - 45 * 9,
      hasUntimed: true,
    });
  });
});

describe('validation asks each step only what its type uses', () => {
  it('requires a rep count on a rep-counted step', () => {
    const t = training({
      blocks: [block('b1', [step('s1'), step('s2', { setTargets: [{ reps: 8 }] })], { repeat: 1 })],
    });
    expect(validateTraining(t, new Map([['ex-s1', 'weightReps'], ['ex-s2', 'weightReps']]))).toEqual(
      ['Block A, exercise 1: set a rep count.'],
    );
  });

  it('never asks a timed step for a rep count', () => {
    const t = training({ blocks: [block('b1', [step('s1')], { repeat: 1 })] });
    expect(validateTraining(t, new Map([['ex-s1', 'duration']]))).toEqual([]);
  });

  it('never asks a rep-counted step for a duration', () => {
    // workSeconds of 1 is below the minimum and would fail a timed step. On a
    // rep-counted one it is a number nobody was shown, let alone chose.
    const t = training({
      blocks: [block('b1', [step('s1', { setTargets: [{ reps: 8 }], workSeconds: 1 })], { repeat: 1 })],
    });
    expect(validateTraining(t, new Map([['ex-s1', 'weightReps']]))).toEqual([]);
  });

  it('still enforces the minimum on a timed step', () => {
    const t = training({ blocks: [block('b1', [step('s1', { workSeconds: 1 })], { repeat: 1 })] });
    expect(validateTraining(t, new Map([['ex-s1', 'duration']]))).toEqual([
      expect.stringContaining('time must be at least'),
    ]);
  });

  it('checks one block against a mix of types in one pass', () => {
    const t = training({
      blocks: [
        block('b1', [step('s1'), step('s2', { workSeconds: 1 })], { repeat: 1 }),
      ],
    });
    expect(validateTraining(t, new Map([['ex-s1', 'weightReps'], ['ex-s2', 'duration']]))).toEqual([
      'Block A, exercise 1: set a rep count.',
      'Block A, exercise 2: time must be at least 5s.',
    ]);
  });

  it('applies the structural rules with or without type information', () => {
    for (const types of [undefined, new Map([['ex-s1', 'duration' as const]])]) {
      expect(validateTraining(training({ name: '  ' }), types)).toContain(
        'Give the training a name.',
      );
      expect(validateTraining(training({ blocks: [] }), types)).toContain(
        'Add at least one block.',
      );
    }
  });
});

describe('a new draft still starts from the documented defaults', () => {
  /**
   * `PLAN_ui_fixes.md` A2 — the builder's `emptyTraining()` starts every draft
   * at `DEFAULT_PREPARE_SECONDS`, and a step dropped into it starts at
   * `NEW_STEP_DEFAULTS`. Those are the only two places a "default" exists, and
   * pinning them here catches a screen-side edit to either constant without a
   * device in the loop. What is NOT here any more is a starting *kind*: there
   * is nothing to choose before you type a name.
   */
  it('a freshly built draft is a plain timed circuit', () => {
    const fresh = training({
      prepareSeconds: DEFAULT_PREPARE_SECONDS,
      blocks: [
        block(
          'b1',
          [
            step('s1', {
              workSeconds: NEW_STEP_DEFAULTS.workSeconds,
              restAfterSeconds: NEW_STEP_DEFAULTS.restAfterSeconds,
            }),
          ],
          { repeat: 1, restBetweenRoundsSeconds: NEW_STEP_DEFAULTS.restBetweenRoundsSeconds },
        ),
      ],
    });

    expect(trainingSeconds(fresh, new Map([['ex-s1', 'duration']]))).toEqual({
      seconds: DEFAULT_PREPARE_SECONDS + NEW_STEP_DEFAULTS.workSeconds,
      hasUntimed: false,
    });
  });
});
