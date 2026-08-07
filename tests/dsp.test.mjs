// Verification for the parts that decide your score: pitch detection, note
// segmentation and the scorer itself. Run with `npm test`.

import test from 'node:test';
import assert from 'node:assert/strict';

import { yin } from '../js/dsp/yin.js';
import { trackPitch, contourToNotes, PITCH_RATE } from '../js/dsp/pitch.js';
import { scoreTake } from '../js/score.js';
import { midiToHz, hzToMidi, nameToMidi, midiToName, centsError } from '../js/dsp/notes.js';
import { parseTargets, formatTargets } from '../js/ui/noteeditor.js';

const SAMPLE_RATE = 48000;

/**
 * A vowel-ish tone: fundamental plus a few harmonics, which is what YIN sees.
 * Phase is integrated rather than computed as 2*pi*f*t, because with a
 * time-varying f the latter produces a runaway chirp instead of vibrato.
 */
function tone(hz, seconds, { sampleRate = SAMPLE_RATE, amplitude = 0.35, centsOffset = 0, vibrato = 0, vibratoHz = 5 } = {}) {
  const frequency = hz * Math.pow(2, centsOffset / 1200);
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  let phase = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    const f = frequency * (1 + vibrato * Math.sin(2 * Math.PI * vibratoHz * t));
    phase += (2 * Math.PI * f) / sampleRate;
    samples[i] = amplitude * (Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase));
  }
  return samples;
}

function silence(seconds, sampleRate = SAMPLE_RATE) {
  return new Float32Array(Math.round(seconds * sampleRate));
}

function concat(...chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

test('note helpers round-trip', () => {
  assert.equal(nameToMidi('A4'), 69);
  assert.equal(nameToMidi('C4'), 60);
  assert.equal(nameToMidi('Db4'), 61);
  assert.equal(midiToName(69), 'A4');
  assert.equal(midiToName(48), 'C3');
  assert.ok(Math.abs(midiToHz(69) - 440) < 1e-9);
  assert.ok(Math.abs(hzToMidi(440) - 69) < 1e-9);
  assert.ok(Math.abs(centsError(midiToHz(69) * Math.pow(2, 50 / 1200), 69) - 50) < 0.01);
});

test('octave-agnostic scoring folds an octave error to zero', () => {
  const oneOctaveUp = midiToHz(69 + 12);
  assert.ok(Math.abs(centsError(oneOctaveUp, 69, { octaveAgnostic: true })) < 0.01);
  assert.ok(Math.abs(centsError(oneOctaveUp, 69) - 1200) < 0.01);
});

test('yin finds the fundamental across the vocal range', () => {
  for (const midi of [41, 48, 55, 60, 69, 76, 81]) {
    const hz = midiToHz(midi);
    const samples = tone(hz, 0.2, { sampleRate: PITCH_RATE });
    const window = samples.subarray(2000, 2000 + 1024);
    const result = yin(window, PITCH_RATE);
    const cents = Math.abs(1200 * Math.log2(result.hz / hz));
    assert.ok(result.clarity > 0.7, `clarity too low at ${midiToName(midi)}: ${result.clarity}`);
    assert.ok(cents < 12, `${midiToName(midi)} detected ${cents.toFixed(1)} cents off`);
  }
});

test('yin reports nothing for silence and noise', () => {
  const quiet = yin(silence(0.1, PITCH_RATE).subarray(0, 1024), PITCH_RATE);
  assert.equal(quiet.hz, 0);

  const noise = new Float32Array(1024);
  for (let i = 0; i < noise.length; i++) noise[i] = (Math.random() * 2 - 1) * 0.3;
  const detected = yin(noise, PITCH_RATE);
  assert.ok(detected.hz === 0 || detected.clarity < 0.75, 'noise should not read as a confident pitch');
});

test('trackPitch follows a held note at the source sample rate', () => {
  const samples = tone(midiToHz(60), 1.0);
  const track = trackPitch(samples, SAMPLE_RATE);
  const voiced = [];
  for (let i = 0; i < track.midi.length; i++) if (track.midi[i] > 0) voiced.push(track.midi[i]);
  assert.ok(voiced.length > track.midi.length * 0.8, 'most frames of a steady tone should be voiced');
  const mean = voiced.reduce((a, b) => a + b, 0) / voiced.length;
  assert.ok(Math.abs(mean - 60) < 0.15, `expected ~C4, got ${mean.toFixed(2)}`);
});

test('contourToNotes segments a three-note phrase', () => {
  const samples = concat(
    tone(midiToHz(60), 0.6),
    silence(0.2),
    tone(midiToHz(64), 0.6),
    silence(0.2),
    tone(midiToHz(67), 0.6),
  );
  const notes = contourToNotes(trackPitch(samples, SAMPLE_RATE));
  assert.equal(notes.length, 3, `expected 3 notes, got ${notes.length}`);
  assert.deepEqual(notes.map((note) => note.midi), [60, 64, 67]);
  assert.ok(Math.abs(notes[0].time - 0) < 0.12);
  assert.ok(Math.abs(notes[1].time - 0.8) < 0.12);
  assert.ok(Math.abs(notes[2].time - 1.6) < 0.12);
});

test('an accurate take scores near the top', () => {
  const targets = [
    { time: 0, duration: 0.6, midi: 60 },
    { time: 0.8, duration: 0.6, midi: 64 },
    { time: 1.6, duration: 0.6, midi: 67 },
  ];
  const samples = concat(
    tone(midiToHz(60), 0.6),
    silence(0.2),
    tone(midiToHz(64), 0.6),
    silence(0.2),
    tone(midiToHz(67), 0.6),
  );
  const result = scoreTake(trackPitch(samples, SAMPLE_RATE), targets);
  assert.ok(result.overall > 88, `expected a high score, got ${result.overall}`);
  assert.equal(result.stats.notesSung, 3);
  assert.equal(result.stats.notesMissed, 0);
  assert.ok(Math.abs(result.stats.medianCents) < 12, `median error ${result.stats.medianCents}`);
  assert.ok(result.notes.every((note) => note.verdict === 'perfect' || note.verdict === 'good'));
});

test('a flat take scores lower and is reported as flat', () => {
  const targets = [{ time: 0, duration: 1.0, midi: 60 }];
  const flat = tone(midiToHz(60), 1.0, { centsOffset: -45 });
  const result = scoreTake(trackPitch(flat, SAMPLE_RATE), targets);
  assert.ok(result.stats.bias < -30, `expected a flat bias, got ${result.stats.bias}`);
  assert.ok(result.overall < 80, `a 45-cent flat take should not score ${result.overall}`);
  assert.ok(result.advice.some((tip) => /flat/i.test(tip)), 'advice should mention singing flat');
});

test('a semitone-wrong note is graded as off, not merely fair', () => {
  const targets = [{ time: 0, duration: 1.0, midi: 60 }];
  const wrong = tone(midiToHz(61), 1.0);
  const result = scoreTake(trackPitch(wrong, SAMPLE_RATE), targets);
  assert.equal(result.notes[0].verdict, 'off');
  assert.ok(result.overall < 55, `expected a poor score, got ${result.overall}`);
});

test('silence against a target is reported as a missed note', () => {
  const targets = [{ time: 0, duration: 1.0, midi: 60 }];
  const result = scoreTake(trackPitch(silence(1.0), SAMPLE_RATE), targets);
  assert.equal(result.stats.notesMissed, 1);
  assert.equal(result.notes[0].verdict, 'missed');
  assert.equal(result.overall, 0);
});

test('a late entry is penalised on timing but not on pitch', () => {
  const targets = [{ time: 0, duration: 1.2, midi: 60 }];
  const late = concat(silence(0.35), tone(midiToHz(60), 0.85));
  const result = scoreTake(trackPitch(late, SAMPLE_RATE), targets);
  assert.ok(result.parts.pitch > 85, `pitch should stay high, got ${result.parts.pitch}`);
  assert.ok(result.parts.timing < 60, `timing should drop, got ${result.parts.timing}`);
  assert.ok(result.notes[0].timingOffset > 0.15);
});

test('a wobbling note loses stability points against a steady one', () => {
  const targets = [{ time: 0, duration: 1.2, midi: 60 }];
  const steady = scoreTake(trackPitch(tone(midiToHz(60), 1.2), SAMPLE_RATE), targets);
  const wobbly = scoreTake(trackPitch(tone(midiToHz(60), 1.2, { vibrato: 0.025 }), SAMPLE_RATE), targets);
  assert.ok(wobbly.parts.stability < steady.parts.stability, 'vibrato should cost stability');
  assert.ok(steady.parts.stability > 70);
});

test('singing one note of three well does not score as a matched part', () => {
  const targets = [
    { time: 0, duration: 2, midi: 60 },
    { time: 3, duration: 2, midi: 64 },
    { time: 6, duration: 2, midi: 67 },
  ];
  // A held C4 across the whole passage: note 1 is perfect, notes 2 and 3 are not sung.
  const take = concat(tone(midiToHz(60), 2.2), silence(5.8));
  const result = scoreTake(trackPitch(take, SAMPLE_RATE), targets);
  assert.equal(result.stats.notesTotal, 3);
  assert.equal(result.stats.notesSung, 1);
  assert.ok(result.notes[0].verdict === 'perfect' || result.notes[0].verdict === 'good');
  assert.ok(result.overall < 45, `one note of three should not score ${result.overall}`);
});

test('targets outside the recording are not judged, so punch-ins are fair', () => {
  const targets = [
    { time: 0, duration: 2, midi: 60 },
    { time: 3, duration: 2, midi: 64 },
    { time: 30, duration: 2, midi: 67 }, // long after this take ends
  ];
  const take = concat(tone(midiToHz(60), 2.2), silence(0.8), tone(midiToHz(64), 2.2));
  const result = scoreTake(trackPitch(take, SAMPLE_RATE), targets);
  assert.equal(result.stats.notesTotal, 2, 'the note beyond the take should be excluded');
  assert.equal(result.stats.notesSung, 2);
  assert.ok(result.overall > 88, `a clean punch-in should score well, got ${result.overall}`);
});

test('a take that misses the targets entirely says so', () => {
  const targets = [{ time: 40, duration: 2, midi: 60 }];
  const result = scoreTake(trackPitch(tone(midiToHz(60), 2), SAMPLE_RATE), targets);
  assert.equal(result.overall, 0);
  assert.match(result.advice[0], /does not overlap/i);
});

test('scoring an empty target list explains itself instead of throwing', () => {
  const result = scoreTake(trackPitch(tone(midiToHz(60), 0.5), SAMPLE_RATE), []);
  assert.equal(result.overall, 0);
  assert.match(result.advice[0], /target/i);
});

test('transpose shifts what counts as correct', () => {
  const targets = [{ time: 0, duration: 1.0, midi: 60 }];
  const sungUpAFifth = trackPitch(tone(midiToHz(67), 1.0), SAMPLE_RATE);
  assert.ok(scoreTake(sungUpAFifth, targets).overall < 40);
  assert.ok(scoreTake(sungUpAFifth, targets, { transpose: 7 }).overall > 88);
});

test('target notation parses both sequential and absolute forms', () => {
  const { notes, errors } = parseTargets('C4:4 R:2 E4:2\nG4 @10 1.5', 120);
  assert.deepEqual(errors, []);
  assert.equal(notes.length, 3);
  assert.equal(notes[0].midi, 60);
  assert.ok(Math.abs(notes[0].time - 0) < 1e-6);
  assert.ok(Math.abs(notes[0].duration - (2 - 0.03)) < 1e-6, 'four beats at 120 bpm is 2 s');
  assert.equal(notes[1].midi, 64);
  assert.ok(Math.abs(notes[1].time - 3) < 1e-6, 'a two-beat rest pushes the next note to 3 s');
  assert.equal(notes[2].midi, 67);
  assert.ok(Math.abs(notes[2].time - 10) < 1e-6);
  assert.ok(Math.abs(notes[2].duration - 1.5) < 1e-6);
});

test('target notation reports bad input rather than guessing', () => {
  const { notes, errors } = parseTargets('C4:4 H9:2 E4:2', 120);
  assert.equal(notes.length, 2);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /H9/);
});

test('formatTargets round-trips through parseTargets', () => {
  const original = parseTargets('C4:2 E4:2 G4:4', 120).notes;
  const round = parseTargets(formatTargets(original), 120).notes;
  assert.deepEqual(round, original);
});
