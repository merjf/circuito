/**
 * Tap-gated steps: a step whose exercise is not measured in seconds. It has no
 * duration, so the runner waits on it instead of counting down.
 *
 * What decides this changed with the type rewrite, and the change is the point
 * of half these tests. There used to be a `step.mode` overriding an
 * `exercise.kind` inside a `training.kind`, three places to say one thing and
 * two of them able to disagree. Now there is exactly one: the exercise's type,
 * asked through `isTimed`. A plank counts down wherever it appears; a bench
 * press waits for a tap wherever it appears; and a circuit can hold both,
 * which is the whole reason the rewrite happened.
 *
 * The rest of these are the cases the type system cannot reach. `Cue.seconds`
 * being `number | null` forces every arithmetic site to be *written*, but not
 * to be written correctly — a caller can always coalesce a null to zero and
 * produce a total that is confidently wrong. What follows pins the answers.
 */

import { formatQueueDuration, trainingHeadline, trainingSeconds } from '../src/domain/duration';
import {
  buildQueue,
  isGated,
  queueSeconds,
  secondsFrom,
  structureSegments,
  type ExerciseTypes,
} from '../src/domain/queue';
import type { Block, Step, Training } from '../src/domain/types';

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
  repeat: 1,
  restBetweenRoundsSeconds: 60,
  steps,
  ...over,
});

const training = (blocks: Block[], over: Partial<Training> = {}): Training => ({
  id: 't',
  name: 'Circuito',
  prepareSeconds: 10,
  blocks,
  createdAt: '',
  updatedAt: '',
  ...over,
});

/** Both steps run on a clock. */
const TIMED: ExerciseTypes = new Map([
  ['ex-s1', 'duration'],
  ['ex-s2', 'duration'],
]);

/** s1 is rep-counted, s2 is timed — the mixed circuit that used to be illegal. */
const MIXED: ExerciseTypes = new Map([
  ['ex-s1', 'weightReps'],
  ['ex-s2', 'duration'],
]);

describe('what makes a cue gated', () => {
  it('an exercise type that is not measured in time', () => {
    const q = buildQueue(training([block('b', [step('s1')])]), MIXED);
    expect(q.filter((c) => c.kind === 'work')[0]!.seconds).toBeNull();
  });

  it('the same step is timed or gated purely by its exercise', () => {
    const t = training([block('b', [step('s1')])]);
    expect(buildQueue(t, MIXED)[1]!.seconds).toBeNull();
    expect(buildQueue(t, TIMED)[1]!.seconds).toBe(45);
  });

  it('an unknown exercise is gated, not timed', () => {
    // The safe direction. A step whose exercise has been deleted, or whose
    // library has not finished loading, must not be handed a duration nobody
    // prescribed — it waits for a tap and says nothing false.
    expect(buildQueue(training([block('b', [step('s1')])]), new Map())[1]!.seconds).toBeNull();
  });

  it('a gated step keeps its stored duration for later', () => {
    // Not cleared, so reclassifying the exercise as timed restores the number
    // the user last chose rather than a fresh default.
    const s = step('s1', { workSeconds: 90 });
    expect(buildQueue(training([block('b', [s])]), MIXED)[1]!.seconds).toBeNull();
    expect(buildQueue(training([block('b', [s])]), TIMED)[1]!.seconds).toBe(90);
  });

  it('every timed type counts down, and every other type waits', () => {
    const seconds = (type: string) =>
      buildQueue(
        training([block('b', [step('s1')])]),
        new Map([['ex-s1', type]]) as ExerciseTypes,
      )[1]!.seconds;

    // The four types whose field matrix includes time.
    expect(seconds('duration')).toBe(45);
    expect(seconds('durationWeight')).toBe(45);
    expect(seconds('distanceDuration')).toBe(45);
    // ...and the four whose does not.
    expect(seconds('weightReps')).toBeNull();
    expect(seconds('bodyweightReps')).toBeNull();
    expect(seconds('weightedBodyweight')).toBeNull();
    expect(seconds('assistedBodyweight')).toBeNull();
    expect(seconds('weightDistance')).toBeNull();
  });
});

describe('totals are a lower bound, and say so', () => {
  const mixed = training([block('b', [step('s1'), step('s2')])]);

  it('sums only what is known', () => {
    // prepare 10 + gated + rest 20 + work 45
    expect(queueSeconds(buildQueue(mixed, MIXED))).toEqual({
      seconds: 75,
      hasUntimed: true,
    });
  });

  it('renders with a plus rather than as an exact time', () => {
    expect(formatQueueDuration(trainingSeconds(mixed, MIXED))).toBe('01:15 +');
  });

  it('renders without a plus when nothing is gated', () => {
    expect(formatQueueDuration(trainingSeconds(mixed, TIMED))).toBe('02:00');
  });

  it('carries the flag onto the headline', () => {
    expect(trainingHeadline(mixed, MIXED)).toEqual({ seconds: 75, hasUntimed: true });
  });

  it('reports a training that is entirely gated as 0:00 +', () => {
    const all = training([block('b', [step('s1')])], { prepareSeconds: 0 });
    expect(formatQueueDuration(trainingSeconds(all, MIXED))).toBe('00:00 +');
  });

  it('drops the flag once the gated cue is behind you', () => {
    const q = buildQueue(mixed, MIXED);
    expect(secondsFrom(q, 1)).toEqual({ seconds: 65, hasUntimed: true });
    expect(secondsFrom(q, q.length - 1)).toEqual({ seconds: 45, hasUntimed: false });
  });
});

describe('the queue keeps its shape around a gated step', () => {
  it('still emits the rest that follows one', () => {
    const q = buildQueue(training([block('b', [step('s1'), step('s2')])]), MIXED);
    expect(q.map((c) => c.kind)).toEqual(['prepare', 'work', 'rest', 'work']);
  });

  it('still emits the round rest after a gated last step', () => {
    const q = buildQueue(
      training([block('b', [step('s1'), step('s2')], { repeat: 2 })]),
      // s2 last and gated this time — the reverse of MIXED.
      new Map([
        ['ex-s1', 'duration'],
        ['ex-s2', 'weightReps'],
      ]) as ExerciseTypes,
    );
    expect(q.map((c) => c.kind)).toEqual([
      'prepare', 'work', 'rest', 'work', 'roundRest', 'work', 'rest', 'work',
    ]);
  });

  it('carries the rep target and weight onto the cue so the player needs no lookup', () => {
    const q = buildQueue(
      training([
        block('b', [step('s1', { setTargets: [{ reps: 12 }], weightKg: 3, weightCount: 2 })]),
      ]),
      MIXED,
    );
    const cue = q.find(isGated)!;
    expect(cue.targetReps).toBe(12);
    expect(cue.weightKg).toBe(3);
    expect(cue.weightCount).toBe(2);
  });

  it('carries a prescribed distance onto the cue too', () => {
    const q = buildQueue(
      training([block('b', [step('s1', { setTargets: [{ distanceKm: 1.5 }] })])]),
      new Map([['ex-s1', 'weightDistance']]) as ExerciseTypes,
    );
    expect(q.find(isGated)!.targetDistanceKm).toBe(1.5);
  });
});

describe('the structure strip cannot claim a proportion it does not have', () => {
  it('gives a gated segment a null weight', () => {
    const segs = structureSegments(training([block('b', [step('s1'), step('s2')])]), MIXED);
    expect(segs.map((s) => s.weight)).toEqual([null, 20, 45]);
  });
});
