/**
 * Guards the Android hardware/gesture back button during an active session.
 *
 * `app/_layout.tsx` already disables the iOS swipe-back gesture on both
 * `player/[trainingId]` and `reps/[trainingId]` (`gestureEnabled: false`),
 * specifically so that leaving mid-session always goes through the
 * discard/save prompt. That covers iOS and any in-app "back" button, which
 * both screens already route through `setLeaving(true)`.
 *
 * It does NOT cover Android's hardware back button or 3-button/gesture-nav
 * back — those fire through the OS `BackHandler` event, one level below
 * React Navigation's own gesture layer, and `gestureEnabled` has no effect
 * on it. Nothing in the app was listening for it, so on Android the back
 * button popped the screen directly: no prompt, and — worse — the session
 * could unmount without `save`/`savePartial`/`finalise` ever running.
 *
 * `when` gates the guard so it does nothing before a session has started or
 * after the screen has already decided to leave (e.g. mid-navigation from
 * the dialog's own buttons, where a second back press should behave
 * normally rather than fighting the exit). `onBlocked` is called instead of
 * letting the pop through — normally `() => setLeaving(true)`, the same
 * handler the header's back arrow already uses.
 */
import { useEffect } from 'react';
import { BackHandler } from 'react-native';

export function useConfirmedBack(when: boolean, onBlocked: () => void): void {
  useEffect(() => {
    if (!when) return;

    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBlocked();
      // `true` marks the event handled — stops the default pop/exit.
      return true;
    });

    return () => sub.remove();
  }, [when, onBlocked]);
}
