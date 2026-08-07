// The baseline test: a fixed sequence of short stages that measures your range
// and probes each trainable skill once, so the trainer has something concrete
// to reason from before you have recorded any songs.
//
// Each stage is a part in a generated project, which means it reuses the whole
// existing machinery — targets, recording, latency correction, scoring.

import { midiToName } from '../dsp/notes.js';

const HOME = 60; // C4, the note both range sweeps start from

/** Notes laid out one per slot. */
function sequence(midis, { start = 0, step, duration }) {
  return midis.map((midi, index) => ({
    time: +(start + index * step).toFixed(3),
    duration,
    midi,
  }));
}

/** Whole-tone sweep away from the home note, for finding where a range ends. */
function sweep(from, to) {
  const step = to > from ? 2 : -2;
  const midis = [];
  for (let midi = from; step > 0 ? midi <= to : midi >= to; midi += step) midis.push(midi);
  return midis;
}

const SWEEP_DOWN = sweep(HOME, 36);        // C4 down to C2
const SWEEP_UP = sweep(HOME, 84);          // C4 up to C6
const SWEEP_STEP = 2.6;                    // seconds per note, including the gap
const SWEEP_HOLD = 1.7;

export const BASELINE_STAGES = [
  {
    id: 'range-down',
    name: '1 · Range — downwards',
    kind: 'sweep',
    color: '#ff9f7a',
    instruction: 'Starting at middle C, sing each note as it comes and stop when you run out of comfortable notes. Do not push or growl for the bottom — silence is a perfectly good answer.',
    notes: sequence(SWEEP_DOWN, { step: SWEEP_STEP, duration: SWEEP_HOLD }),
  },
  {
    id: 'range-up',
    name: '2 · Range — upwards',
    kind: 'sweep',
    color: '#ff8fd0',
    instruction: 'Same again, going up. Let the voice change register if it wants to — falsetto counts. Stop when notes stop being singable.',
    notes: sequence(SWEEP_UP, { step: SWEEP_STEP, duration: SWEEP_HOLD }),
  },
  {
    id: 'sustain',
    name: '3 · Sustain',
    kind: 'skill',
    skills: ['breath', 'intonation'],
    color: '#7fd4ff',
    instruction: 'Three long notes. Straight tone, no vibrato, and try to sound the same at the end of each note as at the start.',
    notes: [
      { time: 0, duration: 7, midi: 60 },
      { time: 8.5, duration: 7, midi: 64 },
      { time: 17, duration: 7, midi: 67 },
    ],
  },
  {
    id: 'onsets',
    name: '4 · Onsets',
    kind: 'skill',
    skills: ['onset'],
    color: '#8effc0',
    instruction: 'Short notes with silence between. Start each one already on the pitch rather than sliding up to it.',
    notes: sequence([60, 65, 62, 67, 59, 64, 61, 60], { step: 2, duration: 1.1 }),
  },
  {
    id: 'leaps',
    name: '5 · Leaps',
    kind: 'skill',
    skills: ['leaps'],
    color: '#c9a7ff',
    instruction: 'Jumps away from a home note and back. Hear the interval before you sing it.',
    notes: sequence([60, 67, 60, 72, 60, 55, 60, 74], { step: 1.8, duration: 1.2 }),
  },
  {
    id: 'agility',
    name: '6 · Agility',
    kind: 'skill',
    skills: ['agility'],
    color: '#ffd479',
    instruction: 'A scale run up and down. Accuracy matters more than keeping up — if it falls apart, that is the useful result.',
    notes: sequence([60, 62, 64, 65, 67, 65, 64, 62, 60, 62, 64, 65, 67, 69, 67, 65, 64, 62, 60], { step: 0.32, duration: 0.28 }),
  },
  {
    id: 'timing',
    name: '7 · Timing',
    kind: 'skill',
    skills: ['timing'],
    color: '#9ede3f',
    instruction: 'One note, once a second, squarely on the click. Turn the metronome on for this one.',
    notes: sequence([60, 60, 60, 60, null, 60, 60, 60, 60].filter((m) => m !== null), { step: 1, duration: 0.6 }),
  },
];

export const BASELINE_ID = 'baseline';

/** An exercise-shaped source, so createProject() can build it like any other. */
export function baselineSource() {
  const duration = Math.max(
    ...BASELINE_STAGES.map((stage) => {
      const last = stage.notes[stage.notes.length - 1];
      return last.time + last.duration;
    }),
  );
  return {
    id: BASELINE_ID,
    kind: 'baseline',
    title: 'Baseline vocal test',
    artist: 'Assessment',
    summary: 'Seven short stages that measure your range and test each skill once.',
    key: 'C',
    bpm: 60,
    timeSig: [4, 4],
    difficulty: 1,
    duration: Math.ceil(duration) + 2,
    loop: null,
    parts: BASELINE_STAGES.map((stage) => ({
      id: stage.id,
      role: stage.id,
      name: stage.name,
      color: stage.color,
      low: Math.min(...stage.notes.map((n) => n.midi)),
      high: Math.max(...stage.notes.map((n) => n.midi)),
      tip: stage.instruction,
      notes: stage.notes,
    })),
  };
}

export function isBaselineProject(project) {
  return project?.sourceId === BASELINE_ID;
}

export function stageFor(track) {
  return BASELINE_STAGES.find((stage) => stage.id === track?.role) ?? null;
}

/**
 * Work out the range from the two sweep stages.
 *
 * Contiguity matters: one stray detection two octaves below everything else is
 * a microphone thump, not a note you can sing. Only pitches connected back to
 * the home note by an unbroken run of reached notes count.
 */
export function rangeFromSweeps(attempts) {
  const reached = new Map();
  for (const attempt of attempts) {
    if (!['range-down', 'range-up'].includes(attempt.stageId)) continue;
    for (const note of attempt.notes ?? []) {
      if (note.cents === null || note.coverage < 0.4) continue;
      const solid = note.centsAbs <= 100;
      const comfortable = note.centsAbs <= 40 && note.coverage >= 0.7;
      const current = reached.get(note.midi);
      if (!current || (solid && !current.solid) || (comfortable && !current.comfortable)) {
        reached.set(note.midi, {
          midi: note.midi,
          solid: solid || Boolean(current?.solid),
          comfortable: comfortable || Boolean(current?.comfortable),
          centsAbs: Math.min(note.centsAbs, current?.centsAbs ?? Infinity),
        });
      }
    }
  }

  const solid = [...reached.values()].filter((entry) => entry.solid).map((entry) => entry.midi).sort((a, b) => a - b);
  if (!solid.length) return null;

  const span = contiguousAround(solid, HOME, 2);
  const comfortable = [...reached.values()]
    .filter((entry) => entry.comfortable && entry.midi >= span.low && entry.midi <= span.high)
    .map((entry) => entry.midi)
    .sort((a, b) => a - b);
  const comfortableSpan = comfortable.length ? contiguousAround(comfortable, HOME, 2) : null;

  return {
    low: span.low,
    high: span.high,
    lowName: midiToName(span.low),
    highName: midiToName(span.high),
    semitones: span.high - span.low,
    comfortableLow: comfortableSpan?.low ?? null,
    comfortableHigh: comfortableSpan?.high ?? null,
    comfortableLowName: comfortableSpan ? midiToName(comfortableSpan.low) : null,
    comfortableHighName: comfortableSpan ? midiToName(comfortableSpan.high) : null,
    tested: reached.size,
  };
}

/** Longest run around `anchor` where consecutive values are within `gap`. */
function contiguousAround(sorted, anchor, gap) {
  if (!sorted.length) return { low: anchor, high: anchor };
  // Find the value nearest the anchor to grow outwards from.
  let seed = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i] - anchor) < Math.abs(sorted[seed] - anchor)) seed = i;
  }
  let low = seed;
  let high = seed;
  while (low > 0 && sorted[low] - sorted[low - 1] <= gap) low--;
  while (high < sorted.length - 1 && sorted[high + 1] - sorted[high] <= gap) high++;
  return { low: sorted[low], high: sorted[high] };
}

/** Which stages have been recorded, and what is left to do. */
export function baselineProgress(project, attempts) {
  const done = new Set(attempts.filter((a) => a.projectId === project?.id).map((a) => a.stageId));
  const stages = BASELINE_STAGES.map((stage) => ({
    ...stage,
    complete: done.has(stage.id),
    trackId: project?.tracks.find((track) => track.role === stage.id)?.id ?? null,
  }));
  return {
    stages,
    completed: stages.filter((stage) => stage.complete).length,
    total: stages.length,
    next: stages.find((stage) => !stage.complete) ?? null,
    finished: stages.every((stage) => stage.complete),
  };
}
