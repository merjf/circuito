/**
 * The session runner.
 *
 * Timing rule from the handoff, and the single most important thing in the app:
 * NEVER decrement a counter on an interval. Intervals drift, and they stall
 * outright when the app is backgrounded — which is exactly what happens when a
 * phone locks in someone's pocket mid-round. Instead we store the wall-clock
 * moment the current cue started and recompute `remaining` from it on every
 * tick and on every resume. Pausing is modelled as accumulated pause time, so
 * the arithmetic stays a single subtraction.
 *
 *   remaining = cue.seconds - (now - startedAt - accumulatedPause) / 1000
 *
 * `Date.now()` is used deliberately rather than `performance.now()`: it is the
 * only clock that keeps counting correctly across a JS-context suspension, so
 * reconciling on foreground is free. The tradeoff is sensitivity to the user
 * changing the system time mid-session, which is not a real risk here.
 *
 * Ported from Player Prototype.dc.html, which is the behavioural reference.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  buildQueue,
  isGated,
  isRest,
  secondsFrom,
  usesDarkPalette,
  type Cue,
  type ExerciseTypes,
  type QueueDuration,
} from '../domain/queue';
import type { Training } from '../domain/types';
import type { Settings, SoundId } from '../domain/settings';
import {
  scheduledSounds,
  sessionEndSound,
  soundOnEnter,
  soundOnExit,
} from './cues';

/** Pressing previous within this window jumps back; after it, it restarts. */
export const PREVIOUS_RESTART_WINDOW_SECONDS = 2;

/**
 * How often we recompute. 10Hz is smooth for the digits; the background fill is
 * animated separately and does not depend on this. There is no longer a
 * sub-second beep to land on, so this is purely a display cadence.
 */
const TICK_MS = 100;

export interface RunnerState {
  index: number;
  /** Epoch ms at which the current cue began. */
  startedAt: number;
  /** Epoch ms of the pause currently in effect, or null when running. */
  pausedAt: number | null;
  /** Total ms spent paused within the current cue. */
  accumulatedPause: number;
  isPaused: boolean;
  skippedRests: number;
  /**
   * Seconds added to (or taken off) the CURRENT cue by the −15 / +15 controls.
   * Reset to 0 on every move, because it belongs to one cue and not to the
   * session.
   *
   * It has to live in state rather than be folded into `startedAt`, because
   * `goTo` banks `min(elapsed, cue.seconds)` and `totalRemaining` sums the
   * queue's own numbers. Shifting the clock instead would make a lengthened
   * rest bank less time than was actually spent resting, and the summary's
   * work/rest split would quietly stop adding up.
   */
  adjustment: number;
  /** Actual seconds spent, split by kind — feeds the summary (1k). */
  elapsedByKind: { work: number; rest: number };
  /** Epoch ms the whole session began. */
  sessionStartedAt: number;
  finished: boolean;
}

export interface RunnerView {
  queue: Cue[];
  cue: Cue | undefined;
  next: Cue | undefined;
  index: number;
  /** Seconds left on the current cue, or null when it waits for a tap. */
  remaining: number | null;
  /** 0→1 through the current cue. Drives the draining background fill. */
  progress: number;
  /** Left in the whole session. A lower bound once a gated cue is ahead. */
  totalRemaining: QueueDuration;
  phase: 'prepare' | 'work' | 'rest';
  dark: boolean;
  isPaused: boolean;
  finished: boolean;
  skippedRests: number;
  elapsedByKind: { work: number; rest: number };
  sessionStartedAt: number;
  toggle: () => void;
  skip: () => void;
  /** Finish a tap-gated cue. See the note on the implementation. */
  complete: () => void;
  /**
   * Add or remove seconds on the current cue. No-op on a gated one, which has
   * no length to adjust. Never drives `remaining` below zero: taking more off
   * than is left simply ends the cue, which is what the user asked for.
   */
  adjust: (deltaSeconds: number) => void;
  /** True when `adjust` would do something — the controls hide otherwise. */
  canAdjust: boolean;
  previous: () => void;
  jumpTo: (index: number) => void;
  restart: () => void;
}

export interface RunnerCallbacks {
  /**
   * The app's only audio. Fired on entering a work step, entering a rest, and
   * once when the session ends — see `cues.ts`. Silent transitions (into
   * `prepare`) do not call this at all.
   */
  onSound?: (sound: SoundId) => void;
  /** Fired once when the queue runs out, with the final banked state. */
  onFinish?: (state: RunnerState) => void;
}

/**
 * Fold the current remainder into the rest of the queue.
 *
 * A gated cue contributes nothing to the number and everything to the flag: the
 * total is a lower bound from the moment one is anywhere ahead of you.
 */
function addRemaining(remaining: number | null, rest: QueueDuration): QueueDuration {
  return remaining === null
    ? { seconds: rest.seconds, hasUntimed: true }
    : { seconds: remaining + rest.seconds, hasUntimed: rest.hasUntimed };
}

function elapsedSeconds(s: RunnerState, now: number): number {
  const pause = s.accumulatedPause + (s.pausedAt !== null ? now - s.pausedAt : 0);
  return Math.max(0, (now - s.startedAt - pause) / 1000);
}

export function useRunner(
  training: Training,
  exerciseTypes: ExerciseTypes,
  settings: Settings,
  callbacks: RunnerCallbacks = {},
  { autoStart = false }: { autoStart?: boolean } = {},
): RunnerView {
  const queue = useMemo(() => buildQueue(training, exerciseTypes), [training, exerciseTypes]);

  const [state, setState] = useState<RunnerState>(() => {
    const now = Date.now();
    return {
      index: 0,
      startedAt: now,
      pausedAt: autoStart ? null : now,
      accumulatedPause: 0,
      isPaused: !autoStart,
      skippedRests: 0,
      adjustment: 0,
      elapsedByKind: { work: 0, rest: 0 },
      sessionStartedAt: now,
      finished: false,
    };
  });

  // Re-render clock. State the tick drives is derived, not stored.
  const [, forceTick] = useState(0);
  /**
   * Which scheduled sounds have already fired for the cue now showing.
   *
   * A ref rather than state: firing a bell must not cause a render, and the
   * tick already re-renders on its own cadence. Keyed by index so that stepping
   * back into a cue rearms it — the interval genuinely restarted.
   */
  const firedRef = useRef<{ index: number; at: Set<number> }>({ index: -1, at: new Set() });
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;
  // Read through a ref so that changing a sound mid-session does not rebuild
  // `goTo` and reset the interval the whole timer hangs off.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const cue = queue[state.index];

  /** Move to `nextIndex`, banking the time actually spent on the current cue. */
  const goTo = useCallback(
    (nextIndex: number, opts: { countAsSkippedRest?: boolean; keepPaused?: boolean } = {}) => {
      setState((s) => {
        const now = Date.now();
        const current = queue[s.index];
        // A gated cue has no cap to clamp against, so the real time spent IS
        // the time spent. It is the only way the summary can learn how long a
        // set actually took.
        const spent = current
          ? current.seconds === null
            ? elapsedSeconds(s, now)
            : // Clamped against the ADJUSTED length, not the planned one:
              // a rest the user stretched by 15s really did take that long,
              // and clamping to the plan would lose those seconds from the
              // summary's rest total.
              Math.min(elapsedSeconds(s, now), current.seconds + s.adjustment)
          : 0;

        const banked = { ...s.elapsedByKind };
        if (current) {
          if (isRest(current)) banked.rest += spent;
          else banked.work += spent;
        }

        /**
         * ── A CONSTRAINT, BEFORE YOU ADD A FOURTH CALLBACK HERE ─────────────
         * The `onSound` / `onFinish` calls below happen INSIDE a setState
         * updater, which React is entitled to re-invoke: StrictMode
         * double-invokes it in development, and a discarded concurrent render
         * replays it. Nothing in the app enables StrictMode today, and
         * `onFinish` (the player's `save`) is idempotent behind its own
         * `saving` ref — so this is correct by circumstance, not by design.
         *
         * `onSound` is NOT guarded. Turn StrictMode on and every bell in the
         * app fires twice, which reads as an audio bug and gets hunted in
         * `cues.ts` — a long way from the actual cause, which is here.
         *
         * If you need another side effect at a transition, do not add it to
         * this updater. Compute the transition here and fire from an effect
         * keyed on `state.index` / `state.finished`; that is the shape this
         * should eventually become anyway.
         */

        if (nextIndex >= queue.length) {
          const finalState: RunnerState = {
            ...s,
            index: queue.length - 1,
            elapsedByKind: banked,
            isPaused: true,
            pausedAt: now,
            finished: true,
          };
          if (!s.finished) {
            const end = sessionEndSound(settingsRef.current);
            if (end) cbRef.current.onSound?.(end);
            cbRef.current.onFinish?.(finalState);
          }
          return finalState;
        }

        const clamped = Math.max(0, nextIndex);
        // Leaving a work interval is its own event, fired however the cue was
        // left — run out, tapped through, or skipped. See runner/cues.ts.
        if (current) {
          const exit = soundOnExit(current, settingsRef.current);
          if (exit) cbRef.current.onSound?.(exit);
        }
        const next = queue[clamped];
        if (next) {
          const enter = soundOnEnter(next, settingsRef.current);
          if (enter) cbRef.current.onSound?.(enter);
        }

        const keepPaused = opts.keepPaused ?? s.isPaused;
        return {
          ...s,
          index: clamped,
          startedAt: now,
          pausedAt: keepPaused ? now : null,
          accumulatedPause: 0,
          // Belongs to the cue being left, not to the one being entered.
          adjustment: 0,
          isPaused: keepPaused,
          skippedRests:
            opts.countAsSkippedRest && current && isRest(current)
              ? s.skippedRests + 1
              : s.skippedRests,
          elapsedByKind: banked,
        };
      });
    },
    [queue],
  );

  // The tick. Recomputes from the clock; advances when the cue runs out.
  useEffect(() => {
    // A gated cue has no end to reach, so there is nothing to tick towards:
    // it advances only when the user taps Done. Starting an interval for one
    // would burn 10Hz of battery recomputing a number that cannot change.
    if (state.isPaused || state.finished || !cue || isGated(cue)) return;

    // Re-entering a cue rearms its sounds: the interval genuinely restarted.
    if (firedRef.current.index !== state.index) {
      firedRef.current = { index: state.index, at: new Set() };
    }
    // Every scheduled sound on a cue that can be adjusted is anchored to its
    // END (`beforeRoundEnd`, `beforeRestEnd`), so stretching the cue moves
    // them by the same amount. Shifting `atSecond` keeps a "3 seconds before
    // the end" warning meaning exactly that after a +15.
    const schedule = scheduledSounds(cue, settingsRef.current).map((event) =>
      state.adjustment === 0
        ? event
        : { ...event, atSecond: event.atSecond + state.adjustment },
    );

    const id = setInterval(() => {
      const elapsedNow = elapsedSeconds(state, Date.now());
      const left = (cue.seconds ?? 0) + state.adjustment - elapsedNow;

      // Fired from the same clock the timer reads, so a sound can never land on
      // a second the display never showed. A cue passed while backgrounded is
      // deliberately NOT replayed on resume: a burst of bells for a round that
      // already finished is noise, not information.
      for (const event of schedule) {
        if (elapsedNow >= event.atSecond && !firedRef.current.at.has(event.atSecond)) {
          firedRef.current.at.add(event.atSecond);
          cbRef.current.onSound?.(event.sound);
        }
      }

      if (left <= 0) goTo(state.index + 1, { keepPaused: false });
      else forceTick((n) => n + 1);
    }, TICK_MS);

    return () => clearInterval(id);
  }, [state, cue, goTo]);

  const now = Date.now();
  const elapsed = cue ? elapsedSeconds(state, now) : 0;
  /** The current cue's length as it now stands, −15/+15 included. */
  const cueSeconds =
    cue && cue.seconds !== null ? Math.max(0, cue.seconds + state.adjustment) : null;
  // null, not 0: there is no number here, and a zero would render as a timer
  // that has run out rather than one that was never running.
  const remaining = cueSeconds !== null ? Math.max(0, cueSeconds - elapsed) : null;

  const toggle = useCallback(() => {
    setState((s) => {
      const t = Date.now();
      if (s.isPaused) {
        return {
          ...s,
          isPaused: false,
          pausedAt: null,
          accumulatedPause: s.accumulatedPause + (s.pausedAt !== null ? t - s.pausedAt : 0),
        };
      }
      return { ...s, isPaused: true, pausedAt: t };
    });
  }, []);

  const skip = useCallback(
    () => goTo(state.index + 1, { countAsSkippedRest: true }),
    [goTo, state.index],
  );

  /**
   * Finish a tap-gated cue.
   *
   * Today this lands on the same transition as `skip`, because
   * `countAsSkippedRest` only fires on a rest and gated cues are always work.
   * It is a separate function anyway: completing a set you were asked to do is
   * not the same event as skipping past one, and the day gated rests exist the
   * difference stops being cosmetic and starts corrupting the summary.
   */
  const complete = useCallback(() => goTo(state.index + 1), [goTo, state.index]);

  /**
   * Stretch or trim the current cue.
   *
   * Deliberately NOT counted as a skipped rest. `skippedRests` is what the
   * summary reports as "2 rests skipped", and a rest you chose to shorten by
   * 15 seconds is not one you skipped — folding the two together would make
   * that line mean nothing. Only ▶▶ skips.
   *
   * The floor is `-cue.seconds` rather than `-elapsed`: taking off more than
   * remains drives `remaining` to zero, and the tick then advances on its own,
   * which is the behaviour a user pressing −15 near the end is asking for.
   */
  const adjust = useCallback(
    (deltaSeconds: number) => {
      setState((s) => {
        const current = queue[s.index];
        if (!current || current.seconds === null) return s;
        return {
          ...s,
          adjustment: Math.max(-current.seconds, s.adjustment + deltaSeconds),
        };
      });
    },
    [queue],
  );

  /** Restart the current cue, or step back if pressed right after it started. */
  const previous = useCallback(() => {
    const spent = cue ? elapsedSeconds(state, Date.now()) : 0;
    goTo(spent > PREVIOUS_RESTART_WINDOW_SECONDS ? state.index : state.index - 1);
  }, [cue, goTo, state]);

  const jumpTo = useCallback((i: number) => goTo(i, { keepPaused: true }), [goTo]);

  const restart = useCallback(() => {
    const t = Date.now();
    setState({
      index: 0,
      startedAt: t,
      pausedAt: t,
      accumulatedPause: 0,
      isPaused: true,
      skippedRests: 0,
      adjustment: 0,
      elapsedByKind: { work: 0, rest: 0 },
      sessionStartedAt: t,
      finished: false,
    });
  }, []);

  return {
    queue,
    cue,
    next: queue[state.index + 1],
    index: state.index,
    remaining,
    // No draining fill on a gated cue: the background would drain towards an
    // end that does not exist, and a bar creeping to nowhere reads as a stuck
    // app rather than as a prompt.
    progress: cueSeconds ? Math.min(1, elapsed / cueSeconds) : 0,
    totalRemaining: addRemaining(remaining, secondsFrom(queue, state.index + 1)),
    phase: !cue ? 'work' : cue.kind === 'prepare' ? 'prepare' : isRest(cue) ? 'rest' : 'work',
    dark: cue ? usesDarkPalette(cue) : true,
    isPaused: state.isPaused,
    finished: state.finished,
    skippedRests: state.skippedRests,
    elapsedByKind: state.elapsedByKind,
    sessionStartedAt: state.sessionStartedAt,
    toggle,
    skip,
    complete,
    adjust,
    canAdjust: cue != null && cue.seconds !== null && !state.finished,
    previous,
    jumpTo,
    restart,
  };
}
