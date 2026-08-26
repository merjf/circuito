/**
 * Design tokens — transcribed verbatim from the handoff
 * (design_handoff_interval_trainer/README.md § "Design tokens").
 *
 * Nothing in the app should hardcode a hex value. If a colour is missing here,
 * it is missing from the handoff — ask before inventing one.
 *
 * There is deliberately no red/green semantics anywhere. Work vs rest is
 * carried entirely by the background flip plus the mono WORK / REST label.
 */

export const color = {
  // Light screens
  canvas: '#F6F6F7',
  surface: '#FFFFFF',
  sunken: '#F0F0F1',
  restCanvas: '#F2F1EE',

  ink: '#14141A',
  inkStrong: '#141416',
  inkMuted: '#6B6B72',
  inkFaint: '#9A9AA1',
  inkGhost: '#C8C8CC',
  inkGhostest: '#C8C8CC',

  hairline: 'rgba(20,20,26,0.06)',
  hairlineStrong: 'rgba(20,20,26,0.14)',
  divider: 'rgba(20,20,26,0.08)',
  track: '#E3E3E6',
  accent: '#44444C',
  accentSoft: '#ECECEE',

  // Incidental surfaces named in the screen specs
  blockHeader: '#EEEEF0',
  repeatedRound: '#ECECEE',
  dragHandle: '#C8C8CC',

  // Soft tint pairs for the three action colours the UI-fixes pass asked for:
  // red = delete/bin, orange = edit, blue = the custom-colors accent. Each is
  // a pale fill + a slightly stronger border, in the same low-saturation
  // register as the rest of the palette rather than a stock system red/etc.
  softRed: '#FCE8E8',
  softRedBorder: 'rgba(214,69,69,0.35)',
  softRedIcon: '#D64545',
  // Legacy aliases kept for existing components. The v2 system deliberately
  // uses one neutral accent for every non-destructive state.
  softOrange: '#ECECEE',
  softOrangeBorder: 'rgba(68,68,76,0.28)',
  softOrangeIcon: '#44444C',
  softBlue: '#ECECEE',
  softBlueBorder: 'rgba(68,68,76,0.28)',
  softBlueIcon: '#44444C',
  // Save is the one non-destructive action that still needs its own color:
  // on the neutral fill every other icon button shares, "ready to save" and
  // "blocked — fix the problems" were nearly indistinguishable (both a grey
  // checkmark, differing only by a 0.45 opacity dip), which read as the
  // button not working at all. A real, low-saturation green — same register
  // as `softRed` — gives "ready" a color the dim state can visibly leave.
  softGreen: '#E3F1E7',
  softGreenBorder: 'rgba(45,133,79,0.32)',
  softGreenIcon: '#2D854F',

  // The three Settings § Background colors swatch rows, each its own hue so
  // the three states read apart from each other at a glance rather than as
  // near-identical shades of one color: Round stays the original slate blue,
  // End round warning is a burnt orange, Rest is a light, airy yellow.
  //
  // Round and Warning both ramp dark-to-darker, same as before — every stop
  // dark enough that `isLowContrast` passes the light player ink on top.
  // Rest ramps light-to-less-light instead, matching "light yellow" as
  // asked for: every stop still clears `isLowContrast`, just with the dark
  // player ink on top rather than the light one — `playerPalette.ts`
  // already picks whichever ink set actually contrasts, so this needed no
  // changes there.
  roundBlue1: '#2b82ec',
  roundBlue2: '#1f6fd9',
  roundBlue3: '#1a5ebf',
  roundBlue4: '#154ea6',
  roundBlue5: '#0f3e8c',
  roundBlue6: '#0a2e73',

  // Superseded 2026-08-25: the old ramp below was 6 shades of #ffd600 pushed
  // dark enough to clear contrast, which reads as near-black olive-brown, not
  // orange — see `warningGradientLight`/`warningGradientDark` below for what
  // the end-round warning actually renders now. Left in place (unreferenced)
  // rather than deleted, since it documents why the darkening was necessary
  // the first time a "light" version of this ramp is attempted again:
  // #ffd600 and anything near it fails `isLowContrast` against BOTH ink
  // sets, because a saturated brand yellow at that brightness sits in the
  // one luminance band that contrasts poorly with both near-black and
  // near-white text.
  warningOrange1: '#d6ac03',
  warningOrange2: '#c09600',
  warningOrange3: '#a88000',
  warningOrange4: '#906a00',
  warningOrange5: '#785400',
  warningOrange6: '#604000',

  warningGradientLight: '#FFE8CC',
  warningGradientDark: '#FFAD5C',

  // 6 shades of #88cdc7 (teal/mint), lightest-first — every stop keeps
  // well over 3:1 contrast against the dark player ink (`ink`).
  restYellow1: '#dbf0d3',
  restYellow2: '#c8e9b7',
  restYellow3: '#b5e09b',
  restYellow4: '#a2d77f',
  restYellow5: '#8fdf63',
  restYellow6: '#7cd747',
  
  // Dark (player)
  darkBg: '#141416',
  darkSurface: '#202023',
  darkInk: '#F5F4F1',
  darkInk2: '#C8C7C3',
  darkMuted: '#8E8E8A',
  darkFaint: '#5F5F5C',
  darkFainter: '#3F3F3D',
  darkHairline: 'rgba(245,244,241,0.12)',
  darkHairlineStrong: 'rgba(245,244,241,0.22)',
  darkButton: 'rgba(245,244,241,0.08)',
  darkChip: 'rgba(245,244,241,0.10)',
} as const;

/**
 * The two player palettes. The runner picks one by phase and the whole screen
 * cross-fades between them in 200ms — see `transition.themeFlip`.
 */
export const playerTheme = {
  work: {
    bg: color.darkBg,
    fill: color.darkSurface,
    hairline: color.darkHairlineStrong,
    ink: color.darkInk,
    ink2: color.darkInk2,
    muted: color.darkMuted,
    faint: color.inkMuted,
    button: color.darkButton,
    chip: color.darkChip,
  },
  rest: {
    bg: color.restCanvas,
    fill: 'rgba(27,27,29,0.05)',
    hairline: color.hairlineStrong,
    ink: color.ink,
    ink2: color.accent,
    muted: color.inkFaint,
    faint: color.inkGhost,
    button: 'rgba(27,27,29,0.07)',
    chip: 'rgba(27,27,29,0.07)',
  },
} as const;

/**
 * The shape of a player palette.
 *
 * Written out rather than inferred from `playerTheme.work`: that object is
 * `as const`, so inference gave every field a string-LITERAL type and a palette
 * built at runtime from a user-chosen colour could not be assigned to it. The
 * shipped palettes still satisfy this interface exactly.
 */
export interface PlayerPalette {
  bg: string;
  /**
   * Two-stop gradient for the screen background, when the state has one
   * (currently only `warning`). `bg` stays a single solid colour alongside
   * this — it is still used as a plain fill colour elsewhere (the centre
   * button's icon glyphs, `playTriangle`'s border colour), which a gradient
   * cannot stand in for. When absent, the screen renders `bg` as a flat fill,
   * same as before this field existed.
   */
  bgGradient?: readonly [string, string];
  fill: string;
  hairline: string;
  ink: string;
  ink2: string;
  muted: string;
  faint: string;
  button: string;
  chip: string;
}

export const space = {
  gutter: 22,
  gutterPlayer: 26,
  xs: 8,
  s: 9,
  sm: 12,
  m: 14,
  l: 18,
  xl: 22,
  xxl: 26,
} as const;

export const radius = {
  card: 14,
  cardTight: 10,
  field: 7,
  fieldTight: 6,
  button: 14,
  sheet: 18,
  pill: 20,
  segment: 2,
} as const;

export const size = {
  primaryButton: 54,
  playerControl: 56,
  stickyBar: 54,
  tabBar: 64,
  addCircle: 38,
  // Bumped from 26/34 (`PLAN_ui_fixes.md` UI pass) — the −/+ boxes read as too
  // small a tap target next to the rest of the button work below.
  stepper: 32,
  stepperSmall: 24,
  sheetStepper: 40,
  thumbnail: 52,
  mediaBlock: 200,
  circleAction: 26,
  progressSegment: 5,
  structureStrip: 5,
} as const;

export const shadow = {
  sheet: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.12,
    shadowRadius: 40,
    elevation: 24,
  },
  /** Soft resting-state lift for filled buttons (primary, add-circle, play).
   *  Deliberately subtle — this app's whole surface language is low-contrast
   *  and ink-toned, so this should read as "slightly raised," not glossy. */
  button: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
} as const;

export const transition = {
  /** Work <-> rest palette cross-fade. */
  themeFlip: 200,
  /** The draining background fill follows the timer, so it is never eased. */
  fillEasing: 'linear',
} as const;

/** Striped placeholder used wherever real user media is not yet attached. */
export const mediaPlaceholder = {
  stripeA: '#E9E7E3',
  stripeB: '#F4F3F0',
  angle: 45,
  stripeWidth: 8,
} as const;
