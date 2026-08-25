/**
 * WHICH field a `ValueEditSheet` bottom sheet is currently open for — never
 * the field's resolved value or its `onChange`.
 *
 * The host screen (`training/[id]/builder.tsx`, `exercise/[id].tsx`) stores
 * one of these in state and derives the sheet's `ValueEditContext` fresh on
 * every render from its own live data (`draft`, `exercise`), the same way
 * `StepEditSheet`'s `editContext` is derived from `editing: {blockId, stepId}`.
 *
 * The bug this replaces: storing the resolved `{value, onChange}` object
 * directly meant it was captured ONCE, at the moment the sheet opened, off
 * whatever `exercise`/`draft` looked like in that render. The sheet's own
 * stepper then showed a frozen number — it never picked up later renders —
 * and every `onChange` after the first one closed over the stale object,
 * silently discarding whatever `persist`/`patch` had already saved. Storing
 * only the identity of the field being edited, and re-resolving its current
 * value/onChange on every render, is what keeps the sheet live.
 */
export type ValueEditTarget =
  | { kind: 'prepare' }
  | { kind: 'blockRepeat'; blockId: string }
  | { kind: 'roundRest'; blockId: string }
  | { kind: 'blockRest'; blockId: string }
  | { kind: 'stepTime'; blockId: string; stepId: string }
  | { kind: 'stepRest'; blockId: string; stepId: string }
  | { kind: 'stepReps'; blockId: string; stepId: string }
  | { kind: 'stepDistance'; blockId: string; stepId: string };
