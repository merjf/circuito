/**
 * The user's approved starter library.  These rows deliberately use stable ids
 * and INSERT OR IGNORE, so a later app launch adds missing starter material
 * without changing or removing anything the user already owns.
 */

import { Image } from 'react-native';
import type * as SQLite from 'expo-sqlite';

import type { Equipment, ExerciseType } from '../domain/exerciseType';

type ExerciseSeed = {
  name: string;
  type: ExerciseType;
  equipment: Equipment;
  tags: string[];
  media: keyof typeof MEDIA;
  note?: string;
  weightKg?: number;
  weightCount?: number;
};

type StepSeed = { exercise: keyof typeof EXERCISES; work?: number; rest?: number; reps?: number; kg?: number; count?: number };
type BlockSeed = { label: string; repeat?: number; roundRest?: number; afterRest?: number; steps: StepSeed[] };
type TrainingSeed = { name: string; blocks: BlockSeed[] };

const uri = (asset: number) => Image.resolveAssetSource(asset).uri;

// Keep every require literal: Metro can then bundle the images for offline use.
const MEDIA = {
  bicycle: uri(require('../../assets/exercises/bicycle-crunch.png')),
  boxingCross: uri(require('../../assets/exercises/boxing-cross.png')),
  boxingDirect: uri(require('../../assets/exercises/boxing-direct.png')),
  boxingHook: uri(require('../../assets/exercises/boxing-hook.png')),
  boxingJab: uri(require('../../assets/exercises/boxing-jab.png')),
  burpee: uri(require('../../assets/exercises/burpee.png')),
  crunch: uri(require('../../assets/exercises/crunch.png')),
  frontRaise: uri(require('../../assets/exercises/dumbbell-front-raise.png')),
  lateralRaise: uri(require('../../assets/exercises/dumbbell-lateral-raise.png')),
  elbow: uri(require('../../assets/exercises/front-elbow-photoreal-prototype.png')),
  jabDirect: uri(require('../../assets/exercises/jab-direct.png')),
  jumpingKnee: uri(require('../../assets/exercises/jumping-knee.png')),
  jumpingLunge: uri(require('../../assets/exercises/jumping-lunge.png')),
  jumpingSquat: uri(require('../../assets/exercises/jumping-squat.png')),
  legHold: uri(require('../../assets/exercises/leg-isometric-hold.png')),
  mountain: uri(require('../../assets/exercises/mountain-climber.png')),
  muayThai: uri(require('../../assets/exercises/muay-thai.png')),
  triceps: uri(require('../../assets/exercises/overhead-triceps-extension.png')),
  shoulderTap: uri(require('../../assets/exercises/plank-shoulder-tap.png')),
  pushup: uri(require('../../assets/exercises/push-up.png')),
  squat: uri(require('../../assets/exercises/squat.png')),
  row: uri(require('../../assets/exercises/dumbbell-row.png')),
  press: uri(require('../../assets/exercises/military-press.png')),
  floorPress: uri(require('../../assets/exercises/floor-press.png')),
  pike: uri(require('../../assets/exercises/pike-push-up.png')),
  vup: uri(require('../../assets/exercises/v-up.png')),
  rope: uri(require('../../assets/exercises/jump-rope.png')),
  roundhouse: uri(require('../../assets/exercises/roundhouse-kick.png')),
  wallKnee: uri(require('../../assets/exercises/wall-knee-drive.png')),
} as const;

const ex = (name: string, type: ExerciseType, equipment: Equipment, media: keyof typeof MEDIA, tags: string[], note?: string, weightKg?: number, weightCount?: number): ExerciseSeed => ({ name, type, equipment, media, tags, note, weightKg, weightCount });

const EXERCISES = {
  rowSingle: ex('Rematore singolo', 'weightReps', 'dumbbell', 'row', ['gym', 'schiena'], '8 ripetizioni eccentriche.'),
  rowSupinated: ex('Rematore manubri simultanei presa supina', 'weightReps', 'dumbbell', 'row', ['gym', 'schiena'], '8 ripetizioni isometriche, palmi in su.'),
  military: ex('Military press presa neutra', 'weightReps', 'dumbbell', 'press', ['gym', 'spalle'], '8 ripetizioni eccentriche, palmi verso l’interno.'),
  lateralRaise: ex('Alzate laterali', 'weightReps', 'dumbbell', 'lateralRaise', ['gym', 'spalle'], '8 ripetizioni eccentriche.'),
  frontRaise: ex('Alzate frontali', 'weightReps', 'dumbbell', 'frontRaise', ['gym', 'spalle'], '8 ripetizioni isometriche, palmi verso l’interno.'),
  floorPress: ex('Bench floor', 'weightReps', 'dumbbell', 'floorPress', ['gym', 'petto'], '12 ripetizioni eccentriche.'),
  pushupEccentric: ex('Push up eccentrico', 'bodyweightReps', 'none', 'pushup', ['gym', 'petto'], 'A cedimento, fase eccentrica controllata.'),
  pikePushup: ex('Pike push up', 'bodyweightReps', 'none', 'pike', ['gym', 'spalle'], 'A cedimento, piedi a terra, posizione a V.'),
  frenchPress: ex('French press manubri', 'weightReps', 'dumbbell', 'triceps', ['gym', 'tricipiti'], '8 ripetizioni eccentriche; due manubri, gomiti all’altezza delle orecchie.'),
  dips: ex('Dips stretti al muro', 'bodyweightReps', 'none', 'pushup', ['gym', 'tricipiti'], 'A cedimento; gomiti stretti e schiena dritta appoggiata alla parete.'),
  bicycle50: ex('Bicycle crunch', 'bodyweightReps', 'none', 'bicycle', ['addominali'], '50 ripetizioni.'),
  kneeTuck50: ex('Knee tuck crunch', 'bodyweightReps', 'none', 'crunch', ['addominali'], '50 ripetizioni.'),
  vup50: ex('V-up toe touch', 'bodyweightReps', 'none', 'vup', ['addominali'], '50 ripetizioni.'),
  crunch50: ex('Crunch', 'bodyweightReps', 'none', 'crunch', ['addominali'], '50 ripetizioni.'),
  mountain50: ex('Mountain climbing 50', 'bodyweightReps', 'none', 'mountain', ['addominali', 'cardio'], '50 ripetizioni.'),
  jumpingKnee20: ex('Jumping knee', 'bodyweightReps', 'none', 'jumpingKnee', ['gambe', 'muay-thai'], '20 ripetizioni.'),
  roundhouse20: ex('Roundhouse kick alternati', 'bodyweightReps', 'none', 'roundhouse', ['gambe', 'muay-thai'], '20 ripetizioni.'),
  stepOver20: ex('Step-over rapido rialzato', 'bodyweightReps', 'other', 'jumpingLunge', ['gambe', 'cardio'], '20 ripetizioni.'),
  squatJump20: ex('Jump squat', 'bodyweightReps', 'none', 'jumpingSquat', ['gambe'], '20 ripetizioni.'),
  agility20: ex('Agility shuffle', 'bodyweightReps', 'none', 'jumpingLunge', ['gambe', 'cardio'], '20 ripetizioni.'),
  highKnees20: ex('Skip sul posto', 'bodyweightReps', 'none', 'jumpingKnee', ['gambe', 'cardio'], '20 ripetizioni.'),
  wallKnee20: ex('Wall knee drive', 'bodyweightReps', 'none', 'wallKnee', ['gambe', 'muay-thai'], '20 ripetizioni per lato.'),
  explosiveHop20: ex('Explosive forward hop', 'bodyweightReps', 'none', 'jumpingLunge', ['gambe'], '20 ripetizioni.'),
  frogJump20: ex('Frog jump', 'bodyweightReps', 'none', 'jumpingSquat', ['gambe'], '20 ripetizioni.'),
  armParallel: ex('Braccia parallele dentro fuori', 'durationWeight', 'dumbbell', 'frontRaise', ['braccia'], 'Pesi da 3 kg.'),
  armOpenClose: ex('Braccia tese avanti, apro chiudo', 'durationWeight', 'dumbbell', 'frontRaise', ['braccia'], 'Pesi da 3 kg.'),
  armOverhead: ex('Braccia in su, pesi dietro e alzo', 'durationWeight', 'dumbbell', 'triceps', ['braccia'], 'Pesi da 3 kg.'),
  armPulseRight: ex('Solo braccio destro', 'durationWeight', 'dumbbell', 'frontRaise', ['braccia'], 'Pesi da 3 kg.'),
  armPulseLeft: ex('Solo braccio sinistro', 'durationWeight', 'dumbbell', 'frontRaise', ['braccia'], 'Pesi da 3 kg.'),
  armPulseBoth: ex('Entrambi i bracci', 'durationWeight', 'dumbbell', 'frontRaise', ['braccia'], 'Pesi da 3 kg.'),
  soloBox: ex('Solo box', 'duration', 'none', 'boxingDirect', ['vuoto', 'boxe']),
  ianTao: ex('Ian Tao', 'durationWeight', 'dumbbell', 'muayThai', ['vuoto', 'muay-thai']),
  boxLeft: ex('Box left con pesetti', 'durationWeight', 'dumbbell', 'boxingJab', ['vuoto', 'boxe']),
  boxRight: ex('Box right con pesetti', 'durationWeight', 'dumbbell', 'boxingCross', ['vuoto', 'boxe']),
  boxAlternate: ex('Box dx sx con pesetti', 'durationWeight', 'dumbbell', 'jabDirect', ['vuoto', 'boxe']),
  threeDirect: ex('3 diretti con pesetti', 'durationWeight', 'dumbbell', 'boxingDirect', ['vuoto', 'boxe']),
  burpeeWeights: ex('Burpees attorno ai pesetti', 'durationWeight', 'dumbbell', 'burpee', ['vuoto', 'cardio']),
  vuoto: ex('Vuoto completo', 'durationWeight', 'dumbbell', 'muayThai', ['vuoto', 'muay-thai']),
  pushupTimed: ex('Flessioni', 'duration', 'none', 'pushup', ['total-body', 'petto']),
  absTimed: ex('Addominali', 'duration', 'none', 'crunch', ['total-body', 'addominali']),
  weightedPunches: ex('Solo pugni con pesetti', 'durationWeight', 'dumbbell', 'boxingDirect', ['total-body', 'boxe']),
  squatTimed: ex('Squat', 'duration', 'none', 'squat', ['total-body', 'gambe']),
  mountainTimed: ex('Mountain climbing', 'duration', 'none', 'mountain', ['total-body', 'cardio']),
  legHoldTimed: ex('Isometria gambe', 'duration', 'none', 'legHold', ['total-body', 'gambe']),
  shoulderTapTimed: ex('Tocco spalla', 'duration', 'none', 'shoulderTap', ['total-body', 'core']),
  burpeeTimed: ex('Burpee', 'duration', 'none', 'burpee', ['total-body', 'cardio']),
  jumpLungeTimed: ex('Affondi saltati', 'duration', 'none', 'jumpingLunge', ['total-body', 'gambe']),
  jumpingJack: ex('Jumping jack', 'duration', 'none', 'jumpingSquat', ['total-body', 'cardio']),
  squatKnee10: ex('Squat con ginocchiate', 'bodyweightReps', 'none', 'jumpingSquat', ['total-body', 'gambe']),
  pushupShoulder10: ex('Push up con tocco spalla', 'bodyweightReps', 'none', 'shoulderTap', ['total-body', 'petto']),
  backShoulder10: ex('Dorso su e apri spalle', 'bodyweightReps', 'none', 'crunch', ['total-body', 'schiena']),
  abs10: ex('Addominali 10', 'bodyweightReps', 'none', 'crunch', ['total-body', 'addominali']),
  burpeeJack10: ex('Burpee con 6 jumping jack', 'bodyweightReps', 'none', 'burpee', ['total-body', 'cardio']),
  jumpRope: ex('Corda', 'duration', 'cord', 'rope', ['total-body', 'cardio']),
  burpeeKnee: ex('Burpee senza flessione con ginocchiata', 'duration', 'none', 'burpee', ['total-body', 'cardio']),
  plankShoulder: ex('Plank con tocco spalla', 'duration', 'none', 'shoulderTap', ['total-body', 'core']),
  teepRight: ex('Tep destro', 'duration', 'none', 'muayThai', ['sacco', 'muay-thai']),
  teepLeft: ex('Tep sinistro', 'duration', 'none', 'muayThai', ['sacco', 'muay-thai']),
  teepAlternate: ex('Tep alternati dx/sx', 'duration', 'none', 'muayThai', ['sacco', 'muay-thai']),
  blockKickRight: ex('Block + kick destro', 'duration', 'none', 'muayThai', ['sacco', 'muay-thai']),
  blockKickLeft: ex('Block + kick sinistro', 'duration', 'none', 'muayThai', ['sacco', 'muay-thai']),
  jumpKneeBag: ex('Jump knee', 'duration', 'none', 'jumpingKnee', ['sacco', 'muay-thai']),
  roundhouseRight: ex('Roundhouse kick destro', 'duration', 'none', 'roundhouse', ['sacco', 'muay-thai']),
  roundhouseLeft: ex('Roundhouse kick sinistro', 'duration', 'none', 'roundhouse', ['sacco', 'muay-thai']),
  roundhouseAlternate: ex('Roundhouse kick alternati dx/sx', 'duration', 'none', 'roundhouse', ['sacco', 'muay-thai']),
  elbow: ex('Elbow strikes', 'duration', 'none', 'elbow', ['sacco', 'muay-thai']),
  jabCrossSpeed: ex('Jab, Cross speed', 'duration', 'none', 'jabDirect', ['sacco', 'boxe']),
  jabCrossPower: ex('Jab, Cross power', 'duration', 'none', 'jabDirect', ['sacco', 'boxe']),
  leftHook: ex('Left hook power', 'duration', 'none', 'boxingHook', ['sacco', 'boxe']),
  rightHook: ex('Right hook power', 'duration', 'none', 'boxingHook', ['sacco', 'boxe']),
  uppercuts: ex('Uppercuts speed', 'duration', 'none', 'boxingHook', ['sacco', 'boxe']),
  boxPower: ex('Box power', 'duration', 'none', 'boxingDirect', ['sacco', 'boxe']),
  kicks15: ex('15 kicks per lato', 'duration', 'none', 'muayThai', ['sacco', 'muay-thai'], '15 calci per lato.'),
  punchesBurpee: ex('Punches & burpee', 'duration', 'none', 'burpee', ['sacco', 'boxe']),
  reverseLungeKnee: ex('Reverse lunges & knee', 'duration', 'none', 'jumpingLunge', ['sacco', 'gambe']),
  teep15: ex('15 tep per lato', 'duration', 'none', 'muayThai', ['sacco', 'muay-thai'], '15 teep per lato.'),
} as const;

const s = (exercise: keyof typeof EXERCISES, work = 45, rest = 0, reps?: number, kg?: number, count?: number): StepSeed => ({ exercise, work, rest, reps, kg, count });

const TRAININGS: TrainingSeed[] = [
  { name: 'Gym Specific 1', blocks: [{ label: '8 reps', steps: [s('rowSingle', 0, 0, 8), s('rowSupinated', 0, 0, 8), s('military', 0, 0, 8), s('lateralRaise', 0, 0, 8), s('frontRaise', 0, 0, 8)] }] },
  { name: 'Gym Specific 2', blocks: [{ label: 'Strength', steps: [s('floorPress', 0, 0, 12), s('pushupEccentric'), s('pikePushup'), s('frenchPress', 0, 0, 8), s('dips')] }] },
  { name: 'Circuito addominali', blocks: [{ label: '50 reps', steps: [s('bicycle50', 0, 0, 50), s('kneeTuck50', 0, 0, 50), s('vup50', 0, 0, 50), s('crunch50', 0, 0, 50), s('mountain50', 0, 0, 50)] }] },
  { name: 'Circuito solo gambe', blocks: [{ label: 'Faster Legs · 20 reps', steps: [s('jumpingKnee20', 0, 0, 20), s('roundhouse20', 0, 0, 20), s('stepOver20', 0, 0, 20), s('squatJump20', 0, 0, 20), s('agility20', 0, 0, 20), s('highKnees20', 0, 0, 20)] }, { label: 'Horse Legs · 20 reps', steps: [s('wallKnee20', 0, 0, 20), s('explosiveHop20', 0, 0, 20), s('frogJump20', 0, 0, 20), s('squatJump20', 0, 0, 20), s('jumpingKnee20', 0, 0, 20)] }] },
  { name: 'Circuito solo braccia', blocks: [{ label: 'Blocco 1 · 1 min', afterRest: 60, steps: [s('armParallel', 60, 0, undefined, 3, 2), s('armOpenClose', 60, 0, undefined, 3, 2), s('armOverhead', 60, 0, undefined, 3, 2)] }, { label: 'Blocco 2 · 1 min', steps: [s('armPulseRight', 60, 0, undefined, 3, 2), s('armPulseLeft', 60, 0, undefined, 3, 2), s('armPulseBoth', 60, 0, undefined, 3, 2)] }] },
  { name: 'Circuito Vuoto Ian Tao', blocks: [{ label: '2 min', steps: [s('soloBox', 120, 30), s('ianTao', 120, 30), s('ianTao', 120, 30, undefined, 2, 1), s('ianTao', 120, 30)] }] },
  { name: 'Circuito 2 Vuoto', blocks: [{ label: '1 min', steps: [s('boxLeft', 60, 10), s('boxRight', 60, 10), s('boxAlternate', 60, 10), s('threeDirect', 60, 10), s('burpeeWeights', 60, 10), s('vuoto', 60, 10, undefined, 2, 1), s('vuoto', 60, 10)] }] },
  { name: 'Circuito 1 Total body', blocks: [{ label: '30 sec', steps: [s('pushupTimed', 30, 5), s('absTimed', 30, 5), s('weightedPunches', 30, 5), s('squatTimed', 30, 5), s('mountainTimed', 30, 5), s('legHoldTimed', 30, 5), s('shoulderTapTimed', 30, 5), s('burpeeTimed', 30, 5), s('vuoto', 30, 5, undefined, 2, 1)] }] },
  { name: 'Circuito 2 Total body', blocks: [{ label: '30 sec', steps: [s('pushupTimed', 30, 5), s('jumpLungeTimed', 30, 5), s('absTimed', 30, 5), s('mountainTimed', 30, 5), s('burpeeTimed', 30, 5), s('highKnees20', 30, 5), s('jumpLungeTimed', 30, 5), s('jumpingJack', 30, 5), s('mountainTimed', 30, 5), s('burpeeTimed', 30, 5)] }] },
  { name: 'Circuito 3 Total body', blocks: [{ label: '4 round', repeat: 4, roundRest: 60, steps: [s('squatKnee10', 0, 0, 10), s('pushupShoulder10', 0, 0, 10), s('backShoulder10', 0, 0, 10), s('abs10', 0, 0, 10), s('burpeeJack10', 0, 0, 10)] }] },
  { name: 'Circuito 4 Total body', blocks: [{ label: '4 round × 2', repeat: 8, roundRest: 60, steps: [s('jumpRope', 120, 0), s('burpeeKnee', 120, 0), s('absTimed', 120, 0), s('jumpRope', 120, 0), s('plankShoulder', 120, 0), s('mountainTimed', 120, 0)] }] },
  { name: 'Circuito 1 Sacco', blocks: [{ label: '45 sec', steps: [s('teepRight', 45, 15), s('teepLeft', 45, 15), s('teepAlternate', 45, 15), s('blockKickRight', 45, 15), s('blockKickLeft', 45, 15), s('jumpKneeBag', 45, 15), s('roundhouseRight', 45, 15), s('roundhouseLeft', 45, 15), s('roundhouseAlternate', 45, 15), s('elbow', 45, 15), s('jabCrossSpeed', 45, 15), s('jabCrossPower', 45, 15), s('leftHook', 45, 15), s('rightHook', 45, 15), s('uppercuts', 45, 15)] }] },
  { name: 'Circuito 2 Sacco', blocks: [{ label: '10 riprese', repeat: 10, roundRest: 300, steps: [s('boxPower', 300, 0)] }] },
  { name: 'Circuito 3 Sacco', blocks: [{ label: '5 round · 1 min', repeat: 5, steps: [s('kicks15', 60), s('punchesBurpee', 60), s('reverseLungeKnee', 60), s('teep15', 60)] }] },
];

const exerciseId = (key: string) => `approved_exercise_${key}`;
const trainingId = (name: string) => `approved_training_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
const blockId = (training: string, index: number) => `${training}_block_${index}`;
const stepId = (block: string, index: number) => `${block}_step_${index}`;

export async function seedApprovedLibrary(conn: SQLite.SQLiteDatabase): Promise<void> {
  const now = new Date().toISOString();
  await conn.withTransactionAsync(async () => {
    for (const [key, item] of Object.entries(EXERCISES)) {
      await conn.runAsync(
        `INSERT OR IGNORE INTO exercises (id,name,type,equipment,tags,mediaUrl,mediaType,note,defaultWeightKg,defaultWeightCount,createdAt,updatedAt,deletedAt)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL)`,
        exerciseId(key), item.name, item.type, item.equipment, JSON.stringify(item.tags), MEDIA[item.media], 'photo',
        item.note ?? null, item.weightKg ?? null, item.weightCount ?? null, now, now,
      );
    }

    for (const training of TRAININGS) {
      const id = trainingId(training.name);
      const present = await conn.getFirstAsync<{ id: string }>('SELECT id FROM trainings WHERE id = ?', id);
      if (present) continue;
      await conn.runAsync('INSERT INTO trainings (id,name,prepareSeconds,createdAt,updatedAt,deletedAt) VALUES (?,?,?,?,?,NULL)', id, training.name, 10, now, now);
      for (const [bi, block] of training.blocks.entries()) {
        const bid = blockId(id, bi);
        await conn.runAsync(
          `INSERT INTO blocks (id,trainingId,label,repeat,restBetweenRoundsSeconds,restAfterBlockSeconds,position,updatedAt)
           VALUES (?,?,?,?,?,?,?,?)`,
          bid, id, block.label, block.repeat ?? 1, block.roundRest ?? 0, block.afterRest ?? 0, bi, now,
        );
        for (const [si, step] of block.steps.entries()) {
          await conn.runAsync(
            `INSERT INTO steps (id,blockId,exerciseId,workSeconds,restAfterSeconds,setTargets,weightKg,weightCount,position,updatedAt)
             VALUES (?,?,?,?,?,?,?,?,?,?)`,
            stepId(bid, si), bid, exerciseId(step.exercise), step.work ?? 45, step.rest ?? 0,
            step.reps == null ? null : JSON.stringify([{ reps: step.reps }]), step.kg ?? null, step.count ?? null, si, now,
          );
        }
      }
    }
  });
}
