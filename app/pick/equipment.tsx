/**
 * Choosing what an exercise is done with.
 *
 * A route rather than a sheet, because it is a full page of pictures and
 * because the exercise form it is opened from is already a long scroll — a
 * sheet over it would cover the field it is answering.
 *
 * ── WHY PICTURES ───────────────────────────────────────────────────────────
 * The list this replaces was a row of text pills, and text pills are read.
 * A barbell and a kettlebell are recognised, not read, which is the whole
 * argument for the art: at a glance down the page the right row is found by
 * shape before the label is parsed. The pictures live in `assets/equipment/`
 * and are mapped by `EQUIPMENT_ART` — see that file for how to replace them.
 *
 * ── NONE IS A CHOICE, ABSENT IS NOT ────────────────────────────────────────
 * `none` says "this is done with nothing" — a push-up, a sit-up. Absent says
 * "nobody has said yet", which is what every exercise created before this
 * screen existed still holds. They are different claims and the list keeps
 * them apart: `none` is a row you can pick, and the way back to absent is to
 * tap the row you already picked.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MonoLabel, ScreenHeader } from '@/components/ui';
import { EQUIPMENT_ART } from '@/domain/equipmentArt';
import { asEquipment, EQUIPMENT, EQUIPMENT_LABELS } from '@/domain/exerciseType';
import { deliverPick } from '@/nav/pickerHandoff';
import { color, radius, space } from '@/theme/tokens';
import { type as t } from '@/theme/type';

export default function EquipmentPickerScreen() {
  const insets = useSafeAreaInsets();
  // What the exercise holds now, so the list can show it. Narrowed rather than
  // trusted: params are strings from a URL, and this route can be reached by
  // one.
  const { current } = useLocalSearchParams<{ current?: string }>();
  const selected = asEquipment(current);

  const choose = (value: string) => {
    deliverPick(value);
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas, paddingTop: insets.top + 12 }}>
      <View style={{ paddingHorizontal: space.gutter }}>
        <ScreenHeader onBack={() => router.back()} />
        <Text style={[t.detailTitle, { color: color.ink, marginTop: space.m }]}>Equipment</Text>
        <MonoLabel tone={color.inkFaint}>What the movement is done with</MonoLabel>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: space.gutter,
          paddingBottom: insets.bottom + space.xxl,
        }}
      >
        {EQUIPMENT.map((item) => {
          const active = selected === item;
          return (
            <Pressable
              key={item}
              style={[styles.row, active && styles.rowActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={EQUIPMENT_LABELS[item]}
              // Tapping the chosen row clears it back to unstated. There is no
              // separate "clear" control because there is no sensible place to
              // put one that is not also a tenth thing to look at.
              onPress={() => choose(active ? '' : item)}
            >
              <Image source={EQUIPMENT_ART[item]} style={styles.art} resizeMode="contain" />
              <Text style={[t.exerciseRow, { color: color.ink, fontSize: 14, flex: 1 }]}>
                {EQUIPMENT_LABELS[item]}
              </Text>
              {active && <Text style={styles.tick}>✓</Text>}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: color.surface,
    borderRadius: radius.cardTight,
    borderWidth: 1,
    borderColor: color.hairline,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
  rowActive: { borderColor: color.inkStrong, backgroundColor: color.blockHeader },
  // Square and transparent, sitting on the row's own background rather than in
  // a tile of its own — a framed thumbnail would compete with the exercise
  // media everywhere else in the app.
  art: { width: 44, height: 44 },
  tick: { fontFamily: 'Archivo_600SemiBold', fontSize: 15, color: color.softGreenIcon },
});
