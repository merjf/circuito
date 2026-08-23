/**
 * What an exercise measures — and therefore which fields every screen shows.
 *
 * This REPLACES the old `Mode = 'timed' | 'reps'` and, with it, the whole
 * timed-training / reps-training split (2026-08-18). That split put the answer
 * on the TRAINING, which meant a circuit could not hold a bench press and a
 * 50-second battle-rope set at the same time — and that is the ordinary shape
 * of a real circuit.
 *
 * The answer moves down to the exercise, where it always belonged: a plank is
 * measured in seconds wherever it appears, and a bench press is measured in
 * kilograms and reps wherever it appears. A training is now simply a list of
 * blocks, and each step's shape is read off its exercise.
 *
 * ── THE FIELD MATRIX IS THE POINT ──────────────────────────────────────────
 * Everything downstream — the builder row, the logger row, the meta line, the
 * runner's decision to count down or wait for a tap — asks `fieldsFor()` and
 * renders what it is told. Eight types with the same four questions beats
 * eight branches repeated at six call sites, which is how `stepFields.ts`
 * (deleted with this change) started drifting from `visibleStepFields`.
 */

export type ExerciseType =
  | 'weightReps'
  | 'bodyweightReps'
  | 'weightedBodyweight'
  | 'assistedBodyweight'
  | 'duration'
  | 'durationWeight'
  | 'distanceDuration'
  | 'weightDistance';

/** Order is the order of the picker screen. */
export const EXERCISE_TYPES: readonly ExerciseType[] = [
  'weightReps',
  'bodyweightReps',
  'weightedBodyweight',
  'assistedBodyweight',
  'duration',
  'durationWeight',
  'distanceDuration',
  'weightDistance',
] as const;

/**
 * How a type's weight reads.
 *
 * `plus` and `minus` are not decoration. A weighted pull-up at +10 kg and an
 * assisted pull-up at −10 kg are opposite facts, and a bare "10 kg" on either
 * would invert the meaning of your own history.
 */
export type WeightSign = 'plain' | 'plus' | 'minus';

export interface TypeFields {
  weight: boolean;
  reps: boolean;
  time: boolean;
  distance: boolean;
  /** Only meaningful when `weight` is true. */
  weightSign: WeightSign;
}

const FIELDS: Record<ExerciseType, TypeFields> = {
  weightReps: { weight: true, reps: true, time: false, distance: false, weightSign: 'plain' },
  bodyweightReps: { weight: false, reps: true, time: false, distance: false, weightSign: 'plain' },
  weightedBodyweight: { weight: true, reps: true, time: false, distance: false, weightSign: 'plus' },
  assistedBodyweight: {
    weight: true,
    reps: true,
    time: false,
    distance: false,
    weightSign: 'minus',
  },
  duration: { weight: false, reps: false, time: true, distance: false, weightSign: 'plain' },
  durationWeight: { weight: true, reps: false, time: true, distance: false, weightSign: 'plain' },
  distanceDuration: { weight: false, reps: false, time: true, distance: true, weightSign: 'plain' },
  weightDistance: { weight: true, reps: false, time: false, distance: true, weightSign: 'plain' },
};

/**
 * The single source of truth for "which inputs does this exercise need".
 *
 * Never inline this table. Every screen that renders a step asks here, which
 * is what keeps the builder, the logger and the meta line describing the same
 * exercise the same way.
 */
export function fieldsFor(type: ExerciseType): TypeFields {
  return FIELDS[type] ?? FIELDS.weightReps;
}

/**
 * Does this exercise run on a clock?
 *
 * The one question the runner asks. A timed step counts down; everything else
 * is tap-gated — it waits for you to say you are done, exactly as rep-counted
 * steps already did. That mechanism is why a mixed circuit can run hands-free
 * at all without inventing a duration for a bench press.
 */
export function isTimed(type: ExerciseType): boolean {
  return fieldsFor(type).time;
}

/**
 * Narrow an unknown string to a type, falling back to weight-and-reps.
 *
 * Lives here rather than in `db/repo.ts`, which is where it started, because
 * the value now arrives from two directions — a database column and a picker
 * route — and two copies of "what counts as a valid type" is one copy too
 * many.
 *
 * The fallback is not a guess so much as the least surprising landing place:
 * weight and reps is what most movements are, and the form makes it one tap to
 * correct. Throwing would take a whole library down over one bad row.
 */
export function asExerciseType(v: unknown): ExerciseType {
  return typeof v === 'string' && (EXERCISE_TYPES as readonly string[]).includes(v)
    ? (v as ExerciseType)
    : 'weightReps';
}

export interface TypeCopy {
  label: string;
  example: string;
  /** The unit chips shown on the picker row, in field order. */
  chips: string[];
}

export const TYPE_COPY: Record<ExerciseType, TypeCopy> = {
  weightReps: {
    label: 'Weight & Reps',
    example: 'Bench Press, Dumbbell Curls',
    chips: ['Reps', 'Kg'],
  },
  bodyweightReps: {
    label: 'Bodyweight Reps',
    example: 'Pullups, Sit ups, Burpees',
    chips: ['Reps'],
  },
  weightedBodyweight: {
    label: 'Weighted Bodyweight',
    example: 'Weighted Pull Ups, Weighted Dips',
    chips: ['Reps', '+Kg'],
  },
  assistedBodyweight: {
    label: 'Assisted Bodyweight',
    example: 'Assisted Pullups, Assisted Dips',
    chips: ['Reps', '-Kg'],
  },
  duration: {
    label: 'Duration',
    example: 'Planks, Yoga, Stretching',
    chips: ['Time'],
  },
  durationWeight: {
    label: 'Duration & Weight',
    example: 'Weighted Plank, Wall Sit',
    chips: ['Kg', 'Time'],
  },
  distanceDuration: {
    label: 'Distance & Duration',
    example: 'Running, Cycling, Rowing',
    chips: ['Time', 'Km'],
  },
  weightDistance: {
    label: 'Weight & Distance',
    example: 'Farmers Walk, Suitcase Carry',
    chips: ['Kg', 'Km'],
  },
};

// ── Equipment ──────────────────────────────────────────────────────────────

/**
 * What the movement is done with.
 *
 * Replaces the shorter list added in v5. `none` supersedes `bodyweight` and
 * `resistanceBand` supersedes `band`; `cord` is here for battle ropes and
 * skipping ropes, which are neither a band nor a machine and were previously
 * landing in `other` alongside everything else nobody had classified.
 *
 * Unlike v5, absent no longer reads as "unstated" for a NEW exercise — the
 * creation form asks for it. It stays optional in the type because every row
 * written before this change genuinely has no answer.
 */
export type Equipment =
  | 'none'
  | 'barbell'
  | 'dumbbell'
  | 'kettlebell'
  | 'machine'
  | 'plate'
  | 'resistanceBand'
  | 'suspensionBand'
  | 'cord'
  | 'other';

/** Order is the order of the picker screen. */
export const EQUIPMENT: readonly Equipment[] = [
  'none',
  'barbell',
  'dumbbell',
  'kettlebell',
  'machine',
  'plate',
  'resistanceBand',
  'suspensionBand',
  'cord',
  'other',
] as const;

/**
 * Narrow an unknown string to a piece of equipment, or to nothing.
 *
 * Unlike `asExerciseType` there is no sensible fallback value, and that is the
 * point: absent means UNSTATED, so an unrecognised string becomes unstated too
 * rather than being rounded to `other`, which would look like an answer.
 */
export function asEquipment(v: unknown): Equipment | undefined {
  return typeof v === 'string' && (EQUIPMENT as readonly string[]).includes(v)
    ? (v as Equipment)
    : undefined;
}

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  none: 'None',
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  kettlebell: 'Kettlebell',
  machine: 'Machine',
  plate: 'Plate',
  resistanceBand: 'Resistance Band',
  suspensionBand: 'Suspension Band',
  cord: 'Cord',
  other: 'Other',
};
