/**
 * Seed content — the user's two real circuits, from the handoff § "Sample content".
 *
 * TEST FIXTURE ONLY as of 2026-08-16 (`PLAN_ui_fixes.md` A1): the app ships empty,
 * with no runtime seeding. This file used to live at `src/db/seed.ts` and be
 * imported by `openDatabase()`; it now exists purely so `queue`, `reps`,
 * `validation` and `weight` tests have real, hand-checked data (the 10:55 total
 * for the legs circuit is pinned by a test against these exact numbers).
 *
 * Exercise names are VERBATIM ITALIAN. They are user data, not UI strings:
 * do not translate, shorten, sentence-case or "fix" them.
 *
 * STILL ASSUMED (user confirmed 2026-08-15 that these remain guesses): the
 * 20s rest and 60s round rest on the legs circuit. They are seeded so the app
 * has something to run and are asserted by the queue tests, but they are not
 * the user's real numbers yet. Expect them to change once he times a session —
 * only this file and the expected totals in `__tests__/queue.test.ts` move.
 *
 * Every exercise here is `durationWeight` — a clock and a load, which is what
 * these movements are: 45 seconds holding a 4 kg weight. Before the type
 * rewrite they were `kind: 'timed'` inside a `kind: 'timed'` training, and the
 * weight rode along on the step with nothing on the exercise saying it was
 * part of the measurement. The numbers are unchanged; only the vocabulary is.
 *
 * Exercises carry no timing — that lives on the steps below (see
 * `domain/types.ts`). Weights are per step with an explicit count:
 * the legs circuit is one 4 kg weight, the arms circuit a pair of 3 kg ones —
 * the handoff's "2 pesi 3 kg". The counts match the exercise names: the legs
 * moves say "mano ... che tiene peso" (one hand, one weight) while the arms
 * moves say "porto dietro i pesi" (plural).
 */

import type { Exercise, Training } from '../../src/domain/types';

const T0 = '2026-01-01T00:00:00.000Z';

export const SEED_EXERCISES: Exercise[] = [
  {
    id: 'ex-gambe-1',
    name: 'Piede su piedistallo, piede schiaccia piede, mano opposta a gamba piedistallo che tiene peso',
    tags: ['Gambe'],
    type: 'durationWeight',
    defaultWeightKg: 4,
    defaultWeightCount: 1,
    createdAt: T0,
    updatedAt: T0,
  },
  {
    id: 'ex-gambe-2',
    name: 'Squat con mano alternata che tiene peso',
    tags: ['Gambe'],
    type: 'durationWeight',
    defaultWeightKg: 4,
    defaultWeightCount: 1,
    createdAt: T0,
    updatedAt: T0,
  },
  {
    id: 'ex-gambe-3',
    name: 'Squat saltati',
    tags: ['Gambe'],
    type: 'durationWeight',
    defaultWeightKg: 4,
    defaultWeightCount: 1,
    createdAt: T0,
    updatedAt: T0,
  },
  {
    id: 'ex-braccia-1',
    name: 'Braccia parallele dentro fuori',
    tags: ['Braccia'],
    type: 'durationWeight',
    defaultWeightKg: 3,
    defaultWeightCount: 2,
    createdAt: T0,
    updatedAt: T0,
  },
  {
    id: 'ex-braccia-2',
    name: 'Braccia tese avanti, apro chiudo',
    tags: ['Braccia'],
    type: 'durationWeight',
    defaultWeightKg: 3,
    defaultWeightCount: 2,
    createdAt: T0,
    updatedAt: T0,
  },
  {
    id: 'ex-braccia-3',
    name: 'Braccia in su, porto dietro i pesi e alzo',
    tags: ['Braccia'],
    type: 'durationWeight',
    defaultWeightKg: 3,
    defaultWeightCount: 2,
    createdAt: T0,
    updatedAt: T0,
  },
];

export const SEED_TRAININGS: Training[] = [
  {
    id: 'tr-gambe',
    name: 'Circuito solo gambe',
    prepareSeconds: 10,
    createdAt: T0,
    updatedAt: T0,
    blocks: [
      {
        id: 'bl-gambe-a',
        label: 'Block A',
        repeat: 3,
        restBetweenRoundsSeconds: 60,
        steps: [
          {
            id: 'st-gambe-1',
            exerciseId: 'ex-gambe-1',
            workSeconds: 45,
            restAfterSeconds: 20,
            setTargets: [{ reps: 10 }],
            weightKg: 4,
            weightCount: 1,
          },
          {
            id: 'st-gambe-2',
            exerciseId: 'ex-gambe-2',
            workSeconds: 45,
            restAfterSeconds: 20,
            setTargets: [{ reps: 10 }],
            weightKg: 4,
            weightCount: 1,
          },
          {
            id: 'st-gambe-3',
            exerciseId: 'ex-gambe-3',
            workSeconds: 45,
            restAfterSeconds: 20,
            setTargets: [{ reps: 10 }],
            weightKg: 4,
            weightCount: 1,
          },
        ],
      },
    ],
  },
  {
    id: 'tr-braccia',
    name: 'Circuito solo braccia',
    prepareSeconds: 10,
    createdAt: T0,
    updatedAt: T0,
    blocks: [
      {
        id: 'bl-braccia-a',
        label: 'Block A',
        repeat: 1,
        restBetweenRoundsSeconds: 0,
        steps: [
          { id: 'st-braccia-1', exerciseId: 'ex-braccia-1', workSeconds: 60, restAfterSeconds: 0, weightKg: 3, weightCount: 2 },
          { id: 'st-braccia-2', exerciseId: 'ex-braccia-2', workSeconds: 60, restAfterSeconds: 0, weightKg: 3, weightCount: 2 },
          { id: 'st-braccia-3', exerciseId: 'ex-braccia-3', workSeconds: 60, restAfterSeconds: 0, weightKg: 3, weightCount: 2 },
        ],
      },
    ],
  },
];
