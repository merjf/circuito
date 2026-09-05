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
  /** For text and marks that are de-emphasised but still have to be READ.
   *  Distinct from `inkGhost`/`inkGhostest`, which are decorative (placeholder
   *  text, future calendar cells, grid rules) and stay at #C8C8CC. Added
   *  2026-08-26 (PLAN_ui_polish.md §2b) rather than editing either ghost
   *  token's value, since `inkGhost` also feeds `playerTheme.rest.faint` and
   *  changing it would silently change the player palette. 3.18:1 on canvas —
   *  clears WCAG's 3:1 floor for meaningful non-text marks. */
  inkDisabled: '#8A8A90',

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
  card: 18,
  cardTight: 14,
  field: 10,
  fieldTight: 8,
  button: 16,
  sheet: 24,
  pill: 20,
  segment: 3,
} as const;

export const size = {
  primaryButton: 54,
  playerControl: 56,
  stickyBar: 54,
  // 64 -> 72: the icons sat almost against the bar's top hairline. The extra
  // 8px is breathing room ABOVE the icon (see the `item` paddingTop in
  // `app/(tabs)/_layout.tsx`), not a taller label area.
  tabBar: 72,
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

/** Cross-platform depth scale. See PLAN_ui_polish.md §3 for the full
 *  reasoning behind this shape — short version below.
 *
 *  Geometry (offset + radius) is FROZEN per level and never animated: iOS
 *  rasterises a layer shadow's alpha channel offscreen on any frame where
 *  shadowRadius/shadowOffset/bounds change (RN exposes no `shadowPath` to
 *  skip that), so animating shadow *geometry* at 60fps is the expensive
 *  thing. `shadowOpacity` is not geometry — with offset+radius frozen it's a
 *  free GPU composite. Android `elevation` has no opacity equivalent and
 *  quantises to a handful of steps on many OEM skins, so it moves in
 *  discrete steps, never tweened.
 *
 *  Only `shadowOpacity` (iOS) and stepped `elevation` (Android) animate.
 *  `transform` (scale + translateY) carries the depth read the eye actually
 *  notices.
 *
 *  Pure black at low opacity, no tinted shadows — this app's whole surface
 *  language is neutral and a coloured shadow would be the first thing in it
 *  that isn't. */
export const elevation = {
  /** Flat. Sunken rows, chips, icon buttons, anything inset. */
  e0: { shadowColor: '#000', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
  /** Resting cards, stat cards, list rows. You notice the edge lift off the
   *  canvas, not the shadow. */
  e1: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 1 },
  /** Filled buttons at rest (primary, add-circle, play). ~ today's shadow.button. */
  e2: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  /** Raised: pressed card, tab bar, toast, sticky bar, the row being dragged. */
  e3: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.14, shadowRadius: 16, elevation: 8 },
  /** Overlays: sheets, dialogs, exercise picker. */
  e4: { shadowColor: '#000', shadowOffset: { width: 0, height: -12 }, shadowOpacity: 0.14, shadowRadius: 40, elevation: 24 },
} as const;

/** The scalar forms the animated press states read, so the static and
 *  animated paths can never drift apart. */
export const elevationOpacity = { e0: 0, e1: 0.05, e2: 0.08, e3: 0.14, e4: 0.14 } as const;
export const elevationLevel = { e0: 0, e1: 1, e2: 3, e3: 8, e4: 24 } as const;

/**
 * @deprecated Use `elevation` instead (e2 ~= old `button`, e4 ~= old `sheet`).
 * Kept as an alias for one release so nothing mid-migration breaks; delete
 * once every call site has moved to `elevation`.
 */
export const shadow = {
  sheet: elevation.e4,
  button: elevation.e2,
} as const;

/**
 * Motion tokens. Previously inline magic numbers inside `usePressAnimation`
 * (80/120ms, damping 14, stiffness 260) — lifted out so the whole app shares
 * one feel and one place to tune it. Entrances and layout changes deliberately
 * use short timed transitions: they acknowledge a change without the vertical
 * overshoot that made lists and sheets feel constantly in motion.
 */
export const motion = {
  pressIn: { duration: 90 },
  pressOut: { duration: 140 },
  enter: { duration: 160 },
  /** ms per item, entrance stagger. */
  enterStagger: 20,
  /** items after which stagger stops accumulating. */
  enterStaggerMax: 4,
  layout: { duration: 140 },
  sheetIn: { duration: 160 },
  sheetOut: { duration: 120 },
  /** Hold before a drag activates. See PLAN_ui_polish.md §7.1 for why 350. */
  dragHold: 350,
  /** Work <-> rest palette cross-fade. Moved here from `transition`, which
   *  keeps `themeFlip` exported as an alias since `playerPalette.ts` and the
   *  runner read it from there. */
  themeFlip: 29,
} as const;

/** Press geometry: how far things move, not how long. */
export const press = {
  scaleButton: 0.96,
  /** Large surfaces need far less scale to read. */
  scaleCard: 0.985,
  scaleStepper: 0.90,
  /** The row you're holding during a drag. */
  scaleDrag: 1.03,
  liftY: -2,
  sinkY: 1,
  /** Raised from 0.85 — with real depth carrying the feedback, the opacity
   *  dip can back off. */
  opacity: 0.92,
} as const;

export const transition = {
  /** Work <-> rest palette cross-fade. Alias of `motion.themeFlip`. */
  themeFlip: motion.themeFlip,
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
