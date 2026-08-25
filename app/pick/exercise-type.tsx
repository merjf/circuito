/**
 * Choosing what an exercise is measured in.
 *
 * The most consequential field on the form, and until this screen existed it
 * was a two-way pill: Timed or Reps. That was never a description of a gym —
 * a farmer's walk is weight and distance, an assisted pull-up is reps and
 * NEGATIVE kilograms, a weighted plank is both a clock and a load — and the
 * app's answer to each of them was to pick the nearer of two wrong shapes.
 *
 * Eight types, each with an example and the units it asks for. The example
 * does most of the work: nobody knows what "Weighted Bodyweight" is until they
 * read "Weighted Pull Ups", and then nobody needs telling twice.
 *
 * The choice reaches everywhere — which fields the builder row shows, which
 * columns the logger draws, whether the runner counts down or waits for a tap
 * — so it is deliberately a page and not a chip you can brush past.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MonoLabel, OutlineChip, ScreenHeader } from '@/components/ui';
import { asExerciseType, EXERCISE_TYPES, TYPE_COPY } from '@/domain/exerciseType';
import { deliverPick } from '@/nav/pickerHandoff';
import { color, radius, space } from '@/theme/tokens';
import { type as t } from '@/theme/type';

export default function ExerciseTypePickerScreen() {
  const insets = useSafeAreaInsets();
  const { current } = useLocalSearchParams<{ current?: string }>();
  // Unlike equipment there is no "unstated" here: every exercise is measured
  // in something, and `asExerciseType` lands on weight-and-reps for anything
  // it does not recognise.
  const selected = asExerciseType(current);

  const choose = (value: string) => {
    deliverPick(value);
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas, paddingTop: insets.top + 12 }}>
      <View style={{ paddingHorizontal: space.gutter }}>
        <ScreenHeader onBack={() => router.back()} />
        <Text style={[t.detailTitle, { color: color.ink, marginTop: space.m }]}>
          Exercise type
        </Text>
        <MonoLabel tone={color.inkFaint}>What gets recorded when you log a set</MonoLabel>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: space.gutter,
          paddingBottom: insets.bottom + space.xxl,
        }}
      >
        {EXERCISE_TYPES.map((type) => {
          const copy = TYPE_COPY[type];
          const active = selected === type;
          return (
            <Pressable
              key={type}
              style={[styles.row, active && styles.rowActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${copy.label}. ${copy.chips.join(', ')}`}
              onPress={() => choose(type)}
            >
              <View style={{ flex: 1 }}>
                <Text style={[t.exerciseRow, { color: color.ink, fontSize: 14 }]}>
                  {copy.label}
                </Text>
                {/* Names, not categories. "Planks, Yoga, Stretching" answers
                    the question the label only gestures at. */}
                <Text style={styles.example} numberOfLines={2}>
                  {copy.example}
                </Text>
                {/* The units, in the order the logger's columns run — so the
                    row is also a preview of the screen you will be filling in
                    for the next three months. */}
                <View style={styles.chips}>
                  {copy.chips.map((chip) => (
                    <OutlineChip key={chip}>{chip}</OutlineChip>
                  ))}
                </View>
              </View>
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
    gap: 12,
    backgroundColor: color.surface,
    borderRadius: radius.card,
    borderWidth: 0,
    padding: 14,
    marginBottom: 10,
  },
  rowActive: { borderWidth: 1.5, borderColor: color.accent, backgroundColor: color.softGreen },
  example: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11.5,
    lineHeight: 17,
    color: color.inkFaint,
    marginTop: 4,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tick: {
    width: 22,
    height: 22,
    borderRadius: 11,
    overflow: 'hidden',
    textAlign: 'center',
    lineHeight: 22,
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: color.darkInk,
    backgroundColor: color.accent,
  },
});
