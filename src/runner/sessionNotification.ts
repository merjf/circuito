/**
 * The ongoing session notification (§3.9 of `PLAN_hevy_integration.md`).
 *
 * Deliberately NOT a Live Activity — that is the deferred half of §3.9, and
 * needs a second native target the app does not have. This is a plain local
 * notification, re-scheduled under one fixed identifier so every update
 * REPLACES the last rather than stacking a new one, showing what the player
 * screen is already showing: phase, exercise, and how much was left at the
 * moment of the last cue transition. It does not tick every second — Android
 * throttles rapid notification updates, and a countdown that visibly stutters
 * would read as more broken than one that simply doesn't try. Callers
 * re-show it on `runner.index` changes and on pause/resume, which is the
 * cadence the player screen itself changes at.
 *
 * Android alone gets a genuinely `sticky` (un-swipeable-away) notification —
 * that is `content.sticky`, Android's own name for it, wired through a LOW
 * importance channel so updating it is silent. iOS has no ongoing-notification
 * primitive for a LOCAL notification; there this still re-presents on every
 * cue transition (same cadence, not spammy), it just cannot stay pinned the
 * way Android's foreground-style notification does. That gap is exactly what
 * a Live Activity would close, which is why the plan lists it separately.
 *
 * Every exported function swallows its own failure. No permission granted,
 * no native module present (Expo Go), a channel call racing app start —
 * none of it may cost the session anything more than a missing notification.
 * Same rule `useCueSounds.ts` follows for sound, applied to notifications.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const SESSION_NOTIFICATION_ID = 'circuito-session';
const CHANNEL_ID = 'session';

let channelReady = false;

async function ensureAndroidChannel(): Promise<void> {
  if (channelReady || Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Active session',
    // LOW: visible in the shade, no sound, no heads-up interruption — this is
    // a status line for a workout already in progress, not an alert.
    importance: Notifications.AndroidImportance.LOW,
    sound: null,
    vibrationPattern: null,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  channelReady = true;
}

/**
 * Ask once. The answer is only ever consulted to decide whether it is worth
 * building a notification — a `false` is a normal, common answer (the user
 * said no, or this build has no native module for it), never an error, so
 * nothing upstream should branch on it beyond "then don't bother".
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

/** Show or update the one session notification. */
export async function showSessionNotification(args: {
  title: string;
  body: string;
}): Promise<void> {
  try {
    await ensureAndroidChannel();
    await Notifications.scheduleNotificationAsync({
      identifier: SESSION_NOTIFICATION_ID,
      content: {
        title: args.title,
        body: args.body,
        sound: false,
        sticky: Platform.OS === 'android',
      },
      // `null` is the immediate trigger on iOS; Android additionally needs the
      // channel named on the trigger itself, not just on the channel record.
      trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
    });
  } catch {
    // The session runs without a notification rather than not at all.
  }
}

/** Clear it — the session ended, or the player screen was left. */
export async function dismissSessionNotification(): Promise<void> {
  try {
    await Notifications.dismissNotificationAsync(SESSION_NOTIFICATION_ID);
  } catch {
    // Nothing to clean up, or nothing to be done about it either way.
  }
}
