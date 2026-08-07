// Target-note editing. Targets can come from a reference take, from a built-in
// drill, or be typed here in a compact notation.

import { nameToMidi, midiToName } from '../dsp/notes.js';

/**
 * Two accepted forms, freely mixed:
 *   Sequential (durations in beats, times accumulate):   C4:4  E4:2  R:2  G4:4
 *   Absolute   (seconds):                                C4 @3.5 1.25
 * `R` or `-` is a rest. Newlines, commas and spaces all separate entries.
 */
export function parseTargets(text, bpm = 120) {
  const beat = 60 / bpm;
  const tokens = String(text)
    .replace(/[,;]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const notes = [];
  const errors = [];
  let cursor = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // Absolute form: NAME @start duration
    if (tokens[i + 1]?.startsWith('@')) {
      const midi = nameToMidi(token);
      const start = Number(tokens[i + 1].slice(1));
      const duration = Number(tokens[i + 2]);
      if (midi === null) errors.push(`Unknown note "${token}"`);
      else if (!isFinite(start) || !isFinite(duration) || duration <= 0) errors.push(`Bad time or duration near "${token}"`);
      else notes.push({ time: round(start), duration: round(duration), midi });
      i += 2;
      continue;
    }

    // Sequential form: NAME:beats  (beats default to 1)
    const [namePart, beatsPart] = token.split(':');
    const beats = beatsPart === undefined ? 1 : Number(beatsPart);
    if (!isFinite(beats) || beats <= 0) {
      errors.push(`Bad duration in "${token}"`);
      continue;
    }
    if (/^(r|-|rest)$/i.test(namePart)) {
      cursor += beats * beat;
      continue;
    }
    const midi = nameToMidi(namePart);
    if (midi === null) {
      errors.push(`Unknown note "${namePart}"`);
      continue;
    }
    // Leave a small gap so consecutive notes are scored as separate entries.
    notes.push({ time: round(cursor), duration: round(Math.max(0.05, beats * beat - 0.03)), midi });
    cursor += beats * beat;
  }

  notes.sort((a, b) => a.time - b.time);
  return { notes, errors };
}

/** Round-trips through parseTargets(). */
export function formatTargets(notes) {
  return (notes ?? [])
    .map((note) => `${midiToName(note.midi)} @${round(note.time)} ${round(note.duration)}`)
    .join('\n');
}

export function shiftTargets(notes, { semitones = 0, seconds = 0 } = {}) {
  return notes.map((note) => ({
    ...note,
    midi: note.midi + semitones,
    time: Math.max(0, round(note.time + seconds)),
  }));
}

export function targetsSummary(notes, transpose = 0) {
  if (!notes?.length) return 'none';
  const midis = notes.map((n) => n.midi + transpose);
  const low = Math.min(...midis);
  const high = Math.max(...midis);
  const end = Math.max(...notes.map((n) => n.time + n.duration));
  return `${notes.length} notes · ${midiToName(low)}–${midiToName(high)} · ${end.toFixed(1)}s`;
}

/** Do these targets fit inside the singer's stated range for the part? */
export function rangeWarning(notes, track, transpose = 0) {
  if (!notes?.length || !track) return null;
  const midis = notes.map((n) => n.midi + transpose);
  const low = Math.min(...midis);
  const high = Math.max(...midis);
  if (low < track.low - 2) return `Lowest target ${midiToName(low)} is below the usual ${track.name} range — try transposing up.`;
  if (high > track.high + 2) return `Highest target ${midiToName(high)} is above the usual ${track.name} range — try transposing down.`;
  return null;
}

const round = (n) => Math.round(n * 1000) / 1000;
