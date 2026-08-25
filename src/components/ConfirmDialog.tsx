/**
 * The app's dialog. Replaces `Alert.alert` everywhere.
 *
 * `Alert` renders the OS's own dialog — Material blue on Android, system font,
 * ALL-CAPS text buttons — which is why the delete prompt looked like it came
 * from a different app than the screen behind it. This is the same surface as
 * every other card: `surface` on a scrim, 12px radius, hairline border, Archivo
 * for the title, and the project's own primary/secondary buttons.
 *
 * Deliberately not a full replacement for Alert's API — no input, no arbitrary
 * button lists. It does one thing: ask a question and offer up to two answers,
 * plus cancel. Anything more complex belongs in a sheet.
 */

import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { AnimatedPressable } from '@/components/ui';
import { color, radius, space } from '@/theme/tokens';
import { type as t } from '@/theme/type';

export interface DialogAction {
  label: string;
  onPress: () => void;
  /** Renders in the primary (dark) slot. Exactly one action should set this. */
  primary?: boolean;
  /** Destructive actions are outlined rather than filled, and never primary. */
  destructive?: boolean;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  actions,
  cancelLabel = 'Cancel',
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: ReactNode;
  actions: DialogAction[];
  cancelLabel?: string;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      {/* Tapping outside cancels — the same as pressing Cancel, never the action. */}
      <Pressable style={styles.scrim} onPress={onCancel}>
        <Pressable style={styles.dialog} onPress={() => {}}>
          <Text style={[t.cardTitle, { color: color.ink, fontSize: 17 }]}>{title}</Text>

          {typeof message === 'string' ? (
            <Text style={[t.body, styles.message]}>{message}</Text>
          ) : (
            message
          )}

          <View style={styles.actions}>
            <AnimatedPressable
              style={[styles.button, styles.cancel]}
              haptic={false}
              toOpacity={0.6}
              onPress={onCancel}
            >
              <Text style={[t.exerciseRow, { color: color.ink, fontSize: 14, textAlign: 'center' }]}>
                {cancelLabel}
              </Text>
            </AnimatedPressable>

            {actions.map((action) => (
              <AnimatedPressable
                key={action.label}
                onPress={action.onPress}
                haptic={action.destructive}
                style={[
                  styles.button,
                  action.destructive
                    ? styles.destructive
                    : action.primary
                      ? styles.primary
                      : styles.cancel,
                ]}
              >
                <Text
                  style={[
                    t.exerciseRow,
                    {
                      fontSize: 14,
                      fontFamily: 'Inter_700Bold',
                      textAlign: 'center',
                      color: action.destructive
                        ? color.softRedIcon
                        : action.primary
                          ? color.darkInk
                          : color.ink,
                    },
                  ]}
                >
                  {action.label}
                </Text>
              </AnimatedPressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(20,20,22,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: color.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.hairline,
    padding: space.xl,
    // Explicit rather than relying on the default: without this, a button
    // row that ever paints before its animated style has resolved (or any
    // future addition to the card) can get silently clipped to invisible
    // by the border radius instead of simply overflowing it.
    overflow: 'visible',
  },
  message: { color: color.inkMuted, marginTop: 10, fontSize: 13.5 },
  // `minHeight` matches `button.height` below — a guard so the row can
  // never render collapsed to a hairline (bug report: the Cancel/Delete
  // buttons showed as an invisible sliver) regardless of what happens to
  // the animated children's own layout while their style is still settling.
  actions: { flexDirection: 'row', gap: 10, marginTop: space.xl, minHeight: 46 },
  button: {
    flex: 1,
    minWidth: 0,
    height: 46,
    minHeight: 46,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  // Explicit `surface` background rather than relying on transparency
  // showing the dialog's own white behind it — belt-and-braces so this
  // button is never see-through against whatever sits behind the dialog.
  // Border bumped from `hairlineStrong` to `ink` at fixed width 1.5 — the
  // hairline read as a barely-visible sliver against `surface` (bug report:
  // Cancel/OK button invisible in both the save-error and delete dialogs).
  cancel: { borderWidth: 1.5, borderColor: color.ink, backgroundColor: color.surface },
  primary: { backgroundColor: color.inkStrong },
  // Delete reads as a clearly distinct, soft-red action rather than sharing
  // the plain outlined "cancel" look every other secondary action gets
  // (`PLAN_ui_fixes.md` UI pass).
  destructive: { backgroundColor: color.softRed, borderWidth: 1, borderColor: color.softRedBorder },
});
