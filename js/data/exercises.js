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

// --- 5-8. Skill drills the coach prescribes --------------------------------
// Short notes with clear gaps: every entry has to be found from silence.
const onsets = [
  part('lead', [60, 65, 62, 67, 59, 64, 61, 60].map((midi, index) => ({
    time: index * 2,
    duration: 1.1,
    midi,
  }))),
];

// Widening leaps away from a home note, so the ear has to place the interval.
const LEAP_SEQUENCE = [60, 67, 60, 72, 60, 55, 60, 74, 60, 53, 60];
const leaps = [
  part('lead', LEAP_SEQUENCE.map((midi, index) => ({ time: index * 1.8, duration: 1.2, midi }))),
];

// A scale run, fast enough that only accurate placement survives.
const AGILITY_RUN = [60, 62, 64, 65, 67, 65, 64, 62, 60, 62, 64, 65, 67, 69, 67, 65, 64, 62, 60];
const agility = [
  line('lead', AGILITY_RUN, { step: 0.3, duration: 0.26 }),
];

// Entries on the beat with rests between, at a tempo slow enough that being
// late is a choice rather than a reflex.
const timing = [
  part('lead', [0, 1, 2, 3, 5, 6, 7, 8, 10, 11, 12, 13].map((beat) => ({
    time: beat,
    duration: 0.6,
    midi: 60,
  }))),
];

// `skills` tags let the coach prescribe a drill for a measured weakness. The
// ids match SKILLS in js/trainer/profile.js.
export const EXERCISES = [
  {
    id: 'ex-doowop',
    skills: ['pitch', 'intonation'],
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
    skills: ['pitch', 'intonation', 'onset'],
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
    skills: ['pitch', 'agility'],
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
    skills: ['breath', 'intonation'],
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
  {
    id: 'ex-onsets',
    skills: ['onset', 'pitch'],
    title: 'Clean onsets',
    artist: 'Built-in drill',
    kind: 'exercise',
    summary: 'Short notes with silence between them, so every entry has to be found rather than slid into. Hear the note before you sing it.',
    key: 'C',
    bpm: 60,
    timeSig: [4, 4],
    difficulty: 2,
    duration: 16,
    loop: { start: 0, end: 16 },
    parts: onsets,
  },
  {
    id: 'ex-leaps',
    skills: ['leaps', 'pitch', 'rangeEdges'],
    title: 'Interval leaps',
    artist: 'Built-in drill',
    kind: 'exercise',
    summary: 'Fifths, octaves and wider, always returning to the same home note. Sing the interval, do not feel your way up to it.',
    key: 'C',
    bpm: 60,
    timeSig: [4, 4],
    difficulty: 3,
    duration: 20,
    loop: { start: 0, end: 20 },
    parts: leaps,
  },
  {
    id: 'ex-agility',
    skills: ['agility', 'pitch'],
    title: 'Agility run',
    artist: 'Built-in drill',
    kind: 'exercise',
    summary: 'A scale run at speed. Halve the tempo until every note is clean, then bring it back up — accuracy first, speed second.',
    key: 'C',
    bpm: 100,
    timeSig: [4, 4],
    difficulty: 3,
    duration: 6,
    loop: { start: 0, end: 6 },
    parts: agility,
  },
  {
    id: 'ex-timing',
    skills: ['timing', 'onset'],
    title: 'On-the-beat entries',
    artist: 'Built-in drill',
    kind: 'exercise',
    summary: 'One note, entered squarely on the beat, with rests between. Turn the click on and breathe a beat early.',
    key: 'C',
    bpm: 60,
    timeSig: [4, 4],
    difficulty: 1,
    duration: 15,
    loop: { start: 0, end: 15 },
    parts: timing,
  },
];

/** Drills that train a given skill, best match first. */
export function drillsForSkill(skillId) {
  return EXERCISES
    .filter((exercise) => exercise.skills?.includes(skillId))
    .sort((a, b) => a.skills.indexOf(skillId) - b.skills.indexOf(skillId));
}

export function getExercise(id) {
  return EXERCISES.find((exercise) => exercise.id === id) ?? null;
}
