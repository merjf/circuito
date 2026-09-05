/**
 * Animated startup splash — the app icon's four interval bars, pulsing like a
 * metronome for as long as the app is still loading.
 *
 * Why a JS splash at all: the native splash (app.json `splash`) can only show a
 * static image, and it disappears the instant the JS bundle mounts — which is
 * well before fonts and SQLite are ready. The gap used to be filled by a bare
 * `ActivityIndicator` + status text. This component covers the same window with
 * the brand mark instead, on the SAME background as the native splash and the
 * app icon (`color.darkBg`), so OS splash -> animated splash -> app reads as one
 * continuous surface with no colour flash between the three.
 *
 * The mark is drawn from plain `View`s rather than `assets/splash-icon.png` —
 * same rule as the tab-bar icons and the bin/pencil marks in `ui.tsx`. It also
 * means each bar is an independently animatable node, which a single PNG is not.
 *
 * Motion:
 *  - Entrance: the four bars scale up from nothing, staggered left-to-right, so
 *    the mark assembles rather than appearing.
 *  - Loop: a left-to-right height pulse, one bar after the next, running for as
 *    long as loading takes. It is a LOOP on purpose (not a one-shot): startup
 *    time is unbounded — a cold start after a migration can take seconds — and a
 *    frozen logo is indistinguishable from a hang, which is exactly the failure
 *    the startup screen in `app/_layout.tsx` exists to avoid.
 *  - Exit: driven by the caller (see `SplashGate` below), not by this component.
 *
 * Reduce Motion: the entrance and the loop are decoration, so both are skipped
 * when the system setting is on — the bars simply render at rest. The exit fade
 * is left alone; it is a screen transition, and removing it would replace the
 * hand-off with a hard cut.
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { color } from '@/theme/tokens';

/**
 * The mark, transcribed from `assets/icon.png`: four rounded bars, two bright
 * and two dimmed, at the icon's own relative heights and widths. Scaled up ~2x
 * from the icon's 1024px artboard so it reads as a splash rather than a favicon.
 */
const BARS = [
  { width: 22, height: 90, tone: color.darkInk },
  { width: 22, height: 36, tone: color.darkMuted },
  { width: 22, height: 106, tone: color.darkInk },
  { width: 10, height: 34, tone: color.darkMuted },
] as const;

const BAR_GAP = 14;
/** How far a bar squashes at the bottom of its pulse. */
const PULSE_MIN = 0.68;
/** One bar's rise + fall. */
const PULSE_HALF = 320;
/** Offset between neighbouring bars — what makes the pulse travel sideways. */
const PULSE_STAGGER = 110;
/** Pause after the last bar so the wave restarts rather than churning. */
const PULSE_REST = 260;
const ENTER_STAGGER = 70;

function Bar({
  index,
  bar,
  reducedMotion,
}: {
  index: number;
  bar: (typeof BARS)[number];
  reducedMotion: boolean;
}) {
  // One shared value per bar carries both phases: it settles at 1 after the
  // entrance, which is exactly where the pulse loop wants to start from.
  const scale = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) return;
    const cycle = BARS.length * PULSE_STAGGER + PULSE_HALF * 2 + PULSE_REST;
    const enterDelay = index * ENTER_STAGGER;
    const enterDuration = 260;

    scale.value = withDelay(
      enterDelay,
      withTiming(1, { duration: enterDuration, easing: Easing.out(Easing.cubic) }),
    );

    // The loop starts once every bar has finished entering, so the first wave
    // reads as a wave and not as a continuation of the entrance stagger.
    const enterTotal = (BARS.length - 1) * ENTER_STAGGER + enterDuration;
    const timer = setTimeout(() => {
      scale.value = withRepeat(
        withSequence(
          withDelay(
            index * PULSE_STAGGER,
            withTiming(PULSE_MIN, { duration: PULSE_HALF, easing: Easing.inOut(Easing.quad) }),
          ),
          withTiming(1, { duration: PULSE_HALF, easing: Easing.inOut(Easing.quad) }),
          // Hold at rest for whatever is left of the cycle, so every bar's
          // sequence is the same total length and the wave never drifts.
          withTiming(1, {
            duration: cycle - index * PULSE_STAGGER - PULSE_HALF * 2,
            easing: Easing.linear,
          }),
        ),
        -1,
        false,
      );
    }, enterTotal);

    return () => {
      clearTimeout(timer);
      cancelAnimation(scale);
    };
  }, [index, reducedMotion, scale]);

  // scaleY only: the bar keeps its width and grows/shrinks about its own
  // centre, which is what makes four bars of different heights read as one
  // equaliser rather than four unrelated blocks.
  const animated = useAnimatedStyle(() => ({ transform: [{ scaleY: scale.value }] }));

  return (
    <Animated.View
      style={[
        {
          width: bar.width,
          height: bar.height,
          borderRadius: bar.width / 2.4,
          backgroundColor: bar.tone,
        },
        animated,
      ]}
    />
  );
}

export function SplashMark() {
  const reducedMotion = useReducedMotion();
  return (
    <View style={styles.mark}>
      {BARS.map((bar, index) => (
        <Bar key={index} index={index} bar={bar} reducedMotion={reducedMotion} />
      ))}
    </View>
  );
}

export default function SplashScreen() {
  return (
    <View style={styles.root}>
      <SplashMark />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: color.darkBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BAR_GAP,
    // The tallest bar is 106; a fixed box stops the row's own height from
    // changing as the bars pulse, which would bounce the mark on screen.
    height: 120,
  },
});
