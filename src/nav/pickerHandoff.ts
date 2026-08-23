/**
 * Handing one chosen value back from a picker route to the screen that opened
 * it.
 *
 * expo-router pushes screens, it does not call them: there is no return value
 * from `router.push`, and `router.back()` carries nothing with it. The three
 * usual ways round that are all worse than this one —
 *
 *   • **Params in, params out.** Only works downwards. Setting params on the
 *     screen below from the screen above is not something the router offers.
 *   • **A context provider around the whole app.** A global store, mounted for
 *     the lifetime of the process, so that two screens can exchange one string.
 *   • **Write it to the database from the picker.** The picker would need the
 *     row, and a NEW exercise has no row until it has a name — so the equipment
 *     you picked before typing one would simply be lost.
 *
 * So: a single-slot mailbox. The opener leaves a listener, the picker delivers
 * to it, and the slot empties on delivery. One slot rather than a map keyed by
 * route because only one picker can be on top of the stack at a time — and if
 * that ever stops being true, the assertion to add is here rather than in every
 * caller.
 *
 * A listener left behind by a picker the user backed out of is harmless: it is
 * a closure over a screen that is still mounted, it is never called, and the
 * next `expectPick` overwrites it. The opener may still call `cancelPick` on
 * unmount to be tidy.
 */

type Listener = (value: string) => void;

let pending: Listener | null = null;

/**
 * Register interest in the next pick, immediately before pushing the picker.
 *
 * The type parameter is the caller's promise about what that route delivers —
 * `expectPick<Equipment>` next to a push of `/pick/equipment`. Nothing can
 * check that pairing at compile time, which is why the two routes narrow what
 * they deliver themselves (see `asEquipment` / `asExerciseType`), and why the
 * listener re-checks rather than trusting the string it is handed.
 */
export function expectPick<T extends string>(listener: (value: T) => void): void {
  pending = listener as Listener;
}

/** Deliver the chosen value, then empty the slot. */
export function deliverPick(value: string): void {
  const listener = pending;
  pending = null;
  listener?.(value);
}

/** Forget any pending listener. */
export function cancelPick(): void {
  pending = null;
}
