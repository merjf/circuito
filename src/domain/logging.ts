/**
 * Reading a session's set log back — the rules the logger screen runs on.
 *
 * Pure functions over `SetLog[]`, kept out of the screen for the same reason
 * `stats.ts` is: "how many rounds did I finish" is a definition, not a
 * rendering detail, and a definition written inline in a component is one that
 * will be written slightly differently the next time it is needed.
 *
 * The rule that governs all of it: **the plan prescribes, the log observes.**
 * Nothing here writes back to a `Step`.
 */

import type { SetLog, Training } from './types';

/** Logs for one step in one round, in the order they were performed. */
export function logsForSlot(
  logs: SetLog[],
  stepId: string,
  roundIndex: number,
): SetLog[] {
  return logs
    .filter((log) => log.stepId === stepId && log.roundIndex === roundIndex)
    .sort((a, b) => a.setIndex - b.setIndex);
}

/**
 * How many rows one step needs in one round.
 *
 * The plan asks for exactly one set per exercise per round — that is what a
 * circuit IS. Everything above that is either a row the user added or a log
 * that already exists at a higher index, which happens when a set is unticked
 * and the ones after it stay.
 *
 * Rows are rendered densely from 1 to the returned count, so an unticked set 2
 * of 3 leaves an empty row rather than a hole: the `setIndex` a row writes is
 * its position, and positions cannot be sparse if they are also row numbers.
 */
export function rowsNeeded(logs: SetLog[], stepId: string, roundIndex: number, added: number): number {
  const existing = logsForSlot(logs, stepId, roundIndex);
  const highest = existing.reduce((max, log) => Math.max(max, log.setIndex), 0);
  return Math.max(1, highest) + added;
}

/**
 * How many rounds are fully done.
 *
 * A round counts when **every** step in its block has at least one log for it.
 * The loose reading — any log at all — would make a single tick equal a whole
 * round, and every figure downstream of `roundsCompleted` (the summary's
 * "2 / 3", History's meta line, the streak) would inherit the inflation.
 *
 * Deliberately parallel to `roundsCompletedAt` in `queue.ts`, which answers the
 * same question for a timed session by counting cues. Two sources, one
 * definition: a round is done when its last piece of work is.
 */
export function roundsCompletedFrom(training: Training, logs: SetLog[]): number {
  let completed = 0;

  for (const block of training.blocks) {
    if (block.steps.length === 0) continue;
    const rounds = Math.max(1, block.repeat);
    for (let round = 1; round <= rounds; round++) {
      const everyStepLogged = block.steps.every(
        (step) => logsForSlot(logs, step.id, round).length > 0,
      );
      if (everyStepLogged) completed++;
    }
  }

  return completed;
}

/** Whether anything at all was recorded. Guards the empty-finish prompt. */
export function hasAnyLog(logs: SetLog[]): boolean {
  return logs.length > 0;
}

/**
 * The "previous" reference for one slot.
 *
 * `previous` comes from the most recent session that contained this exercise,
 * from ANY training (decision D7). Within that session we want the same round
 * where one exists — comparing round three to round three is the comparison
 * worth making — and the last logged set otherwise, because two trainings do
 * not have to agree about how many rounds they run.
 *
 * `undefined` when the exercise has never been logged. The column is then
 * blank, not zero: a dash would read as "you did none", which is a different
 * and wrong claim.
 */
export function previousFor(
  history: SetLog[] | undefined,
  roundIndex: number,
  setIndex: number,
): SetLog | undefined {
  if (!history || history.length === 0) return undefined;

  const sameRound = history.filter((log) => log.roundIndex === roundIndex);
  if (sameRound.length > 0) {
    // Within the matching round, the matching set — and failing that, that
    // round's last set. If this session runs more sets than the previous one
    // did, the closest reference for the extra is where that round finished,
    // not where it started.
    return sameRound.find((log) => log.setIndex === setIndex) ?? sameRound[sameRound.length - 1];
  }

  // No matching round at all, which happens whenever the two trainings run a
  // different number of them. The set index is NOT consulted here: searching
  // the whole history for `setIndex` would match round one, and reporting
  // round one as the reference for round four is worse than useless — it
  // makes a later round look like a regression against an earlier one.
  // `previousSetLogs` orders by round then set, so the last row is where that
  // session ended.
  return history[history.length - 1];
}

/**
 * How a logged set reads in one line: "3 kg × 12", "× 12", "3 kg", "0:45",
 * "2.5 km 12:30".
 *
 * Every field the log actually carries, in the order the columns run. Which
 * ones are present is decided by the exercise's type — this function does not
 * need to know it, because a field the type does not use was never written.
 *
 * `null` when the log records nothing at all, which the unique index makes
 * possible: a ticked set with every field left blank is a set you did without
 * saying what you did.
 */
export function formatLog(
  log: Pick<SetLog, 'reps' | 'weightKg' | 'weightCount' | 'seconds' | 'distanceKm'>,
): string | null {
  const weight =
    log.weightKg != null
      ? `${Number.isInteger(log.weightKg) ? log.weightKg : log.weightKg.toFixed(1)} kg${
          log.weightCount != null && log.weightCount > 1 ? ` ×${log.weightCount}` : ''
        }`
      : null;
  const reps = log.reps != null ? `× ${log.reps}` : null;
  // Two decimals at most, and no trailing zeros: 5 km, 2.5 km, 0.04 km. A
  // flat `toFixed(2)` would render a five-kilometre run as "5.00 km", which
  // claims a precision the number does not have.
  const distance =
    log.distanceKm != null ? `${Number(log.distanceKm.toFixed(2))} km` : null;
  const time = log.seconds != null ? formatSetClock(log.seconds) : null;

  const parts = [weight, reps, distance, time].filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join('  ');
}

/**
 * `m:ss` for a logged or prescribed set duration, and `h:mm:ss` past the hour.
 *
 * Not `formatDuration` from `duration.ts`: that one renders "1m 30s" for a
 * plan, which is the right register for prose and the wrong one for a column
 * of numbers you are comparing down the page.
 */
export function formatSetClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}
