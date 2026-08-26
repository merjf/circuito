# circuito — working notes for AI assistants

React Native (Expo Router) interval-training app. Read this before touching `src/components/`, especially `ui.tsx`.

## Shared component library — extend, don't clone

`src/components/ui.tsx` is the app's design system: buttons, chips, icon buttons (`BinButton`/`PencilButton`/`SaveButton`), steppers, cards, media handling. `ConfirmDialog`, `ActionSheet`, `StepEditSheet`, `ValueEditSheet`, and `ExercisePicker` are the app's only overlay primitives — every dialog/sheet/confirm flow routes through one of these five. No screen should ever import `Modal` or call `Alert.alert` directly; if you're about to, use or extend one of the five instead.

**Guardrail:** when a screen needs a variant of an existing shared primitive that doesn't quite exist yet — a smaller icon button, a destructive-styled CTA, a circular delete button — extend that primitive's props in `ui.tsx` in the same change, rather than hand-styling a local lookalike `Pressable`/`TouchableOpacity`. This has already happened three times in this codebase (a hand-rolled destructive "Delete" button in `session/[id].tsx`, a bespoke 28×28 block-delete `×` in `training/[id]/builder.tsx`, a third circular delete button in `exercise/[id].tsx` — all soft-red, all duplicating `BinButton`'s color logic because `IconButton` had no `size`/`shape` prop to cover the smaller/circular cases). Before building a bespoke button, check whether `IconButton`, `BinButton`, `PencilButton`, `SaveButton`, `PrimaryButton`, `SecondaryButton`, or `HeaderAction` already covers the shape — and if it's close but not quite, add the missing prop there first.

`ConfirmDialog` is for yes/no (or yes/no/destructive) prompts only — its own doc comment says so. A "pick one of N" flow (a sound picker, a filter menu, a sort menu) belongs in `ActionSheet`, not `ConfirmDialog`, even though `ConfirmDialog` will technically render an arbitrary list of `actions`.

## `AnimatedPressable` / `RepeatingPressable` — style is split across two nodes, on purpose

Both are built as an outer `Pressable` wrapping an inner `Animated.View` (for the shared press scale/opacity animation). As of 2026-08-25 this is deliberately **not** a single style prop passed once:

- The outer `Pressable` gets the **full** `style` — it's the actual flex item in whatever row/column contains the button, so any sizing prop (`flex`, `height`, `width`) has to land there or Yoga has nothing to size against.
- The inner `AnimatedView` gets a **layout-only** copy (via the internal `layoutOnlyStyle()` helper) — `flexDirection`/`alignItems`/`gap`/etc, so multi-child buttons (e.g. a thumbnail + text + badge row) still arrange correctly — but never border/background/radius/shadow, because both nodes render at the identical rect and painting the same chrome on both stacks two coincident layers. For solid colors that's just wasteful; for any semi-transparent `rgba(...)` border or fill (this app's hairline borders and soft-red/orange/green tints), it visibly composites to a darker/more saturated edge than the design intends.

**Why this exists:** the original implementation applied `style` to the inner `AnimatedView` only. That silently worked for any button using a fixed `height` (`PrimaryButton`, `SecondaryButton`, etc. all render fine standalone), but broke the moment a caller needed `flex: 1` from a row parent to get sized at all — `ConfirmDialog`'s Cancel/Delete/OK button row collapsed to near-zero-height horizontal slivers (full width, no height) because the `flex: 1` set on the inner view never reached the actual flex item (the outer `Pressable`), which had no size of its own to offer. This shipped and was live in the sound picker, the "Couldn't save" dialog, and every delete-confirmation dialog in the app before being caught from screenshots.

**If you're touching `AnimatedPressable`/`RepeatingPressable` again:** keep the two-node split. Don't collapse back to "apply `style` once, to whichever node is convenient" — that's the exact regression this fixes. If you add a new paint-style property to the codebase's vocabulary (a new border/shadow/fill key), add it to `PAINT_KEYS` in `ui.tsx` too, or it'll double-paint on the inner node.

**When adding a new button/row that composes `AnimatedPressable` with multiple children:** the layout props (`flexDirection`, `gap`, `alignItems`) you pass via `style` will correctly reach the children (they're laid out inside the inner `AnimatedView`). You don't need to do anything special — this is handled by the shared component now, not by each call site.
