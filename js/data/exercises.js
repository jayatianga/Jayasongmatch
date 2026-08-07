// Built-in harmony drills. Unlike the song library these ship with real target
// notes, so the accuracy scoring works the moment you open the app — no
// reference recording needed. They are original exercises written in the same
// close-harmony style the songs use.

import { PART_ROLES } from './songs.js';

/** Build a part whose notes are laid out one per step. */
function line(role, midis, { start = 0, step, duration, name } = {}) {
  const notes = [];
  midis.forEach((midi, index) => {
    if (midi === null) return; // rest
    notes.push({ time: +(start + index * step).toFixed(3), duration, midi });
  });
  return part(role, notes, name);
}

function part(role, notes, name) {
  const preset = PART_ROLES[role];
  return {
    id: role,
    role,
    name: name ?? preset.name,
    color: preset.color,
    low: preset.low,
    high: preset.high,
    tip: preset.tip,
    notes,
  };
}

/** Five-voice chord: one sustained note per part. */
function chordAt(time, duration, voicing) {
  return Object.entries(voicing).map(([role, midi]) => ({ role, note: { time, duration, midi } }));
}

function stackExercise(chords) {
  const byRole = new Map();
  for (const chord of chords) {
    for (const { role, note } of chord) {
      if (!byRole.has(role)) byRole.set(role, []);
      byRole.get(role).push(note);
    }
  }
  return [...byRole.entries()].map(([role, notes]) => part(role, notes));
}

// --- 1. Doo-wop turnaround, five voices ------------------------------------
// I – vi – IV – V in C, one chord per bar at 80 bpm (3 s per bar).
const DOOWOP_VOICINGS = [
  { bass: 48, baritone: 52, tenor2: 55, tenor1: 60, falsetto: 64 }, // C
  { bass: 45, baritone: 52, tenor2: 57, tenor1: 60, falsetto: 64 }, // Am
  { bass: 41, baritone: 53, tenor2: 57, tenor1: 60, falsetto: 65 }, // F
  { bass: 43, baritone: 55, tenor2: 59, tenor1: 62, falsetto: 67 }, // G
];

const doowop = stackExercise(
  DOOWOP_VOICINGS.map((voicing, index) => chordAt(index * 3, 2.8, voicing)),
);

// --- 2. Staggered entries --------------------------------------------------
// Each voice joins a held C major chord a bar after the one below it, so you can
// hear your part arrive against the parts already recorded.
const ENTRY_ORDER = [
  ['bass', 48],
  ['baritone', 52],
  ['tenor2', 55],
  ['tenor1', 60],
  ['falsetto', 64],
];
const entries = ENTRY_ORDER.map(([role, midi], index) => {
  const start = index * 3;
  return part(role, [{ time: start, duration: 15 - start, midi }]);
});

// --- 3. Parallel thirds duet ----------------------------------------------
const SCALE_UP_DOWN_UPPER = [64, 65, 67, 69, 71, 72, 74, 76, 74, 72, 71, 69, 67, 65, 64];
const SCALE_UP_DOWN_LOWER = [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60];
const thirds = [
  line('tenor1', SCALE_UP_DOWN_UPPER, { step: 0.625, duration: 0.55 }),
  line('lead', SCALE_UP_DOWN_LOWER, { step: 0.625, duration: 0.55 }),
];

// --- 4. Sustain and tuning test -------------------------------------------
const sustain = [
  part('lead', [
    { time: 0, duration: 6, midi: 60 },
    { time: 7, duration: 6, midi: 64 },
    { time: 14, duration: 6, midi: 67 },
  ]),
];

export const EXERCISES = [
  {
    id: 'ex-doowop',
    title: 'Doo-wop turnaround (5 parts)',
    artist: 'Built-in drill',
    kind: 'exercise',
    summary: 'I–vi–IV–V in C with a five-voice stack, one chord per bar. Record one part at a time and watch the chord lock.',
    key: 'C',
    bpm: 80,
    timeSig: [4, 4],
    difficulty: 2,
    duration: 12,
    loop: { start: 0, end: 12 },
    parts: doowop,
  },
  {
    id: 'ex-entries',
    title: 'Staggered entries (5 parts)',
    artist: 'Built-in drill',
    kind: 'exercise',
    summary: 'A held C major chord that gains a voice every bar. The best way to learn to tune into a stack that is already sounding.',
    key: 'C',
    bpm: 80,
    timeSig: [4, 4],
    difficulty: 1,
    duration: 15,
    loop: { start: 0, end: 15 },
    parts: entries,
  },
  {
    id: 'ex-thirds',
    title: 'Parallel thirds duet',
    artist: 'Built-in drill',
    kind: 'exercise',
    summary: 'Two voices moving in thirds up and down a C major scale. Trains the interval that carries most of this repertoire.',
    key: 'C',
    bpm: 96,
    timeSig: [4, 4],
    difficulty: 2,
    duration: 10,
    loop: { start: 0, end: 10 },
    parts: thirds,
  },
  {
    id: 'ex-sustain',
    title: 'Sustain and tuning test',
    artist: 'Built-in drill',
    kind: 'exercise',
    summary: 'Three long tones with breaths between. Use this to check your input level, your latency calibration, and your sustain stability score.',
    key: 'C',
    bpm: 60,
    timeSig: [4, 4],
    difficulty: 1,
    duration: 20,
    loop: null,
    parts: sustain,
  },
];

export function getExercise(id) {
  return EXERCISES.find((exercise) => exercise.id === id) ?? null;
}
