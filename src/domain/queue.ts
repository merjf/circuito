/**
 * The runner queue — the single source of truth for what a training *is* in time.
 *
 * A training is flattened into a flat list of cues; the player is then nothing
 * but an index into that list plus a monotonic clock. Skip / previous, the
 * progress fill, "up next", the remaining total and the summary stats all fall
 * out of it for free. This is the handoff's § "Runner queue".
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SETTLED — confirmed by the user, 2026-08-15: "no rest in the total".
 *
 * The handoff's closed-form total,
 *     prepare + Σ blocks( repeat × Σ steps(work + restAfter)
 *                         + (repeat − 1) × restBetweenRounds )
 * charges a step's `restAfter` even for the LAST step of a round, which would
 * put the legs circuit at 11:55. The handoff's own builder footer ("Total
 * 10:55") and `Player Prototype.dc.html` (`if (i < ids.length - 1)`) both say
 * otherwise: the last step of a round goes straight into the round rest, giving
 * 10 + 3×(3×45 + 2×20) + 2×60 = 655s = 10:55.
 *
 * That is the behaviour, and it is pinned by a test. The handoff's formula is
 * wrong and should not be re-derived from.
 * ────────────────────────────────────────────────────────────────────────────
 * SETTLED — confirmed by the user, 2026-08-16: rep-counted steps wait for a tap.
 *
 * A step whose resolved mode is `'reps'` inside a TIMED training has NO
 * duration. It is not a 45-second guess and it is not zero: the runner sits on
 * it until the user taps Done. `Cue.seconds` is therefore `number | null`.
 *
 * `null` rather than `0` is the entire safety mechanism of this change. Zero
 * would sum silently and produce a total that is confidently wrong; null makes
 * every arithmetic site a type error until someone has decided what it should
 * mean there. If you are here because the compiler sent you: the question to
 * answer is "what does this number mean when part of the workout has no known
 * length", and the answer is usually "sum what is known and say so".
 * ────────────────────────────────────────────────────────────────────────────
 */

import { isTimed, type ExerciseType } from './exerciseType';
import { distanceAt, repsAt, secondsAt, weightForRound } from './types';
import type { Block, Exercise, Id, Step, Training } from './types';

export type CueKind = 'prepare' | 'work' | 'rest' | 'roundRest';

export interface Cue {
  kind: CueKind;
  /**
   * Length in seconds, or `null` for a tap-gated cue of unknown length.
   * Only `work` cues are ever null — a rest always has a duration.
   */
  seconds: number | null;
  /** Present on `work`. */
  stepId?: Id;
  exerciseId?: Id;
  blockId?: Id;
  /** 1-based round within the block. 0 during `prepare`. */
  round: number;
  /** Rounds in the owning block, so the player can render "Round 2 / 3". */
  roundsInBlock: number;
  /** 1-based index of the step within its round. */
  stepIndex: number;
  /** Steps per round in the owning block, for "Ex 2 / 3". */
  stepsInRound: number;
  /** Target reps carried onto the work cue so the player needs no lookup. */
  targetReps?: number;
  /** Target distance, likewise. Typed by hand — nothing here measures it. */
  targetDistanceKm?: number;
  /** Weight in kg, likewise carried so the player renders chips from the cue alone. */
  weightKg?: number;
  /** How many weights of `weightKg`. Absent means one. */
  weightCount?: number;
}

/** A cue the runner waits on rather than times. */
export function isGated(cue: Cue): boolean {
  return cue.seconds === null;
}

/**
 * How a step's mode is resolved for the queue.
 *
 * Required rather than optional, and a map rather than a default, because the
 * wrong answer here is invisible: a rep-counted step silently treated as timed
 * runs a 45-second timer the user never asked for, and nothing in the UI says
 * so. Every caller already loads the exercise list to render names, so this
 * costs them nothing but a moment's thought about which list they are passing.
 */
export type ExerciseTypes = ReadonlyMap<Id, ExerciseType>;

/**
 * Build the map from whatever list of exercises a screen already has.
 *
 * Every screen that renders a training loads its exercises anyway, to show the
 * names — so this costs nothing but the call. Keeping it here rather than
 * asking each screen to write the same one-liner means there is one answer to
 * "what does the queue need", not five that could drift.
 */
export function exerciseTypesOf(exercises: Iterable<Exercise>): ExerciseTypes {
  return new Map(Array.from(exercises, (e) => [e.id, e.type]));
}

/**
 * Does this step run on a clock?
 *
 * The single question the queue asks of an exercise. A missing entry resolves
 * to NOT timed, which makes the cue tap-gated — the safe direction: a gated
 * cue waits for you, where a timed one would run a countdown nobody asked for
 * and advance past a set you were still doing.
 */
function stepIsTimed(step: Step, types: ExerciseTypes): boolean {
  const type = types.get(step.exerciseId);
  return type != null && isTimed(type);
}

/**
 * Flatten a training into its cue list.
 *
 * Rules:
 *  - `prepare` is emitted only when `prepareSeconds > 0`.
 *  - a rep-counted step emits a cue with `seconds: null` — tap-gated.
 *  - a step's `restAfter` is emitted only when another step follows it in the
 *    same round (see the discrepancy note above).
 *  - `roundRest` is emitted between rounds of a block, never after the last.
 *  - zero-second rests are dropped entirely rather than flashing on screen.
 *  - the queue never ends on a rest.
 */
export function buildQueue(training: Training, exerciseTypes: ExerciseTypes): Cue[] {
  const queue: Cue[] = [];

  if (training.prepareSeconds > 0) {
    queue.push({
      kind: 'prepare',
      seconds: training.prepareSeconds,
      round: 0,
      roundsInBlock: 0,
      stepIndex: 0,
      stepsInRound: 0,
    });
  }

  for (const block of training.blocks) {
    const rounds = Math.max(1, block.repeat);
    const stepsInRound = block.steps.length;
    if (stepsInRound === 0) continue;

    for (let round = 1; round <= rounds; round++) {
      block.steps.forEach((step, i) => {
        const timed = stepIsTimed(step, exerciseTypes);
        // Resolved per round, not per step: a 12/10/8 prescription must reach
        // the player as 12 on round one and 8 on round three. Carrying it on
        // the cue is what keeps the player free of lookups.
        const weight = weightForRound(step, round);
        queue.push({
          kind: 'work',
          // A gated step's stored workSeconds is deliberately ignored rather
          // than cleared: keeping it means changing the exercise's type back
          // restores the number the user last chose.
          seconds: timed ? secondsAt(step, round) : null,
          stepId: step.id,
          exerciseId: step.exerciseId,
          blockId: block.id,
          round,
          roundsInBlock: rounds,
          stepIndex: i + 1,
          stepsInRound,
          targetReps: repsAt(step, round),
          targetDistanceKm: distanceAt(step, round),
          weightKg: weight.weightKg,
          weightCount: weight.weightCount,
        });

        const isLastOfRound = i === stepsInRound - 1;
        if (!isLastOfRound && step.restAfterSeconds > 0) {
          queue.push({
            kind: 'rest',
            seconds: step.restAfterSeconds,
            blockId: block.id,
            round,
            roundsInBlock: rounds,
            stepIndex: i + 1,
            stepsInRound,
          });
        }
      });

      if (round < rounds && block.restBetweenRoundsSeconds > 0) {
        queue.push({
          kind: 'roundRest',
          seconds: block.restBetweenRoundsSeconds,
          blockId: block.id,
          round,
          roundsInBlock: rounds,
          stepIndex: stepsInRound,
          stepsInRound,
        });
      }
    }
  }

  // Defensive: a training must never finish on a rest.
  while (queue.length > 0 && isRest(queue[queue.length - 1]!)) queue.pop();

  return queue;
}

export function isRest(cue: Cue): boolean {
  return cue.kind === 'rest' || cue.kind === 'roundRest';
}

/** `prepare` uses the dark work palette — only true rests flip the screen. */
export function usesDarkPalette(cue: Cue): boolean {
  return !isRest(cue);
}

/**
 * A duration that may be partly unknown.
 *
 * Returned as an object rather than a bare number so that no caller can render
 * a total without having seen `hasUntimed` — the difference between "10:55" and
 * "10:55 +" is the difference between a promise the app can keep and one it
 * cannot.
 */
export interface QueueDuration {
  /** Sum of the cues whose length is known. */
  seconds: number;
  /** True when at least one cue is tap-gated, so `seconds` is a lower bound. */
  hasUntimed: boolean;
}

export function queueSeconds(queue: Cue[]): QueueDuration {
  let seconds = 0;
  let hasUntimed = false;
  for (const cue of queue) {
    if (cue.seconds === null) hasUntimed = true;
    else seconds += cue.seconds;
  }
  return { seconds, hasUntimed };
}

/** Remaining from the start of cue `index` to the end of the queue. */
export function secondsFrom(queue: Cue[], index: number): QueueDuration {
  return queueSeconds(queue.slice(Math.max(0, index)));
}

/**
 * The structure strip on the home card (1a) and the segmented bar on 1g:
 * one flex-weighted segment per cue.
 *
 * A gated cue gets `weight: null`, which the renderer draws at a fixed width.
 * It cannot be flex-weighted: an unknown length has no proportion of the whole
 * to claim, and picking a plausible-looking number would draw a bar that says
 * something the app does not know.
 */
export interface Segment {
  kind: CueKind;
  weight: number | null;
  round: number;
}

export function structureSegments(training: Training, exerciseTypes: ExerciseTypes): Segment[] {
  return buildQueue(training, exerciseTypes)
    .filter((c) => c.kind !== 'prepare')
    .map((c) => ({ kind: c.kind, weight: c.seconds, round: c.round }));
}

/**
 * How many rounds are fully finished at `index` — the summary's "3 / 3".
 *
 * A round counts only once its last work cue has been left behind, so pausing
 * halfway through round three reports two, not three. `completed` marks the
 * whole queue as consumed, which is the only way the final round can count.
 *
 * Unaffected by gating: this counts cues, not seconds.
 */
export function roundsCompletedAt(queue: Cue[], index: number, completed = false): number {
  const finished = new Set<string>();

  for (let i = 0; i < queue.length; i++) {
    const cue = queue[i]!;
    if (cue.kind !== 'work') continue;
    // The last work cue of its round.
    const isRoundEnd = cue.stepIndex === cue.stepsInRound;
    if (!isRoundEnd) continue;
    if (i < index || completed) finished.add(`${cue.blockId}:${cue.round}`);
  }

  return finished.size;
}

/** A single block's contribution, derived the same way as the whole training. */
export function blockQueueSeconds(block: Block, exerciseTypes: ExerciseTypes): QueueDuration {
  return queueSeconds(
    buildQueue(
      {
        id: block.id,
        name: '',
        prepareSeconds: 0,
        blocks: [block],
        createdAt: '',
        updatedAt: '',
      },
      exerciseTypes,
    ),
  );
}
