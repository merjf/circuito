# PLAN — UI polish pass: elevation, radii, motion, semantic haptics

**Date:** 2026-08-26 (rev 3)
**Status:** plan only — nothing implemented yet
**Scope:** presentation layer only. No data model, no navigation, no business logic.
**Environment (verified):** Expo 57, RN 0.86.2, **New Architecture ON** (`app.json:newArchEnabled: true`), Reanimated **4.5.1**, RNGH **2.32.0**, `expo-haptics` 57.

---

## 0. Decisions

| Question | Decision |
| --- | --- |
| How far to push the visual language | **Elevation only.** Palette, hairlines, accent and player colours unchanged. |
| What "hovering animation" means on touch | **All four**: press lift/sink, entrance/scroll-in, resting float, layout transitions |
| Haptics depth | **Semantic scale** (tap / select / confirm / success / warning / error). Every raw `Pressable` migrates onto the shared primitive. No Settings toggle. |
| Contrast | Originally out of scope; **rev 2 moves the `inkGhostest` legibility fix in as Phase 1b**, with the tab-bar icon/label tone split decided (rev 3). |
| Drag-to-reorder | **rev 2:** long-press to select (with visible + haptic confirmation), then drag; layout transitions suspended for the whole list while dragging. |

### What "elevation only" still rules out

No changes to `color.ink`, `inkStrong`, `inkMuted`, `inkFaint`, `hairline*`,
`divider`, `accent`, `soft*`, the three gradient ramps, or either player
palette. Phase 1b is a **single surgical legibility fix**, not a contrast pass —
it repoints three call sites that are using a decorative token to carry
meaningful UI. Everything else in this plan is geometry, depth or motion.

---

## 1. Baseline audit

Read: `src/theme/*`, all 11 files in `src/components/`, all 14 screens under `app/`.

### 1.1 What already works

- `src/theme/tokens.ts` is a real token file and **nothing in the app hardcodes a
  hex.** A radius or shadow change there propagates app-wide for free.
- `AnimatedPressable` / `RepeatingPressable` already give buttons a Reanimated
  press animation and a light haptic, with a **synchronous-throw guard** around
  `expo-haptics` that fixed a real shipped bug.
- Overlays are funnelled through exactly five primitives. Zero `Alert.alert`,
  zero hand-rolled `Modal` outside those five.
- `DraggableList` measures variable row heights on the UI thread — a genuinely
  good implementation that most apps get wrong.

### 1.2 Gaps

| # | Gap | Evidence |
| --- | --- | --- |
| G1 | Depth is one hardcoded `shadow.button`, used on 3 elements. No scale, no semantics. | `tokens.ts`; used at `ui.tsx:1111,1130,1199` |
| G2 | Cards, stat cards, rows, tab bar, toast, `ConfirmDialog` and `ActionSheet` panels are all completely flat. | `styles.card` / `styles.statCard` have `borderWidth: 0` and no shadow |
| G3 | Radii are conservative (7–14px). | `radius` in `tokens.ts` |
| G4 | Nothing lifts or sinks on press. | `usePressAnimation` animates `scale` + `opacity` only |
| G5 | No entrance motion anywhere. | zero `entering=` / `FadeIn` / `LinearTransition` in the repo |
| G6 | Sheets/dialogs use OS `Modal animationType`, so their motion can't be tuned and doesn't match the in-app spring. | `ConfirmDialog:47`, `ActionSheet:50` (`fade`); `StepEditSheet:84`, `ValueEditSheet:45`, `ExercisePicker:80` (`slide`) |
| G7 | List mutations (add/delete/reorder) jump instantly. | no layout transitions |
| G8 | **14 raw `Pressable`s across 10 screens** have no press animation and no haptic. | table in §5.4 |
| G9 | `Card` and `SunkenRow` pass `haptic={false}` — the biggest tap targets in the app are silent. | `ui.tsx:443,466` |
| G10 | One haptic flavour for everything. Deleting a training feels identical to opening a picker. | single `ImpactFeedbackStyle.Light` call site |

### 1.3 Three new findings from this review — read these first

**F1 — the press animation currently animates the button's *contents*, not the button.**

This is the most important thing in the document, and it changes the shape of
Phase 2.

`AnimatedPressable` renders:

```
<Pressable style={style}>                                    ← paints bg/border/radius/shadow
  <AnimatedView style={[layoutOnlyStyle(style), pressStyle]}>  ← carries scale + opacity
    {children}
  </AnimatedView>
</Pressable>
```

`layoutOnlyStyle()` strips every paint key (`PAINT_KEYS`) from the inner node —
which is correct, and is what stops semi-transparent borders double-painting.
But it means the node carrying `scale` and `opacity` **has no background, no
border and no radius**. So when you press `PrimaryButton` today, the dark
`accent` fill and its rounded border sit perfectly still while the white label
shrinks to 96% and fades to 85%.

This is a side effect of the 2026-08-25 flex fix, which moved `style` from the
inner node to the outer one to fix `ConfirmDialog`'s collapsed action buttons.
That fix was right. What it didn't do was move the *animation* along with the
paint. The result is a press feedback that reads as vague — the button doesn't
respond, its text does — and it is very likely part of why this whole polish
pass got asked for.

**Consequence:** converting the outer node to an animated component is not an
extra cost we pay to get shadows. It is the fix for an existing regression, and
shadows come along for free once it's done. See §3.

**F2 — a cancelled drag leaves a row stuck in the dragged state.**

`DraggableList.tsx` resets `activeIndex.value = -1` and calls `onCommit` inside
`.onEnd()` only. RNGH does **not** fire `onEnd` when a gesture is cancelled —
it fires `onFinalize`. So if the drag is interrupted (a parent ScrollView wins
the responder, the screen navigates away, an incoming call), `activeIndex` stays
pinned at that row and `draggingIndex` stays set: the row keeps its raised
z-index and 0.96 opacity until the next successful drag. Latent today, more
visible once the row also carries an elevation. Fix in §7.

**F3 — the "long press" you asked for is already there, at a duration nobody can feel.**

`DraggableList.tsx:110` is `.activateAfterLongPress(120)`. 120ms is below the
threshold at which a hold registers as deliberate — it reads as "the drag
started immediately, and sometimes it doesn't". There is no visual or haptic
confirmation of activation either. §7 turns this into a real long-press.

---

## 2. Phase 1 — Tokens (`src/theme/tokens.ts`)

Pure token work, no component changes, independently shippable, and visible on
its own.

### 2.1 Radius scale

```
card       14 → 18
cardTight  10 → 14
button     14 → 16
field       7 → 10
fieldTight  6 →  8
sheet      18 → 24
segment     2 →  3
pill       20 → 20   (unchanged — already fully round at 34px height)
```

The `sheet: 18 → 24` bump is what makes the bottom sheets read as current. The
`field`/`fieldTight` bump is what stops the stepper boxes and mini-fields
looking like a 2016 settings form.

**Do not route circles through `radius.*`.** `AddCircle`, `PlayButton`,
`videoBadge`, `moreDot` and the tab-bar knobs all compute `size / 2` and must
keep doing so.

**One thing to check by eye after this lands:** `Thumbnail` (`ui.tsx:1022`) at
52px with `radius.cardTight: 14` is a 27% corner ratio — that may look more like
a squircle than intended. If so, give `Thumbnail` its own `radius.thumbnail: 12`
rather than holding the whole scale back.

### 2.2 Elevation scale — replaces `shadow`

Keep the current `shadow` export as a deprecated alias for one release so
nothing breaks mid-migration, then delete it.

```ts
/** Cross-platform depth scale.
 *
 *  Geometry (offset + radius) is FROZEN per level and never animated — see
 *  PLAN_ui_polish.md §3.2 for why. Only `shadowOpacity` (iOS) and `elevation`
 *  (Android) move, and `elevation` moves in discrete steps.
 *
 *  Pure black at low opacity. No tinted shadows: this app's whole surface
 *  language is neutral and a coloured shadow would be the first thing in it
 *  that isn't. */
export const elevation = {
  /** Flat. Sunken rows, chips, icon buttons, anything inset. */
  e0: { shadowColor:'#000', shadowOffset:{width:0,height:0},  shadowOpacity:0,    shadowRadius:0,  elevation:0 },
  /** Resting cards, stat cards, list rows. You notice the edge lift off the
   *  canvas, not the shadow. */
  e1: { shadowColor:'#000', shadowOffset:{width:0,height:2},  shadowOpacity:0.05, shadowRadius:6,  elevation:1 },
  /** Filled buttons at rest (primary, add-circle, play). ~ today's shadow.button. */
  e2: { shadowColor:'#000', shadowOffset:{width:0,height:2},  shadowOpacity:0.08, shadowRadius:8,  elevation:3 },
  /** Raised: pressed card, tab bar, toast, sticky bar, the row being dragged. */
  e3: { shadowColor:'#000', shadowOffset:{width:0,height:6},  shadowOpacity:0.14, shadowRadius:16, elevation:8 },
  /** Overlays: sheets, dialogs, exercise picker. */
  e4: { shadowColor:'#000', shadowOffset:{width:0,height:-12},shadowOpacity:0.14, shadowRadius:40, elevation:24 },
} as const;

/** The scalar forms the animated press states read, so the static and animated
 *  paths can never drift apart. */
export const elevationOpacity = { e0:0, e1:0.05, e2:0.08, e3:0.14, e4:0.14 } as const;
export const elevationLevel   = { e0:0, e1:1,    e2:3,    e3:8,    e4:24   } as const;
```

**Three RN constraints that will bite if ignored:**

1. A shadowed node needs an **opaque `backgroundColor`**. On Android `elevation`
   draws nothing without one; on iOS the shadow is traced from the content's
   alpha instead of the box, producing a shadow shaped like the label. `Card`,
   `StatCard` and `SunkenRow` already set one — any *new* elevated node must too.
2. **`overflow: 'hidden'` cancels the Android shadow.** If a card ever clips a
   child image, the clip goes on an inner wrapper, not the elevated node.
3. Android `elevation` also changes **z-order.** Rows in a `ScrollView` are fine;
   anything absolutely positioned beside an elevated sibling needs a look.

**Noted, not adopted:** RN 0.76+ on the New Architecture (which this app is on)
supports the web-style `boxShadow` string prop, which gives identical rendering
on both platforms, supports multiple stacked shadows, and has no Android z-order
side effect. It is **not animatable by Reanimated**, so it can't carry the press
states. It is worth revisiting later for the *static-only* surfaces (tab bar,
toast, sheets) if Android elevation fidelity disappoints. Do not mix the two on
the same node.

### 2.3 Motion tokens

Motion currently lives as inline magic numbers inside `usePressAnimation`
(80/120ms, damping 14, stiffness 260). Lift it out so the whole app shares one
feel and one place to tune it.

```ts
export const motion = {
  pressIn:   { duration: 90 },
  pressOut:  { damping: 15, stiffness: 280, mass: 0.8 },
  enter:     { duration: 240 },
  enterStagger: 30,      // ms per item
  enterStaggerMax: 8,    // items after which stagger stops accumulating
  layout:    { damping: 18, stiffness: 200 },
  sheetIn:   { damping: 20, stiffness: 190 },
  sheetOut:  { duration: 180 },
  /** Hold before a drag activates. See §7.1 for why 350. */
  dragHold:  350,
  themeFlip: 200,        // moved from `transition`, aliased back
} as const;
```

Keep `transition.themeFlip` exported as an alias — `playerPalette.ts` and the
runner read it.

### 2.4 Press geometry tokens

```ts
export const press = {
  scaleButton:  0.96,   // today's default
  scaleCard:    0.985,  // large surfaces need far less scale to read
  scaleStepper: 0.90,   // today's RepeatingPressable value
  scaleDrag:    1.03,   // the row you're holding
  liftY:        -2,     // translateY for a "lift"
  sinkY:         1,     // translateY for a "sink"
  opacity:      0.92,   // raised from 0.85 — with real depth carrying the
                        // feedback, the opacity dip can back off
} as const;
```

---

## 2b. Phase 1b — the one contrast fix (moved in at your request)

**Not a contrast pass.** Three call sites are using `#C8C8CC` — a decorative
token — to carry text and marks that a user has to read. Measured contrast
ratios (WCAG 2.1, sRGB):

| Colour | on `canvas` #F6F6F7 | on `surface` #FFF | on `sunken` #F0F0F1 |
| --- | --- | --- | --- |
| `#C8C8CC` (today) | **1.54** | 1.67 | 1.46 |
| `#9A9AA1` (`inkFaint`) | 2.59 | 2.80 | 2.46 |
| `#8A8A90` (proposed `inkDisabled`) | **3.18** | 3.43 | **3.01** |
| `#6B6B72` (`inkMuted`) | **4.90** | 5.29 | 4.64 |

AA needs **4.5:1** for text under 18px and **3:1** for meaningful non-text marks.
1.54:1 is roughly "visible only on a good screen at full brightness".

### The constraint that decides the implementation

`inkGhost` and `inkGhostest` are **both** `#C8C8CC` today, and
`tokens.ts:148` wires `playerTheme.rest.faint = color.inkGhost`. **Changing
either token's value silently changes the player palette**, which is out of
scope. So Phase 1b adds one new token and repoints call sites; it does not
edit the value of any existing one.

```ts
/** For text and marks that are de-emphasised but still have to be READ.
 *  Distinct from `inkGhost`/`inkGhostest`, which are decorative (placeholder
 *  text, future calendar cells, grid rules) and stay at #C8C8CC. */
inkDisabled: '#8A8A90',
```

**Call sites to repoint (5 edits):**

| File:line | What | From | To |
| --- | --- | --- | --- |
| `app/(tabs)/_layout.tsx:98` | inactive tab icons **and** their 11px labels | `inkGhostest` | **split** — `inkDisabled` (icon) / `inkMuted` (label), see below |
| `app/reps/[trainingId].tsx:970` | "+ Add set" — a primary action in the logger | `inkGhost` | `inkFaint` |
| `app/reps/[trainingId].tsx:1239,1240` | logger column headers | `inkGhostest` | `inkFaint` |
| `src/components/ui.tsx:1255` | `miniDisabled` | `inkGhostest` | `inkDisabled` |
| `app/reps/[trainingId].tsx:1167` | timer label when `targetSeconds <= 0` | `inkGhostest` | `inkDisabled` |

**Tab bar — DECIDED: split the tone.** The icon and its label currently share
one `tone` value (`_layout.tsx:98`), which forces a single compromise on two
marks with different requirements: the icon is a **non-text** mark needing
3:1, the 11px label is **text** needing 4.5:1. Splitting them satisfies both
without flattening the active state.

```tsx
// app/(tabs)/_layout.tsx — TabItem
function TabItem({ label, focused, Icon }: {...}) {
  const iconTone  = focused ? color.accent : color.inkDisabled;  // 3.18:1 — clears 3:1 for a mark
  const labelTone = focused ? color.accent : color.inkMuted;     // 4.90:1 — clears AA for 11px text
  return (
    <View style={styles.item}>
      <Icon tone={iconTone} focused={focused} />
      <Text style={[t.monoLabelTiny, styles.label, { color: labelTone }]}>{label}</Text>
    </View>
  );
}
```

Why this is better than picking one value for both:

- **`inkDisabled` for both** would leave the label at 3.18:1 — a 2× improvement
  over today, but still short of AA for text that size. (This is roughly where
  iOS's own tab bars sit, which is not a standard worth matching here.)
- **`inkMuted` for both** clears AA everywhere but makes the inactive icons
  nearly as dark as the active one, so the active/inactive distinction has to
  rest almost entirely on the icon's `borderWidth` step (1.6 → 2.4, already
  implemented). The bar reads as four equally-weighted tabs.
- **Split** keeps the icon visibly lighter than the active `accent` (`#44444C`),
  so the "which tab am I on" read stays tonal, while the label — the thing
  you actually have to *read* — clears AA.

Four lines in `TabItem`, no token value changes, no other call sites affected.
Verify on device that the inactive labels don't now read as *active* at a
glance; if they do, the fallback is `inkDisabled` for both and accepting 3.18:1
on the label.

**Rejected for the tab bar:** darkening `color.inkGhostest` itself. It is also
carrying `StructureStrip`, the media caption, `history.tsx:398`'s future
calendar cells and `ui.tsx:424`, all of which are correctly decorative.

**Explicitly unchanged:** every placeholder (`placeholderTextColor`), the
future-date calendar cells (`history.tsx:398`), `StructureStrip`'s "No rest",
the media caption, and `color.dragHandle`. Those are decorative and `#C8C8CC`
is right for them.

---

## 3. Phase 2 — Depth and press feedback: the shadow problem, solved

This section replaces rev 1's §2.2, which hand-waved this.

### 3.1 What actually makes animated shadows expensive

Two separate problems, one per platform, and they need different answers.

**iOS.** Core Animation renders a layer shadow by rasterising the layer's alpha
channel offscreen and blurring it. If a `shadowPath` is set, that work is
skipped. **React Native does not expose `shadowPath`.** So any frame in which
`shadowRadius`, `shadowOffset`, or the layer's bounds change forces a fresh
offscreen rasterise + blur. Animating shadow *geometry* at 60fps on a view that
is also scaling is the expensive combination — and it's exactly what a naive
"animate from e1 to e3" implementation does.

**But `shadowOpacity` is not geometry.** With offset, radius and bounds frozen,
the rasterised shadow image is constant; changing its opacity is a cheap
compositing operation the GPU does for free. The cost problem disappears
entirely if the shadow's *shape* never moves.

**Android.** `elevation` feeds the RenderNode's outline-based shadow and *also*
its z-order. Tweening it per frame invalidates the shadow every frame, and on
several OEM skins it quantises to a handful of visible steps anyway — so you pay
for 60 interpolations and see 4. There's no opacity equivalent to fall back on.

### 3.2 The rule this yields

> **Freeze the shadow's geometry. Animate one scalar per platform:
> `shadowOpacity` on iOS, stepped `elevation` on Android. Let `transform`
> carry everything the eye actually reads as depth.**

Concretely, "lift" and "sink" are *mostly transforms*:

- **sink** = `scale → 0.96`, `translateY → +1`, `shadowOpacity → 0` — the button
  presses down into the surface and its shadow closes up underneath it.
- **lift** = `scale → 1.02`, `translateY → −2`, `shadowOpacity → e3` — the card
  comes toward you and its shadow deepens.

The shadow's blur radius and offset stay at the *rest* level's values in both
directions. Nobody has ever noticed that a real object's shadow doesn't blur
correctly during a 90ms press; everybody notices jank.

### 3.3 The structural change — and why it's worth it anyway (F1)

To animate anything on the node that paints, the outer `Pressable` has to be
animated. Per **F1**, that node is *also* the one that should have been carrying
the existing scale and opacity all along. So this is one change that fixes two
things:

```tsx
// module scope — NEVER inside the component body, or the whole subtree
// remounts on every render
const PressableBase = Animated.createAnimatedComponent(Pressable);

export function AnimatedPressable({ style, children, depth, ...rest }) {
  const press = usePressAnimation({ depth, ... });
  return (
    <PressableBase
      style={[style, press.animatedStyle]}   // paints AND animates
      onPressIn={...} onPressOut={...} {...rest}
    >
      <View style={layoutOnlyStyle(style)}>  {/* layout only — no animation */}
        {children}
      </View>
    </PressableBase>
  );
}
```

**Both `CLAUDE.md` invariants survive intact:**

- Full `style` still lands on the outer node → `flex: 1` from a parent row still
  resolves → the `ConfirmDialog` sliver regression stays fixed.
- The inner node still gets a layout-only copy → multi-child rows still arrange
  → paint props still render exactly once, so semi-transparent borders still
  don't double up.
- `PAINT_KEYS` is unchanged. It keeps doing its job for the same reason.

**Bonus:** the inner node stops being an `Animated.View` and becomes a plain
`View`. One fewer animated node per button, across ~60 call sites.

### 3.4 The animated style

```ts
const depthStyle = useAnimatedStyle(() => {
  const p = pressProgress.value;            // 0 = rest, 1 = pressed
  const shadowOpacity = interpolate(p, [0, 1], [restOpacity, pressOpacity]);
  return {
    transform: [
      { scale:      interpolate(p, [0, 1], [1, toScale]) },
      { translateY: interpolate(p, [0, 1], [0, toTranslateY]) },
    ],
    opacity: interpolate(p, [0, 1], [restAlpha, toOpacity]),
    shadowOpacity,
    // Android: two discrete states, not 60 interpolated ones.
    elevation: p > 0.5 ? pressLevel : restLevel,
  };
});
```

`pressProgress` is driven by `withTiming(1, motion.pressIn)` on press-in and
`withSpring(0, motion.pressOut)` on press-out — a **single** shared value, so
scale, translate, opacity and shadow can never desynchronise.

### 3.5 Traps specific to this change

1. **`disabled` + animated opacity collide.** `PrimaryButton` currently passes
   `disabled && { opacity: 0.35 }` in its style array. An animated `opacity` on
   the same node wins and the disabled dimming vanishes. Fix: feed the rest
   opacity into the worklet (`restAlpha = disabled ? 0.35 : 1`) rather than
   layering a static style.
2. **`shadowColor` must be present at rest, even at `shadowOpacity: 0`.** If it
   is absent, iOS has nothing to fade *in*. `e0` above sets it deliberately.
3. **Transparent-background buttons must not get depth.** `SecondaryButton` is
   an outline with no fill; a shadow under it traces the label. `depth: 'none'`
   is the default and stays the default.
4. **`hitSlop` lives on the outer node.** It already does; keep it there when
   spreading `...rest`.
5. **Don't animate `translateY` on anything inside a `position: absolute`
   overlay measured by its parent** — the sheets and the toast are static-depth
   only for this reason.
6. **Verify Reanimated 4.5 writes `shadowOpacity`/`elevation` on the UI thread**
   under the New Architecture on a real device before rolling it out to all
   call sites. If either falls back to a JS-thread commit, drop the shadow
   channel entirely and keep `transform`-only depth — the visual difference is
   small and the plan degrades gracefully.

### 3.6 Per-component assignment

| Component | Rest | Pressed | Motion | Note |
| --- | --- | --- | --- | --- |
| `Card` (`ui.tsx:432`) | e1 | e3 | **lift** (`scaleCard`, `liftY`) | + haptic `tap`, removing `haptic={false}` (G9) |
| `StatCard` (`ui.tsx:928`) | e1 | — | — | non-interactive |
| `SunkenRow` (`ui.tsx:452`) | **e0** | e0 | scale only | stays flat *on purpose* — it is the inset counterpart to `Card`. Haptic added. |
| `PrimaryButton` (`:473`) | e2 | e0 | **sink** | |
| `SecondaryButton` (`:495`) | e0 | e0 | scale only | outline, no fill → no shadow |
| `AddCircle` (`:512`) | e2 | e0 | **sink** | |
| `PlayButton` (`:764`) | e2 | e0 | **sink** | |
| `IconButton` family (`:533–717`) | e0 | e0 | scale only | at 44px, depth reads as smudge |
| `Stepper` / `MiniStepper` | e0 | e0 | scale only | |
| `FilterPill` (`:403`) | e0 | e0 | scale only | `select` haptic |
| Tab bar (`_layout.tsx:bar`) | e3, offset **upward** | — | — | floats over scrolling content |
| `Toast` | e3 | — | — | |
| `StepEditSheet`, `ValueEditSheet`, `ExercisePicker` | e4 | — | — | replaces `shadow.sheet` 1:1 |
| `ConfirmDialog` / `ActionSheet` panels | e4 | — | — | currently have **no** shadow at all |
| `DraggableList` selected row | e0 → **e3** | — | see §7 | replaces the bare `elevation: active ? 8 : 0`, adds the iOS half it's missing |
| Everything on `app/player/*` | e0 | e0 | scale only | see below |

**Why the player gets no depth:** its background is a user-selectable colour or
a gradient that changes per phase. A pure-black shadow over a saturated hue
reads as a rendering artefact, not as depth. Player controls get scale + haptic
and nothing else. Their radii are `size / 2` and unaffected by §2.1.

### 3.7 New primitive: `Surface`

`Card` and `StatCard` each hand-roll background + radius. Add one primitive both
wrap:

```tsx
<Surface level={0|1|2|3|4} radius="card"|"cardTight"|"sheet" onPress? depth? style? />
```

With `onPress` it composes `AnimatedPressable` with `depth="lift"`; without, a
plain `View`. `Card` and `StatCard` become thin wrappers, so **no screen call
sites change.** This is also the natural home for the `DestructiveButton` and
`IconButton size/shape` additions in §10.

---

## 4. Phase 3 — Semantic haptics

### 4.1 New module: `src/feedback/haptics.ts`

One entry point. Nothing else in the app imports `expo-haptics`.

```ts
export type Haptic =
  | 'none'
  | 'tap'      // Impact Light        — ordinary buttons, cards, rows
  | 'select'   // Selection           — pills, swatches, radio rows, slot crossings
  | 'pickup'   // Impact Medium       — drag activation (§7)
  | 'confirm'  // Impact Medium       — destructive CTAs, Start, irreversible taps
  | 'success'  // Notification Success — saved, logged, personal record
  | 'warning'  // Notification Warning — validation blocked, save disabled
  | 'error';   // Notification Error   — "Couldn't save", failed operation

export function haptic(kind: Haptic): void;
```

Requirements on the implementation:

1. **Keep the synchronous-throw guard** currently at `ui.tsx:135–144`. That
   `try/catch` is not defensive noise: an unlinked native module throws
   *before* returning a promise, inside `onPressIn`, which on Hermes release
   builds aborts the rest of the gesture and makes buttons look dead. Writing
   it once here means it can never be forgotten at a new call site.
2. **Throttle to ~40ms.** A fast double-tap, or a gesture that fires press-in
   twice, must not stack two impacts into one buzz.
3. **Callable from a worklet.** The drag gesture needs it; expose a
   `hapticFromWorklet(kind)` that wraps `runOnJS`, or mark the module
   `'worklet'`-safe.
4. **No Settings toggle** — explicitly out of scope per §0.

### 4.2 Wiring into the primitives

`AnimatedPressable` / `RepeatingPressable` gain `haptic?: Haptic`, replacing
today's `haptic?: boolean`. **Accept `boolean` for one migration pass**
(`true → 'tap'`, `false → 'none'`) so the 60+ existing call sites don't all have
to change in the same commit.

| Component | Haptic |
| --- | --- |
| `PrimaryButton`, `SecondaryButton`, `IconButton`, `PencilButton`, `MoreButton`, `AddCircle`, `HeaderAction` | `tap` |
| `Card`, `SunkenRow` | `tap` (**currently `false`** — G9) |
| `FilterPill`, radio rows, colour swatches, `ActionSheet` options | `select` |
| `BinButton`, `CancelButton`, destructive `ConfirmDialog` action | `confirm` |
| `SaveButton` (enabled) | `success`, fired on completion, not on press |
| `SaveButton` (blocked) | `warning` |
| `PlayButton` / player start | `confirm` |
| `RepeatingPressable` | `tap` on initial press; `select` on **every 3rd** repeat tick (~390ms). Today it fires none, deliberately — a buzz every 130ms is noise. Ship the every-3rd behind a single constant so backing it out is a one-line revert. |

### 4.3 Event-driven haptics (Phase 4 — not attached to a button)

| Event | Haptic | Where |
| --- | --- | --- |
| Training saved | `success` | `saveTraining` success path |
| Save failed | `error` | the "Couldn't save" dialog's mount |
| Set logged / checked | `success` | `app/reps/[trainingId].tsx:1177` |
| Personal record | `success` | `Toast` mount, when `title != null` |
| Delete confirmed | `confirm` | `ConfirmDialog` destructive branch |
| Drag pick-up / slot crossing / drop | `pickup` / `select` / `tap` | §7 |

**Deliberately out of scope, worth a later conversation:** haptic cues on player
phase transitions (work → warning → rest). The phone is usually in a pocket or
on a bench, and a triple-pulse at the end-round warning would be genuinely
useful where the sound cue isn't heard. It needs its own design and probably its
own setting, so it isn't here.

### 4.4 The 14 raw `Pressable` sites

All become `AnimatedPressable` or a shared primitive.

| File:line | What it is | Becomes | Haptic |
| --- | --- | --- | --- |
| `app/(tabs)/index.tsx:227` | search clear "×" | `IconButton` (small) | `tap` |
| `app/(tabs)/index.tsx:433` | last-session row | `Surface` / `SunkenRow` | `tap` |
| `app/(tabs)/index.tsx:456` | "Create your first training" empty state | `AnimatedPressable` | `tap` |
| `app/(tabs)/library.tsx:139` | search clear "×" | `IconButton` (small) | `tap` |
| `app/(tabs)/library.tsx:181` | sort-order control | `AnimatedPressable` | `select` |
| `app/(tabs)/library.tsx:194` | empty state | `AnimatedPressable` | `tap` |
| `app/(tabs)/library.tsx:307` | exercise row | `Surface` row, lift | `tap` |
| `app/(tabs)/history.tsx:242` | filter control | `AnimatedPressable` | `select` |
| `app/(tabs)/settings.tsx:154` | sound-picker row | `SunkenRow` | `select` |
| `app/(tabs)/settings.tsx:329` | colour swatch | `AnimatedPressable`, `toScale: 0.9` | `select` |
| `app/pick/equipment.tsx:64` | radio row | `AnimatedPressable` | `select` |
| `app/pick/exercise-type.tsx:62` | radio row | `AnimatedPressable` | `select` |
| `app/session/[id].tsx:116` | back "←" | `IconButton` (small, borderless) | `tap` |
| `app/session/[id].tsx:233` | hand-rolled destructive **Delete** CTA | **`DestructiveButton`** (new — §10) | `confirm` |

**`app/reps/[trainingId].tsx` (6 sites: 837, 969, 1055, 1077, 1154, 1177)** —
the mid-workout logger. All six get haptics (`tap` for round header / add set /
provenance toggle, `success` for the set checkbox at `:1177`, `select` for the
timer toggle at `:1154`), but the dense 3-column grid rows at `:1055`, `:1077`
and `:1177` get **`toScale: 1`** — a scale-down on a table row makes it wobble
against its neighbours. Use `toOpacity: 0.7` and the haptic to carry the
feedback there.

**`app/player/[trainingId].tsx` (6 sites: 364, 449, 459, 475, 486, 502)** —
haptics on all six, and this is where they matter most, because you're looking
away from the screen. `486` (centre play/pause) → `confirm`; `449`/`459`
(rest ±15s) → `select`; `475`/`502` (prev/skip) → `tap`; `364` (leave) → `tap`.
No elevation (§3.6). Note the ±15s buttons are duplicated between
`RestSheet.tsx` and `player/[trainingId].tsx:449–459` — the 2026-08-25 audit
called merging them legitimately hard, and this pass doesn't, but **both must
get the same haptic** or they'll diverge in feel.

---

## 5. Phase 5 — Entrance motion

```tsx
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';

<Animated.View
  key={item.id}
  entering={FadeInDown
    .duration(motion.enter.duration)
    .delay(Math.min(index, motion.enterStaggerMax) * motion.enterStagger)
    .reduceMotion(ReduceMotion.System)}
>
```

**Apply to:** `app/(tabs)/index.tsx` (training cards + the last-session row),
`app/(tabs)/library.tsx` (exercise rows), `app/(tabs)/history.tsx` (session rows
and the stat row), `app/session/[id].tsx` (summary stat cards),
`app/training/[id]/index.tsx` (block list).

**Do not apply to:** the player, the reps logger row grid, or anything inside a
sheet. Mid-workout screens must appear instantly; a 240ms fade on a set row you
just created reads as lag.

**Traps:**

- The `Math.min(index, 8)` cap is load-bearing. Without it a 40-exercise library
  takes 1.2s to finish appearing.
- Reanimated `entering` **re-fires when a virtualised row recycles.** Put it on
  a wrapper with a stable `key` tied to the item id, then verify by scrolling a
  long library up and down fast.
- **Reduced motion is required, not optional.** `.reduceMotion(ReduceMotion.System)`
  on every entrance and layout animation. Press scale/opacity may stay — it's
  sub-100ms feedback, not decoration. Add this rule to `CLAUDE.md`.

---

## 6. Phase 6 — Layout transitions

`LinearTransition.springify().damping(18).stiffness(200).reduceMotion(ReduceMotion.System)`

**Apply to:** `app/training/[id]/builder.tsx` (block add/delete/reorder),
`app/reps/[trainingId].tsx` (set add/delete, round expand/collapse at `:837`),
`app/(tabs)/library.tsx` (search/filter result changes), `app/(tabs)/history.tsx`
(filter changes).

The `DraggableList` interaction is handled in §7.3 rather than here.

---

## 7. Phase 7 — Drag to reorder: long-press to select

Rewrites `src/components/DraggableList.tsx`. This is the highest-risk item in
the plan and the one with the most behaviour change, so it gets the most detail.

### 7.1 Why 350ms, and why it lets the gesture leave the handle

The file's own docstring currently argues the gesture must stay on the 14px
handle, because *"dragging from anywhere would fight the parent ScrollView …
and would also swallow taps meant for the −/+ buttons."* That argument is sound
**at the current 120ms hold** (`DraggableList.tsx:110`) and stops being sound at
350ms:

- **vs. the ScrollView:** a scroll begins with vertical movement within the
  first ~50–100ms. RNGH cancels a `activateAfterLongPress` pan as soon as the
  finger moves past the slop before the timer fires, so the scroll wins
  automatically. At 120ms the two are close enough to race; at 350ms they
  aren't.
- **vs. child taps:** a tap is finger-down-to-finger-up in well under 200ms. It
  completes and dispatches long before the hold timer fires.

So: **the pan moves to the whole row at 350ms**, and the handle keeps a second,
immediate pan for anyone who's learned it's there.

```ts
const holdPan = Gesture.Pan().activateAfterLongPress(motion.dragHold) /* row */;
const grabPan = Gesture.Pan()                                        /* handle */;
// composed so whichever wins, wins outright
const rowGesture = Gesture.Exclusive(grabPan, holdPan);
```

Both branches call the same `begin` / `update` / `finish` worklets — write those
once and share them, or the two paths will drift.

### 7.2 The selection state — what "I'm selecting that item" looks like

Fired the instant the hold completes (`onStart`), before any movement:

| Channel | Rest | Selected |
| --- | --- | --- |
| Haptic | — | **`pickup`** (Impact Medium) — the confirmation you asked for |
| Scale | 1 | `press.scaleDrag` (1.03) |
| Elevation | e0 | **e3** (both platforms — today it's Android `elevation: 8` only, so iOS gets nothing) |
| Opacity | 1 | **1** — today it dips to `0.96`; **remove that.** A selected item should be *more* present, not less. |
| Handle lines | `color.dragHandle` | `color.accent` (`handleLineActive` already exists — repoint it) |
| Radius | inherited | inherited |

`withTiming(…, { duration: 120 })` into the selected state so it reads as a
deliberate pick-up rather than a snap.

**Additional feedback during the drag:** fire a **`select`** tick each time the
computed drop slot changes. The walk that finds `target` currently only runs in
`.onEnd()`; move it into a shared helper called from `.onUpdate()` too, keep the
last target in a shared value, and `runOnJS` a haptic when it changes. Slot size
throttles this naturally — no extra debounce needed. This is what makes a
reorder feel like moving something through detents rather than sliding a ghost.

### 7.3 Suspending layout transitions during the drag (your item 2)

The conflict is not really with the dragged row — it's with **its neighbours.**
Once §6 puts `LinearTransition` on the builder's rows, every neighbour tries to
spring to its new position while the dragged row is being translated by the
gesture, and the two settle against each other. Result: rows drift after
release.

`layout` is a React prop and cannot be toggled from a worklet, so:

```tsx
// DraggableList — LIST-level state, not per-row. All rows must suspend together.
const [dragging, setDragging] = useState(false);

// gesture:
.onStart(() => { …; runOnJS(setDragging)(true); })
.onFinalize(() => { runOnJS(setDragging)(false); })   // note: onFinalize, see 7.4

// row:
<Animated.View layout={dragging ? undefined : LinearTransition.springify()…}>
  <Animated.View style={dragStyle}>{…}</Animated.View>
</Animated.View>
```

**Two structural points:**

1. **Two nested `Animated.View`s, not one.** The gesture-driven `translateY` /
   scale / elevation must live on an *inner* node; `layout` goes on the *outer*.
   Putting `layout` on the same node that a gesture is writing `transform` to is
   precisely what produces the drift.
2. `setDragging(true)` triggers a **re-render mid-gesture.** That's fine — the
   gesture lives in shared values and RNGH state, not React state — but the
   `Gesture` objects must be memoised (`useMemo` on `[index, count]`) or every
   render rebuilds them and the in-flight gesture is torn down. **This is the
   single most likely way to break this phase.**

### 7.4 Fix F2 while you're in here

Move the reset out of `.onEnd()`:

```ts
.onEnd(() => { /* compute target, runOnJS(onCommit)(index, target) */ })
.onFinalize(() => {                      // fires on end AND on cancel
  activeIndex.value = -1;
  translateY.value = withTiming(0, { duration: 120 });
  runOnJS(setDragging)(false);
})
```

Today a cancelled drag (ScrollView steals the responder, navigation away,
incoming call) leaves `activeIndex` pinned and the row stuck raised. Harmless-ish
now; obvious once the row also carries an e3 shadow and a 1.03 scale.

### 7.5 Accessibility

A long-press-only affordance is invisible to screen readers and hard for users
with motor impairments. Add to each row:

```
accessibilityActions={[{name:'moveUp', label:'Move up'}, {name:'moveDown', label:'Move down'}]}
onAccessibilityAction={…calls onReorder directly…}
```

Cheap, and it means reorder isn't gesture-only. The visible handle stays.

### 7.6 Discoverability

Long-press with no handle visible is a hidden feature. The handle stays visible
and keeps its immediate-drag pan, so nothing is lost — the long-press is an
*addition* for people who grab the row instead of the handle, not a replacement.
Worth a look on device: whether the handle should get slightly more contrast now
that it's the only visual hint.

---

## 8. Phase 8 — Sheet and dialog motion (G6)

| File | Today | Becomes |
| --- | --- | --- |
| `ConfirmDialog.tsx:47` | `animationType="fade"` | `"none"` + backdrop `FadeIn(160)`, panel `FadeIn` + scale 0.94→1 on `motion.sheetIn` |
| `ActionSheet.tsx:50` | `animationType="fade"` | same |
| `StepEditSheet.tsx:84` | `animationType="slide"` | `"none"` + `SlideInDown` spring `motion.sheetIn` / `SlideOutDown` `motion.sheetOut` |
| `ValueEditSheet.tsx:45` | `animationType="slide"` | same |
| `ExercisePicker.tsx:80` | `animationType="slide"`, **non-transparent Modal** | **leave as-is.** It's a full-screen page, not a sheet; converting it means restructuring the Modal to `transparent`. Defer. |

**Trap:** `ActionSheet.tsx:72` already carries a comment about two `Modal`s
presented simultaneously being unreliable on iOS, and uses `InteractionManager`
to sequence them. A custom exit animation must **complete before the `Modal`
unmounts**, or the second Modal opens into a half-torn-down first one. Keep the
`InteractionManager` handoff and either keep `motion.sheetOut` (180ms) shorter
than the handoff, or drive the unmount from the exit callback.

---

## 9. Phase ordering

| Phase | Content | Files | Ships alone? | Size |
| --- | --- | --- | --- | --- |
| **1** | Radii, elevation scale, motion + press tokens | `tokens.ts` | Yes | ~1h |
| **1b** | `inkDisabled` token + 5 repointed call sites + tab-bar icon/label tone split | `tokens.ts`, `_layout.tsx`, `reps`, `ui.tsx` | Yes | ~30m |
| **2** | Animated outer node (fixes F1), depth channel, `Surface`, per-component depth | `ui.tsx`, `Toast.tsx`, `_layout.tsx` | Yes | ~5h |
| **3** | `haptics.ts` + primitive wiring + the 14 raw-`Pressable` migrations | new module, `ui.tsx`, 10 screens | Yes | ~4h |
| **4** | Event-driven haptics | ~6 call sites | Yes | ~1h |
| **5** | Entrance + stagger + reduce-motion | 5 screens | Yes | ~2h |
| **6** | Layout transitions | `builder`, `reps`, `library`, `history` | Yes | ~2h |
| **7** | Long-press drag + F2 fix + a11y actions | `DraggableList.tsx`, `builder.tsx` | Yes | ~4h |
| **8** | Sheet/dialog motion | 4 overlay components | Yes | ~2h |

**Do Phase 6 and Phase 7 in that order and test them together** — §7.3 only
matters once §6 has put layout transitions on the builder's rows.

**Natural stopping points if you want to see it before committing to all of
it:** after Phase 2 (the look is 80% there, and F1 is fixed), and again after
Phase 3 (the feel is 80% there). Phases 5–8 are the polish tail.

---

## 10. Recommended fold-in: four open duplication leaks

Four of the six leaks from the 2026-08-25 audit sit in the exact files this plan
already rewrites, and one is already a required line item in §4.4:

- Add `DestructiveButton` to `ui.tsx` → fixes `app/session/[id].tsx:232–238`
- Add `size?: 'default'|'small'` and `shape?: 'square'|'circle'` to
  `IconButton`/`BinButton`/`PencilButton`/`SaveButton` → fixes
  `app/training/[id]/builder.tsx:571–575` (28×28 block-delete ×) and
  `app/exercise/[id].tsx:452–467` (circular delete)
- Swap `app/training/[id]/index.tsx:110–117`'s raw `Text.onPress` "Edit" for the
  existing `HeaderAction` — it has no hitSlop *and* no press feedback, so it's a
  §4.4 site in all but name

Not folded in: the settings sound-picker using `ConfirmDialog` instead of
`ActionSheet`, and the `RestSheet`/player ±15s duplication.

---

## 11. Risks

1. **F1's fix touches the code path of the 2026-08-25 sliver regression.**
   Re-verify `ConfirmDialog`'s Cancel/Delete/OK row renders at full height on
   both platforms after Phase 2. This is the single most important regression check.
2. **`PAINT_KEYS` stays authoritative.** Any new shadow-ish key added to the
   codebase goes in that array, or it double-paints on the inner view. This app
   uses `rgba()` hairlines everywhere, so it *will* be visible.
3. **`Animated.createAnimatedComponent(Pressable)` at module scope only.**
4. **Reanimated 4.5 + New Arch prop support is assumption, not fact** until
   measured on device — see §3.5 trap 6, including the graceful degradation.
5. **Android `elevation` is stepped, never tweened.** Test on a real mid-range
   device, not the emulator.
6. **`overflow: 'hidden'` + shadow on Android.** Clip on an inner node.
7. **Entrance animations re-fire on virtualised row recycle.** Stable keys;
   verify by scrolling a long library.
8. **Phase 7's gesture objects must be memoised** or the mid-gesture re-render
   from `setDragging(true)` tears down the in-flight gesture (§7.3).
9. **Phase 7 changes an interaction users have learned.** Drag-from-handle still
   works identically; only the row-wide long-press is new.
10. **`ActionSheet`'s iOS double-Modal sequencing** must survive the custom exit
    animation (§8).
11. **Haptic density on a workout screen** is a battery and annoyance surface.
    The `RepeatingPressable` every-3rd-tick haptic is the item most likely to
    need backing out; keep it behind one constant.
12. **No new hex values** beyond Phase 1b's single `inkDisabled`. Shadows are
    pure `#000` at low opacity — no tinted shadows.
13. **The five-overlay-primitive rule stands.** Nothing here adds a `Modal` or
    an `Alert.alert`.

---

## 12. Verification

No visual regression tooling exists in this repo. Verification is typecheck +
unit tests + a manual device pass on **both** platforms.

**After every phase:**
```
npm run typecheck
npm test
```

**Manual device checklist (Android mid-range + iOS, both required):**

- [ ] **F1 fixed:** pressing `PrimaryButton` visibly moves the *button*, not just its label
- [ ] `ConfirmDialog` action buttons still render at full height (risk 1)
- [ ] Every site in §4.4 gives a haptic and a visible press response
- [ ] No doubled/darkened borders anywhere — check `BinButton`, `SaveButton`, `OutlineChip`, stepper boxes
- [ ] Card shadows actually visible on Android (opaque bg present, no `overflow:hidden` above them)
- [ ] Press an elevated card repeatedly while watching the frame monitor — no dropped frames from shadow rasterisation
- [ ] Disabled `PrimaryButton` still dims to 0.35 (§3.5 trap 1)
- [ ] Library at 40+ items: no entrance re-fire on recycle, no stagger tail
- [ ] **Drag:** hold a row 350ms → haptic + row lifts + handle goes accent; drag → a tick at each slot crossing; release → settles with no neighbour drift
- [ ] **Drag:** start a hold then scroll instead — the ScrollView wins, no row is left raised
- [ ] **Drag:** start a drag then navigate away — nothing stuck (F2)
- [ ] **Drag:** tap a −/+ button inside a row — the tap still registers, no drag starts
- [ ] Sound picker → `ActionSheet`/`ConfirmDialog` open and close without the iOS double-Modal hang
- [ ] OS "Reduce Motion" on: entrances and layout transitions instant; press feedback still present
- [ ] Tab bar: inactive **labels** readable at arm's length in daylight, and inactive **icons** still clearly lighter than the active one (the split in §2b) — if the labels start reading as active, fall back to `inkDisabled` for both
- [ ] Player at arm's length: legibility unchanged, no shadows, haptics fire on all six controls with the phone in a pocket
- [ ] Run one full workout end to end and judge haptic density — a feel judgement, and the one that decides whether §4.2's repeat-tick haptic stays

**Docs to update on completion — `CLAUDE.md` gains:**
- the reduce-motion rule
- "the animated node is the outer `Pressable`; the inner `View` is layout-only and static" (updating the existing section, which describes the pre-F1 arrangement)
- "all haptics go through `src/feedback/haptics.ts` — never import `expo-haptics` directly"
- "shadow geometry is frozen per elevation level; only `shadowOpacity`/`elevation` animate"
