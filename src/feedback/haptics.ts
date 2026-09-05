/**
 * The single entry point for haptic feedback in this app. Nothing else
 * should import `expo-haptics` directly — see PLAN_ui_polish.md §4.1.
 *
 * A semantic scale rather than raw impact styles, so a call site says what
 * *kind* of thing just happened ('confirm', 'success', 'error') rather than
 * how hard to buzz. That's also what keeps a destructive action feeling
 * different from an ordinary tap without every call site having to agree on
 * which raw `ImpactFeedbackStyle` means what.
 */

import * as Haptics from 'expo-haptics';
import { runOnJS } from 'react-native-reanimated';

export type Haptic =
  | 'none'
  | 'tap' // Impact Light — ordinary buttons, cards, rows
  | 'select' // Selection — pills, swatches, radio rows, slot crossings
  | 'pickup' // Impact Medium — drag activation
  | 'confirm' // Impact Medium — destructive CTAs, Start, irreversible taps
  | 'success' // Notification Success — saved, logged, personal record
  | 'warning' // Notification Warning — validation blocked, save disabled
  | 'error'; // Notification Error — "Couldn't save", failed operation

/** Fast double-taps, or a gesture that fires press-in twice, must not stack
 *  two impacts into one buzz. */
const THROTTLE_MS = 40;
let lastFireAt = 0;

function fire(kind: Haptic): void {
  if (kind === 'none') return;

  const now = Date.now();
  if (now - lastFireAt < THROTTLE_MS) return;
  lastFireAt = now;

  // Guarded with try/catch, not just `.catch()` on the promise: if the
  // native module itself failed to link into this build, the call throws
  // SYNCHRONOUSLY before it ever returns a promise to attach `.catch` to.
  // An uncaught throw here, if this runs inside a Pressable's onPressIn
  // handler ahead of onPress, can on Hermes/release builds abort the rest
  // of the gesture — indistinguishable from "the button does nothing"
  // (PLAN_bugfix_round2.md item 1–3). This guard is what stops that from
  // ever being re-introduced at a new call site — it lives here once.
  try {
    switch (kind) {
      case 'tap':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)?.catch(() => {});
        break;
      case 'select':
        Haptics.selectionAsync()?.catch(() => {});
        break;
      case 'pickup':
      case 'confirm':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)?.catch(() => {});
        break;
      case 'success':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)?.catch(() => {});
        break;
      case 'warning':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)?.catch(() => {});
        break;
      case 'error':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)?.catch(() => {});
        break;
    }
  } catch {
    // Haptics unavailable on this build/device — caller must still proceed.
  }
}

/** Call from ordinary JS: event handlers, effects, `onPress`. */
export function haptic(kind: Haptic): void {
  fire(kind);
}

/**
 * Call from inside a Reanimated worklet (e.g. the drag gesture's `onUpdate`
 * when the drop slot changes). `expo-haptics` is a bridge module, not a
 * worklet-safe one — calling it directly on the UI thread doesn't work — so
 * this hops back to JS via `runOnJS` internally. Marked `'worklet'` so
 * Reanimated accepts it as a worklet-callable function at the call site
 * without an extra `runOnJS(...)` wrapper there.
 */
export function hapticFromWorklet(kind: Haptic): void {
  'worklet';
  runOnJS(fire)(kind);
}
