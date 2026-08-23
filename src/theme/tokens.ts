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
  canvas: '#FBFAF8',
  surface: '#FFFFFF',
  sunken: '#F1F0ED',
  restCanvas: '#F2F1EE',

  ink: '#1B1B1D',
  inkStrong: '#141416',
  inkMuted: '#6E6E6B',
  inkFaint: '#8A8A85',
  inkGhost: '#A3A29D',
  inkGhostest: '#B5B3AD',

  hairline: 'rgba(27,27,29,0.09)',
  hairlineStrong: 'rgba(27,27,29,0.14)',
  divider: 'rgba(27,27,29,0.07)',
  track: '#DEDCD7',
  accent: '#4A4A4A',

  // Incidental surfaces named in the screen specs
  blockHeader: '#F6F5F2',
  repeatedRound: '#ECEAE5',
  dragHandle: '#C9C7C2',

  // Soft tint pairs for the three action colours the UI-fixes pass asked for:
  // red = delete/bin, orange = edit, blue = the custom-colors accent. Each is
  // a pale fill + a slightly stronger border, in the same low-saturation
  // register as the rest of the palette rather than a stock system red/etc.
  softRed: '#F5E4E1',
  softRedBorder: 'rgba(178,66,53,0.35)',
  softRedIcon: '#B24235',
  softOrange: '#F7EADA',
  softOrangeBorder: 'rgba(178,116,32,0.35)',
  softOrangeIcon: '#B27420',
  softBlue: '#E2E9F5',
  softBlueBorder: 'rgba(58,90,168,0.35)',
  softBlueIcon: '#3A5AA8',
  softGreen: '#E3EEE2',
  softGreenBorder: 'rgba(63,127,58,0.35)',
  softGreenIcon: '#3F7F3A',

  // The Round color palette (Settings § Background colors) — a gradient of
  // soft, muted blues rather than the mixed near-black/green/maroon set it
  // replaced, light-to-dark so there is a real spread to pick from. Kept dark
  // enough throughout that `isLowContrast` still passes the light player ink
  // that sits on top of it.
  roundBlue1: '#3A5A82',
  roundBlue2: '#2E4A6E',
  roundBlue3: '#243C5C',
  roundBlue4: '#1B2E48',
  roundBlue5: '#152336',
  roundBlue6: '#0F1826',

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
  gutter: 20,
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
  card: 12,
  cardTight: 10,
  field: 7,
  fieldTight: 6,
  button: 10,
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
