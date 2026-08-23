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
import { useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import type { MediaType } from '@/domain/types';
import { color, mediaPlaceholder, radius, size, space } from '@/theme/tokens';
import { type as t } from '@/theme/type';

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
      <Pressable onPress={onBack} hitSlop={16}>
        <Text style={{ fontSize: 22, lineHeight: 26, color: color.ink }}>←</Text>
      </Pressable>
      {action ?? <View />}
    </View>
  );
}

/** The tappable mono-label shape a `ScreenHeader` action usually is — "Edit",
 *  "Save", and so on. */
export function HeaderAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={12}>
      <MonoLabel tone={color.inkMuted}>{label}</MonoLabel>
    </Pressable>
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
    <Pressable
      onPress={onPress}
      style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}
    >
      <MonoLabel tone={active ? color.darkInk : color.inkMuted}>{label}</MonoLabel>
      {count != null && (
        <MonoLabel tone={active ? color.darkMuted : color.inkGhostest}>{String(count)}</MonoLabel>
      )}
    </Pressable>
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
      <Pressable onPress={onPress} style={[styles.card, style]}>
        {children}
      </Pressable>
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
  const Comp = onPress ? Pressable : View;
  return (
    <Comp onPress={onPress as () => void} style={[styles.sunkenRow, style]}>
      {children}
    </Comp>
  );
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
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.primaryButton, disabled && { opacity: 0.35 }, style]}
    >
      <Text style={styles.primaryLabel}>{label}</Text>
    </Pressable>
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
    <Pressable onPress={onPress} style={[styles.secondaryButton, style]}>
      <Text style={styles.secondaryLabel}>{label}</Text>
    </Pressable>
  );
}

/** The dark circular `+` on 1a and 1e. */
export function AddCircle({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.addCircle}>
      <Text style={{ color: color.darkInk, fontSize: 20, lineHeight: 22 }}>+</Text>
    </Pressable>
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
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
      style={({ pressed }) => [
        styles.iconButton,
        tintBg != null && { backgroundColor: tintBg },
        tintBorder != null && { borderColor: tintBorder },
        pressed && styles.iconButtonPressed,
        disabled && { opacity: 0.35 },
        style,
      ]}
    >
      {children}
    </Pressable>
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
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={({ pressed }) => [
        styles.playButton,
        pressed && styles.iconButtonPressed,
        disabled && { opacity: 0.3 },
      ]}
    >
      <View style={styles.playTriangle} />
    </Pressable>
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
      <Pressable
        onPress={() => onChange(clamp(value - step))}
        disabled={value <= min}
        style={[styles.stepperBox, { width: box, height: box }, value <= min && { opacity: 0.3 }]}
      >
        <Text style={styles.stepperGlyph}>−</Text>
      </Pressable>
      <Text
        style={[
          large ? t.statFigure : t.monoValue,
          large && { fontSize: 20, lineHeight: 24 },
          { color: color.ink, minWidth: large ? 56 : 44, textAlign: 'center' },
        ]}
      >
        {format(value)}
      </Text>
      <Pressable
        onPress={() => onChange(clamp(value + step))}
        disabled={value >= max}
        style={[styles.stepperBox, { width: box, height: box }, value >= max && { opacity: 0.3 }]}
      >
        <Text style={styles.stepperGlyph}>+</Text>
      </Pressable>
    </View>
  );
}

/**
 * The Work / Rest / Reps field in a builder row: mono micro-label above a
 * `− value +` row.
 *
 * The buttons are 22px so three of these fit across a phone without squeezing
 * out the value, and they carry `hitSlop` to bring the real touch target to
 * roughly 38px. Tapping the value itself does nothing — the arrows are the
 * whole interaction, which is what keeps the row readable at a glance.
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
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const atMin = value <= min;
  const atMax = value >= max;

  return (
    <View style={[styles.miniField, style]}>
      <MonoLabel tone={color.inkGhost} style={{ fontSize: 9 }}>
        {label}
      </MonoLabel>

      {disabled ? (
        <Text style={[t.monoValue, styles.miniDisabled]}>{disabledValue}</Text>
      ) : (
        <View style={styles.miniRow}>
          <Pressable
            hitSlop={8}
            disabled={atMin}
            onPress={() => onChange(clamp(value - step))}
            style={[styles.miniButton, atMin && { opacity: 0.25 }]}
          >
            <Text style={styles.miniGlyph}>−</Text>
          </Pressable>

          <Text style={[t.monoValue, styles.miniValue]} numberOfLines={1}>
            {format(value)}
          </Text>

          <Pressable
            hitSlop={8}
            disabled={atMax}
            onPress={() => onChange(clamp(value + step))}
            style={[styles.miniButton, atMax && { opacity: 0.25 }]}
          >
            <Text style={styles.miniGlyph}>+</Text>
          </Pressable>
        </View>
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
  pillActive: { backgroundColor: color.inkStrong },
  pillInactive: { borderWidth: 1, borderColor: color.hairlineStrong },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.hairline,
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
    backgroundColor: color.inkStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: { fontFamily: 'Archivo_600SemiBold', fontSize: 14, color: color.darkInk },
  secondaryButton: {
    height: size.primaryButton,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: { fontFamily: 'Archivo_500Medium', fontSize: 14, color: color.inkMuted },
  addCircle: {
    width: size.addCircle,
    height: size.addCircle,
    borderRadius: size.addCircle / 2,
    backgroundColor: color.inkStrong,
    alignItems: 'center',
    justifyContent: 'center',
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
  iconButtonPressed: { opacity: 0.5 },
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
  saveGlyph: { fontFamily: 'Archivo_600SemiBold', fontSize: 18, color: color.softGreenIcon },
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
    backgroundColor: color.inkStrong,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontFamily: 'Archivo_600SemiBold',
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
  stepperGlyph: { fontFamily: 'Archivo_500Medium', fontSize: 17, color: color.ink },
  miniField: {
    flex: 1,
    backgroundColor: color.sunken,
    borderRadius: radius.fieldTight,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 7,
  },
  miniRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  miniButton: {
    width: 27,
    height: 27,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniGlyph: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 15,
    lineHeight: 18,
    color: color.ink,
  },
  miniValue: { color: color.ink, fontSize: 12.5, flex: 1, textAlign: 'center' },
  miniDisabled: { color: color.inkGhostest, fontSize: 12.5, marginTop: 9, textAlign: 'center' },
  statCard: {
    flex: 1,
    backgroundColor: color.surface,
    borderRadius: radius.cardTight,
    borderWidth: 1,
    borderColor: color.hairline,
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
