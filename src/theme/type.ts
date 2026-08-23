/**
 * Typography — from the handoff § "Typography".
 *
 * Two families only:
 *   Archivo       400/500/600/700 — UI and numerals
 *   IBM Plex Mono 400/500         — labels, counters, durations (always uppercase)
 *
 * Both are bundled via @expo-google-fonts (SIL OFL), loaded in app/_layout.tsx.
 * Timer digits always use tabular figures so they do not jitter as they count.
 */

import type { TextStyle } from 'react-native';

export const font = {
  regular: 'Archivo_400Regular',
  medium: 'Archivo_500Medium',
  semibold: 'Archivo_600SemiBold',
  bold: 'Archivo_700Bold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
} as const;

/** react-native equivalent of `font-variant-numeric: tabular-nums`. */
export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

const t = <T extends Record<string, TextStyle>>(styles: T) => styles;

export const type = t({
  /** Archivo 600 / 27 / 1.1 / -.02em */
  screenTitle: {
    fontFamily: font.semibold,
    fontSize: 27,
    lineHeight: 30,
    letterSpacing: -0.54,
  },
  /** Archivo 600 / 25 / 1.15 / -.02em */
  detailTitle: {
    fontFamily: font.semibold,
    fontSize: 25,
    lineHeight: 29,
    letterSpacing: -0.5,
  },
  /** Archivo 600 / 16 / 1.25 */
  cardTitle: { fontFamily: font.semibold, fontSize: 16, lineHeight: 20 },
  /** Archivo 500 / 13 / 1.35 */
  exerciseRow: { fontFamily: font.medium, fontSize: 13, lineHeight: 17.5 },
  /** Archivo 400 / 13 / 1.6 */
  body: { fontFamily: font.regular, fontSize: 13, lineHeight: 21 },
  bodySmall: { fontFamily: font.regular, fontSize: 12.5, lineHeight: 19 },

  /** Plex Mono 500 / 10 / uppercase / .12em */
  monoLabel: {
    fontFamily: font.monoMedium,
    fontSize: 10,
    lineHeight: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  /** Plex Mono 500 / 9.5 / uppercase / .14em — "Up next", tab bar */
  monoLabelTiny: {
    fontFamily: font.monoMedium,
    fontSize: 9.5,
    lineHeight: 9.5,
    letterSpacing: 1.33,
    textTransform: 'uppercase',
  },
  /** Plex Mono 500 / 10 / uppercase / .22em — the WORK / REST / PREPARE label */
  monoPhase: {
    fontFamily: font.monoMedium,
    fontSize: 10,
    lineHeight: 10,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
  },
  /** Plex Mono 500 / 11–13 */
  monoValue: { fontFamily: font.monoMedium, fontSize: 12, lineHeight: 14, ...tabular },
  monoValueLarge: { fontFamily: font.monoMedium, fontSize: 13, lineHeight: 15, ...tabular },
  monoValueSmall: { fontFamily: font.monoMedium, fontSize: 11, lineHeight: 13, ...tabular },

  /** Player 1h — Archivo 600 / 110 / .88 / -.055em. Carries the screen. */
  playerTimer: {
    fontFamily: font.semibold,
    fontSize: 110,
    lineHeight: 97,
    letterSpacing: -6.05,
    ...tabular,
  },
  /**
   * The unit that follows a gated cue's number — "12 reps", "1.5 km" — nested
   * inside `playerTimer` so the two share a baseline.
   *
   * A quarter of the number's size, and mono rather than Archivo: the number
   * is the reading and the unit is the label on it, and at 110pt anything
   * closer in weight competes for the same glance.
   */
  playerTimerUnit: {
    fontFamily: font.mono,
    fontSize: 26,
    letterSpacing: 0,
  },
  /** Rest 1j — Archivo 600 / 128 / .85 / -.055em (mock variant only). */
  restTimer: {
    fontFamily: font.semibold,
    fontSize: 128,
    lineHeight: 109,
    letterSpacing: -7.04,
    ...tabular,
  },
  /** Player exercise name — Archivo 600 / 27 / 1.22 / -.015em, up to 3 lines. */
  playerExercise: {
    fontFamily: font.semibold,
    fontSize: 27,
    lineHeight: 33,
    letterSpacing: -0.4,
  },
  /** Summary stat figures — Archivo 600 / 26, tabular. */
  statFigure: { fontFamily: font.semibold, fontSize: 26, lineHeight: 30, ...tabular },
});

/**
 * Nothing on the player may render below 10px — it has to read at arm's length
 * from a gym floor. Guard rail for review, not enforced at runtime.
 */
export const MIN_PLAYER_FONT_SIZE = 10;
