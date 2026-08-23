/**
 * The fourth tab — Settings.
 *
 * Replaces the deliberately blank `reserved` column. Laid out to match the
 * screenshot the user supplied: a Sound settings group of picker rows, then
 * Background colors with a switch and three swatches.
 *
 * Two departures from that screenshot, both deliberate:
 *
 *  - **A sixth sound row, Session end.** The app already plays something when a
 *    training finishes. Leaving it off the screen would make it the one sound
 *    the user could not change, for no reason other than that it was missing
 *    from a screenshot of a different app.
 *  - **Lead-time fields under the two "before" rows.** "Before round end" is
 *    meaningless without saying how far before. Three seconds is the default;
 *    the two are separate because a warning before work and a warning before
 *    rest are not the same kind of prompt.
 *
 * Accounts and sync (phase 8) belong at the top of this screen when they exist,
 * which is why this became Settings rather than a dedicated "You" tab: one more
 * tab for one more row would be a poor trade.
 */

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FilterPill, MiniStepper, MonoLabel, Stepper } from '@/components/ui';
import {
  BAR_WEIGHT_LIMITS,
  LEAD_SECONDS_LIMITS,
  SOUND_EVENTS,
  SOUND_IDS,
  type SoundChoice,
  type SoundEvent,
} from '@/domain/settings';
import { useSettings } from '@/hooks/useSettings';
import { isLowContrast } from '@/theme/playerPalette';
import { color, radius, space } from '@/theme/tokens';
import { type as t } from '@/theme/type';

const ROUND_BLUE_GRADIENT = [
  color.roundBlue1,
  color.roundBlue2,
  color.roundBlue3,
  color.roundBlue4,
  color.roundBlue5,
  color.roundBlue6,
];

/** Row labels, in the order the user's screenshot shows them. */
const SOUND_LABELS: Record<SoundEvent, string> = {
  roundStart: 'Round start',
  roundEnd: 'Round end',
  beforeRoundEnd: 'Before round end',
  beforeRestEnd: 'Before rest end',
  innerRoundAlert: 'Inner round alert',
  sessionEnd: 'Session end',
};

const SOUND_NAMES: Record<SoundChoice, string> = {
  gong: 'Gong',
  warning: 'Warning',
  alert: 'Alert',
  restEnd: 'Rest end',
  beep: 'Beep',
  none: 'None',
};

/**
 * Swatches offered per slot.
 *
 * A palette rather than a full colour picker, and not only for effort: every
 * one of these has been checked against `isLowContrast`, so the obvious choices
 * are all readable. The picker still warns, because the list is a shortcut and
 * not a cage.
 */
/**
 * Offered plate sizes (B9). A standard Olympic fractional set plus the two
 * lightest change plates — enough to cover a home rack without scrolling.
 * Anything the user doesn't own, they simply leave off.
 */
const PLATE_SIZES = [25, 20, 15, 10, 5, 2.5, 1.25, 1, 0.5];

const SWATCHES: Record<'round' | 'warning' | 'rest', string[]> = {
  // A soft-blue gradient, light to dark, replacing the earlier mixed
  // near-black/green/maroon set entirely (`PLAN_ui_fixes.md` UI pass) — every
  // stop is still dark enough that the light player ink on top of it passes
  // `isLowContrast`.
  round: ROUND_BLUE_GRADIENT,
  warning: ['#DCCB70', '#E5D68A', '#D8C868', '#E8DC9E', '#D0BE5C'],
  rest: ['#F2F1EE', '#EDF1EE', '#F1EEF2', '#F4F0EA', '#E9EEF1'],
};

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const {
    settings,
    setSound,
    setLead,
    setUseCustomColors,
    setColor,
    setBarWeight,
    setAvailablePlates,
  } = useSettings();
  const [picking, setPicking] = useState<SoundEvent | null>(null);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.canvas }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingHorizontal: space.gutter,
        paddingBottom: space.xxl,
      }}
    >
      <Text style={[t.screenTitle, { color: color.ink }]}>Settings</Text>

      <View style={{ marginTop: space.xl }}>
        <MonoLabel>Sound settings</MonoLabel>
        {SOUND_EVENTS.map((event) => (
          <View key={event}>
            <Pressable style={styles.row} onPress={() => setPicking(event)}>
              <Text style={[t.exerciseRow, { color: color.ink, flex: 1 }]}>
                {SOUND_LABELS[event]}
              </Text>
              <MonoLabel tone={color.inkFaint}>
                {SOUND_NAMES[settings.sounds[event]]}
              </MonoLabel>
            </Pressable>

            {/* The lead time belongs to its warning, so it sits under it
                rather than in a group of its own where the pairing would
                have to be inferred. */}
            {(event === 'beforeRoundEnd' || event === 'beforeRestEnd') && (
              <View style={styles.leadRow}>
                <MonoLabel tone={color.inkGhost}>How early</MonoLabel>
                <MiniStepper
                  label=""
                  value={settings.leadSeconds[event]}
                  step={1}
                  min={LEAD_SECONDS_LIMITS.min}
                  max={LEAD_SECONDS_LIMITS.max}
                  format={(v) => (v === 0 ? 'Off' : `${v}s`)}
                  onChange={(v) => setLead(event, v)}
                  // The default `flex: 1` stretched this across the whole row
                  // — it only ever shows a couple of characters, so a fixed
                  // width reads much closer to a normal input box
                  // (`PLAN_ui_fixes.md` UI pass).
                  style={styles.leadStepper}
                />
              </View>
            )}
          </View>
        ))}
      </View>

      <View style={{ marginTop: space.xxl }}>
        <MonoLabel>Background colors</MonoLabel>

        <View style={styles.row}>
          <Text style={[t.exerciseRow, { color: color.ink, flex: 1 }]}>Use custom colors</Text>
          <Switch
            value={settings.colors.useCustom}
            onValueChange={setUseCustomColors}
            trackColor={{ true: color.ink, false: color.track }}
            thumbColor={color.surface}
          />
        </View>

        {/* Hidden rather than disabled when the switch is off: a row of greyed
            swatches invites tapping and then does nothing. */}
        {settings.colors.useCustom && (
          <>
            <ColorRow
              label="Round color"
              value={settings.colors.round}
              swatches={SWATCHES.round}
              onChange={(hex) => setColor('round', hex)}
            />
            <ColorRow
              label="End round warning color"
              value={settings.colors.warning}
              swatches={SWATCHES.warning}
              onChange={(hex) => setColor('warning', hex)}
            />
            <ColorRow
              label="Rest color"
              value={settings.colors.rest}
              swatches={SWATCHES.rest}
              onChange={(hex) => setColor('rest', hex)}
            />
            <Text style={[t.bodySmall, { color: color.inkGhost, marginTop: space.sm }]}>
              The round color also decides whether text on it is light or dark.
            </Text>
          </>
        )}
      </View>

      {/* Feeds the plate calculator (B9) — the StepEditSheet row that appears
          only on a barbell exercise. Nothing here is used until then, so it
          is fine that most users never open this group. */}
      <View style={{ marginTop: space.xxl }}>
        <MonoLabel>Plates</MonoLabel>

        <View style={styles.row}>
          <Text style={[t.exerciseRow, { color: color.ink, flex: 1 }]}>Bar weight</Text>
          <Stepper
            value={settings.plates.barKg}
            step={0.5}
            min={BAR_WEIGHT_LIMITS.min}
            max={BAR_WEIGHT_LIMITS.max}
            onChange={setBarWeight}
            format={(v) => `${Number.isInteger(v) ? v : v.toFixed(1)} kg`}
          />
        </View>

        <Text style={[t.bodySmall, { color: color.inkGhost, marginTop: space.m }]}>
          Plates you own — the calculator only ever offers these
        </Text>
        <View style={styles.plateChips}>
          {PLATE_SIZES.map((kg) => {
            const owned = settings.plates.availableKg.includes(kg);
            return (
              <FilterPill
                key={kg}
                label={`${kg} kg`}
                active={owned}
                onPress={() =>
                  setAvailablePlates(
                    owned
                      ? settings.plates.availableKg.filter((k) => k !== kg)
                      : [...settings.plates.availableKg, kg].sort((a, b) => b - a),
                  )
                }
              />
            );
          })}
        </View>
      </View>

      <ConfirmDialog
        visible={picking !== null}
        title={picking ? SOUND_LABELS[picking] : ''}
        actions={[...SOUND_IDS, 'none' as const].map((id) => ({
          label: SOUND_NAMES[id],
          primary: picking ? settings.sounds[picking] === id : false,
          onPress: () => {
            if (picking) setSound(picking, id);
            setPicking(null);
          },
        }))}
        onCancel={() => setPicking(null)}
      />
    </ScrollView>
  );
}

function ColorRow({
  label,
  value,
  swatches,
  onChange,
}: {
  label: string;
  value: string;
  swatches: string[];
  onChange: (hex: string) => void;
}) {
  // Whatever is already chosen stays offered, even if it came from an older
  // build or a hand-edited row — otherwise the selected swatch would vanish
  // from its own list.
  const options = swatches.includes(value) ? swatches : [value, ...swatches];

  return (
    <View style={styles.colorRow}>
      <Text style={[t.exerciseRow, { color: color.ink }]}>{label}</Text>
      <View style={styles.swatches}>
        {options.map((hex) => (
          <Pressable
            key={hex}
            onPress={() => onChange(hex)}
            style={[
              styles.swatch,
              { backgroundColor: hex },
              hex === value && styles.swatchActive,
            ]}
          />
        ))}
      </View>
      {isLowContrast(value) && (
        <Text style={[t.bodySmall, { color: color.inkFaint }]}>
          Secondary text will be hard to read on this.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.divider,
  },
  leadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: space.m,
    paddingLeft: space.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.divider,
  },
  leadStepper: { flex: 0, width: 128 },
  plateChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: space.sm },
  colorRow: {
    gap: 10,
    paddingVertical: space.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.divider,
  },
  swatches: { flexDirection: 'row', gap: 10 },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: radius.fieldTight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
  },
  swatchActive: { borderWidth: 2, borderColor: color.ink },
});
