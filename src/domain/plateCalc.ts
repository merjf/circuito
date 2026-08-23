/**
 * The plate calculator (B9 of `PLAN_hevy_integration.md`).
 *
 * A barbell's total load is the bar plus plates on both sides, symmetric.
 * `Step.weightKg` already stores the TOTAL — the same field a dumbbell or a
 * kettlebell uses — so this module's only job is to go from "45 kg total" to
 * "which plates, one side", given what the user says the bar weighs and which
 * plates they own (`Settings.plates`, `hooks/useSettings.tsx`).
 *
 * Gated on `Exercise.equipment === 'barbell'` at the call site (§1.4 /
 * `domain/exerciseType.ts`) — this module does not know about exercises at
 * all, so a dumbbell circuit never even imports it.
 */

export interface PlateBreakdown {
  /** One side, heaviest first. Empty means "just the bar". */
  perSide: number[];
  /** `barKg + 2 × sum(perSide)` — what actually loads, which may fall short
   *  of the target when the owned plates cannot make up the difference. */
  achievedKg: number;
  /** Whether `achievedKg` matches the requested total, within float tolerance. */
  exact: boolean;
}

/** Trims float noise the same way `withUniformDistance` does, and for the
 *  same reason: a stepper walking in 0.5s can land on 12.499999999999998. */
const round2 = (n: number): number => Number(n.toFixed(2));

/**
 * Below the bar's own weight there is nothing to load — that is a different
 * fact from "zero plates", which is what an empty `perSide` already means for
 * an exact match at the bar's weight. Returning `null` keeps the two apart
 * rather than printing "0 kg / side" for a target the bar cannot even reach.
 */
export function platesFor(
  targetKg: number,
  barKg: number,
  availableKg: readonly number[],
): PlateBreakdown | null {
  if (targetKg < barKg - 0.005) return null;

  // Greedy by descending size. Optimal for a standard fractional plate set —
  // every common size divides evenly into the ones above it — and it is also
  // the algorithm a person loading a bar actually uses, which matters more
  // here than provable optimality against a plate set nobody owns.
  const sizes = [...new Set(availableKg)].filter((k) => k > 0).sort((a, b) => b - a);
  let remaining = (targetKg - barKg) / 2;
  const perSide: number[] = [];

  for (const size of sizes) {
    while (remaining - size >= -0.005) {
      perSide.push(size);
      remaining -= size;
    }
  }

  const achievedKg = round2(barKg + 2 * perSide.reduce((sum, k) => sum + k, 0));
  return { perSide, achievedKg, exact: Math.abs(achievedKg - targetKg) < 0.01 };
}

/**
 * "10 + 2.5 kg / side", or the honest shortfall when the owned plates cannot
 * hit the target exactly — never a silently rounded number. Same discipline
 * as `10:55 +` and the `REPS` placeholder: say what is actually true.
 */
export function formatPlateBreakdown(breakdown: PlateBreakdown, targetKg: number): string {
  if (breakdown.perSide.length === 0) return 'Just the bar';
  const line = `${breakdown.perSide.map((k) => String(round2(k))).join(' + ')} kg / side`;
  if (breakdown.exact) return line;
  return `${line} — loads to ${String(round2(breakdown.achievedKg))} kg, not ${String(round2(targetKg))}`;
}
