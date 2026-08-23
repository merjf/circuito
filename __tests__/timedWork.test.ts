/**
 * Three things a review caught that neither the compiler nor the existing
 * tests could, all of them the same species of mistake: a value read without
 * asking whether the exercise it came from still uses that field.
 */

import { hasTimedWork, trainingHeadline } from '../src/domain/duration';
import type { ExerciseTypes } from '../src/domain/queue';
import { formatTrainingWeight, trainingWeights } from '../src/domain/weight';
import { distanceAt, withUniformDistance } from '../src/domain/types';
import type { Block, Step, Training } from '../src/domain/types';

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

describe('hasTimedWork', () => {
  /**
   * The bug this replaces: the screens asked `trainingHeadline(...).seconds > 0`
   * and called it "is anything timed". Prepare and every rest carry a real
   * duration and only WORK cues can be null, so that test was true for every
   * training the builder has ever produced — the "REPS" chip was unreachable
   * and a bodyweight circuit quoted a confident total for a session whose
   * length nobody had stated.
   */
  const bodyweight = training([block([step('s1'), step('s2'), step('s3')])]);
  const TYPES: ExerciseTypes = new Map([
    ['ex-s1', 'bodyweightReps'],
    ['ex-s2', 'bodyweightReps'],
    ['ex-s3', 'bodyweightReps'],
  ]);

  it('is false for a circuit of nothing but rep-counted exercises', () => {
    expect(hasTimedWork(bodyweight, TYPES)).toBe(false);
  });

  it('is false even though that circuit has a large non-zero total', () => {
    // 10 prepare + 3 rounds of two played rests + 2 round rests. This is the
    // number the old check was reading, and it is not about work at all.
    expect(trainingHeadline(bodyweight, TYPES).seconds).toBe(250);
    expect(trainingHeadline(bodyweight, TYPES).hasUntimed).toBe(true);
  });

  it('is true as soon as one exercise is measured in time', () => {
    const mixed: ExerciseTypes = new Map([...TYPES, ['ex-s2', 'duration']]);
    expect(hasTimedWork(bodyweight, mixed)).toBe(true);
  });

  it('is false when no exercise resolves at all', () => {
    // An unknown exercise is tap-gated, so there is still nothing to count.
    expect(hasTimedWork(bodyweight, new Map())).toBe(false);
  });

  it('ignores rests and prepare entirely', () => {
    const noRests = training([block([step('s1', { restAfterSeconds: 0 })], {
      repeat: 1,
      restBetweenRoundsSeconds: 0,
    })], { prepareSeconds: 0 });
    expect(hasTimedWork(noRests, new Map([['ex-s1', 'duration']]))).toBe(true);
    expect(hasTimedWork(noRests, new Map([['ex-s1', 'weightReps']]))).toBe(false);
  });
});

describe('formatTrainingWeight reads the type, not just the field', () => {
  const weighted = training([
    block([step('s1', { weightKg: 10, weightCount: 1 })], { repeat: 1 }),
  ]);

  it('shows a weight for an exercise that is measured in weight', () => {
    expect(formatTrainingWeight(weighted, new Map([['ex-s1', 'weightReps']]))).toBe('10 kg');
  });

  it('drops a weight left behind on a reclassified exercise', () => {
    // A step KEEPS its weightKg when its exercise becomes bodyweight — steps
    // are never rewritten underneath the user. Every other renderer already
    // gated on the type; this one showed "10 kg" on a card for a movement that
    // stopped being weighted weeks ago.
    expect(formatTrainingWeight(weighted, new Map([['ex-s1', 'bodyweightReps']]))).toBeNull();
    expect(trainingWeights(weighted, new Map([['ex-s1', 'duration']]))).toHaveLength(0);
  });

  it('signs an assisted load, which is the opposite of a loaded one', () => {
    // "10 kg" on an assisted pull-up reads as ten kilos ADDED. It is ten kilos
    // taken away, and the two are opposite facts about the same movement.
    expect(formatTrainingWeight(weighted, new Map([['ex-s1', 'assistedBodyweight']]))).toBe(
      '−10 kg',
    );
    expect(formatTrainingWeight(weighted, new Map([['ex-s1', 'weightedBodyweight']]))).toBe(
      '+10 kg',
    );
  });

  it('drops back to unsigned when a training mixes signs', () => {
    // No single sign is true of the whole thing, and picking one would
    // mislabel half of it. The per-step lines still carry the truth.
    const mixed = training([
      block(
        [step('s1', { weightKg: 10 }), step('s2', { weightKg: 10 })],
        { repeat: 1 },
      ),
    ]);
    const types: ExerciseTypes = new Map([
      ['ex-s1', 'assistedBodyweight'],
      ['ex-s2', 'weightedBodyweight'],
    ]);
    expect(formatTrainingWeight(mixed, types)).toBe('10 kg');
  });

  it('still reads every stored weight when no types are supplied', () => {
    // A caller with no library loaded cannot ask the question, and reading
    // what is stored is the honest thing it CAN do.
    expect(formatTrainingWeight(weighted)).toBe('10 kg');
  });
});

describe('withUniformDistance', () => {
  it('prescribes one distance for every round', () => {
    const s = withUniformDistance(step('s1'), 1.5);
    expect(distanceAt(s, 1)).toBe(1.5);
    expect(distanceAt(s, 3)).toBe(1.5);
  });

  it('keeps whatever else the first target held', () => {
    const s = withUniformDistance(step('s1', { setTargets: [{ weightKg: 24 }] }), 0.04);
    expect(s.setTargets).toEqual([{ weightKg: 24, distanceKm: 0.04 }]);
  });

  it('clearing it leaves no empty target behind', () => {
    // An array of `{}` would read as "varies by round" forever, which is the
    // trap `withUniformReps` documents and avoids the same way.
    const s = withUniformDistance(withUniformDistance(step('s1'), 5), undefined);
    expect(s.setTargets).toBeUndefined();
  });

  it('clearing it keeps a target that still says something else', () => {
    const withBoth = withUniformDistance(step('s1', { setTargets: [{ reps: 12 }] }), 5);
    const cleared = withUniformDistance(withBoth, undefined);
    expect(cleared.setTargets).toEqual([{ reps: 12 }]);
  });

  it('treats zero and negative as clearing, not as a prescription of none', () => {
    const s = withUniformDistance(step('s1'), 5);
    expect(withUniformDistance(s, 0).setTargets).toBeUndefined();
    expect(withUniformDistance(s, -1).setTargets).toBeUndefined();
  });
});
