// Accuracy scoring: compare a recorded take's pitch contour against the target
// notes for that harmony part, and produce both an overall grade and a per-note
// breakdown you can act on.

import { isVoiced } from './dsp/pitch.js';
import { centsError, midiToName } from './dsp/notes.js';

// Weights for the overall score. Pitch dominates because that is what makes a
// stack of harmonies lock; timing and coverage are the next things that break.
const WEIGHTS = { pitch: 0.6, timing: 0.18, coverage: 0.14, stability: 0.08 };

// A note is "clean" inside this window. 25 cents is roughly the point where a
// held harmony starts to beat audibly against the part above it.
export const TOLERANCE_CENTS = { perfect: 10, good: 25, fair: 50 };

/**
 * @param {object} track     pitch contour from trackPitch()
 * @param {Array}  targets   [{time, duration, midi}] in take-relative seconds
 * @param {object} opts      {octaveAgnostic, a4, minClarity, noiseFloor, transpose}
 */
export function scoreTake(track, targets, opts = {}) {
  const octaveAgnostic = opts.octaveAgnostic ?? false;
  const transpose = opts.transpose ?? 0;
  const a4 = opts.a4 ?? 440;

  if (!targets || !targets.length) {
    return emptyResult('No target notes set for this part yet.');
  }
  if (!track || !track.times.length) {
    return emptyResult('Nothing recorded to analyse.');
  }

  // Only judge the targets this recording actually covers. Punching in on the
  // last four bars should not be marked down for the bars you never attempted,
  // but every note you *did* record over counts, sung or not.
  const analysisEnd = opts.takeDuration ?? track.times[track.times.length - 1] ?? 0;
  const ordered = [...targets]
    .sort((a, b) => a.time - b.time)
    .filter((target) => {
      const midpoint = target.time + target.duration / 2;
      return midpoint >= 0 && midpoint <= analysisEnd;
    });

  if (!ordered.length) {
    return emptyResult('This take does not overlap any target notes for this part. Check where the take starts, or record over the passage the targets cover.');
  }

  const notes = [];
  for (let index = 0; index < ordered.length; index++) {
    const target = ordered[index];
    const targetMidi = target.midi + transpose;
    // Ignore the attack and release edges: scoops and cutoffs are musical, and
    // grading them punishes takes that actually sound right. The guards also
    // need to exceed the analyser's half-window, or the frames at each edge
    // straddle silence and read as missing coverage.
    const guard = Math.min(0.06, target.duration * 0.2);
    const from = target.time + guard;
    const to = target.time + target.duration - Math.min(0.05, target.duration * 0.15);

    const centsSamples = [];
    let voicedFrames = 0;
    let totalFrames = 0;
    let onsetTime = null;
    let peakLevel = 0;

    for (let i = 0; i < track.times.length; i++) {
      const t = track.times[i];
      if (t < from) continue;
      if (t > to) break;
      totalFrames++;
      if (!isVoiced(track, i, opts)) continue;
      voicedFrames++;
      peakLevel = Math.max(peakLevel, track.rms[i]);
      if (onsetTime === null) onsetTime = t;
      centsSamples.push(centsError(track.hz[i], targetMidi, { octaveAgnostic, a4 }));
    }

    // Look slightly outside the note for the real onset, so an early or late
    // entrance is reported as a timing error rather than as missing coverage.
    // The backward search must never cross into the previous target, or the
    // tail of that note gets mistaken for an early entry on this one.
    const previous = ordered[index - 1];
    const earliest = previous ? Math.max(target.time - 0.25, previous.time + previous.duration) : target.time - 0.25;
    const searchOnset = findOnset(track, earliest, target.time + Math.min(0.35, target.duration), opts);

    notes.push(buildNoteResult(target, targetMidi, centsSamples, voicedFrames, totalFrames, searchOnset ?? onsetTime, peakLevel));
  }

  const sung = notes.filter((n) => n.coverage >= 0.25);
  const totalDuration = ordered.reduce((sum, t) => sum + t.duration, 0) || 1;

  // Every covered note is averaged in, a skipped one as a zero. Averaging over
  // only the notes you sang would let a take that nails one note out of three
  // score as though it had matched the part.
  //
  // Timing and stability are additionally gated on credibility: singing a
  // confident, steady, perfectly-timed *wrong* pitch should not bank the
  // non-pitch components, which is exactly the mistake this tool exists to catch.
  const scoreOf = (note, points) => (note.coverage >= 0.25 ? points(note) : 0);
  const pitchScore = weightedMean(notes.map((n) => [scoreOf(n, (x) => pitchPoints(x.centsAbs)), n.duration])) ?? 0;
  const timingScore = weightedMean(notes.map((n) => [scoreOf(n, (x) => timingPoints(x.timingOffset) * x.credibility), n.duration])) ?? 0;
  const stabilityScore = weightedMean(notes.map((n) => [scoreOf(n, (x) => stabilityPoints(x.centsSpread) * x.credibility), n.duration])) ?? 0;
  const coverageScore = 100 * (notes.reduce((sum, n) => sum + n.coverage * n.credibility * n.duration, 0) / totalDuration);

  const overall = sung.length === 0
    ? 0
    : WEIGHTS.pitch * pitchScore +
      WEIGHTS.timing * timingScore +
      WEIGHTS.coverage * coverageScore +
      WEIGHTS.stability * stabilityScore;

  const allCents = sung.flatMap((n) => (n.centsAbs === null ? [] : [n.centsAbs]));
  const inTune = (limit) => (sung.length ? (100 * sung.filter((n) => n.centsAbs !== null && n.centsAbs <= limit).length) / sung.length : 0);

  return {
    overall: round(overall),
    grade: gradeFor(overall),
    parts: {
      pitch: round(pitchScore),
      timing: round(timingScore),
      coverage: round(coverageScore),
      stability: round(stabilityScore),
    },
    stats: {
      notesTotal: notes.length,
      notesSung: sung.length,
      notesMissed: notes.length - sung.length,
      medianCents: allCents.length ? round(median(allCents)) : null,
      // A consistent sign here means you are singing systematically sharp or
      // flat, which is a different fix from being merely inconsistent.
      bias: sung.length ? round(mean(sung.map((n) => n.cents ?? 0))) : null,
      withinPerfect: round(inTune(TOLERANCE_CENTS.perfect)),
      withinGood: round(inTune(TOLERANCE_CENTS.good)),
      withinFair: round(inTune(TOLERANCE_CENTS.fair)),
    },
    notes,
    advice: buildAdvice(notes, sung, overall),
  };
}

function buildNoteResult(target, targetMidi, centsSamples, voicedFrames, totalFrames, onsetTime, peakLevel) {
  const coverage = totalFrames > 0 ? voicedFrames / totalFrames : 0;
  const hasPitch = centsSamples.length > 0;
  const cents = hasPitch ? median(centsSamples) : null;
  const spread = hasPitch ? standardDeviation(centsSamples) : null;
  const timingOffset = onsetTime === null ? null : onsetTime - target.time;

  return {
    time: target.time,
    duration: target.duration,
    midi: targetMidi,
    name: midiToName(targetMidi),
    credibility: credibilityFor(cents),
    coverage: round2(coverage),
    cents: cents === null ? null : round(cents),
    centsAbs: cents === null ? null : round(Math.abs(cents)),
    centsSpread: spread === null ? null : round(spread),
    timingOffset: timingOffset === null ? null : round2(timingOffset),
    level: round2(peakLevel),
    verdict: verdictFor(coverage, cents),
  };
}

function verdictFor(coverage, cents) {
  if (coverage < 0.25 || cents === null) return 'missed';
  const abs = Math.abs(cents);
  if (abs <= TOLERANCE_CENTS.perfect) return 'perfect';
  if (abs <= TOLERANCE_CENTS.good) return 'good';
  if (abs <= TOLERANCE_CENTS.fair) return 'fair';
  return 'off';
}

/**
 * How much this counts as the target note at all: full credit inside a quarter
 * tone, nothing once you are a semitone and a half out — by then you are
 * singing a different note, however well you sang it.
 */
function credibilityFor(cents) {
  if (cents === null) return 0;
  const abs = Math.abs(cents);
  if (abs <= TOLERANCE_CENTS.fair) return 1;
  return Math.max(0, Math.min(1, 1 - (abs - TOLERANCE_CENTS.fair) / 100));
}

/** 0 cents -> 100 points, decaying to 0 at a full semitone out. */
function pitchPoints(centsAbs) {
  if (centsAbs === null) return 0;
  return 100 * Math.max(0, 1 - Math.pow(Math.min(centsAbs, 100) / 100, 1.35));
}

/** Within 30 ms is free; 250 ms out scores nothing. */
function timingPoints(offset) {
  if (offset === null) return 0;
  const abs = Math.abs(offset);
  if (abs <= 0.03) return 100;
  return 100 * Math.max(0, 1 - (abs - 0.03) / 0.22);
}

/** Rewards a steady held pitch; 60 cents of wobble scores nothing. */
function stabilityPoints(spread) {
  if (spread === null) return 0;
  return 100 * Math.max(0, 1 - spread / 60);
}

function findOnset(track, from, to, opts) {
  for (let i = 0; i < track.times.length; i++) {
    const t = track.times[i];
    if (t < from) continue;
    if (t > to) return null;
    if (isVoiced(track, i, opts)) return t;
  }
  return null;
}

function buildAdvice(notes, sung, overall) {
  const tips = [];
  if (!sung.length) {
    tips.push('No sung pitch was detected inside the target notes. Check that the right input device is selected and that the take is loud enough.');
    return tips;
  }
  const bias = mean(sung.map((n) => n.cents ?? 0));
  if (bias > 12) tips.push(`You are running ${Math.round(bias)} cents sharp on average — ease off the support and let the note settle.`);
  if (bias < -12) tips.push(`You are running ${Math.round(Math.abs(bias))} cents flat on average — more breath support, especially on held notes.`);

  const missed = notes.filter((n) => n.verdict === 'missed');
  if (missed.length) {
    tips.push(`${missed.length} target note${missed.length > 1 ? 's' : ''} had little or no sung pitch (first at ${formatTime(missed[0].time)}).`);
  }

  const late = sung.filter((n) => (n.timingOffset ?? 0) > 0.08);
  const early = sung.filter((n) => (n.timingOffset ?? 0) < -0.08);
  if (late.length > sung.length * 0.25) tips.push('Entries are consistently late — try breathing a beat earlier into each phrase.');
  if (early.length > sung.length * 0.25) tips.push('Entries are consistently early — if the whole take is early, run Calibrate Latency in the transport bar.');

  const wobbly = sung.filter((n) => (n.centsSpread ?? 0) > 35);
  if (wobbly.length > sung.length * 0.3) tips.push('Held notes are drifting. Aim for a straighter tone — block harmonies lock better without wide vibrato.');

  const worst = sung
    .filter((n) => n.centsAbs !== null)
    .sort((a, b) => b.centsAbs - a.centsAbs)
    .slice(0, 3)
    .filter((n) => n.centsAbs > TOLERANCE_CENTS.good);
  if (worst.length) {
    tips.push(`Weakest notes: ${worst.map((n) => `${n.name} at ${formatTime(n.time)} (${n.cents > 0 ? '+' : ''}${n.cents}¢)`).join(', ')}.`);
  }

  if (overall >= 90 && tips.length === 0) tips.push('This part is locked in. Try it against the full stack with the other parts unmuted.');
  return tips;
}

function emptyResult(message) {
  return {
    overall: 0,
    grade: '—',
    parts: { pitch: 0, timing: 0, coverage: 0, stability: 0 },
    stats: { notesTotal: 0, notesSung: 0, notesMissed: 0, medianCents: null, bias: null, withinPerfect: 0, withinGood: 0, withinFair: 0 },
    notes: [],
    advice: [message],
  };
}

export function gradeFor(score) {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 85) return 'B+';
  if (score >= 78) return 'B';
  if (score >= 70) return 'C+';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

export function formatTime(seconds) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest.toFixed(2).padStart(5, '0')}`;
}

function weightedMean(pairs) {
  if (!pairs.length) return null;
  let num = 0;
  let den = 0;
  for (const [value, weight] of pairs) {
    num += value * weight;
    den += weight;
  }
  return den === 0 ? null : num / den;
}

function mean(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function standardDeviation(values) {
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) * (v - m))));
}

const round = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;
