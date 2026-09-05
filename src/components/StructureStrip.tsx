import { View } from 'react-native';

import type { ExerciseTypes } from '@/domain/queue';
import type { Training } from '@/domain/types';
import { color, radius, size } from '@/theme/tokens';
import { MonoLabel } from './ui';

/**
 * The structure strip on the home card (1a), plus its round labels.
 *
 * A round gets one equal-width mark for each exercise in that round. This is a
 * structural summary, not a timeline: rests and prepare time are deliberately
 * absent, and alternating ink/surface rounds make the repeat count readable.
 */

export function StructureStrip({
  training,
  // Retained in the public API so card callers do not need to know that this
  // visual is no longer duration-dependent.
  exerciseTypes: _exerciseTypes,
}: {
  training: Training;
  exerciseTypes: ExerciseTypes;
}) {
  const rounds = training.blocks.flatMap((block) =>
    block.steps.length === 0
      ? []
      : Array.from({ length: Math.max(1, block.repeat) }, () => block.steps),
  );
  if (rounds.length === 0) return null;

  return (
    <View>
      <View style={{ flexDirection: 'row', height: size.structureStrip, gap: 2 }}>
        {rounds.flatMap((steps, roundIndex) =>
          steps.map((step) => {
            const dark = roundIndex % 2 === 0;
            return (
              <View
                key={`${roundIndex}-${step.id}`}
                style={{
                  flex: 1,
                  backgroundColor: dark ? color.ink : color.surface,
                  borderColor: dark ? color.ink : color.track,
                  borderWidth: dark ? 0 : 1,
                  borderRadius: radius.segment,
                }}
              />
            );
          }),
        )}
      </View>

      {rounds.length > 1 && (
        <View style={{ flexDirection: 'row', marginTop: 10, gap: 2 }}>
          {rounds.map((steps, index) => (
            <View
              key={index}
              style={{
                flex: steps.length,
                alignItems:
                  index === 0 ? 'flex-start' : index === rounds.length - 1 ? 'flex-end' : 'center',
              }}
            >
              <MonoLabel tone={index % 2 === 0 ? color.inkFaint : color.inkGhostest}>
                Round {index + 1}
              </MonoLabel>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
