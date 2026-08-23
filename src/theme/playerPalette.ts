/**
 * The player's palette, which is now three states rather than two and may be
 * user-coloured.
 *
 * Two things changed on 2026-08-16. There is a `warning` state — the work
 * screen turns a distinct colour for the final seconds of a round, which
 * nothing did before — and the three backgrounds can be set by the user in
 * Settings.
 *
 * That second change breaks an assumption the shipped palettes were built on.
 * `theme/tokens.ts` pairs a fixed dark background with fixed light text, and a
 * fixed light background with fixed dark text; both pairings were chosen by
 * hand and are correct by construction. An arbitrary user colour has no such
 * guarantee — light text on a pale yellow is unreadable, and this is a screen
 * being read at arm's length, mid-effort, by someone out of breath.
 *
 * So ink is derived from the background rather than paired with it: whichever
 * of the two shipped ink sets contrasts better wins. No new colours are
 * invented — the user picks backgrounds, and the app picks which of its own two
 * text treatments to put on top.
 */

import type { Settings } from '../domain/settings';
import { color, playerTheme, type PlayerPalette } from './tokens';

/** Which face of the player is showing. */
export type PlayerState = 'work' | 'warning' | 'rest';

// ── Contrast ───────────────────────────────────────────────────────────────

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/**
 * WCAG relative luminance.
 *
 * The gamma expansion is not optional decoration: a naive average of the raw
 * channels calls mid-green darker than mid-blue, which is backwards, and green
 * is exactly where a "round colour" is likely to land — the app the user
 * screenshotted defaults to green.
 */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Which ink set to put on `background`.
 *
 * Compares the two candidates by actual contrast rather than testing luminance
 * against a threshold constant. Same answer in the easy cases, but it stays
 * correct if the ink tokens are ever adjusted — a hardcoded 0.179 would quietly
 * become wrong the day someone darkens `darkInk`.
 */
export function inkSetFor(background: string): 'light' | 'dark' {
  const onLight = contrastRatio(background, color.ink);
  const onDark = contrastRatio(background, color.darkInk);
  return onDark >= onLight ? 'light' : 'dark';
}

/**
 * Contrast of the weakest *real* text on the screen against `background`.
 *
 * Measured on `muted` — the secondary lines like "Round 2 / 3" — rather than on
 * `ink`, because `ink` is never the problem: the two ink tokens are near-black
 * and near-white, so the better of them clears 3.9:1 against literally any
 * colour. A check on `ink` would be a warning that can never fire, which is
 * worse than no warning at all.
 *
 * `faint` is deliberately not measured either. It is ghost text by design and
 * sits at 2.26:1 on the app's own shipped rest background — a threshold that
 * flags the defaults is miscalibrated, not strict.
 */
export function weakestTextContrast(background: string): number {
  return contrastRatio(background, paletteFor(background).muted);
}

/**
 * True when secondary text on `background` falls below WCAG AA for large text.
 *
 * Calibrated so it never fires on what ships (5.60:1 on the dark player, 3.07:1
 * on the light rest screen) and does fire on saturated mid-tones, which is
 * exactly where derived text starts to struggle.
 *
 * Surfaced so the colour picker can warn rather than silently accept. Not
 * enforced: it is the user's app, and a colour they like is their call — but
 * they should be told.
 */
export function isLowContrast(background: string): boolean {
  return weakestTextContrast(background) < 3;
}

// ── Palettes ───────────────────────────────────────────────────────────────

function toHex(n: number): string {
  return Math.round(Math.max(0, Math.min(255, n)))
    .toString(16)
    .padStart(2, '0');
}

/** Blend `from` toward `to` by `amount` (0 = from, 1 = to). */
function mix(from: string, to: string, amount: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  return `#${a.map((v, i) => toHex(v + (b[i]! - v) * amount)).join('')}`;
}

/**
 * Build a palette around an arbitrary background.
 *
 * `ink` and `ink2` come from the shipped tokens — no new colours are invented
 * for the text the user actually reads. But `muted` and `faint` are *derived*
 * by blending that ink toward the background, and that is the part that matters
 * for an arbitrary colour.
 *
 * The shipped greys only work because they were chosen against near-black and
 * near-white. Put `darkMuted` (#8E8E8A) on the default amber warning colour and
 * it lands at 1.38:1 — present in the DOM, invisible in the gym. Blending
 * instead preserves the *relationship* the design intends, secondary text as a
 * softened version of primary, at whatever background it is given.
 *
 * The other values are translucent overlays of black or white rather than
 * opaque colours, so surfaces, hairlines and chips stay in the same colour
 * family as whatever the user chose instead of a grey that clashes with it.
 */
function paletteFor(background: string): PlayerPalette {
  const set = inkSetFor(background);
  const ink = set === 'light' ? color.darkInk : color.ink;
  const ink2 = set === 'light' ? color.darkInk2 : color.accent;

  // Ratios picked to land near the shipped palettes on the shipped
  // backgrounds, so switching custom colours on and choosing the current
  // colours is visually a no-op.
  const muted = mix(ink, background, 0.42);
  const faint = mix(ink, background, 0.68);

  if (set === 'light') {
    return {
      bg: background,
      fill: 'rgba(245,244,241,0.10)',
      hairline: color.darkHairlineStrong,
      ink,
      ink2,
      muted,
      faint,
      button: color.darkButton,
      chip: color.darkChip,
    };
  }

  return {
    bg: background,
    fill: 'rgba(27,27,29,0.05)',
    hairline: color.hairlineStrong,
    ink,
    ink2,
    muted,
    faint,
    button: 'rgba(27,27,29,0.07)',
    chip: 'rgba(27,27,29,0.07)',
  };
}

/**
 * The palette for a player state under the current settings.
 *
 * With `useCustom` off this returns the shipped `playerTheme` objects
 * unchanged — identity, not a reconstruction — so that leaving the switch alone
 * cannot possibly shift a pixel. The warning state has no shipped equivalent
 * (nothing changed colour there before), so it derives from the default warning
 * colour in both branches.
 */
export function playerPalette(state: PlayerState, settings: Settings): PlayerPalette {
  const { colors } = settings;

  if (!colors.useCustom) {
    if (state === 'work') return playerTheme.work;
    if (state === 'rest') return playerTheme.rest;
    return paletteFor(colors.warning);
  }

  if (state === 'work') return paletteFor(colors.round);
  if (state === 'rest') return paletteFor(colors.rest);
  return paletteFor(colors.warning);
}

/**
 * Which state the player should be showing.
 *
 * The warning state applies only to a timed work cue inside its final `lead`
 * seconds. It does not apply to a tap-gated cue, for the same reason the
 * warning *sound* does not: there is no known end to count down to.
 */
export function playerStateFor(args: {
  isRest: boolean;
  secondsRemaining: number | null;
  leadSeconds: number;
}): PlayerState {
  if (args.isRest) return 'rest';
  if (args.secondsRemaining === null) return 'work';
  return args.secondsRemaining <= args.leadSeconds && args.leadSeconds > 0 ? 'warning' : 'work';
}
