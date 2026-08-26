// Whole-signal pitch tracking: decimate to a pitch-friendly rate, run YIN on a
// sliding window, then clean up the resulting contour.

import { yin, rms } from './yin.js';
import { hzToMidi } from './notes.js';

export const PITCH_RATE = 16000; // plenty for a 1.2 kHz ceiling, ~3x cheaper than 48k
export const HOP_SECONDS = 0.01; // 10 ms frames

/** One-pole cascade lowpass, used as a cheap anti-alias before decimation. */
function lowpass(input, sampleRate, cutoff) {
  const out = new Float32Array(input.length);
  const dt = 1 / sampleRate;
  const rc = 1 / (2 * Math.PI * cutoff);
  const alpha = dt / (rc + dt);
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < input.length; i++) {
    y1 += alpha * (input[i] - y1);
    y2 += alpha * (y1 - y2);
    out[i] = y2;
  }
  return out;
}

/** Linear-interpolating resample to PITCH_RATE. */
export function toPitchRate(samples, sampleRate) {
  if (Math.abs(sampleRate - PITCH_RATE) < 1) return samples;
  const filtered = sampleRate > PITCH_RATE ? lowpass(samples, sampleRate, PITCH_RATE * 0.45) : samples;
  const ratio = sampleRate / PITCH_RATE;
  const outLength = Math.floor(samples.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const a = filtered[i0] ?? 0;
    const b = filtered[i0 + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/**
 * Extract a pitch contour.
 * @returns {{times:Float32Array, hz:Float32Array, midi:Float32Array,
 *            clarity:Float32Array, rms:Float32Array, hop:number}}
 */
export function trackPitch(samples, sampleRate, opts = {}) {
  const onProgress = opts.onProgress;
  const signal = toPitchRate(samples, sampleRate);
  const hop = Math.round(PITCH_RATE * (opts.hopSeconds ?? HOP_SECONDS));
  const windowSize = 1024; // 64 ms at 16 kHz -> resolves down to ~31 Hz periods
  const frameCount = Math.max(0, Math.floor((signal.length - windowSize) / hop) + 1);

  const times = new Float32Array(frameCount);
  const hzOut = new Float32Array(frameCount);
  const midiOut = new Float32Array(frameCount);
  const clarityOut = new Float32Array(frameCount);
  const rmsOut = new Float32Array(frameCount);

  const window = new Float32Array(windowSize);
  for (let f = 0; f < frameCount; f++) {
    const start = f * hop;
    window.set(signal.subarray(start, start + windowSize));
    const level = rms(window);
    const { hz, clarity } = yin(window, PITCH_RATE, opts);

    times[f] = (start + windowSize / 2) / PITCH_RATE;
    hzOut[f] = hz;
    midiOut[f] = hz > 0 ? hzToMidi(hz, opts.a4 ?? 440) : 0;
    clarityOut[f] = clarity;
    rmsOut[f] = level;

    if (onProgress && (f & 255) === 0) onProgress(f / Math.max(1, frameCount));
  }

  const track = { times, hz: hzOut, midi: midiOut, clarity: clarityOut, rms: rmsOut, hop: hop / PITCH_RATE };
  medianSmooth(track);
  return track;
}

/**
 * 5-frame median filter over voiced frames. YIN occasionally jumps an octave on
 * a single frame; smoothing keeps those from polluting the score.
 */
function medianSmooth(track) {
  const { midi, hz, clarity } = track;
  const n = midi.length;
  const src = Float32Array.from(midi);
  const scratch = [];
  for (let i = 0; i < n; i++) {
    if (src[i] === 0) continue;
    scratch.length = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) {
      if (src[j] !== 0) scratch.push(src[j]);
    }
    if (scratch.length < 3) continue;
    scratch.sort((a, b) => a - b);
    const median = scratch[scratch.length >> 1];
    // Only correct clear octave/large jumps, so real slides survive intact.
    if (Math.abs(src[i] - median) > 3) {
      midi[i] = median;
      hz[i] = 440 * Math.pow(2, (median - 69) / 12);
      clarity[i] *= 0.8;
    }
  }
}

/** Is this frame a usable sung pitch, or silence/breath/noise? */
export function isVoiced(track, index, opts = {}) {
  const minClarity = opts.minClarity ?? 0.72;
  const noiseFloor = opts.noiseFloor ?? 0.004;
  return track.hz[index] > 0 && track.clarity[index] >= minClarity && track.rms[index] >= noiseFloor;
}

/**
 * Segment a pitch contour into discrete notes. Used to turn a reference take
 * into a target the scorer can measure against.
 */
export function contourToNotes(track, opts = {}) {
  const minDuration = opts.minDuration ?? 0.09;
  const tolerance = opts.tolerance ?? 0.9; // semitones of drift before a new note
  const notes = [];
  let current = null;

  const flush = (endTime) => {
    if (!current) return;
    const duration = endTime - current.start;
    if (duration >= minDuration && current.samples.length) {
      const sorted = current.samples.slice().sort((a, b) => a - b);
      const median = sorted[sorted.length >> 1];
      notes.push({
        time: +current.start.toFixed(4),
        duration: +duration.toFixed(4),
        midi: Math.round(median),
      });
    }
    current = null;
  };

  for (let i = 0; i < track.times.length; i++) {
    const t = track.times[i];
    if (!isVoiced(track, i, opts)) {
      flush(t);
      continue;
    }
    const m = track.midi[i];
    if (current && Math.abs(m - current.reference) <= tolerance) {
      current.samples.push(m);
      current.reference = current.samples.reduce((a, b) => a + b, 0) / current.samples.length;
    } else {
      flush(t);
      current = { start: t, reference: m, samples: [m] };
    }
  }
  flush(track.times[track.times.length - 1] ?? 0);

  // Glue together neighbouring segments that landed on the same pitch.
  const merged = [];
  for (const note of notes) {
    const prev = merged[merged.length - 1];
    if (prev && prev.midi === note.midi && note.time - (prev.time + prev.duration) < 0.08) {
      prev.duration = +(note.time + note.duration - prev.time).toFixed(4);
    } else {
      merged.push(note);
    }
  }
  return merged;
}
