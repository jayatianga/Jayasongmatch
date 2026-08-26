// Note / frequency utilities. MIDI note 69 == A4 == 440 Hz (tuning reference is
// configurable so you can match recordings that sit slightly off A440).

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToHz(midi, a4 = 440) {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

export function hzToMidi(hz, a4 = 440) {
  return 69 + 12 * Math.log2(hz / a4);
}

export function midiToName(midi) {
  const m = Math.round(midi);
  const octave = Math.floor(m / 12) - 1;
  return NOTE_NAMES[((m % 12) + 12) % 12] + octave;
}

/** "C#4" / "Db4" / "G4" -> midi number. Returns null when unparseable. */
export function nameToMidi(name) {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(String(name).trim());
  if (!m) return null;
  const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()];
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return (parseInt(m[3], 10) + 1) * 12 + base + accidental;
}

/** Signed cents from `hz` to the target MIDI pitch. */
export function centsFrom(hz, targetMidi, a4 = 440) {
  return 1200 * Math.log2(hz / midiToHz(targetMidi, a4));
}

/**
 * Cents error, optionally ignoring octave. Singing the right note an octave
 * off is a different mistake than singing the wrong note, so the scorer can
 * treat it separately.
 */
export function centsError(hz, targetMidi, { octaveAgnostic = false, a4 = 440 } = {}) {
  let cents = centsFrom(hz, targetMidi, a4);
  if (octaveAgnostic) {
    cents = ((cents % 1200) + 1800) % 1200 - 600;
  }
  return cents;
}

/** Rough vocal-range label, used to suggest which part suits a singer. */
export function rangeLabel(lowMidi, highMidi) {
  return `${midiToName(lowMidi)}–${midiToName(highMidi)}`;
}
