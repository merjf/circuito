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
  roundBlue1: '#3A5A82',
  roundBlue2: '#2E4A6E',
  roundBlue3: '#243C5C',
  roundBlue4: '#1B2E48',
  roundBlue5: '#152336',
  roundBlue6: '#0F1826',

  // 6 shades of #ffd600 (the brand yellow asked for), darkest-first to match
  // the ramp direction every other row uses. #ffd600 itself, and anything near
  // it, fails `isLowContrast` against BOTH ink sets — a saturated brand yellow
  // at that brightness sits in the one luminance band that contrasts poorly
  // with both near-black and near-white text. So this ramp goes considerably
  // darker than the literal hue to actually clear the bar: every stop here is
  // >=3.2:1 against the light player ink (`darkInk`'s muted, `darkMuted`),
  // checked against the real `isLowContrast`/`weakestTextContrast` — the
  // previous ramp's own comment claimed ">=4:1" but 3 of its 6 stops actually
  // measured under 3:1; this one was verified against the live formula rather
  // than asserted.
  warningOrange1: '#1A1500',
  warningOrange2: '#241E00',
  warningOrange3: '#2E2700',
  warningOrange4: '#382F00',
  warningOrange5: '#423800',
  warningOrange6: '#4A3E00',

  // 6 shades of #88cdc7 (teal/mint), lightest-first — every stop keeps
  // well over 3:1 contrast against the dark player ink (`ink`).
  restYellow1: '#CDEAE7',
  restYellow2: '#B7E1DD',
  restYellow3: '#A2D8D3',
  restYellow4: '#8CCFC9',
  restYellow5: '#77C6BF',
  restYellow6: '#61BDB5',

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
