/**
 * How a cue reads on the player.
 *
 * Two questions the player asks of every cue — "what goes where the clock
 * would be" and "what does the line after this one say" — and both of them
 * changed the day a circuit could hold three kinds of exercise. They live here
 * rather than inline in the screen for the reason `logging.ts` and `stats.ts`
 * do: these are definitions, not rendering details, and a definition written
 * inside a component is one that gets written slightly differently the next
 * time it is needed.
 *
 * ── THE RULE THEY BOTH SERVE ───────────────────────────────────────────────
 * Never show an invented number. A cue with no known length shows what it
 * PRESCRIBES, and names the unit so the number cannot be misread; a cue that
 * prescribes nothing shows a dash, which is the honest rendering of "do this,
 * then press DONE".
 */

import { fieldsFor, type ExerciseType } from '../domain/exerciseType';
import type { Cue } from '../domain/queue';

/** The em-dash that stands in for "nothing was prescribed". */
export const NOTHING = '—';

/** Two decimals at most, with no trailing zeros: 5, 2.5, 0.04. */
export function trimNumber(n: number): string {
  return String(Number(n.toFixed(2)));
}

export interface GatedReadout {
  value: string;
  /** `null` when there is no number, and therefore nothing to label. */
  unit: string | null;
}

/**
 * What a tap-gated cue puts where the clock would be.
 *
 * A gated cue has no time to show, and a frozen `0:00` would look broken — so
 * the screen shows the thing that IS being counted. Which that is comes from
 * the exercise's type in its own field order, so the number is always the one
 * the movement is defined by: reps for the four rep-counted types, distance
 * for a loaded carry.
 *
 * The type is consulted before the value, not after. A step keeps its
 * `setTargets` when its exercise is reclassified — steps are not rewritten
 * underneath the user — so a rep target still sitting on a carry is a stale
 * number, and reading it would put "×12" on the screen for a movement measured
 * in kilometres.
 */
export function gatedReadout(cue: Cue, type: ExerciseType | undefined): GatedReadout {
  const fields = fieldsFor(type ?? 'weightReps');

  if (fields.reps && cue.targetReps != null) {
    return { value: String(cue.targetReps), unit: 'reps' };
  }
  if (fields.distance && cue.targetDistanceKm != null) {
    return { value: trimNumber(cue.targetDistanceKm), unit: 'km' };
  }
  return { value: NOTHING, unit: null };
}

/**
 * The one-line description of the cue after this one.
 *
 * `Cue.seconds` is null on a gated cue, and the template this replaces read
 * `${next.seconds}s work` unconditionally — which rendered the literal string
 * "nulls work" the first time a rep-counted exercise followed anything else.
 * That is the bug this function exists to make unrepeatable: a cue with no
 * known length is described by what it asks for, and never by its length.
 */
export function upNextMeta(next: Cue | null | undefined, type: ExerciseType | undefined): string {
  if (!next) return NOTHING;

  if (next.kind !== 'work') {
    // A rest always has a duration, but the type does not promise it, and a
    // fallback costs one branch where a `!` would cost a crash.
    return next.seconds != null ? `after ${next.seconds}s rest` : 'rest';
  }

  if (next.seconds != null) return `${next.seconds}s work`;

  const { value, unit } = gatedReadout(next, type);
  // "on your call" rather than a dash: the up-next line is prose, and a lone
  // em-dash there reads as missing data rather than as an open-ended set.
  return unit ? `${value} ${unit}` : 'on your call';
}
