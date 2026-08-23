/**
 * Derived durations. Nothing here is ever persisted.
 *
 * Everything delegates to the runner queue so that the number shown in the
 * builder footer, the number on the home card and the number the player counts
 * down can never drift apart. See the discrepancy note at the top of `queue.ts`
 * for why this is derived from the queue rather than from the handoff's closed
 * form expression.
 *
 * Since 2026-08-16 a duration may be only PARTLY knowable: a tap-gated step has
 * no length until it is tapped. Every function that adds seconds up therefore
 * returns a `QueueDuration` — a number plus a flag saying whether that number is
 * the whole story — rather than a bare number a caller could render as if it
 * were exact.
 */

import {
  blockQueueSeconds,
  buildQueue,
  queueSeconds,
  type ExerciseTypes,
  type QueueDuration,
} from './queue';
import { fieldsFor, type ExerciseType } from './exerciseType';
import { secondsAt } from './types';
import type { Block, Step, Training } from './types';
import { formatWeight, weightOf } from './weight';

/**
 * A step's rep prescription as one string: "×12", or "12 · 10 · 8" when it
 * varies by round.
 *
 * `null` rather than an empty string when nothing is prescribed, so callers
 * drop the segment instead of printing a stray separator.
 */
export function formatTargetReps(step: Step): string | null {
  const targets = step.setTargets;
  if (!targets || targets.length === 0) return null;

  const reps = targets.map((target) => target.reps).filter((r): r is number => r != null && r > 0);
  if (reps.length === 0) return null;
  // A single entry applies to every round, so it reads as one target. Several
  // read as a sequence, in the order they are performed.
  if (targets.length === 1) return `×${reps[0]}`;
  return reps.join(' · ');
}

/** A block's full contribution: every round plus the rests between them. */
export function blockSeconds(block: Block, exerciseTypes: ExerciseTypes): QueueDuration {
  return blockQueueSeconds(block, exerciseTypes);
}

/** One pass through a block's steps. Shown on collapsed builder block rows. */
export function blockRoundSeconds(block: Block, exerciseTypes: ExerciseTypes): QueueDuration {
  return blockQueueSeconds({ ...block, repeat: 1 }, exerciseTypes);
}

export function trainingSeconds(training: Training, exerciseTypes: ExerciseTypes): QueueDuration {
  return queueSeconds(buildQueue(training, exerciseTypes));
}

/**
 * The headline a training gets.
 *
 * Since the timed/reps split was deleted this is simply the queue's duration —
 * but it stays a `QueueDuration` rather than a number, because a training full
 * of tap-gated steps has no total the app can promise. `hasUntimed` is what
 * turns "10:55" into "10:55 +", and dropping it here would be dropping the
 * only honest thing this function says.
 */
export function trainingHeadline(
  training: Training,
  exerciseTypes: ExerciseTypes,
): QueueDuration {
  return trainingSeconds(training, exerciseTypes);
}

/** Total rounds across all blocks — the "3 rounds" in the list meta line. */
/**
 * Does this training prescribe any seconds of WORK?
 *
 * Not `trainingHeadline(...).seconds > 0`, which is the shape this replaces and
 * was wrong in a way that took a review to catch: the queue gives prepare and
 * every rest a real duration, and only WORK cues can be null. A circuit of
 * three bodyweight exercises with the builder's defaults totals 250 seconds of
 * prepare and rest without a single second of prescribed work — so the
 * `> 0` test was true for every training that has ever existed, the "REPS"
 * chip was unreachable, and a rep-counted circuit confidently quoted
 * "04:10 + total" for a session whose length nobody had said anything about.
 *
 * The question the screens are actually asking is "is there a clock to show",
 * and this is that question.
 */
export function hasTimedWork(training: Training, exerciseTypes: ExerciseTypes): boolean {
  return buildQueue(training, exerciseTypes).some(
    (cue) => cue.kind === 'work' && cue.seconds !== null,
  );
}

export function totalRounds(training: Training): number {
  return training.blocks.reduce((sum, b) => sum + Math.max(1, b.repeat), 0);
}

/** Distinct exercise slots, not counting repeats — the "3 exercises" meta. */
export function totalSteps(training: Training): number {
  return training.blocks.reduce((sum, b) => sum + b.steps.length, 0);
}

/** `m:ss` — no leading zero on minutes. The player timer (1h) uses this. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** `mm:ss` — zero-padded. Totals, durations and "left" readouts. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * A duration that may be a lower bound: "10:55" or "10:55 +".
 *
 * The `+` is the whole point of `QueueDuration` reaching this far. It means
 * "plus however long your sets take", and without it the app would be quoting a
 * total it cannot deliver.
 */
export function formatQueueDuration(duration: QueueDuration): string {
  return duration.hasUntimed
    ? `${formatDuration(duration.seconds)} +`
    : formatDuration(duration.seconds);
}

/**
 * `mm:ss`, or `h:mm:ss` once it passes an hour.
 *
 * For the logger's running clock, which is the one duration in the app that is
 * open-ended — every other one is bounded by a queue built in advance. Left as
 * `mm:ss` below the hour so a normal session reads exactly as it does
 * everywhere else, rather than carrying a permanent `0:`.
 */
export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 3600) return formatDuration(s);
  const hours = Math.floor(s / 3600);
  const minutes = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  return `${hours}:${minutes}:${String(s % 60).padStart(2, '0')}`;
}

/** "45s" / "1m 30s" — compact form for meta lines. */
export function formatShort(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
}

/**
 * A step's meta line, keyed on the EXERCISE's type.
 *
 * The type decides which facts are true of this step: a duration exercise has
 * work seconds and no reps, a weight-and-reps exercise has the opposite, and
 * asking a step to describe itself without knowing its type is how the old
 * `stepMetaLine(step, trainingKind)` ended up printing "×10 reps" for a plank.
 *
 * Extracted so every reader of a step's meta describes it identically.
 */
export function stepMetaLine(
  step: Step,
  type: ExerciseType | undefined,
  opts: { isLast?: boolean } = {},
): string {
  const fields = fieldsFor(type ?? 'weightReps');
  const targets = formatTargetReps(step);
  const weight = weightOf(step);

  return [
    fields.reps && targets ? `${targets} reps` : null,
    fields.time ? `${formatShort(secondsAt(step, 1))} work` : null,
    // Signed, so a weighted pull-up and an assisted one do not read alike.
    fields.weight && weight ? formatWeight(weight, fields.weightSign) : null,
    // The last step of a round runs straight into the round rest, so its
    // restAfter never fires and is not shown.
    !opts.isLast && step.restAfterSeconds > 0
      ? `${formatShort(step.restAfterSeconds)} rest`
      : null,
  ]
    .filter((v): v is string => Boolean(v))
    .join('  ·  ');
}
