import { formatClock, formatDuration, trainingSeconds } from '../src/domain/duration';
import {
  buildQueue,
  exerciseTypesOf,
  isRest,
  secondsFrom,
  structureSegments,
  type ExerciseTypes,
} from '../src/domain/queue';
import { SEED_EXERCISES, SEED_TRAININGS } from './fixtures/seed';
import type { Training } from '../src/domain/types';

/**
 * Whether a step has a duration is the exercise's answer now, so these tests
 * have to say which exercise is what — an empty map means every step is
 * tap-gated, which is the safe direction but not the one being measured here.
 * `TYPES` is the seed library; `TIMED` covers the ad-hoc trainings below,
 * whose exercise ids are invented on the spot.
 */
const TYPES = exerciseTypesOf(SEED_EXERCISES);
const TIMED: ExerciseTypes = new Map([['e', 'duration']]);

const gambe = SEED_TRAININGS[0]!;
const braccia = SEED_TRAININGS[1]!;

describe('buildQueue — legs circuit', () => {
  const q = buildQueue(gambe, TYPES);

  it('opens with prepare and never ends on a rest', () => {
    expect(q[0]!.kind).toBe('prepare');
    expect(q[0]!.seconds).toBe(10);
    expect(isRest(q[q.length - 1]!)).toBe(false);
  });

  it('emits 9 work cues — 3 exercises across 3 rounds', () => {
    expect(q.filter((c) => c.kind === 'work')).toHaveLength(9);
  });

  it('drops the trailing rest of each round in favour of the round rest', () => {
    // 2 inter-step rests per round × 3 rounds
    expect(q.filter((c) => c.kind === 'rest')).toHaveLength(6);
    // between rounds 1→2 and 2→3 only
    expect(q.filter((c) => c.kind === 'roundRest')).toHaveLength(2);
  });

  it('never places two rests back to back', () => {
    for (let i = 1; i < q.length; i++) {
      expect(isRest(q[i]!) && isRest(q[i - 1]!)).toBe(false);
    }
  });

  it('carries round and step counters for the player header', () => {
    const work = q.filter((c) => c.kind === 'work');
    expect(work[4]).toMatchObject({ round: 2, roundsInBlock: 3, stepIndex: 2, stepsInRound: 3 });
    expect(work[4]!.targetReps).toBe(10);
  });

  it('carries reps and weight onto work cues so the player chips need no lookup', () => {
    const work = q.filter((c) => c.kind === 'work');
    expect(work.every((c) => c.targetReps === 10 && c.weightKg === 4)).toBe(true);
    expect(work.every((c) => c.weightCount === 1)).toBe(true);
  });

  it('leaves rest cues without reps or weight — chips are work-only', () => {
    for (const c of q.filter(isRest)) {
      expect(c.targetReps).toBeUndefined();
      expect(c.weightKg).toBeUndefined();
    }
  });

  it('totals 10:55 — the figure the handoff shows in the builder footer', () => {
    expect(trainingSeconds(gambe, TYPES).seconds).toBe(655);
    expect(formatDuration(trainingSeconds(gambe, TYPES).seconds)).toBe('10:55');
  });
});

describe('buildQueue — arms circuit', () => {
  const q = buildQueue(braccia, TYPES);

  it('emits no rest cues when every restAfter is zero', () => {
    expect(q.filter(isRest)).toHaveLength(0);
    expect(q).toHaveLength(4); // prepare + 3 work
  });

  it('totals prepare + 3×60s', () => {
    expect(trainingSeconds(braccia, TYPES).seconds).toBe(190);
  });

  it('carries a pair of 3kg weights and no rep target', () => {
    const work = q.filter((c) => c.kind === 'work');
    expect(
      work.every((c) => c.weightKg === 3 && c.weightCount === 2 && c.targetReps === undefined),
    ).toBe(true);
  });
});

describe('buildQueue — rests between blocks', () => {
  const twoBlocks: Training = {
    id: 'two-blocks',
    name: 'Two blocks',
    prepareSeconds: 0,
    createdAt: '',
    updatedAt: '',
    blocks: [
      {
        id: 'a',
        label: 'Block A',
        repeat: 1,
        restBetweenRoundsSeconds: 0,
        restAfterBlockSeconds: 75,
        steps: [{ id: 'a-step', exerciseId: 'e', workSeconds: 30, restAfterSeconds: 0 }],
      },
      {
        id: 'b',
        label: 'Block B',
        repeat: 1,
        restBetweenRoundsSeconds: 0,
        restAfterBlockSeconds: 90,
        steps: [{ id: 'b-step', exerciseId: 'e', workSeconds: 40, restAfterSeconds: 0 }],
      },
    ],
  };

  it('places the preceding block’s rest between its last work cue and the next block', () => {
    expect(buildQueue(twoBlocks, TIMED).map((cue) => [cue.kind, cue.seconds])).toEqual([
      ['work', 30],
      ['blockRest', 75],
      ['work', 40],
    ]);
    expect(trainingSeconds(twoBlocks, TIMED).seconds).toBe(145);
  });

  it('does not emit a transition rest when it is zero or after the final block', () => {
    const withoutTransition = {
      ...twoBlocks,
      blocks: twoBlocks.blocks.map((block) => ({ ...block, restAfterBlockSeconds: 0 })),
    };
    expect(buildQueue(withoutTransition, TIMED).map((cue) => cue.kind)).toEqual(['work', 'work']);
  });

  it('waits for the next non-empty block instead of ending on a rest', () => {
    const withEmptyMiddle = {
      ...twoBlocks,
      blocks: [twoBlocks.blocks[0]!, { ...twoBlocks.blocks[1]!, steps: [] }],
    };
    expect(buildQueue(withEmptyMiddle, TIMED).map((cue) => cue.kind)).toEqual(['work']);
  });
});

describe('bodyweight steps', () => {
  it('omit weight entirely rather than reporting zero', () => {
    const t: Training = {
      id: 't',
      name: '',
      prepareSeconds: 0,
      blocks: [
        {
          id: 'b',
          label: 'Block A',
          repeat: 1,
          restBetweenRoundsSeconds: 0,
          steps: [{ id: 's', exerciseId: 'e', workSeconds: 30, restAfterSeconds: 0 }],
        },
      ],
      createdAt: '',
      updatedAt: '',
    };
    expect(buildQueue(t, TIMED)[0]!.weightKg).toBeUndefined();
  });
});

describe('edge cases', () => {
  const empty: Training = {
    id: 't',
    name: '',
    prepareSeconds: 0,
    blocks: [],
    createdAt: '',
    updatedAt: '',
  };

  it('handles a training with no blocks', () => {
    expect(buildQueue(empty, TIMED)).toHaveLength(0);
    expect(trainingSeconds(empty, TIMED).seconds).toBe(0);
  });

  it('skips blocks that have no steps', () => {
    const t: Training = {
      ...empty,
      blocks: [{ id: 'b', label: 'Block A', repeat: 3, restBetweenRoundsSeconds: 60, steps: [] }],
    };
    expect(buildQueue(t, TIMED)).toHaveLength(0);
  });

  it('treats repeat 0 as a single round', () => {
    const t: Training = {
      ...empty,
      blocks: [
        {
          id: 'b',
          label: 'Block A',
          repeat: 0,
          restBetweenRoundsSeconds: 60,
          steps: [{ id: 's', exerciseId: 'e', workSeconds: 30, restAfterSeconds: 15 }],
        },
      ],
    };
    expect(trainingSeconds(t, TIMED).seconds).toBe(30);
  });
});

describe('secondsFrom', () => {
  it('counts down to zero across the queue', () => {
    const q = buildQueue(gambe, TYPES);
    expect(secondsFrom(q, 0).seconds).toBe(655);
    expect(secondsFrom(q, q.length).seconds).toBe(0);
    expect(secondsFrom(q, -5).seconds).toBe(655);
  });
});

describe('structureSegments', () => {
  it('weights one segment per cue and excludes prepare', () => {
    const segs = structureSegments(gambe, TYPES);
    expect(segs).toHaveLength(buildQueue(gambe, TYPES).length - 1);
    // Every seeded step is timed, so no segment is gated and the weights are
    // real seconds. A gated segment would carry null here by design.
    expect(segs.reduce((s, x) => s + (x.weight ?? 0), 0)).toBe(645);
  });
});

describe('formatting', () => {
  it('formatClock drops the leading zero on minutes', () => {
    expect(formatClock(31)).toBe('0:31');
    expect(formatClock(252)).toBe('4:12');
    expect(formatClock(-3)).toBe('0:00');
  });

  it('formatClock rounds up so the timer shows 0:00 only at zero', () => {
    expect(formatClock(0.4)).toBe('0:01');
    expect(formatClock(0)).toBe('0:00');
  });

  it('formatDuration pads minutes', () => {
    expect(formatDuration(252)).toBe('04:12');
    expect(formatDuration(655)).toBe('10:55');
  });
});

describe('library exercises carry no timing', () => {
  it('seeded exercises expose only movement data, not a prescription', () => {
    for (const exercise of SEED_EXERCISES) {
      expect(exercise).not.toHaveProperty('defaultWorkSeconds');
      expect(exercise).not.toHaveProperty('defaultRestSeconds');
      expect(exercise).not.toHaveProperty('defaultReps');
      expect(exercise.name.length).toBeGreaterThan(0);
    }
  });

  it('timing still reaches the queue, from the steps', () => {
    const work = buildQueue(gambe, TYPES).filter((c) => c.kind === 'work');
    expect(work.every((c) => c.seconds === 45)).toBe(true);
  });
});
