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
            <Pressable style={[styles.button, styles.cancel]} onPress={onCancel}>
              <Text style={[t.exerciseRow, { color: color.inkMuted, fontSize: 14 }]}>
                {cancelLabel}
              </Text>
            </Pressable>

            {actions.map((action) => (
              <Pressable
                key={action.label}
                onPress={action.onPress}
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
                      fontFamily: 'Archivo_600SemiBold',
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
              </Pressable>
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
  },
  message: { color: color.inkMuted, marginTop: 10, fontSize: 13.5 },
  actions: { flexDirection: 'row', gap: 10, marginTop: space.xl },
  button: {
    flex: 1,
    height: 46,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancel: { borderWidth: 1, borderColor: color.hairlineStrong },
  primary: { backgroundColor: color.inkStrong },
  // Delete reads as a clearly distinct, soft-red action rather than sharing
  // the plain outlined "cancel" look every other secondary action gets
  // (`PLAN_ui_fixes.md` UI pass).
  destructive: { backgroundColor: color.softRed, borderWidth: 1, borderColor: color.softRedBorder },
});
