/**
 * Keeps the ongoing session notification (§3.9, `sessionNotification.ts`) in
 * sync with the player screen.
 *
 * Re-shown on every actual change to `title`/`body` — which, because both are
 * computed from `runner.cue` and `runner.isPaused` rather than from the 10Hz
 * tick, only happens on a real cue transition or a pause/resume, never once
 * a second. That is what keeps this from fighting Android's notification
 * update throttling, and from claiming a live countdown this feature does
 * not actually provide (see the note in `sessionNotification.ts`).
 *
 * Permission is requested at most once per mount, the first time `active`
 * is true, and the answer is remembered in a ref for the rest of the
 * session — a "no" must not turn into a repeated prompt every time the
 * circuit moves to the next round.
 */

import { useEffect, useRef } from 'react';

import {
  dismissSessionNotification,
  ensureNotificationPermission,
  showSessionNotification,
} from './sessionNotification';

export function useSessionNotification(args: {
  /** False once the session is finished — or before it has really begun. */
  active: boolean;
  title: string;
  body: string;
}): void {
  const { active, title, body } = args;
  const permitted = useRef<boolean | null>(null);

  useEffect(() => {
    if (!active) {
      void dismissSessionNotification();
      return;
    }
    let cancelled = false;
    (async () => {
      if (permitted.current === null) {
        permitted.current = await ensureNotificationPermission();
      }
      if (cancelled || !permitted.current) return;
      await showSessionNotification({ title, body });
    })();
    return () => {
      cancelled = true;
    };
  }, [active, title, body]);

  // Belt and braces: leaving the screen at all — finished, abandoned, or the
  // app killed the component for an unrelated reason — must never leave a
  // stale "Round 2 of 3" sitting in the tray after the workout is over.
  useEffect(() => {
    return () => {
      void dismissSessionNotification();
    };
  }, []);
}
