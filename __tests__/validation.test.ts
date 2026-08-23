import { SEED_EXERCISES, SEED_TRAININGS } from './fixtures/seed';
import { buildQueue, exerciseTypesOf, roundsCompletedAt } from '../src/domain/queue';
import type { Training } from '../src/domain/types';
import { isValid, validateTraining } from '../src/domain/validation';

/**
 * Whether a step has a duration is its exercise's answer, so the queue built
 * below has to be told. Every seeded exercise is `durationWeight` — a clock
 * and a load — which is what makes this queue a fully timed one.
 */
const TYPES = exerciseTypesOf(SEED_EXERCISES);

const gambe = SEED_TRAININGS[0]!;

describe('validateTraining', () => {
  it('accepts both seeded circuits', () => {
    expect(validateTraining(gambe)).toEqual([]);
    expect(isValid(SEED_TRAININGS[1]!)).toBe(true);
  });

  it('requires a name', () => {
    expect(validateTraining({ ...gambe, name: '   ' })).toContain('Give the training a name.');
  });

  it('requires at least one block, and says so before anything else', () => {
    const problems = validateTraining({ ...gambe, blocks: [] });
    expect(problems).toEqual(['Add at least one block.']);
  });

  it('rejects an empty block', () => {
    const t: Training = { ...gambe, blocks: [{ ...gambe.blocks[0]!, steps: [] }] };
    expect(validateTraining(t)).toContain('Block A has no exercises.');
  });

  it('rejects work below the 5s floor', () => {
    const block = gambe.blocks[0]!;
    const t: Training = {
      ...gambe,
      blocks: [
        { ...block, steps: [{ ...block.steps[0]!, workSeconds: 3 }, ...block.steps.slice(1)] },
      ],
    };
    expect(validateTraining(t, TYPES)).toContain('Block A, exercise 1: time must be at least 5s.');
  });

  it('reports every problem at once rather than the first', () => {
    const t: Training = { ...gambe, name: '', blocks: [{ ...gambe.blocks[0]!, repeat: 0 }] };
    expect(validateTraining(t).length).toBeGreaterThan(1);
  });
});

describe('roundsCompletedAt', () => {
  const queue = buildQueue(gambe, TYPES);

  it('is zero before the first round finishes', () => {
    expect(roundsCompletedAt(queue, 0)).toBe(0);
    // Still inside round 1's last exercise.
    const lastOfRound1 = queue.findIndex(
      (c) => c.kind === 'work' && c.round === 1 && c.stepIndex === 3,
    );
    expect(roundsCompletedAt(queue, lastOfRound1)).toBe(0);
  });

  it('counts a round once its final work cue is behind us', () => {
    const lastOfRound1 = queue.findIndex(
      (c) => c.kind === 'work' && c.round === 1 && c.stepIndex === 3,
    );
    expect(roundsCompletedAt(queue, lastOfRound1 + 1)).toBe(1);
  });

  it('counts every round when the queue completed', () => {
    expect(roundsCompletedAt(queue, queue.length - 1, true)).toBe(3);
  });

  it('does not credit the final round to someone who stopped inside it', () => {
    expect(roundsCompletedAt(queue, queue.length - 1, false)).toBe(2);
  });
});
