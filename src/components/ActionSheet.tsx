/**
 * A bottom sheet of actions — the overflow (`⋯`) menu behind a list row.
 *
 * `ConfirmDialog` deliberately refuses this job: its own header says it "does
 * one thing: ask a question and offer up to two answers", and that anything
 * more complex belongs in a sheet. This is that sheet. It exists so that
 * destructive controls can come off the surface of every row in a scrolling
 * list — a bin on each of six training cards is six live delete targets under
 * a scrolling thumb.
 *
 * IMPORTANT — sheets and dialogs do not stack. An action that needs to confirm
 * must close this sheet FIRST and open the dialog after, never both at once:
 * two `Modal`s presented simultaneously is unreliable on iOS. `onSelect` is
 * therefore fired *after* the sheet has dismissed itself, so a caller can wire
 * `onPress: () => setConfirmingDelete(true)` without thinking about it.
 */

import { InteractionManager, Modal, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/ui';
import { color, radius, space } from '@/theme/tokens';
import { type as t } from '@/theme/type';

export interface SheetAction {
  label: string;
  onPress: () => void;
  /** Soft-red treatment, and always sorted to the bottom of the list. */
  destructive?: boolean;
  /** Greyed and inert — e.g. Start on a training with nothing in it. */
  disabled?: boolean;
  /** Optional second line, for saying why a row is disabled. */
  hint?: string;
}

export function ActionSheet({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        {/* Swallows taps so pressing the sheet itself does not dismiss it. */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          {title != null && (
            <Text style={[t.monoLabel, styles.title]} numberOfLines={1}>
              {title}
            </Text>
          )}

          {actions.map((action, i) => (
            <AnimatedPressable
              key={action.label}
              disabled={action.disabled}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              haptic={action.destructive}
              toOpacity={0.5}
              onPress={() => {
                // Dismiss first, then act — see the note at the top of the
                // file. Both calls in the same handler would batch into one
                // commit, so a Delete that opens a ConfirmDialog would still
                // be unmounting this Modal while mounting that one.
                // `runAfterInteractions` puts the action on the far side of
                // the dismissal animation, which is the whole point.
                onClose();
                InteractionManager.runAfterInteractions(action.onPress);
              }}
              style={[
                styles.row,
                i > 0 && styles.rowDivider,
                action.disabled && { opacity: 0.35 },
              ]}
            >
              <Text
                style={[
                  t.exerciseRow,
                  styles.label,
                  action.destructive && { color: color.softRedIcon },
                ]}
              >
                {action.label}
              </Text>
              {action.hint != null && (
                <Text style={[t.monoValue, styles.hint]}>{action.hint}</Text>
              )}
            </AnimatedPressable>
          ))}

          <AnimatedPressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            haptic={false}
            toOpacity={0.5}
            style={[styles.row, styles.cancel, { marginBottom: insets.bottom }]}
          >
            <Text style={[t.exerciseRow, styles.label, { color: color.inkMuted }]}>Cancel</Text>
          </AnimatedPressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(20,20,22,0.42)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderTopWidth: 1,
    borderColor: color.hairline,
    paddingHorizontal: space.gutter,
    paddingTop: space.l,
  },
  title: {
    color: color.inkGhost,
    marginBottom: space.xs,
  },
  row: {
    minHeight: 54,
    justifyContent: 'center',
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: color.divider },
  label: { color: color.ink, fontSize: 15 },
  hint: { color: color.inkGhost, marginTop: 3 },
  cancel: {
    marginTop: space.xs,
    borderTopWidth: 1,
    borderTopColor: color.hairlineStrong,
  },
});
