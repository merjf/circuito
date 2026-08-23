/**
 * Audio cues.
 *
 * REPLACES the transition-based model (2026-08-15, three fixed sounds) with the
 * six configurable events the Settings tab exposes. The shape of the problem
 * changed, not just the count: sounds now fire *inside* a cue at offsets, not
 * only when the runner crosses from one cue to the next.
 *
 * The events split into three kinds, and keeping them apart is what makes the
 * tap-gated case fall out for free rather than needing a special path:
 *
 *   on enter     roundStart — the moment a work interval begins
 *   scheduled    beforeRoundEnd, beforeRestEnd, innerRoundAlert — at an offset
 *   on exit      roundEnd — when a work interval is left, however that happens
 *
 * `roundEnd` is deliberately NOT scheduled at `seconds`, even though for a
 * timed cue that is exactly when it lands. Scheduling it would mean a gated cue
 * needs a second mechanism for the same sound, and any cue left early by a skip
 * would need the scheduler unwound. Firing it on exit is one rule that covers
 * timed, gated and skipped alike.
 *
 * `prepare` remains silent — it is the get-ready, and the round-start sound at
 * its end is what starts the session. That means the start bell always means
 * "move now".
 *
 * Three things from the handoff are still deliberately NOT built: the 3-2-1
 * countdown beep, the mixable audio session, and the mute toggle. The device's
 * silent switch and volume keys are the controls, and every event can be set to
 * `'none'` individually, which is a better mute than one global switch.
 */

import { isRest, type Cue } from '../domain/queue';
import type { Settings, SoundEvent, SoundId } from '../domain/settings';

export interface ScheduledSound {
  /** Seconds from the start of the cue. */
  atSecond: number;
  event: SoundEvent;
  sound: SoundId;
}

/**
 * Closest two sounds may land without being merged.
 *
 * A second is a long time in audio. Two cues less than that apart read as one
 * muddled noise rather than two signals, and the user cannot act on either.
 * When events fall inside this window the less important one is dropped, never
 * shifted — moving a warning away from the moment it warns about would make it
 * lie.
 */
export const MIN_GAP_SECONDS = 1;

/**
 * Which event wins when two land within `MIN_GAP_SECONDS`. Higher survives.
 *
 * The ordering is by how much the user loses if it goes missing. A missed
 * `roundStart` means starting late; a missed halfway alert means nothing much,
 * which is why it is bottom.
 */
const PRIORITY: Record<SoundEvent, number> = {
  roundStart: 100,
  roundEnd: 90,
  beforeRoundEnd: 80,
  beforeRestEnd: 80,
  sessionEnd: 70,
  innerRoundAlert: 10,
};

/** `'none'` is a choice, not an absence — it resolves to no sound at all. */
function chosen(settings: Settings, event: SoundEvent): SoundId | null {
  const choice = settings.sounds[event];
  return choice === 'none' ? null : choice;
}

/** The sound when the runner enters `cue`, if any. */
export function soundOnEnter(cue: Cue, settings: Settings): SoundId | null {
  if (cue.kind !== 'work') return null;
  return chosen(settings, 'roundStart');
}

/**
 * The sound when the runner leaves `cue`, if any.
 *
 * Fires whether the cue ran out, was tapped through, or was skipped. That is
 * intentional: the sound marks "this interval is over", and from the user's
 * side it is over in all three cases.
 */
export function soundOnExit(cue: Cue, settings: Settings): SoundId | null {
  if (cue.kind !== 'work') return null;
  return chosen(settings, 'roundEnd');
}

export function sessionEndSound(settings: Settings): SoundId | null {
  return chosen(settings, 'sessionEnd');
}

/**
 * Sounds that fire at an offset within `cue`.
 *
 * Returns `[]` for a tap-gated cue: both scheduled events are predictions about
 * when an interval ends, and a gated cue has no known end to predict. Also `[]`
 * for `prepare`, which is silent by design.
 *
 * Guarantees, all pinned by tests:
 *  - every `atSecond` is strictly inside `(0, seconds)`
 *  - results are sorted by `atSecond`
 *  - no two results fall within `MIN_GAP_SECONDS` of each other, of the start,
 *    or of the end
 */
export function scheduledSounds(cue: Cue, settings: Settings): ScheduledSound[] {
  const total = cue.seconds;
  if (total === null || cue.kind === 'prepare') return [];

  const candidates: ScheduledSound[] = [];

  if (cue.kind === 'work') {
    const lead = settings.leadSeconds.beforeRoundEnd;
    const sound = chosen(settings, 'beforeRoundEnd');
    // A zero lead would land exactly on the exit sound. Two sounds at one
    // instant is a muddle, and `roundEnd` already marks that moment.
    if (sound && lead > 0) {
      candidates.push({ atSecond: total - lead, event: 'beforeRoundEnd', sound });
    }

    const alert = chosen(settings, 'innerRoundAlert');
    if (alert) {
      candidates.push({ atSecond: total / 2, event: 'innerRoundAlert', sound: alert });
    }
  }

  if (isRest(cue)) {
    const lead = settings.leadSeconds.beforeRestEnd;
    const sound = chosen(settings, 'beforeRestEnd');
    if (sound && lead > 0) {
      candidates.push({ atSecond: total - lead, event: 'beforeRestEnd', sound });
    }
  }

  return resolve(candidates, total);
}

/**
 * Drop anything too close to the edges or to a more important neighbour.
 *
 * Written as a filter over candidates rather than as conditions at each push
 * site because the interesting failures are all *interactions* — a lead time
 * longer than the interval, a halfway point that coincides with the warning on
 * a 6-second round with a 3-second lead — and those are invisible when each
 * event is guarded in isolation.
 */
function resolve(candidates: ScheduledSound[], total: number): ScheduledSound[] {
  const inBounds = candidates.filter(
    (c) => c.atSecond >= MIN_GAP_SECONDS && total - c.atSecond >= MIN_GAP_SECONDS,
  );

  // Most important first, so the survivor of any collision is the one kept.
  const byPriority = [...inBounds].sort(
    (a, b) => PRIORITY[b.event] - PRIORITY[a.event] || a.atSecond - b.atSecond,
  );

  const kept: ScheduledSound[] = [];
  for (const candidate of byPriority) {
    const clashes = kept.some((k) => Math.abs(k.atSecond - candidate.atSecond) < MIN_GAP_SECONDS);
    if (!clashes) kept.push(candidate);
  }

  return kept.sort((a, b) => a.atSecond - b.atSecond);
}

/**
 * Every sound a cue produces, as one list — enter at 0, the scheduled ones, and
 * exit at the end when the end is known.
 *
 * This is a *description*, not what the runner drives from: the runner uses
 * `soundOnEnter` / `scheduledSounds` / `soundOnExit` directly, because it must
 * fire the exit sound on a skip or a tap, neither of which has an offset. This
 * function exists so that a whole cue's audio can be reasoned about and
 * asserted on in one piece.
 */
export function soundEventsForCue(cue: Cue, settings: Settings): ScheduledSound[] {
  const events: ScheduledSound[] = [];

  const enter = soundOnEnter(cue, settings);
  if (enter) events.push({ atSecond: 0, event: 'roundStart', sound: enter });

  events.push(...scheduledSounds(cue, settings));

  const exit = soundOnExit(cue, settings);
  if (exit && cue.seconds !== null) {
    events.push({ atSecond: cue.seconds, event: 'roundEnd', sound: exit });
  }

  return events;
}
