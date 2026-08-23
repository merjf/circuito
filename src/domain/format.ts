/**
 * Small text-formatting helpers shared across screens, split out of any one
 * screen once a second place needed the same wording.
 */

/**
 * "used by 3 trainings" makes the person go hunting for which ones before
 * they can act. Naming them directly saves that round trip
 * (`PLAN_ui_fixes.md` B8): "Leg day", "Leg day and Push day", "Leg day, Push
 * day, and Core".
 */
export function joinNames(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}
