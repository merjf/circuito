/**
 * The logger's rest timer.
 *
 * A small sibling of `useRunner`, not a reuse of it: the runner owns a whole
 * queue and an index into it, and a rest between two logged sets is one number
 * counting down with nothing after it. Bending the runner to that shape would
 * mean a queue of one cue and a finish callback that means "dismiss a sheet".
 *
 * What IS shared is the rule that matters, taken verbatim from the runner:
 * NEVER decrement a counter on an interval. Intervals drift, and they stall
 * outright when the app is backgrounded — which is exactly what a phone does
 * while it sits on the bench between sets. The end time is a wall-clock moment
 * and `remaining` is recomputed from it, so a rest that elapsed while the
 * screen was off is simply over when you look again.
 *
 * Sounds go through the same `Settings` the player uses, so the choices in the
 * Settings tab apply here without a second configuration surface.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { Settings, SoundId } from '../domain/settings';

/** Matches the player's −15 / +15. One thumb, mid-workout. */
export const REST_ADJUST_SECONDS = 15;

/** 4Hz. The display shows whole seconds; ten ticks a second buys nothing. */
const TICK_MS = 250;

export interface RestTimer {
  /** Seconds left, or null when no rest is running. */
  remaining: number | null;
  /** The rest's full length as it now stands, adjustments included. */
  total: number;
  running: boolean;
  start: (seconds: number) => void;
  adjust: (deltaSeconds: number) => void;
  stop: () => void;
}

export function useRestTimer(
  settings: Settings,
  onSound?: (sound: SoundId) => void,
): RestTimer {
  /** Epoch ms the rest is due to end, or null when nothing is running. */
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [, forceTick] = useState(0);

  // Refs so that changing a sound mid-rest does not restart the interval the
  // countdown hangs off — the same reasoning as `useRunner`'s settingsRef.
  const soundRef = useRef(onSound);
  soundRef.current = onSound;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  /** Guards the one-shot warning so it fires once per rest, not once per tick. */
  const warnedRef = useRef(false);

  const stop = useCallback(() => {
    setEndsAt(null);
    setTotal(0);
    warnedRef.current = false;
  }, []);

  const start = useCallback(
    (seconds: number) => {
      // Zero means "no rest here", not "a rest of no length". A sheet that
      // appears and immediately dismisses itself is worse than no sheet.
      if (seconds <= 0) {
        stop();
        return;
      }
      warnedRef.current = false;
      setTotal(seconds);
      setEndsAt(Date.now() + seconds * 1000);
    },
    [stop],
  );

  const adjust = useCallback((deltaSeconds: number) => {
    setEndsAt((current) => (current === null ? current : current + deltaSeconds * 1000));
    setTotal((current) => Math.max(0, current + deltaSeconds));
    // Stretching the rest moves the end, so the warning about that end has
    // not happened yet — whatever already played was about a different moment.
    warnedRef.current = false;
  }, []);

  useEffect(() => {
    if (endsAt === null) return;

    const id = setInterval(() => {
      const left = (endsAt - Date.now()) / 1000;
      const lead = settingsRef.current.leadSeconds.beforeRestEnd;
      const warningSound = settingsRef.current.sounds.beforeRestEnd;
      const endSound = settingsRef.current.sounds.roundStart;

      if (!warnedRef.current && left <= lead && left > 0) {
        warnedRef.current = true;
        if (warningSound !== 'none') soundRef.current?.(warningSound);
      }

      if (left <= 0) {
        // The rest ending IS the next set starting, so it uses the round-start
        // sound rather than one of its own. One fewer setting, and the bell
        // already means "move now" everywhere else in the app.
        if (endSound !== 'none') soundRef.current?.(endSound);
        setEndsAt(null);
        setTotal(0);
        warnedRef.current = false;
        return;
      }

      forceTick((n) => n + 1);
    }, TICK_MS);

    return () => clearInterval(id);
  }, [endsAt]);

  return {
    remaining: endsAt === null ? null : Math.max(0, (endsAt - Date.now()) / 1000),
    total,
    running: endsAt !== null,
    start,
    adjust,
    stop,
  };
}
