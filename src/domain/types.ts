/**
 * Domain model — from the handoff § "Data model", as amended.
 *
 * Rule that shapes everything below: total duration, per-block duration and the
 * flattened timeline are DERIVED, never stored. See `duration.ts` and `queue.ts`.
 *
 * Exercise names are user-authored and often Italian. They are data, not UI
 * strings: never translate, normalise or rewrite them.
 *
 * ── 2026-08-18: the timed/reps split is GONE ───────────────────────────────
 * `Training.kind`, `Step.mode`, `Session.kind` and `Mode` have all been
 * deleted. They encoded "is this whole training on a clock", which made a
 * bench press and a 50-second battle-rope set unable to share a circuit — the
 * ordinary shape of a real workout.
 *
 * What replaces them is `Exercise.type` (see `domain/exerciseType.ts`): the
 * question moves to the thing it was always about. A training is now just
 * blocks of steps, and every screen reads each step's shape off its exercise.
 */

import type { Equipment, ExerciseType } from './exerciseType';

export type Id = string;

/** ISO-8601 string. Stored as TEXT in SQLite so it sorts lexicographically. */
export type Timestamp = string;

export type MediaType = 'photo' | 'video';

/**
 * Library entity — a movement, with defaults.
 *
 * An exercise is **what to do**: a name, a description, a photo or video, what
 * it is measured in (`type`), what it is done with (`equipment`), and the
 * weight you usually hold.
 *
 * It still carries NO durations. Work and rest seconds belong to the step: the
 * same movement is 45s in one circuit and 60s in another, so a default there
 * would only ever be a guess that goes stale. `type`, `equipment` and the
 * weight defaults are different in kind — a plank is measured in seconds
 * wherever it appears, a barbell squat uses a barbell wherever it appears, and
 * your 3 kg dumbbells are your 3 kg dumbbells — so a default is a good guess
 * rather than a stale one.
 */
export interface Exercise {
  id: Id;
  name: string;
  /** Free text — form cues, reminders. Shown on the exercise page and in the logger. */
  note?: string;
  /**
   * What this movement is measured in, and therefore which inputs every screen
   * shows for it. Replaces the old `kind: 'timed' | 'reps'`, which could only
   * say "clock or count" and had no way to express weight at all.
   */
  type: ExerciseType;
  /** What it is done with. Optional only because rows predating v5 have no answer. */
  equipment?: Equipment;
  /**
   * Prefills `Step.weightKg` / `Step.weightCount`. Absent means bodyweight.
   * "2 × 3 kg" is a pair of 3 kg weights, not a single 6 kg one — see
   * `domain/weight.ts`.
   */
  defaultWeightKg?: number;
  defaultWeightCount?: number;
  /** Drives the library's filter pills and the sets-per-tag chart. Free text. */
  tags: string[];
  mediaUrl?: string;
  mediaType?: MediaType;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * What a step starts at when an exercise is first dropped into a block, for
 * whatever the exercise does not supply.
 *
 * Constants rather than per-exercise defaults: durations are deliberately not
 * on the library entity, and a fixed, predictable starting point is easier to
 * correct than a remembered one that quietly differs per row.
 */
export const NEW_STEP_DEFAULTS = {
  workSeconds: 45,
  restAfterSeconds: 20,
  restBetweenRoundsSeconds: 60,
} as const;

/**
 * What one round asks of one step.
 *
 * `weightKg` / `weightCount` are OVERRIDES of the step's own weight, not
 * replacements — absent means "whatever the step says". That is what lets a
 * pyramid express itself without every other step carrying a per-round weight
 * it never varies. Resolve with `weightForRound()`.
 *
 * Which of these fields is meaningful is decided by the exercise's type, never
 * by what happens to be filled in. A `duration` exercise reads `seconds` and
 * ignores `reps`, even if a `reps` survived a type change.
 */
export interface SetTarget {
  reps?: number;
  weightKg?: number;
  weightCount?: number;
  /** For `duration` and `durationWeight` types. */
  seconds?: number;
  /** For the two distance types. Typed by hand — nothing here measures it. */
  distanceKm?: number;
}

/** One exercise slot inside a block. */
export interface Step {
  id: Id;
  exerciseId: Id;
  /**
   * How long a timed step runs, when its per-round target does not say.
   *
   * Only read for an exercise whose type has a time field. Kept on every step
   * regardless, so that changing an exercise's type back and forth does not
   * lose the number you last chose.
   */
  workSeconds: number;
  /**
   * The rest AFTER this step. Read by the logger's rest timer and by the
   * hands-free runner alike.
   */
  restAfterSeconds: number;
  /**
   * The per-round prescription.
   *
   * Length is either **1** — one target that applies to every round — or
   * exactly `Block.repeat`, where entry *i* is round *i*. Nothing else is
   * legal; `validateTraining` enforces it and `reconcileTargets` keeps the
   * builder from ever producing it.
   *
   * Tying the length to the block's round count rather than letting it float
   * is what keeps the model coherent: a block with `repeat: 3` already means
   * three rounds, so a step carrying three independent sets would mean nine,
   * and nobody could say which. Bound to the round index, `12 / 10 / 8` reads
   * exactly as it is performed.
   *
   * Read it with `targetAt()` / `repsAt()` — never index this array directly.
   */
  setTargets?: SetTarget[];
  /**
   * Weight for this step, in kilograms. Per-step rather than per-training: two
   * circuits use different weights, and within a circuit a single exercise may
   * differ from its neighbours. Prefilled from the exercise's
   * `defaultWeightKg`. Omitted when the step is bodyweight.
   */
  weightKg?: number;
  /**
   * How many weights of `weightKg` are held. "2 pesi 3 kg" is a pair of 3 kg
   * weights, not a single 6 kg one — the distinction matters when reading the
   * line back, so it is stored rather than inferred. Treated as 1 when absent.
   */
  weightCount?: number;
}

export interface Block {
  id: Id;
  label: string;
  /** Rounds. >= 1. */
  repeat: number;
  restBetweenRoundsSeconds: number;
  steps: Step[];
}

/**
 * A training: blocks of steps, and nothing about how it is measured.
 *
 * There is deliberately no `kind`. A training that mixes a weighted press, a
 * timed hold and a bodyweight set is not a contradiction to be resolved by a
 * flag — it is a normal circuit, and every screen reads each step's shape from
 * its exercise.
 */
export interface Training {
  id: Id;
  name: string;
  /** Countdown before the first step, when run hands-free. Default 10. */
  prepareSeconds: number;
  blocks: Block[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ── Set targets ────────────────────────────────────────────────────────────
//
// Everything below is the single place that knows how `Step.setTargets` maps
// onto rounds. Screens, the queue and the builder all go through here: a rule
// spelled out at four call sites is a rule that will disagree with itself
// within a month.

/**
 * The target for a 1-based round.
 *
 * Falls back to entry 0, which is what makes a length-1 array mean "every
 * round". Out-of-range rounds fall back the same way rather than returning
 * undefined: a step whose block just grew a round is under-specified, not
 * broken, and the first target is the best answer available until the builder
 * reconciles it.
 */
export function targetAt(step: Step, round: number): SetTarget | undefined {
  const targets = step.setTargets;
  if (!targets || targets.length === 0) return undefined;
  return targets[round - 1] ?? targets[0];
}

/** The rep count for a 1-based round, if one is set. */
export function repsAt(step: Step, round: number): number | undefined {
  return targetAt(step, round)?.reps;
}

/**
 * The work duration for a 1-based round.
 *
 * Falls back to `Step.workSeconds`, which is the step-wide default. A timed
 * step therefore always has an answer, which is what lets the hands-free
 * runner count down without inventing anything.
 */
export function secondsAt(step: Step, round: number): number {
  return targetAt(step, round)?.seconds ?? step.workSeconds;
}

/** The distance for a 1-based round, if one is set. */
export function distanceAt(step: Step, round: number): number | undefined {
  return targetAt(step, round)?.distanceKm;
}

/** True when the step prescribes something different round to round. */
export function targetsVary(step: Step): boolean {
  return (step.setTargets?.length ?? 0) > 1;
}

/**
 * The weight for a 1-based round: the round's override if it has one, the
 * step's own weight otherwise.
 */
export function weightForRound(
  step: Step,
  round: number,
): { weightKg?: number; weightCount?: number } {
  const target = targetAt(step, round);
  if (target?.weightKg == null) {
    return { weightKg: step.weightKg, weightCount: step.weightCount };
  }
  return { weightKg: target.weightKg, weightCount: target.weightCount ?? 1 };
}

/** Replace the whole prescription with one target applied to every round. */
export function withUniformReps(step: Step, reps: number | undefined): Step {
  if (reps == null || reps <= 0) {
    // Clearing reps clears the prescription entirely rather than leaving an
    // array of empty objects behind, which would read as "varies" forever.
    const remaining = (step.setTargets ?? [])
      .map(({ reps: _dropped, ...rest }) => rest)
      .filter((target) => Object.keys(target).length > 0);
    return { ...step, setTargets: remaining.length > 0 ? remaining : undefined };
  }
  const existing = step.setTargets?.[0] ?? {};
  return { ...step, setTargets: [{ ...existing, reps }] };
}

/**
 * Replace the whole prescription with one distance applied to every round.
 *
 * The distance twin of `withUniformReps`, and it clears the same way: setting
 * it to nothing strips `distanceKm` from every entry and drops the array
 * entirely if that leaves it empty, rather than keeping a row of `{}` behind
 * which would read as "varies by round" forever.
 *
 * There is deliberately no per-round distance editor to go with `withRepsAt`.
 * A carry that changes distance every round is a different prescription each
 * time, and the builder has no room for n distance steppers next to n rep
 * ones — if it is ever wanted, `expandTargets` is already the mechanism.
 */
export function withUniformDistance(step: Step, distanceKm: number | undefined): Step {
  // Rounded HERE, not at the point it is displayed. A stepper of 0.05 walks
  // through values like 0.39999999999999997, and stepping up to 0.05 and back
  // down lands on 1.39e-17 rather than 0 — which is not zero, so it would
  // persist as a prescription, render as "0 km" in the player where a zero is
  // forbidden, and print in full in the logger's placeholder. Anything under
  // half a centimetre is nobody's target; it is arithmetic residue.
  const km = distanceKm == null ? undefined : Number(distanceKm.toFixed(2));

  if (km == null || km < 0.005) {
    const remaining = (step.setTargets ?? [])
      .map(({ distanceKm: _dropped, ...rest }) => rest)
      .filter((target) => Object.keys(target).length > 0);
    return { ...step, setTargets: remaining.length > 0 ? remaining : undefined };
  }
  const existing = step.setTargets?.[0] ?? {};
  return { ...step, setTargets: [{ ...existing, distanceKm: km }] };
}

/** Set the rep count for one round, expanding a uniform target if needed. */
export function withRepsAt(step: Step, round: number, reps: number, rounds: number): Step {
  const expanded = expandTargets(step.setTargets, rounds);
  expanded[round - 1] = { ...expanded[round - 1], reps: reps > 0 ? reps : undefined };
  return { ...step, setTargets: expanded };
}

/** Grow a prescription to one entry per round, repeating the last. */
function expandTargets(targets: SetTarget[] | undefined, rounds: number): SetTarget[] {
  const source = targets && targets.length > 0 ? targets : [{}];
  return Array.from({ length: Math.max(1, rounds) }, (_, i) => ({
    ...(source[i] ?? source[source.length - 1] ?? {}),
  }));
}

/**
 * Bring a step's prescription back in line with its block's round count.
 *
 * Called by the BUILDER whenever `repeat` changes, not by validation. The
 * difference matters: authoring 12/10/8 at three rounds and then tapping the
 * repeat stepper down to two would otherwise leave a draft that fails to save,
 * with the error surfacing on Save — long after, and far from, the tap that
 * caused it. Truncating on the spot is what the user meant.
 *
 * Growing pads with the last value rather than the first, so 12/10/8 taken to
 * four rounds becomes 12/10/8/8 — the progression continues instead of
 * restarting.
 */
export function reconcileTargets(step: Step, repeat: number): Step {
  const targets = step.setTargets;
  if (!targets || targets.length <= 1) return step;

  const rounds = Math.max(1, repeat);
  if (targets.length === rounds) return step;
  if (targets.length > rounds) {
    return { ...step, setTargets: targets.slice(0, rounds) };
  }
  return { ...step, setTargets: expandTargets(targets, rounds) };
}

// ── Sessions and logs ──────────────────────────────────────────────────────

/** One completed or abandoned run. */
export interface Session {
  id: Id;
  trainingId: Id;
  /** Denormalised so history survives the training being renamed or deleted. */
  trainingName: string;
  startedAt: Timestamp;
  endedAt: Timestamp;
  /**
   * Measured wall time. Zero only for sessions written by the old reference
   * sheet, which never started a clock — which is why the readers branch on
   * this value rather than on any stored kind.
   */
  elapsedSeconds: number;
  /** Banked by the hands-free runner only. Zero for a plainly logged session. */
  workSeconds: number;
  restSeconds: number;
  roundsCompleted: number;
  roundsPlanned: number;
  skippedRests: number;
  completed: boolean;
}

/**
 * How a logged set was performed.
 *
 * `drop` earns its place by BEHAVIOUR rather than by labelling: consecutive
 * drop sets suppress the rest timer, because the point of a drop set is that
 * there is no rest in between.
 */
export type SetType = 'normal' | 'warmup' | 'drop' | 'failure';

/**
 * One set, as actually performed.
 *
 * The counterpart to `Step`, and the two must never be confused: **the plan
 * prescribes, the log observes, neither writes to the other.**
 *
 * `exerciseName` is denormalised for the same reason `Session.trainingName`
 * is: an exercise can be deleted once no training uses it, and history that
 * loses its labels is history nobody can read.
 */
export interface SetLog {
  id: Id;
  sessionId: Id;
  exerciseId: Id;
  exerciseName: string;
  blockId?: Id;
  /** Which slot in the plan produced this. Absent for an unplanned extra set. */
  stepId?: Id;
  /** 1-based, matching `Block.repeat`. */
  roundIndex: number;
  /** 1-based within the round. Usually 1; higher for an added set. */
  setIndex: number;
  reps?: number;
  weightKg?: number;
  weightCount?: number;
  /** How long the set actually took, for a timed exercise. */
  seconds?: number;
  /** How far it covered, for a distance exercise. */
  distanceKm?: number;
  type: SetType;
  /**
   * Rate of perceived exertion. Stored from the first migration, written by
   * nothing yet: the logger row is already four columns wide on a phone, and a
   * fifth would be the one that breaks it.
   */
  rpe?: number;
  completedAt: Timestamp;
}

export const DEFAULT_PREPARE_SECONDS = 10;

/** Builder validation — handoff § "Interactions & behaviour". */
export const LIMITS = {
  minWorkSeconds: 5,
  minRestSeconds: 0,
  minRepeat: 1,
  minStepsPerBlock: 1,
  minBlocksPerTraining: 1,
  minReps: 1,
  /** Stepper increments. */
  secondsIncrement: 5,
  repsIncrement: 1,
  repeatIncrement: 1,
} as const;

export type { Equipment, ExerciseType } from './exerciseType';
