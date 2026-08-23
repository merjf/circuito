import { SEED_TRAININGS } from './fixtures/seed';
import type { Training } from '../src/domain/types';
import {
  formatTrainingWeight,
  formatWeight,
  formatWeightChip,
  trainingWeights,
  weightOf,
} from '../src/domain/weight';

const gambe = SEED_TRAININGS[0]!;
const braccia = SEED_TRAININGS[1]!;

describe('formatWeight', () => {
  it('omits the count when a single weight is held', () => {
    expect(formatWeight({ kg: 4, count: 1 })).toBe('4 kg');
  });

  it('shows the count for a pair — "2 pesi 3 kg" is not 6 kg', () => {
    expect(formatWeight({ kg: 3, count: 2 })).toBe('2 × 3 kg');
  });

  it('trims a trailing zero but keeps a real fraction', () => {
    expect(formatWeight({ kg: 2.5, count: 1 })).toBe('2.5 kg');
    expect(formatWeight({ kg: 10, count: 1 })).toBe('10 kg');
  });

  it('uppercases for the player chip', () => {
    expect(formatWeightChip({ kg: 4, count: 1 })).toBe('4 KG');
    expect(formatWeightChip({ kg: 3, count: 2 })).toBe('2 × 3 KG');
  });
});

describe('weightOf', () => {
  it('treats a missing count as one', () => {
    expect(weightOf({ weightKg: 5 })).toEqual({ kg: 5, count: 1 });
  });

  it('returns null for a bodyweight step rather than a zero', () => {
    expect(weightOf({})).toBeNull();
  });
});

describe('formatTrainingWeight', () => {
  it('reads the seeded circuits', () => {
    expect(formatTrainingWeight(gambe)).toBe('4 kg');
    expect(formatTrainingWeight(braccia)).toBe('2 × 3 kg');
  });

  it('is null for an all-bodyweight training so the separator can be dropped', () => {
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
    expect(formatTrainingWeight(t)).toBeNull();
    expect(trainingWeights(t)).toHaveLength(0);
  });

  it('shows a range when a training mixes weights', () => {
    const mixed: Training = {
      ...gambe,
      blocks: [
        {
          ...gambe.blocks[0]!,
          steps: [
            { ...gambe.blocks[0]!.steps[0]!, weightKg: 4, weightCount: 1 },
            { ...gambe.blocks[0]!.steps[1]!, weightKg: 6, weightCount: 2 },
          ],
        },
      ],
    };
    expect(formatTrainingWeight(mixed)).toBe('4 kg–2 × 6 kg');
  });
});
