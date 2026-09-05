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

import { useCallback, useEffect, useState } from 'react';
import { InteractionManager, Modal, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, runOnJS } from 'react-native-reanimated';

import { AnimatedPressable } from '@/components/ui';
import { color, elevation, motion, radius, space } from '@/theme/tokens';
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

  // PLAN_ui_polish.md §8 — a short FadeIn/FadeOut pair replaces the Modal's
  // untunable transition.
  //
  // Same pattern as `ConfirmDialog`: `exiting` only plays on a node that is
  // actually removed while an ancestor stays mounted, so the scrim/sheet are
  // rendered conditionally on `visible` directly, and `rendered` (flipped by
  // `handleExitDone`, once `FadeOut` genuinely finishes) is what keeps the
  // `Modal` itself alive for exactly as long as that takes — `Modal` has no
  // exit-animation concept of its own to wait on.
  //
  // This also happens to be exactly what the file's own doc comment above
  // requires: `onClose()` still fires the instant a row is pressed (so
  // `InteractionManager.runAfterInteractions(action.onPress)` is queued
  // immediately, same as before), but the Modal — and thus this sheet's
  // Native occupancy of the screen — stays up through `motion.sheetOut` after
  // that. A caller opening a `ConfirmDialog` from
  // that callback is therefore still opening into an already-dismissed (or
  // dismissing) sheet, never a still-fully-presented one — the ordering the
  // "sheets and dialogs do not stack" rule requires.
  const [rendered, setRendered] = useState(visible);

  useEffect(() => {
    if (visible) setRendered(true);
  }, [visible]);

  const handleExitDone = useCallback((finished?: boolean) => {
    'worklet';
    if (finished === false) return;
    runOnJS(setRendered)(false);
  }, []);

  if (!rendered) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        {visible && (
          <Animated.View
            style={StyleSheet.absoluteFill}
            entering={FadeIn.duration(160)}
            exiting={FadeOut.duration(motion.sheetOut.duration).withCallback(handleExitDone)}
          />
        )}
        {visible && (
          <Animated.View
            entering={FadeIn.duration(motion.sheetIn.duration)}
            exiting={FadeOut.duration(motion.sheetOut.duration)}
          >
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
                  haptic={action.destructive ? 'confirm' : 'select'}
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
                haptic="tap"
                toOpacity={0.5}
                style={[styles.row, styles.cancel, { marginBottom: insets.bottom }]}
              >
                <Text style={[t.exerciseRow, styles.label, { color: color.inkMuted }]}>Cancel</Text>
              </AnimatedPressable>
            </Pressable>
          </Animated.View>
        )}
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
    // e4 — overlays get the deepest, static-only shadow (PLAN_ui_polish.md
    // §3.6). This panel previously had no shadow at all.
    ...elevation.e4,
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
