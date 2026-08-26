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

import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, radius, shadow, space } from '@/theme/tokens';
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
  if (!context) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.l }]}>
        <View style={styles.grabber} />

        <Text style={[t.cardTitle, { color: color.ink, fontSize: 15 }]}>{context.label}</Text>
        {context.hint && (
          <Text style={[t.body, { color: color.inkFaint, fontSize: 11.5, marginTop: 4 }]}>
            {context.hint}
          </Text>
        )}

        <View style={styles.stepperRow}>
          <Stepper
            large
            value={context.value}
            step={context.step}
            min={context.min}
            max={context.max}
            format={context.format}
            onChange={context.onChange}
          />
        </View>

        <PrimaryButton label="Done" style={styles.done} onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(20,20,22,0.28)' },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.gutter,
    paddingTop: 10,
    ...shadow.sheet,
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
