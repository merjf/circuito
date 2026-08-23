/**
 * Weight formatting for meta lines (1a, 1b) and player chips (1h).
 *
 * Weight is stored per step as `weightKg` plus `weightCount` — the number of
 * weights held. "2 pesi 3 kg" is a *pair* of 3 kg weights, not a single 6 kg
 * one, and the two are not interchangeable to someone reading the line back, so
 * the count is stored rather than inferred. A count of 1 (or absent) renders as
 * a plain weight.
 *
 * COPY — settled with the user 2026-08-15: render "4 kg", not the mock's Italian
 * "pesi 4 kg". The mock's meta lines are the designer's shorthand; the interface
 * is English. Exercise NAMES stay verbatim Italian — that rule is about user
 * data and is unaffected by this one.
 */

import { fieldsFor, type WeightSign } from './exerciseType';
import type { ExerciseTypes } from './queue';
import type { Training } from './types';

export interface WeightSpec {
  kg: number;
  count: number;
}

/** Trims a trailing `.0` so 4 reads as "4 kg" and 2.5 as "2.5 kg". */
function kg(n: number): string {
  return `${Number.isInteger(n) ? n : n.toFixed(1)} kg`;
}

/**
 * "4 kg" for a single weight, "2 × 3 kg" for a pair.
 *
 * `sign` comes from the exercise's type (`fieldsFor(type).weightSign`) and is
 * not decoration: a weighted pull-up at +10 kg and an assisted pull-up at
 * −10 kg are opposite facts, and a bare "10 kg" on either would invert the
 * meaning of the line. Plain weights — a dumbbell curl, a loaded carry — take
 * no sign, because there is no opposite for them to be confused with.
 */
export function formatWeight(spec: WeightSpec, sign: WeightSign = 'plain'): string {
  const body = spec.count > 1 ? `${spec.count} × ${kg(spec.kg)}` : kg(spec.kg);
  // U+2212 MINUS SIGN, not a hyphen: it aligns with the digits at these sizes.
  return sign === 'plus' ? `+${body}` : sign === 'minus' ? `−${body}` : body;
}

/** The player chip (1h), which is uppercase mono: "4 KG" / "2 × 3 KG". */
export function formatWeightChip(spec: WeightSpec, sign: WeightSign = 'plain'): string {
  return formatWeight(spec, sign).toUpperCase();
}

/** Reads a weight off anything carrying the two fields — a step or a cue. */
export function weightOf(source: {
  weightKg?: number;
  weightCount?: number;
}): WeightSpec | null {
  if (source.weightKg == null) return null;
  return { kg: source.weightKg, count: source.weightCount ?? 1 };
}

/**
 * Every distinct weight used in a training, ascending by kg then count.
 *
 * `types` decides which steps count, and passing it is not optional in
 * practice even though the signature allows it. A step KEEPS its `weightKg`
 * when its exercise is reclassified — steps are never rewritten underneath the
 * user — so reading the field without asking whether the exercise is still
 * weighted is how "10 kg" ends up on a card for a movement that became
 * bodyweight three weeks ago. Every other weight renderer in the app
 * (`stepMetaLine`, the player's chip, the logger's KG column) is gated this
 * way; this one was the last that was not.
 *
 * Omitting `types` reads every step's stored weight, which is what a caller
 * with no library loaded can honestly do — and is why it stays allowed.
 */
export function trainingWeights(training: Training, types?: ExerciseTypes): WeightSpec[] {
  const seen = new Map<string, WeightSpec>();
  for (const block of training.blocks) {
    for (const step of block.steps) {
      const type = types?.get(step.exerciseId);
      if (types && (type == null || !fieldsFor(type).weight)) continue;
      const spec = weightOf(step);
      if (spec) seen.set(`${spec.kg}x${spec.count}`, spec);
    }
  }
  return [...seen.values()].sort((a, b) => a.kg - b.kg || a.count - b.count);
}

/**
 * The sign shared by every weighted step in a training, or `plain` when they
 * disagree.
 *
 * A training of assisted pull-ups reads "−10 kg" and means it. A training that
 * mixes an assisted pull-up with a dumbbell curl has no single sign to give,
 * and inventing one would mislabel half of it — so the summary drops back to
 * unsigned, and the per-step lines below carry the truth.
 */
function sharedSign(training: Training, types?: ExerciseTypes): WeightSign {
  if (!types) return 'plain';
  const signs = new Set<WeightSign>();
  for (const block of training.blocks) {
    for (const step of block.steps) {
      const type = types.get(step.exerciseId);
      if (type == null || !fieldsFor(type).weight || step.weightKg == null) continue;
      signs.add(fieldsFor(type).weightSign);
    }
  }
  return signs.size === 1 ? [...signs][0]! : 'plain';
}

/**
 * The meta-line fragment. `null` when the training carries no weight at all, so
 * callers can drop the separator rather than print an empty segment. A training
 * mixing weights shows the range, since the meta line has room for one segment.
 */
export function formatTrainingWeight(training: Training, types?: ExerciseTypes): string | null {
  const weights = trainingWeights(training, types);
  if (weights.length === 0) return null;
  const sign = sharedSign(training, types);
  if (weights.length === 1) return formatWeight(weights[0]!, sign);
  const lightest = weights[0]!;
  const heaviest = weights[weights.length - 1]!;
  const from = sign === 'plus' ? `+${kg(lightest.kg)}` : sign === 'minus' ? `−${kg(lightest.kg)}` : kg(lightest.kg);
  return `${from}–${formatWeight(heaviest, sign)}`;
}
