/**
 * The shared "tap a value, get a bottom sheet with a big stepper" pattern —
 * the design `StepEditSheet`'s rows already used for Time/Rest/Reps/Weight,
 * generalized to a single value so every OTHER inline −/+ in the app
 * (`Stepper`'s Prepare/repeat/round-rest rows, `MiniStepper`'s Time/Rest/
 * Reps/Km fields, the exercise Weights fields) can open the same shape
 * instead of stepping in place.
 *
 * One sheet instance, reused everywhere: the caller passes the field's own
 * label/value/step/min/max/format/onChange (exactly what `Stepper` and
 * `MiniStepper` already took), and this owns nothing but presentation —
 * `onChange` still writes straight back into the caller's draft, same as
 * before, so there is no new intermediate state to keep in sync.
 */

import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, runOnJS } from 'react-native-reanimated';

import { color, elevation, motion, radius, space } from '@/theme/tokens';
import { type as t } from '@/theme/type';
import { PrimaryButton, Stepper } from './ui';

export interface ValueEditContext {
  label: string;
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
  format?: (v: number) => string;
  hint?: string;
}

export function ValueEditSheet({
  context,
  onClose,
}: {
  context: ValueEditContext | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  // PLAN_ui_polish.md §8 — `animationType="slide"` replaced with
  // Short FadeIn/FadeOut transitions (Reanimated).
  //
  // This component is driven by `context` going straight to `null`, not by a
  // `visible` boolean — the instant that happens the caller has nothing left
  // to render at all, so `lastContext` holds on to the most recent non-null
  // value purely so there is still something to show WHILE the exit
  // animation plays; it is never read once `context` is non-null again.
  //
  // Same "conditional child + exit-callback keeps the Modal mounted" shape as
  // `ConfirmDialog`/`ActionSheet`: `exiting` only fires on a node actually
  // removed while an ancestor survives, so the sheet is rendered on
  // `context != null` directly, and `rendered` (flipped by `handleExitDone`)
  // is what keeps the `Modal` itself up for the length of `motion.sheetOut`.
  const [lastContext, setLastContext] = useState(context);
  const [rendered, setRendered] = useState(context != null);

  useEffect(() => {
    if (context != null) {
      setLastContext(context);
      setRendered(true);
    }
  }, [context]);

  const handleExitDone = useCallback((finished?: boolean) => {
    'worklet';
    if (finished === false) return;
    runOnJS(setRendered)(false);
  }, []);

  if (!rendered || !lastContext) return null;
  const shown = context ?? lastContext;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      {context != null && (
        <Animated.View
          style={StyleSheet.absoluteFill}
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(motion.sheetOut.duration).withCallback(handleExitDone)}
        >
          <Pressable style={styles.scrim} onPress={onClose} />
        </Animated.View>
      )}
      {context != null && (
        <Animated.View
          entering={FadeIn.duration(motion.sheetIn.duration)}
          exiting={FadeOut.duration(motion.sheetOut.duration)}
          style={styles.sheetWrap}
        >
          <View style={[styles.sheet, { paddingBottom: insets.bottom + space.l }]}>
            <View style={styles.grabber} />

            <Text style={[t.cardTitle, { color: color.ink, fontSize: 15 }]}>{shown.label}</Text>
            {shown.hint && (
              <Text style={[t.body, { color: color.inkFaint, fontSize: 11.5, marginTop: 4 }]}>{shown.hint}</Text>
            )}

            <View style={styles.stepperRow}>
              <Stepper
                large
                value={shown.value}
                step={shown.step}
                min={shown.min}
                max={shown.max}
                format={shown.format}
                onChange={shown.onChange}
              />
            </View>

            <PrimaryButton label="Done" style={styles.done} onPress={onClose} />
          </View>
        </Animated.View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(20,20,22,0.28)' },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.gutter,
    paddingTop: 10,
    ...elevation.e4,
  },
  grabber: {
    width: 34,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.track,
    alignSelf: 'center',
    marginBottom: space.l,
  },
  stepperRow: {
    marginTop: space.xl,
    alignItems: 'center',
  },
  done: { marginTop: space.xl, height: 46, marginBottom: space.xl },
});
