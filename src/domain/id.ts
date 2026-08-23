/**
 * Client-generated ids.
 *
 * Generated on the device rather than assigned by a server, because the app is
 * offline-first and a record must have a stable identity the moment it is
 * created — before any sync exists to hand one out. Random enough that two
 * devices creating records simultaneously will not collide.
 */

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

function token(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/**
 * Prefixed so an id is self-describing in logs and in the database:
 * `tr_`, `bl_`, `st_`, `ex_`, `se_`, `sl_`.
 */
export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${token(6)}`;
}

export const newTrainingId = () => newId('tr');
export const newBlockId = () => newId('bl');
export const newStepId = () => newId('st');
export const newExerciseId = () => newId('ex');
export const newSessionId = () => newId('se');
export const newSetLogId = () => newId('sl');
