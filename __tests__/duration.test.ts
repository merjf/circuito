import { stepMetaLine, trainingHeadline } from '../src/domain/duration';
import type { ExerciseType } from '../src/domain/exerciseType';
import type { Step, Training } from '../src/domain/types';

/**
 * `stepMetaLine` is the one line under an exercise name on the training detail
 * screen, and `trainingHeadline` is the number on its chip and on the Train
 * tab's cards.
 *
 * What these pin is that BOTH read the exercise's type and show only the
 * fields that type uses. The line used to key off the TRAINING's kind, which
 * is why a rep-counted exercise dropped into a circuit was described in
 * seconds it never ran for — and why `trainingHeadline` had to exist as a
 * crash guard at all (`PLAN_ui_fixes.md` B1: 1b called `trainingSeconds`,
 * which called `buildQueue`, which threw by design on a reps training).
 * `buildQueue` accepts every training now, so the guard is gone and the
 * headline is simply the duration.
 */

const baseStep: Step = {
  id: 'st-1',
  exerciseId: 'ex-1',
  workSeconds: 45,
  restAfterSeconds: 20,
};

describe('stepMetaLine', () => {
  it('a timed step reads work and rest', () => {
    expect(stepMetaLine(baseStep, 'duration')).toBe('45s work  ·  20s rest');
  });

  it('a timed-and-weighted step reads work, weight and rest', () => {
    const step: Step = { ...baseStep, weightKg: 4, weightCount: 1 };
    expect(stepMetaLine(step, 'durationWeight')).toBe('45s work  ·  4 kg  ·  20s rest');
  });

  it('the last timed step in a round drops rest, even when restAfterSeconds is stored', () => {
    expect(stepMetaLine(baseStep, 'duration', { isLast: true })).toBe('45s work');
  });

  it('a step with restAfterSeconds of 0 drops rest regardless of position', () => {
    const step: Step = { ...baseStep, restAfterSeconds: 0 };
    expect(stepMetaLine(step, 'duration')).toBe('45s work');
  });

  it('a weight-and-reps step reads reps and weight, never work', () => {
    const step: Step = { ...baseStep, setTargets: [{ reps: 10 }], weightKg: 4, weightCount: 1 };
    expect(stepMetaLine(step, 'weightReps')).toBe('×10 reps  ·  4 kg  ·  20s rest');
  });

  it('renders the count of a weight pair', () => {
    const step: Step = { ...baseStep, setTargets: [{ reps: 12 }], weightKg: 3, weightCount: 2 };
    expect(stepMetaLine(step, 'weightReps')).toBe('×12 reps  ·  2 × 3 kg  ·  20s rest');
  });

  it('a bodyweight-reps step drops the weight segment even when a weight is stored', () => {
    // The step keeps `weightKg` — a step is not rewritten when its exercise's
    // type changes — and the line must not resurrect it as a claim.
    const step: Step = { ...baseStep, setTargets: [{ reps: 12 }], weightKg: 3, weightCount: 2 };
    expect(stepMetaLine(step, 'bodyweightReps')).toBe('×12 reps  ·  20s rest');
  });

  it('never mentions work for a rep-counted step, whatever workSeconds holds', () => {
    const step: Step = {
      ...baseStep,
      setTargets: [{ reps: 8 }],
      workSeconds: 999,
      restAfterSeconds: 0,
    };
    expect(stepMetaLine(step, 'bodyweightReps')).not.toContain('work');
  });

  it('falls back to weight-and-reps when the exercise is missing', () => {
    // A step pointing at a deleted exercise still has to render something,
    // and the fallback is the shape most movements are.
    const step: Step = { ...baseStep, setTargets: [{ reps: 10 }], restAfterSeconds: 0 };
    expect(stepMetaLine(step, undefined)).toBe('×10 reps');
  });
});

describe('trainingHeadline', () => {
  const training = (type: ExerciseType): Training => ({
    id: 'tr-1',
    name: 'Circuit',
    prepareSeconds: 10,
    createdAt: 't0',
    updatedAt: 't0',
    blocks: [
      {
        id: 'bl-1',
        label: 'Block A',
        repeat: 2,
        restBetweenRoundsSeconds: 60,
        steps: [{ ...baseStep, setTargets: [{ reps: 10 }] }],
      },
    ],
  });

  const types = (type: ExerciseType) => new Map([['ex-1', type]]);

  it('totals a timed training: prepare, two 45s rounds and the rest between them', () => {
    // 10 prepare + 45 + 60 round rest + 45. The trailing round rest is not
    // played, and neither is the last step's restAfter.
    expect(trainingHeadline(training('duration'), types('duration'))).toEqual({
      seconds: 160,
      hasUntimed: false,
    });
  });

  it('a rep-counted training totals the rests only, and says so with hasUntimed', () => {
    // Nothing here prescribes seconds of WORK, so the total is a lower bound
    // and the screens render "REPS" rather than a number. The 10s prepare and
    // the 60s round rest still happen, which is why the count is not zero.
    expect(trainingHeadline(training('bodyweightReps'), types('bodyweightReps'))).toEqual({
      seconds: 70,
      hasUntimed: true,
    });
  });

  it('does not throw when no exercise resolves', () => {
    // Every step falls back to untimed rather than crashing the screen — the
    // regression `PLAN_ui_fixes.md` B1 was about, now impossible by design.
    expect(() => trainingHeadline(training('duration'), new Map())).not.toThrow();
  });
});
