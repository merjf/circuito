/**
 * Shared primitives.
 *
 * Every screen repeats the same handful of shapes — an outlined mono chip, a
 * white card with a hairline border, a 54px dark button, a −/value/+ stepper.
 * They live here so the tokens are applied once rather than re-typed per screen,
 * which is how a design system drifts.
 *
 * Icons are text glyphs, per the handoff's § "Assets": the mock draws them as
 * plain shapes and characters, and substituting a full icon set for six glyphs
 * would be a heavier dependency than the design asks for.
 */

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { MediaType } from '@/domain/types';
import { color, mediaPlaceholder, radius, shadow, size, space } from '@/theme/tokens';
import { type as t } from '@/theme/type';

const AnimatedView = Animated.createAnimatedComponent(View);

// ── Press animation ───────────────────────────────────────────────────────

/**
 * Shared press feedback for every button in the app: a quick scale-down +
 * opacity dip on press-in (native-thread, via Reanimated, so it never waits
 * on a JS re-render), a light spring back to rest on release, and — unless
 * opted out — a light haptic tick that lands together with the visual squish
 * rather than after it.
 *
 * Every button used to be a bare `Pressable` with either no pressed style at
 * all, or a static `opacity: 0.5` snap. This is the one place that changes,
 * so every button picks up the same feel at once.
 */
function usePressAnimation({
  toScale = 0.96,
  toOpacity = 0.85,
  haptic = true,
  disabled = false,
}: {
  toScale?: number;
  toOpacity?: number;
  haptic?: boolean;
  disabled?: boolean;
} = {}) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const pressIn = () => {
    if (disabled) return;
    scale.value = withTiming(toScale, { duration: 80 });
    opacity.value = withTiming(toOpacity, { duration: 80 });
    if (haptic) {
      // Guarded with try/catch, not just `.catch()` on the promise: if the
      // native module itself failed to link into this build, the call throws
      // SYNCHRONOUSLY before it ever returns a promise to attach `.catch` to.
      // An uncaught throw here happens inside the Pressable's onPressIn
      // handler, ahead of onPress — on Hermes/release builds that can abort
      // the rest of the gesture, which is indistinguishable from "the button
      // does nothing" (PLAN_bugfix_round2.md item 1–3).
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)?.catch(() => {});
      } catch {
        // Haptics unavailable on this build/device — press animation and
        // onPress must still proceed.
      }
    }
  };

  const pressOut = () => {
    if (disabled) return;
    scale.value = withSpring(1, { damping: 14, stiffness: 260 });
    opacity.value = withTiming(1, { duration: 120 });
  };

  return { animatedStyle, pressIn, pressOut };
}

/**
 * A `Pressable` wrapped in the shared press animation above. Drop-in for any
 * button shape — pass the button's own style(s) via `style`, they're applied
 * to the inner animated view alongside the scale/opacity.
 */
export function AnimatedPressable({
  onPress,
  onPressIn,
  onPressOut,
  disabled,
  style,
  children,
  toScale,
  toOpacity,
  haptic,
  ...rest
}: {
  onPress: (e: GestureResponderEvent) => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  toScale?: number;
  toOpacity?: number;
  haptic?: boolean;
  [key: string]: unknown;
}) {
  const press = usePressAnimation({ toScale, toOpacity, haptic, disabled });

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        press.pressIn();
        onPressIn?.();
      }}
      onPressOut={() => {
        press.pressOut();
        onPressOut?.();
      }}
      disabled={disabled}
      {...rest}
    >
      <AnimatedView style={[style, press.animatedStyle]}>{children}</AnimatedView>
    </Pressable>
  );
}

/**
 * The same press animation as `AnimatedPressable`, plus press-and-hold
 * auto-repeat — built for stepper −/+ buttons, where holding the button
 * should keep incrementing rather than requiring a tap per step.
 *
 * Timing: an initial ~400ms delay (so a normal tap never double-fires),
 * then repeats on a ~130ms interval, clamped to whatever `onRepeat` itself
 * enforces (min/max belong to the caller, same as a single tap). No haptic
 * per repeat tick — a buzz every 130ms reads as noise, not feedback — only
 * on the initial press, same as every other button.
 */
export function RepeatingPressable({
  onRepeat,
  disabled,
  style,
  children,
  initialDelay = 400,
  repeatInterval = 130,
  ...rest
}: {
  onRepeat: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  initialDelay?: number;
  repeatInterval?: number;
  [key: string]: unknown;
}) {
  const press = usePressAnimation({ toScale: 0.9, toOpacity: 1, haptic: true, disabled });
  const delayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // `onRepeat` is a new closure every render (it's `() => onChange(clamp(value
  // ± step))` at the call site, closing over that render's `value`). The
  // interval below is created once, in `start()`, and must keep reading the
  // LATEST `onRepeat` on every tick — otherwise a held button keeps calling
  // the closure from the render at press-in time, which keeps applying the
  // same step to the same stale value instead of progressively advancing it.
  const onRepeatRef = useRef(onRepeat);
  onRepeatRef.current = onRepeat;

  const clearTimers = () => {
    if (delayTimer.current != null) {
      clearTimeout(delayTimer.current);
      delayTimer.current = null;
    }
    if (repeatTimer.current != null) {
      clearInterval(repeatTimer.current);
      repeatTimer.current = null;
    }
  };

  // Belt-and-braces: a held button whose screen unmounts mid-press (e.g. the
  // sheet is dismissed) must not leave an interval running against state
  // that no longer exists.
  useEffect(() => clearTimers, []);

  const start = () => {
    if (disabled) return;
    press.pressIn();
    onRepeatRef.current();
    delayTimer.current = setTimeout(() => {
      repeatTimer.current = setInterval(() => onRepeatRef.current(), repeatInterval);
    }, initialDelay);
  };

  const stop = () => {
    clearTimers();
    press.pressOut();
  };

  return (
    <Pressable
      onPressIn={start}
      onPressOut={stop}
      disabled={disabled}
      {...rest}
    >
      <AnimatedView style={[style, press.animatedStyle]}>{children}</AnimatedView>
    </Pressable>
  );
}

// ── Text ───────────────────────────────────────────────────────────────────

export function MonoLabel({
  children,
  style,
  tone = color.inkGhost,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  tone?: string;
}) {
  return <Text style={[t.monoLabel, { color: tone }, style]}>{children}</Text>;
}

export function MonoValue({
  children,
  style,
  tone = color.ink,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  tone?: string;
}) {
  return <Text style={[t.monoValue, { color: tone }, style]}>{children}</Text>;
}

// ── Header ─────────────────────────────────────────────────────────────────

/**
 * Back arrow on the left, an optional action area on the right (1b, 1f).
 *
 * `action` takes a `ReactNode` rather than a text label, so a screen that
 * needs more than one control there — 1b's "Edit" plus a bin
 * (`PLAN_ui_fixes.md` A4) — can pass a small row of them. `HeaderAction`
 * below is the common single-text-label case.
 */
export function ScreenHeader({
  onBack,
  action,
}: {
  onBack: () => void;
  action?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      {/* A bare glyph at this font size is well under 44px on its own;
          hitSlop raised so the effective target clears it
          (`PLAN_ui_fixes.md` B6). */}
      <AnimatedPressable onPress={onBack} hitSlop={16} haptic={false} toOpacity={0.5}>
        <Text style={{ fontSize: 22, lineHeight: 26, color: color.ink }}>←</Text>
      </AnimatedPressable>
      {action ?? <View />}
    </View>
  );
}

/** The tappable mono-label shape a `ScreenHeader` action usually is — "Edit",
 *  "Save", and so on. */
export function HeaderAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <AnimatedPressable onPress={onPress} hitSlop={12} haptic={false} toOpacity={0.5}>
      <MonoLabel tone={color.inkMuted}>{label}</MonoLabel>
    </AnimatedPressable>
  );
}

// ── Chips ──────────────────────────────────────────────────────────────────

/** 1px outlined box, mono uppercase — the metadata chips on 1b. */
export function OutlineChip({ children }: { children: ReactNode }) {
  return (
    <View style={styles.outlineChip}>
      <MonoLabel tone={color.inkMuted}>{children}</MonoLabel>
    </View>
  );
}

/** Filled `sunken` chip — the tag chips on 1f. */
export function TagChip({ children }: { children: ReactNode }) {
  return (
    <View style={styles.tagChip}>
      <MonoLabel tone={color.inkMuted}>{children}</MonoLabel>
    </View>
  );
}

/** Filter pill (1e): dark fill when active, outlined when not. */
export function FilterPill({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count?: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      haptic={false}
      toScale={0.95}
      toOpacity={0.8}
      style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}
    >
      <MonoLabel tone={active ? color.darkInk : color.inkMuted}>{label}</MonoLabel>
      {count != null && (
        <MonoLabel tone={active ? color.darkMuted : color.inkGhostest}>{String(count)}</MonoLabel>
      )}
    </AnimatedPressable>
  );
}

// ── Containers ─────────────────────────────────────────────────────────────

export function Card({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  if (onPress) {
    return (
      <AnimatedPressable onPress={onPress} haptic={false} toScale={0.98} toOpacity={0.9} style={[styles.card, style]}>
        {children}
      </AnimatedPressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

/** A `sunken` row — "Prepare 00:10", the skipped note, "Used in" entries. */
export function SunkenRow({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  if (onPress) {
    return (
      <AnimatedPressable onPress={onPress} haptic={false} toScale={0.98} toOpacity={0.85} style={[styles.sunkenRow, style]}>
        {children}
      </AnimatedPressable>
    );
  }
  return <View style={[styles.sunkenRow, style]}>{children}</View>;
}

// ── Buttons ────────────────────────────────────────────────────────────────

export function PrimaryButton({
  label,
  onPress,
  style,
  disabled,
}: {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.primaryButton, disabled && { opacity: 0.35 }, style]}
    >
      <Text style={styles.primaryLabel}>{label}</Text>
    </AnimatedPressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  style,
}: {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <AnimatedPressable onPress={onPress} toOpacity={0.6} style={[styles.secondaryButton, style]}>
      <Text style={styles.secondaryLabel}>{label}</Text>
    </AnimatedPressable>
  );
}

/** The dark circular `+` on 1a and 1e. */
export function AddCircle({ onPress }: { onPress: () => void }) {
  return (
    <AnimatedPressable onPress={onPress} hitSlop={8} style={styles.addCircle}>
      <Text style={{ color: color.darkInk, fontSize: 20, lineHeight: 22 }}>+</Text>
    </AnimatedPressable>
  );
}

// ── Icon buttons ───────────────────────────────────────────────────────────

/**
 * A 44×44 tap target around an arbitrary glyph, with a pressed state and a
 * required label — every other icon-only control on this app used to be a
 * bare `Pressable` with a `hitSlop` and no visible shape, which is how
 * `deleteTraining()` ended up with no way to reach it from the UI at all
 * (`PLAN_ui_fixes.md` A4) and how the block-delete `×` shipped at a 24px box.
 * It now always renders as a rounded, bordered button — filled `sunken` by
 * default, or a `tintBg`/`tintBorder` pair for a coloured variant (bin →
 * soft red, edit → soft orange) — so every icon control reads as a tappable
 * button rather than a loose glyph floating on the canvas.
 */
export function IconButton({
  onPress,
  accessibilityLabel,
  children,
  style,
  tintBg,
  tintBorder,
  disabled,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tintBg?: string;
  tintBorder?: string;
  disabled?: boolean;
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
      style={[
        styles.iconButton,
        tintBg != null && { backgroundColor: tintBg },
        tintBorder != null && { borderColor: tintBorder },
        disabled && { opacity: 0.35 },
        style,
      ]}
    >
      {children}
    </AnimatedPressable>
  );
}

/**
 * A minimal line-drawn bin — built from plain `View`s rather than a Unicode
 * glyph, because there is no plain-TEXT wastebasket character: the ones that
 * look like one (🗑, U+1F5D1) live in the emoji block and render in full
 * colour on both platforms, which would be the one full-colour mark on an
 * otherwise ink-toned, text-glyph app (see the handoff's icon rule: × ✓ ← ›
 * + − ◀◀ ▶▶, and the earlier decision not to pull in a full icon set for a
 * handful of glyphs).
 *
 * Every delete action in the app is soft-red (`PLAN_ui_fixes.md` UI pass) —
 * pale fill, matching border, red glyph — so "this removes something" is
 * legible at a glance rather than only on read.
 */
export function BinButton({
  onPress,
  accessibilityLabel = 'Delete',
  tone = color.softRedIcon,
}: {
  onPress: () => void;
  accessibilityLabel?: string;
  tone?: string;
}) {
  return (
    <IconButton
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      tintBg={color.softRed}
      tintBorder={color.softRedBorder}
    >
      <View style={styles.binGlyph}>
        <View style={[styles.binHandle, { backgroundColor: tone }]} />
        <View style={[styles.binLid, { backgroundColor: tone }]} />
        <View style={[styles.binBody, { borderColor: tone }]} />
      </View>
    </IconButton>
  );
}

/**
 * A small line-drawn pencil, same construction as `BinButton` — plain `View`s
 * rather than a Unicode glyph (✎ renders as a colour emoji on some platforms).
 * Soft orange, per the same "colour says what the action does" rule as the
 * bin: this is the app's one edit action.
 */
export function PencilButton({
  onPress,
  accessibilityLabel = 'Edit',
}: {
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <IconButton
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      tintBg={color.softOrange}
      tintBorder={color.softOrangeBorder}
    >
      <View style={styles.pencilGlyph}>
        <View style={styles.pencilBody} />
        <View style={styles.pencilTip} />
      </View>
    </IconButton>
  );
}

/**
 * The Save action, as an icon rather than a text label — `✓` is already on
 * the handoff's approved glyph list (× ✓ ← › + − ◀◀ ▶▶), so this needs no new
 * construction the way the bin and pencil did. Soft green: on the neutral
 * `sunken` fill it used to share with every other resting control, it read as
 * inert rather than as the screen's one confirming action
 * (`PLAN_ui_fixes.md` UI pass — "save button does not work").
 */
export function SaveButton({
  onPress,
  accessibilityLabel = 'Save',
  /** Fades the whole button without blocking the press — the builder still
   *  needs a tap through to land when the draft has problems, since that is
   *  what surfaces the "Not ready to save" dialog. Use `disabled` only when
   *  the press really should do nothing. */
  dim = false,
  disabled = false,
}: {
  onPress: () => void;
  accessibilityLabel?: string;
  dim?: boolean;
  disabled?: boolean;
}) {
  return (
    <IconButton
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      tintBg={color.softGreen}
      tintBorder={color.softGreenBorder}
      style={dim ? { opacity: 0.45 } : undefined}
    >
      <Text style={styles.saveGlyph}>✓</Text>
    </IconButton>
  );
}

/**
 * The small outlined badge saying what an exercise is measured in.
 *
 * Was `RepsTag`, which could only say one thing because there were only two
 * kinds of exercise. With eight types the badge has to carry its own label —
 * "Reps · Kg", "Time", "Kg · Km" — and the places it appears (library row,
 * picker row, builder row) all read it from `TYPE_COPY` so they cannot drift.
 */
export function TypeTag({ label }: { label: string }) {
  return (
    <View style={styles.repsTag}>
      <Text style={styles.repsTagLabel}>{label.toUpperCase()}</Text>
    </View>
  );
}

/**
 * The overflow control — three dots opening an `ActionSheet`.
 *
 * Built from `View`s rather than a glyph, for the same reason as the bin and
 * the pencil: the characters that look right (⋯ U+22EF, … U+2026) are typeset
 * for prose and sit on the text baseline at a size and spacing that reads as
 * punctuation rather than as a button. Three explicit dots are also trivially
 * rotatable if a vertical variant is ever wanted.
 *
 * Neutral by design. This is the control that lets a *destructive* action come
 * off the surface of a list row, so it must not itself look destructive.
 */
export function MoreButton({
  onPress,
  accessibilityLabel = 'More actions',
}: {
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <IconButton onPress={onPress} accessibilityLabel={accessibilityLabel}>
      <View style={styles.moreGlyph}>
        <View style={styles.moreDot} />
        <View style={styles.moreDot} />
        <View style={styles.moreDot} />
      </View>
    </IconButton>
  );
}

/**
 * Start, as a filled dark circle on a list row (1a).
 *
 * Starting a training used to cost two taps — card, then the sticky button on
 * the detail screen — for the single thing the app exists to do. `disabled`
 * exists because a training with no exercises has nothing to run; it is dimmed
 * in place rather than hidden, so the row's shape does not jump between cards.
 */
export function PlayButton({
  onPress,
  accessibilityLabel = 'Start',
  disabled = false,
}: {
  onPress: () => void;
  accessibilityLabel?: string;
  disabled?: boolean;
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={[styles.playButton, disabled && { opacity: 0.3 }]}
    >
      <View style={styles.playTriangle} />
    </AnimatedPressable>
  );
}

// ── Steppers ───────────────────────────────────────────────────────────────

/**
 * −/value/+ in three boxes. Two sizes: the compact one in the builder's name
 * card and block headers, and the 34px one in the edit sheet.
 */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 3600,
  format = String,
  large = false,
}: {
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
  format?: (v: number) => string;
  large?: boolean;
}) {
  const box = large ? size.sheetStepper : size.stepper;
  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: large ? 10 : 8 }}>
      <RepeatingPressable
        onRepeat={() => onChange(clamp(value - step))}
        disabled={value <= min}
        style={[styles.stepperBox, { width: box, height: box }, value <= min && { opacity: 0.3 }]}
      >
        <Text style={styles.stepperGlyph}>−</Text>
      </RepeatingPressable>
      <Text
        style={[
          large ? t.statFigure : t.monoValue,
          large && { fontSize: 20, lineHeight: 24 },
          { color: color.ink, minWidth: large ? 56 : 44, textAlign: 'center' },
        ]}
      >
        {format(value)}
      </Text>
      <RepeatingPressable
        onRepeat={() => {
          const next = clamp(value + step);
          // TEMP DEBUG (bug report: "+ does nothing once value reaches 0")
          // — every static read of this component's clamp/disabled logic
          // came back correct, so this logs the actual runtime values at
          // the moment "+" is pressed to catch what a code read can't:
          // remove once the report reproduces with this in place.
          if (__DEV__) {
            console.log('[Stepper +]', { value, step, min, max, next });
          }
          onChange(next);
        }}
        disabled={value >= max}
        style={[styles.stepperBox, { width: box, height: box }, value >= max && { opacity: 0.3 }]}
      >
        <Text style={styles.stepperGlyph}>+</Text>
      </RepeatingPressable>
    </View>
  );
}

/**
 * The Work / Rest / Reps field in a builder row: mono micro-label over a
 * tappable value chip.
 *
 * Used to carry its own `− value +` row — three of these fit across a phone
 * width, per the original comment here, which is exactly why the buttons
 * were 22px: too small a target next to the rest of the app's button work.
 * The row is now a single tap target showing the current value; tapping it
 * opens a `ValueEditSheet` with the same large `Stepper` every other value
 * in the app is edited with, `onOpen` supplies everything that sheet needs
 * (label, value, step/min/max/format) — the call site doesn't change, only
 * how the field renders.
 */
export function MiniStepper({
  label,
  value,
  onChange,
  step = 5,
  min = 0,
  max = 3600,
  format = String,
  disabled = false,
  disabledValue = '—',
  style,
  onOpen,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
  format?: (v: number) => string;
  disabled?: boolean;
  disabledValue?: string;
  /** Overrides the outer field's width/flex — the settings "How early" row
   *  passes a fixed width so the box doesn't stretch to fill the row the way
   *  a bare `flex: 1` does (`PLAN_ui_fixes.md` UI pass). */
  style?: StyleProp<ViewStyle>;
  /** Opens the shared `ValueEditSheet` pre-filled with this field's own
   *  label/value/step/min/max/format/onChange. Omit to render read-only
   *  (used nowhere today, kept so a future read-only mini-field doesn't need
   *  a second component). */
  onOpen?: () => void;
}) {
  return (
    <View style={[styles.miniField, style]}>
      <MonoLabel tone={color.inkGhost} style={{ fontSize: 9 }}>
        {label}
      </MonoLabel>

      {disabled || !onOpen ? (
        <Text style={[t.monoValue, styles.miniDisabled]}>
          {disabled ? disabledValue : format(value)}
        </Text>
      ) : (
        <AnimatedPressable
          onPress={onOpen}
          haptic={false}
          toScale={0.95}
          toOpacity={0.7}
          style={styles.miniValueTap}
        >
          <Text style={[t.monoValue, styles.miniValue]} numberOfLines={1}>
            {format(value)}
          </Text>
        </AnimatedPressable>
      )}
    </View>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────────

/** Mono micro-label over a large tabular figure — 1k's 2×2 grid and 1f's 3-up. */
export function StatCard({
  label,
  value,
  style,
  compact = false,
}: {
  label: string;
  value: string;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  return (
    <View style={[styles.statCard, style]}>
      <MonoLabel tone={color.inkFaint}>{label}</MonoLabel>
      <Text
        style={[
          t.statFigure,
          compact && { fontSize: 17, lineHeight: 21 },
          { color: color.ink, marginTop: compact ? 6 : 8 },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

// ── Media placeholder ──────────────────────────────────────────────────────

/**
 * The 45° striped placeholder standing in for user media.
 *
 * CSS would do this with `repeating-linear-gradient`; React Native has no such
 * thing, so the stripes are rotated bars in a clipped box. Cheap, and it never
 * ships to a user who has attached real media — this only renders when
 * `mediaUrl` is absent.
 */
export function MediaPlaceholder({
  style,
  caption,
  borderRadius = radius.field,
}: {
  style?: StyleProp<ViewStyle>;
  caption?: string;
  borderRadius?: number;
}) {
  const bars = Array.from({ length: 24 });
  return (
    <View
      style={[
        { backgroundColor: mediaPlaceholder.stripeB, borderRadius, overflow: 'hidden' },
        style,
      ]}
    >
      <View style={StyleSheet.absoluteFill}>
        {bars.map((_, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              top: -400,
              bottom: -400,
              left: i * (mediaPlaceholder.stripeWidth * 2) - 200,
              width: mediaPlaceholder.stripeWidth,
              backgroundColor: mediaPlaceholder.stripeA,
              transform: [{ rotate: `${mediaPlaceholder.angle}deg` }],
            }}
          />
        ))}
      </View>
      {caption && (
        <View style={styles.mediaCaption}>
          <MonoLabel tone={color.inkGhostest}>{caption}</MonoLabel>
        </View>
      )}
    </View>
  );
}

/**
 * A library-row/picker-row thumbnail (`PLAN_ui_fixes.md` A5).
 *
 * Renders the real photo only for `type === 'photo'` with a `uri` present —
 * both list rows used to render `<MediaPlaceholder />` unconditionally,
 * never reading `mediaUrl` at all, so the stripes were not a "no media yet"
 * state there, they were *all* there was. `type === 'video'` always shows
 * the placeholder here (with a ▶ badge) rather than piping a video URI into
 * an `<Image>`, which draws an empty box — that bug is what pushed videos
 * behind `mediaTypes: ['images']` in the picker until playback exists.
 *
 * `onError` falls back to the placeholder: these are `file://` URIs into the
 * app's own document directory, and they do go missing — a reinstall, the OS
 * reclaiming storage — so a broken image box would be worse than the stripes.
 */
export function Thumbnail({
  uri,
  type,
  size: dimension,
  style,
}: {
  uri: string | undefined;
  type: MediaType | undefined;
  size: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [failed, setFailed] = useState(false);
  const showPhoto = type === 'photo' && !!uri && !failed;
  const box = { width: dimension, height: dimension };

  return (
    <View style={[box, style]}>
      {showPhoto ? (
        <Image
          source={{ uri }}
          style={[box, { borderRadius: radius.field }]}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <MediaPlaceholder style={box} />
      )}
      {type === 'video' && (
        <View style={styles.videoBadge}>
          <Text style={styles.videoBadgeGlyph}>▶</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // minHeight rather than a fixed 32: a bin (44×44, PLAN_ui_fixes.md A4)
    // now sometimes sits in the action slot, and a fixed height would
    // silently overflow rather than reserve room for it.
    minHeight: 44,
  },
  outlineChip: {
    borderWidth: 1,
    borderColor: color.hairlineStrong,
    borderRadius: radius.fieldTight,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  tagChip: {
    backgroundColor: color.sunken,
    borderRadius: radius.fieldTight,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    height: 34,
  },
  pillActive: { backgroundColor: color.accent },
  pillInactive: { borderWidth: 1, borderColor: color.hairlineStrong },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.card,
    borderWidth: 0,
  },
  sunkenRow: {
    backgroundColor: color.sunken,
    borderRadius: radius.cardTight,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  primaryButton: {
    height: size.primaryButton,
    borderRadius: radius.button,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.button,
  },
  primaryLabel: { fontFamily: 'Inter_700Bold', fontSize: 14, color: color.darkInk },
  secondaryButton: {
    height: size.primaryButton,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: { fontFamily: 'Inter_500Medium', fontSize: 14, color: color.inkMuted },
  addCircle: {
    width: size.addCircle,
    height: size.addCircle,
    borderRadius: size.addCircle / 2,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.button,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
    backgroundColor: color.sunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  binGlyph: { width: 15, height: 15, alignItems: 'center' },
  binHandle: { width: 5, height: 1.6, borderRadius: 1, marginBottom: 1.5 },
  binLid: { width: 15, height: 1.6, borderRadius: 1 },
  binBody: {
    width: 11,
    flex: 1,
    marginTop: 1.5,
    borderWidth: 1.4,
    borderTopWidth: 0,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  pencilGlyph: { width: 16, height: 16 },
  pencilBody: {
    position: 'absolute',
    top: 1,
    left: 6,
    width: 4,
    height: 13,
    borderRadius: 1.2,
    backgroundColor: color.softOrangeIcon,
    transform: [{ rotate: '45deg' }],
  },
  pencilTip: {
    position: 'absolute',
    top: 10.5,
    left: 3.2,
    width: 0,
    height: 0,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderTopWidth: 3.6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: color.softOrangeIcon,
    transform: [{ rotate: '45deg' }],
  },
  saveGlyph: { fontFamily: 'Inter_700Bold', fontSize: 18, color: color.softGreenIcon },
  moreGlyph: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  moreDot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 1.75,
    backgroundColor: color.inkMuted,
  },
  playButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.button,
  },
  playTriangle: {
    width: 0,
    height: 0,
    marginLeft: 3,
    borderLeftWidth: 11,
    borderTopWidth: 7,
    borderBottomWidth: 7,
    borderLeftColor: color.darkInk,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  repsTag: {
    borderWidth: 1,
    borderColor: color.hairlineStrong,
    borderRadius: radius.fieldTight,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  repsTagLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    letterSpacing: 0.4,
    color: color.inkMuted,
  },
  stepperBox: {
    backgroundColor: color.sunken,
    borderRadius: radius.fieldTight,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperGlyph: { fontFamily: 'Inter_500Medium', fontSize: 17, color: color.ink },
  miniField: {
    flex: 1,
    backgroundColor: color.sunken,
    borderRadius: radius.fieldTight,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 7,
  },
  // The whole value area is now one tap target that opens `ValueEditSheet` —
  // no more −/+ boxes crammed into a 22px-tall row.
  miniValueTap: {
    marginTop: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
    backgroundColor: color.surface,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniValue: { color: color.ink, fontSize: 12.5, textAlign: 'center' },
  miniDisabled: { color: color.inkGhostest, fontSize: 12.5, marginTop: 9, textAlign: 'center' },
  statCard: {
    flex: 1,
    backgroundColor: color.surface,
    borderRadius: radius.cardTight,
    borderWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  mediaCaption: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(20,20,22,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoBadgeGlyph: { color: color.darkInk, fontSize: 8, marginLeft: 1 },
  spacer: { height: space.gutter },
});
