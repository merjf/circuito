/**
 * The rest countdown between two logged sets.
 *
 * A sheet rather than a screen, and a deliberately small one: this appears
 * every time you tick a set, so it has to be dismissible without thought and
 * must never cover the row you just filled in. It sits at the bottom, over the
 * logger, and the list stays visible and scrollable above it.
 *
 * Not a `Modal`. Everything else in the app that overlays uses one, but a
 * Modal here would capture touches for the whole screen — and the whole point
 * is that you can carry on reading the next exercise while the clock runs.
 * An absolutely-positioned view inside the screen is the right shape.
 */

import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/ui';
import { formatClock } from '@/domain/duration';
import { REST_ADJUST_SECONDS } from '@/runner/useRestTimer';
import { color, radius, space } from '@/theme/tokens';
import { type as t } from '@/theme/type';

export function RestSheet({
  remaining,
  total,
  onAdjust,
  onSkip,
}: {
  /** Seconds left. `null` hides the sheet entirely. */
  remaining: number | null;
  total: number;
  onAdjust: (deltaSeconds: number) => void;
  onSkip: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (remaining === null) return null;

  // The bar drains left to right as the rest runs down, so the sheet can be
  // read at a glance without parsing the digits — the same idea as the
  // player's draining background, at a tenth of the size.
  const progress = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;

  return (
    <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[t.monoLabelTiny, { color: color.inkGhost }]}>Rest</Text>
          <Text style={[t.statFigure, styles.clock]}>{formatClock(remaining)}</Text>
        </View>

        <AnimatedPressable
          onPress={() => onAdjust(-REST_ADJUST_SECONDS)}
          accessibilityRole="button"
          accessibilityLabel={`Take ${REST_ADJUST_SECONDS} seconds off this rest`}
          hitSlop={8}
          haptic="select"
          style={styles.button}
        >
          <Text style={[t.monoLabel, { color: color.ink }]}>{`−${REST_ADJUST_SECONDS}s`}</Text>
        </AnimatedPressable>

        <AnimatedPressable
          onPress={() => onAdjust(REST_ADJUST_SECONDS)}
          accessibilityRole="button"
          accessibilityLabel={`Add ${REST_ADJUST_SECONDS} seconds to this rest`}
          hitSlop={8}
          haptic="select"
          style={styles.button}
        >
          <Text style={[t.monoLabel, { color: color.ink }]}>{`+${REST_ADJUST_SECONDS}s`}</Text>
        </AnimatedPressable>

        <AnimatedPressable
          onPress={onSkip}
          accessibilityRole="button"
          accessibilityLabel="Skip the rest"
          hitSlop={8}
          style={[styles.button, styles.skip]}
        >
          <Text style={[t.monoLabel, { color: color.darkInk }]}>SKIP</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderTopWidth: 1,
    borderColor: color.hairlineStrong,
    paddingHorizontal: space.gutter,
    paddingTop: space.m,
  },
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: color.track,
    overflow: 'hidden',
  },
  fill: { height: 3, backgroundColor: color.inkStrong },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: space.sm,
  },
  clock: { color: color.ink, fontSize: 24, lineHeight: 28, marginTop: 2 },
  button: {
    minWidth: 58,
    height: 40,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
    backgroundColor: color.sunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skip: { backgroundColor: color.inkStrong, borderColor: color.inkStrong },
});
