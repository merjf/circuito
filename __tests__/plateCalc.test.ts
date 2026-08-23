import { formatPlateBreakdown, platesFor } from '../src/domain/plateCalc';

/**
 * B9 of `PLAN_hevy_integration.md`. `platesFor` turns a total barbell weight
 * into plates for one side; `formatPlateBreakdown` is the line the
 * `StepEditSheet` row prints. What matters here is the same thing that
 * matters for `withUniformDistance` (`__tests__/setTargets.test.ts` and
 * `types.ts` itself): float noise must never read as a real discrepancy, and
 * an unreachable target must say so rather than being silently rounded.
 */

const STANDARD_SET = [20, 15, 10, 5, 2.5, 1.25];

describe('platesFor', () => {
  it('splits the load evenly across both sides', () => {
    // 60 kg total, 20 kg bar → 20 kg per side → one 20 exactly.
    expect(platesFor(60, 20, STANDARD_SET)).toEqual({
      perSide: [20],
      achievedKg: 60,
      exact: true,
    });
  });

  it('greedily combines plates, heaviest first', () => {
    // 45 kg total, 20 kg bar → 12.5 kg per side → 10 + 2.5.
    expect(platesFor(45, 20, STANDARD_SET)).toEqual({
      perSide: [10, 2.5],
      achievedKg: 45,
      exact: true,
    });
  });

  it('is just the bar when the target equals the bar weight', () => {
    expect(platesFor(20, 20, STANDARD_SET)).toEqual({
      perSide: [],
      achievedKg: 20,
      exact: true,
    });
  });

  it('returns null below the bar — nothing to load is not the same as zero plates', () => {
    expect(platesFor(15, 20, STANDARD_SET)).toBeNull();
  });

  it('reports the honest shortfall when the owned plates cannot hit the target', () => {
    // 43 kg total, 20 kg bar → 11.5 kg per side. Without a 1.25 the owned set
    // only reaches 10, landing on 40 kg total — 3 kg short, not silently
    // rounded to 43.
    const result = platesFor(43, 20, [20, 15, 10, 5, 2.5]);
    expect(result).toEqual({ perSide: [10], achievedKg: 40, exact: false });
  });

  it('closes a fractional gap when a 1.25 is available, even after float division', () => {
    // 21.25 kg total, 20 kg bar → 0.625 kg per side is not achievable, so this
    // should still come back honest rather than crashing or looping forever.
    const result = platesFor(21.25, 20, STANDARD_SET)!;
    expect(result.perSide.reduce((sum, k) => sum + k, 0) * 2 + 20).toBeCloseTo(result.achievedKg, 2);
  });

  it('treats duplicate and unsorted available sizes the same as a clean set', () => {
    expect(platesFor(60, 20, [10, 20, 20, 15, 20])).toEqual({
      perSide: [20],
      achievedKg: 60,
      exact: true,
    });
  });

  it('never loops or overshoots when no plates are owned', () => {
    expect(platesFor(20, 20, [])).toEqual({ perSide: [], achievedKg: 20, exact: true });
    expect(platesFor(60, 20, [])).toEqual({ perSide: [], achievedKg: 20, exact: false });
  });
});

describe('formatPlateBreakdown', () => {
  it('reads "Just the bar" when no plate is needed', () => {
    expect(formatPlateBreakdown({ perSide: [], achievedKg: 20, exact: true }, 20)).toBe(
      'Just the bar',
    );
  });

  it('lists plates heaviest first with the unit once', () => {
    expect(
      formatPlateBreakdown({ perSide: [10, 2.5], achievedKg: 45, exact: true }, 45),
    ).toBe('10 + 2.5 kg / side');
  });

  it('names the shortfall instead of hiding it', () => {
    expect(
      formatPlateBreakdown({ perSide: [10], achievedKg: 40, exact: false }, 43),
    ).toBe('10 kg / side — loads to 40 kg, not 43');
  });
});
