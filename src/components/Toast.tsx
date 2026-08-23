/**
 * A brief, non-blocking notice. Used for personal records in the logger.
 *
 * Everything else that overlays in this app is a `Modal` — `ConfirmDialog`,
 * `ActionSheet`, `ExercisePicker` — because everything else is asking a
 * question. This is telling you something while you are mid-workout, so it
 * must not capture a single touch: you should be able to tick the next set
 * straight through it without dismissing anything.
 *
 * It also dismisses itself. A PR notice that waits to be acknowledged turns a
 * small piece of good news into a piece of admin.
 */

import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, radius, space } from '@/theme/tokens';
import { type as t } from '@/theme/type';

/** Long enough to read a two-line notice, short enough not to sit in the way. */
const VISIBLE_MS = 2600;
const FADE_MS = 180;

export function Toast({
  title,
  message,
  onDone,
}: {
  /** `null` renders nothing. Changing it restarts the timer. */
  title: string | null;
  message?: string;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (title == null) return;

    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: FADE_MS,
      useNativeDriver: true,
    }).start();

    const id = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_MS,
        useNativeDriver: true,
      }).start(() => doneRef.current());
    }, VISIBLE_MS);

    return () => clearTimeout(id);
    // `message` is deliberately not a dependency: two records broken by the
    // same set arrive as one notice, and re-running this on the second would
    // restart the fade halfway through the first.
  }, [title, opacity]);

  if (title == null) return null;

  return (
    <Animated.View
      // The whole point: touches pass through to the row underneath.
      pointerEvents="box-none"
      style={[styles.wrap, { top: insets.top + 8, opacity }]}
    >
      {/* Tappable only to dismiss early — never to confirm, because there is
          nothing here to confirm. */}
      <Pressable onPress={() => doneRef.current()} style={styles.toast}>
        <View style={styles.mark} />
        <View style={{ flex: 1 }}>
          <Text style={[t.monoLabel, { color: color.darkInk }]}>{title}</Text>
          {message != null && (
            <Text
              style={[t.exerciseRow, { color: color.darkInk2, fontSize: 13, marginTop: 3 }]}
              numberOfLines={2}
            >
              {message}
            </Text>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: space.gutter,
    right: space.gutter,
    zIndex: 20,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: color.inkStrong,
    borderRadius: radius.card,
    paddingHorizontal: space.m,
    paddingVertical: space.sm,
  },
  // A small filled square rather than a trophy or a star: the app draws its
  // marks from plain shapes, and an emoji here would be the one full-colour
  // thing on an otherwise ink-toned screen.
  mark: {
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: color.softGreenIcon,
  },
});
