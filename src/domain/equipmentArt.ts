/**
 * The equipment pictures.
 *
 * ── HOW TO REPLACE THESE ───────────────────────────────────────────────────
 * The files in `assets/equipment/` are PLACEHOLDERS — flat greyscale shapes
 * generated so the picker looks right and the bundler resolves. To use real
 * images, overwrite them in place, keeping the same filenames:
 *
 *     assets/equipment/none.png            assets/equipment/plate.png
 *     assets/equipment/barbell.png         assets/equipment/resistanceBand.png
 *     assets/equipment/dumbbell.png        assets/equipment/suspensionBand.png
 *     assets/equipment/kettlebell.png      assets/equipment/cord.png
 *     assets/equipment/machine.png         assets/equipment/other.png
 *
 * Transparent PNG, square, ideally 256×256 or larger. Nothing in the code
 * needs to change — the map below is by filename, so a swap is a file swap.
 *
 * ── WHY A STATIC MAP ───────────────────────────────────────────────────────
 * Metro resolves `require` at build time, so the path cannot be built from a
 * variable: `require(\`../../assets/equipment/${id}.png\`)` does not bundle.
 * Ten explicit lines is the price of shipping images at all, and the exhaustive
 * `Record` means adding an eleventh piece of equipment without its art is a
 * type error rather than a blank square on a device.
 */

import type { ImageSourcePropType } from 'react-native';

import type { Equipment } from './exerciseType';

export const EQUIPMENT_ART: Record<Equipment, ImageSourcePropType> = {
  none: require('../../assets/equipment/none.png'),
  barbell: require('../../assets/equipment/barbell.png'),
  dumbbell: require('../../assets/equipment/dumbbell.png'),
  kettlebell: require('../../assets/equipment/kettlebell.png'),
  machine: require('../../assets/equipment/machine.png'),
  plate: require('../../assets/equipment/plate.png'),
  resistanceBand: require('../../assets/equipment/resistanceBand.png'),
  suspensionBand: require('../../assets/equipment/suspensionBand.png'),
  cord: require('../../assets/equipment/cord.png'),
  other: require('../../assets/equipment/other.png'),
};
