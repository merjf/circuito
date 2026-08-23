/**
 * Personal records, derived from the set log.
 *
 * Pure functions over `SetLog[]`, computed on read like everything else in
 * `stats.ts` — nothing is cached and no "best ever" is stored on a row. A
 * stale record is worse than a recomputed one, and unticking a set has to be
 * able to take a record away again, which a stored high-water mark could not
 * do without a second mechanism to walk it back.
 *
 * ── WHAT A RECORD MEANS HERE ───────────────────────────────────────────────
 * Circuito's weights are `weightKg` plus `weightCount`, and "2 × 3 kg" is a
 * PAIR of 3 kg weights rather than one 6 kg weight (see `domain/weight.ts`).
 * That distinction decides two definitions below:
 *
 *  - **Heaviest** is `weightKg` — the weight in one hand. That is the number
 *    you say out loud, and the number you go shopping for. Summing the pair
 *    would make a 2 × 3 kg set outrank a single 5 kg one, which is not how
 *    anybody reads it.
 *  - **Volume** is `weightKg × weightCount × reps` — total work done, where
 *    both hands genuinely count.
 *
 * ── WHAT IS DELIBERATELY ABSENT ────────────────────────────────────────────
 * No "strength level" ranking, no comparison against other people. Circuito is
 * local-first and single-user; a percentile against a population it does not
 * have would be an invention.
 */

import type { SetLog } from './types';

/** A logged set that actually carries a load. */
function isWeighted(log: SetLog): log is SetLog & { weightKg: number } {
  return log.weightKg != null && log.weightKg > 0;
}

/**
 * Warm-ups are excluded from every record.
 *
 * A warm-up is by definition not an attempt at your best, and letting one set
 * a "best volume" would make the record meaningless the first time somebody
 * did fifteen easy reps to loosen up. Failure and drop sets DO count — they
 * are real work, done at real load.
 */
function counts(log: SetLog): boolean {
  return log.type !== 'warmup';
}

/** Total work in one set: both hands, every rep. */
export function setVolume(log: SetLog): number {
  if (!isWeighted(log) || log.reps == null) return 0;
  return log.weightKg * (log.weightCount ?? 1) * log.reps;
}

/**
 * Estimated one-rep max, Epley.
 *
 * `null` above 12 reps, and that is not a rounding decision — the formula is
 * fitted to low-rep sets and its error grows fast past about ten. A confident
 * number derived from a set of thirty would be exactly the kind of invented
 * figure the rest of this app refuses to print.
 *
 * Every caller must label the result as ESTIMATED. It is arithmetic on one
 * set, not something that was lifted.
 */
export function estimatedOneRepMax(log: SetLog): number | null {
  if (!isWeighted(log) || log.reps == null || log.reps < 1) return null;
  if (log.reps === 1) return log.weightKg;
  if (log.reps > 12) return null;
  return log.weightKg * (1 + log.reps / 30);
}

export interface ExerciseRecords {
  /** Heaviest single weight (per hand), and the set that did it. */
  heaviest: SetLog | null;
  /** Most work in one set. */
  bestSet: SetLog | null;
  /** Most work in one session, and which. */
  bestSessionVolume: { sessionId: string; volume: number } | null;
  /** Highest estimated 1RM, and the set it was estimated from. */
  bestOneRepMax: { log: SetLog; value: number } | null;
  /** Most reps in a single bodyweight set — the record for an unloaded movement. */
  mostReps: SetLog | null;
  /** Max weight at each rep count, ascending by reps. */
  setRecords: { reps: number; log: SetLog }[];
  /** Sessions this exercise appears in. */
  sessionCount: number;
}

export const EMPTY_RECORDS: ExerciseRecords = {
  heaviest: null,
  bestSet: null,
  bestSessionVolume: null,
  bestOneRepMax: null,
  mostReps: null,
  setRecords: [],
  sessionCount: 0,
};

/**
 * Everything the Records tab shows, in one pass.
 *
 * One function rather than six exported ones because the screen wants them
 * together and computing them separately would walk the same list six times
 * for no gain in clarity.
 */
export function recordsFor(logs: SetLog[]): ExerciseRecords {
  const scored = logs.filter(counts);
  if (scored.length === 0) return { ...EMPTY_RECORDS, sessionCount: 0 };

  let heaviest: SetLog | null = null;
  let bestSet: SetLog | null = null;
  let bestSetVolume = 0;
  let bestOneRepMax: { log: SetLog; value: number } | null = null;
  let mostReps: SetLog | null = null;
  const perSession = new Map<string, number>();
  const perReps = new Map<number, SetLog>();

  for (const log of scored) {
    if (isWeighted(log)) {
      // Ties broken by reps: 5 kg × 10 is a better set than 5 kg × 6, and
      // reporting the earlier one as "heaviest" would show a worse set.
      if (
        heaviest == null ||
        log.weightKg > heaviest.weightKg! ||
        (log.weightKg === heaviest.weightKg && (log.reps ?? 0) > (heaviest.reps ?? 0))
      ) {
        heaviest = log;
      }

      const estimate = estimatedOneRepMax(log);
      if (estimate != null && (bestOneRepMax == null || estimate > bestOneRepMax.value)) {
        bestOneRepMax = { log, value: estimate };
      }

      if (log.reps != null && log.reps > 0) {
        const existing = perReps.get(log.reps);
        if (existing == null || log.weightKg > (existing.weightKg ?? 0)) {
          perReps.set(log.reps, log);
        }
      }
    } else if (log.reps != null && log.reps > 0) {
      // Only unloaded sets compete on rep count. Mixing them with weighted
      // ones would let a light set beat a heavy one on a scoreboard that says
      // nothing about load.
      if (mostReps == null || log.reps > (mostReps.reps ?? 0)) mostReps = log;
    }

    const volume = setVolume(log);
    if (volume > bestSetVolume) {
      bestSetVolume = volume;
      bestSet = log;
    }
    perSession.set(log.sessionId, (perSession.get(log.sessionId) ?? 0) + volume);
  }

  let bestSessionVolume: { sessionId: string; volume: number } | null = null;
  for (const [sessionId, volume] of perSession) {
    if (volume > 0 && (bestSessionVolume == null || volume > bestSessionVolume.volume)) {
      bestSessionVolume = { sessionId, volume };
    }
  }

  return {
    heaviest,
    bestSet,
    bestSessionVolume,
    bestOneRepMax,
    mostReps,
    setRecords: [...perReps.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([reps, log]) => ({ reps, log })),
    sessionCount: new Set(scored.map((l) => l.sessionId)).size,
  };
}

/** What a freshly logged set just beat. */
export type RecordKind = 'heaviest' | 'volume' | 'reps';

export interface BrokenRecord {
  kind: RecordKind;
  /** Ready to show: "Heaviest set", "Best set volume", "Most reps". */
  label: string;
}

const RECORD_LABELS: Record<RecordKind, string> = {
  heaviest: 'Heaviest set',
  volume: 'Best set volume',
  reps: 'Most reps',
};

/**
 * Which records a new set breaks, given everything logged BEFORE it.
 *
 * `history` must exclude the set being tested and, in practice, the whole
 * current session — comparing a set against itself finds no record, and
 * comparing it against its own session's earlier sets would fire a PR on the
 * second set of a first-ever workout, which is noise rather than news.
 *
 * The first time an exercise is ever logged sets no records at all, for the
 * same reason: everything is a personal best when there is nothing to beat,
 * and a screen that says so three times is a screen you learn to ignore.
 */
export function recordsBrokenBy(log: SetLog, history: SetLog[]): BrokenRecord[] {
  if (!counts(log)) return [];
  const previous = recordsFor(history);
  if (previous.sessionCount === 0) return [];

  const broken: RecordKind[] = [];

  if (isWeighted(log) && (previous.heaviest?.weightKg ?? 0) < log.weightKg) {
    broken.push('heaviest');
  }

  const volume = setVolume(log);
  const previousBest = previous.bestSet ? setVolume(previous.bestSet) : 0;
  if (volume > 0 && volume > previousBest) broken.push('volume');

  if (
    !isWeighted(log) &&
    log.reps != null &&
    log.reps > (previous.mostReps?.reps ?? 0)
  ) {
    broken.push('reps');
  }

  return broken.map((kind) => ({ kind, label: RECORD_LABELS[kind] }));
}
