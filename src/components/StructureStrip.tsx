import { View } from 'react-native';

import { structureSegments, type ExerciseTypes } from '@/domain/queue';
import { totalRounds } from '@/domain/duration';
import type { Training } from '@/domain/types';
import { color, radius, size } from '@/theme/tokens';
import { MonoLabel } from './ui';

/**
 * The structure strip on the home card (1a), plus its round labels.
 *
 * One flex-weighted segment per cue, so the strip is a true-to-scale picture of
 * the session's shape. Colour follows the mock: the first round is drawn in
 * full contrast (`ink` for work, `track` for rest) and every repeat after it
 * collapses to a single flat `#ECEAE5` — the point of the strip is to show the
 * shape of one round and the fact that it recurs, not to invite counting
 * segments in round three.
 */
/**
 * The flex share a tap-gated segment gets.
 *
 * It cannot be weighted by duration because it has none. A fixed share says
 * "something happens here" without claiming how long it takes — which is the
 * only honest thing the strip can say about a set of twelve.
 */
const GATED_FLEX = 30;

export function StructureStrip({
  training,
  exerciseTypes,
}: {
  training: Training;
  exerciseTypes: ExerciseTypes;
}) {
  // A reps training has no timeline, so there is no true-to-scale shape to
  // draw. Nothing is better than a strip of equal blocks implying a rhythm the
  // session does not have — and calling structureSegments would throw.
  // Every training has a shape now, whether or not any of it is on a clock —
  // a strip of tap-gated segments is still the honest picture of a circuit.

  const segments = structureSegments(training, exerciseTypes);
  if (segments.length === 0) return null;

  const rounds = totalRounds(training);
  const hasRest = segments.some((s) => s.kind !== 'work');

  // Weight per round, for positioning the labels under their own stretch.
  const roundWeights = new Map<number, number>();
  for (const s of segments) {
    roundWeights.set(s.round, (roundWeights.get(s.round) ?? 0) + (s.weight ?? GATED_FLEX));
  }

  return (
    <View>
      <View style={{ flexDirection: 'row', height: size.structureStrip, gap: 2 }}>
        {segments.map((s, i) => {
          const repeated = s.round > 1;
          const fill = repeated
            ? color.repeatedRound
            : s.kind === 'work'
              ? color.ink
              : color.track;
          return (
            <View
              key={i}
              style={{ flex: s.weight ?? GATED_FLEX, backgroundColor: fill, borderRadius: radius.segment }}
            />
          );
        })}
      </View>

      {rounds > 1 ? (
        <View style={{ flexDirection: 'row', marginTop: 10, gap: 2 }}>
          {[...roundWeights.entries()].map(([round, weight], i, all) => (
            <View
              key={round}
              style={{
                flex: weight,
                alignItems:
                  i === 0 ? 'flex-start' : i === all.length - 1 ? 'flex-end' : 'center',
              }}
            >
              <MonoLabel tone={round === 1 ? color.inkFaint : color.inkGhostest}>
                Round {round}
              </MonoLabel>
            </View>
          ))}
        </View>
      ) : (
        !hasRest && (
          <View style={{ marginTop: 10 }}>
            <MonoLabel tone={color.inkGhostest}>No rest</MonoLabel>
          </View>
        )
      )}
    </View>
  );
}
