// The vocal profile: turning take results into skills, and accumulating those
// across attempts into a picture of what you can do and where you are weak.
//
// A skill is only scored when a take actually tested it. A song with no leaps
// says nothing about your leaps, so it contributes no sample rather than a
// misleading zero.

import { midiToName } from '../dsp/notes.js';

export const SKILLS = {
  pitch: {
    id: 'pitch',
    name: 'Pitch accuracy',
    blurb: 'Landing on the note itself.',
    fix: 'Slow practice against a drone. Sing the note, hold it, and check the meter before moving on.',
  },
  intonation: {
    id: 'intonation',
    name: 'Steadiness',
    blurb: 'Holding a pitch without wobbling around it.',
    fix: 'Straight-tone long notes. Aim for a flat line on the ribbon, then add vibrato deliberately rather than by accident.',
  },
  timing: {
    id: 'timing',
    name: 'Timing',
    blurb: 'Coming in when the part comes in.',
    fix: 'Practise with the click on, breathing a beat early so the entry is ready before it arrives.',
  },
  breath: {
    id: 'breath',
    name: 'Breath support',
    blurb: 'Keeping a long note steady and full to the end.',
    fix: 'Sustain drills. If the note sags or thins in its last third, the breath ran out before the note did — take a bigger one and spend it more slowly.',
  },
  onset: {
    id: 'onset',
    name: 'Onsets',
    blurb: 'Arriving on the note instead of sliding into it.',
    fix: 'Hear the pitch before you sing it. Use “Give me the note”, then start exactly there rather than scooping up.',
  },
  agility: {
    id: 'agility',
    name: 'Agility',
    blurb: 'Accuracy on fast-moving notes.',
    fix: 'Take the passage at half speed until every note is clean, then step the tempo up.',
  },
  leaps: {
    id: 'leaps',
    name: 'Leaps',
    blurb: 'Accuracy when the line jumps a wide interval.',
    fix: 'Practise the leap on its own: sing the lower note, hear the upper one, then jump. Fill in the interval by step first if it keeps missing.',
  },
  rangeEdges: {
    id: 'rangeEdges',
    name: 'Range extremes',
    blurb: 'Control at the top and bottom of your range.',
    fix: 'Work the edges gently and briefly. Extend by a semitone at a time rather than forcing the notes you cannot yet hold.',
  },
};

export const SKILL_IDS = Object.keys(SKILLS);

/** Below this many measured notes a skill figure is shown but not acted on. */
export const MIN_CONFIDENT_SAMPLES = 4;

const LONG_NOTE = 0.8;   // seconds — long enough to test breath
const FAST_NOTE = 0.35;  // seconds — short enough to test agility
const WIDE_LEAP = 5;     // semitones

/**
 * Score every skill a single take had something to say about.
 * @returns {Object<string,{value:number, samples:number, detail:string}|null>}
 */
export function skillsFromScore(score, { range = null } = {}) {
  const result = {};
  for (const id of SKILL_IDS) result[id] = null;
  if (!score || !score.notes?.length) return result;

  const sung = score.notes.filter((note) => note.coverage >= 0.25 && note.cents !== null);
  if (!sung.length) return result;

  result.pitch = {
    value: score.parts.pitch,
    samples: sung.length,
    detail: score.stats.medianCents === null ? '' : `median error ${score.stats.medianCents}¢`,
  };

  result.timing = {
    value: score.parts.timing,
    samples: sung.filter((note) => note.timingOffset !== null).length,
    detail: describeTiming(sung),
  };

  const steady = sung.filter((note) => note.centsSpread !== null);
  if (steady.length) {
    result.intonation = {
      value: mean(steady.map((note) => points(note.centsSpread, 12, 60))),
      samples: steady.length,
      detail: `±${round(mean(steady.map((n) => n.centsSpread)))}¢ typical wobble`,
    };
  }

  // Breath: sag and thinning across long notes only.
  const longNotes = sung.filter((note) => note.duration >= LONG_NOTE && note.drift !== null);
  if (longNotes.length) {
    const sag = mean(longNotes.map((note) => Math.abs(note.drift)));
    const thin = mean(longNotes.map((note) => Math.max(0, note.fade ?? 0)));
    result.breath = {
      value: 0.65 * points(sag, 10, 70) + 0.35 * points(thin * 100, 10, 60),
      samples: longNotes.length,
      detail: `${signed(round(mean(longNotes.map((n) => n.drift))))}¢ drift over held notes`,
    };
  }

  const onsets = sung.filter((note) => note.scoop !== null);
  if (onsets.length) {
    const scoop = mean(onsets.map((note) => Math.abs(note.scoop)));
    const settle = onsets.filter((n) => n.settleTime !== null).map((n) => n.settleTime);
    result.onset = {
      value: 0.7 * points(scoop, 20, 90) + 0.3 * points(mean(settle) * 1000, 60, 350),
      samples: onsets.length,
      detail: `${round(scoop)}¢ typical scoop into the note`,
    };
  }

  const fast = sung.filter((note) => note.duration <= FAST_NOTE);
  if (fast.length >= 2) {
    result.agility = {
      value: mean(fast.map((note) => points(note.centsAbs, 15, 90))),
      samples: fast.length,
      detail: `${fast.length} fast notes, ${round(mean(fast.map((n) => n.centsAbs)))}¢ average error`,
    };
  }

  const leaps = sung.filter((note) => (note.leap ?? 0) >= WIDE_LEAP);
  if (leaps.length) {
    result.leaps = {
      value: mean(leaps.map((note) => points(note.centsAbs, 15, 95))),
      samples: leaps.length,
      detail: `${leaps.length} leaps of ${Math.min(...leaps.map((n) => n.leap))} semitones or more`,
    };
  }

  // Range extremes are only meaningful once a range has been measured.
  if (range && isFinite(range.low) && isFinite(range.high) && range.high - range.low >= 7) {
    const edge = Math.max(2, Math.round((range.high - range.low) * 0.15));
    const extremes = sung.filter((note) => note.midi <= range.low + edge || note.midi >= range.high - edge);
    if (extremes.length) {
      result.rangeEdges = {
        value: mean(extremes.map((note) => points(note.centsAbs, 20, 100))),
        samples: extremes.length,
        detail: `${extremes.length} notes near the edges of your range`,
      };
    }
  }

  return result;
}

/**
 * Combine the skills of many attempts. Recent attempts count for more, because
 * a profile should describe where you are now, not where you started.
 */
export function aggregateSkills(attempts) {
  const out = {};
  const ordered = [...attempts].sort((a, b) => a.at - b.at);

  for (const id of SKILL_IDS) {
    const entries = [];
    ordered.forEach((attempt, index) => {
      const skill = attempt.skills?.[id];
      if (!skill || !skill.samples) return;
      // Newer attempts weigh more, tapering to about a third for the oldest.
      const recency = 0.35 + 0.65 * ((index + 1) / ordered.length);
      entries.push({ value: skill.value, weight: skill.samples * recency, at: attempt.at, raw: skill });
    });

    if (!entries.length) {
      out[id] = { id, ...SKILLS[id], value: null, samples: 0, trend: null, detail: 'Not tested yet.' };
      continue;
    }

    const value = weightedMean(entries.map((e) => [e.value, e.weight]));
    const samples = entries.reduce((sum, e) => sum + e.raw.samples, 0);
    out[id] = {
      id,
      ...SKILLS[id],
      value: round(value),
      samples,
      attempts: entries.length,
      // Below this, one lucky or unlucky phrase moves the number too far to
      // act on. The figure is still shown, but labelled for what it is.
      provisional: samples < MIN_CONFIDENT_SAMPLES,
      trend: trendOf(entries),
      detail: entries[entries.length - 1].raw.detail,
    };
  }
  return out;
}

/** Recent half against earlier half, in points. Null until there is enough. */
function trendOf(entries) {
  if (entries.length < 4) return null;
  const split = Math.floor(entries.length / 2);
  const earlier = mean(entries.slice(0, split).map((e) => e.value));
  const recent = mean(entries.slice(split).map((e) => e.value));
  return round(recent - earlier);
}

/** Merge every attempt's per-pitch accuracy into one map of your range. */
export function aggregateRange(attempts) {
  const buckets = new Map();
  for (const attempt of attempts) {
    for (const entry of attempt.rangeProfile ?? []) {
      const current = buckets.get(entry.midi) ?? {
        midi: entry.midi, name: entry.name, notes: 0, seconds: 0,
        absCentsSum: 0, biasSum: 0, inTuneSum: 0, attempts: 0, lastAt: 0, bestInTune: 0,
      };
      current.notes += entry.notes;
      current.seconds += entry.seconds;
      current.absCentsSum += entry.absCents * entry.notes;
      current.biasSum += entry.bias * entry.notes;
      current.inTuneSum += entry.inTunePct * entry.notes;
      current.bestInTune = Math.max(current.bestInTune, entry.inTunePct);
      current.attempts += 1;
      current.lastAt = Math.max(current.lastAt, attempt.at ?? 0);
      buckets.set(entry.midi, current);
    }
  }

  return [...buckets.values()]
    .map((entry) => ({
      midi: entry.midi,
      name: entry.name ?? midiToName(entry.midi),
      notes: entry.notes,
      seconds: round2(entry.seconds),
      absCents: round(entry.absCentsSum / entry.notes),
      bias: round(entry.biasSum / entry.notes),
      inTunePct: round(entry.inTuneSum / entry.notes),
      bestInTune: round(entry.bestInTune),
      attempts: entry.attempts,
      lastAt: entry.lastAt,
      confidence: confidenceFor(entry.notes),
    }))
    .sort((a, b) => a.midi - b.midi);
}

/** How much to trust a pitch's figure — one note is an anecdote. */
function confidenceFor(notes) {
  if (notes >= 12) return 'high';
  if (notes >= 5) return 'medium';
  return 'low';
}

/**
 * Reduce the range map to the headline numbers: what you can reach at all, and
 * the narrower span you are actually reliable across.
 */
export function rangeSummary(rangeMap, { reliableInTune = 60, reliableCents = 40 } = {}) {
  const sung = rangeMap.filter((entry) => entry.notes > 0);
  if (!sung.length) {
    return { low: null, high: null, reliableLow: null, reliableHigh: null, span: 0, reliableSpan: 0, strongest: null, weakest: null, notes: 0 };
  }

  const low = sung[0].midi;
  const high = sung[sung.length - 1].midi;
  const reliable = sung.filter((entry) => entry.inTunePct >= reliableInTune && entry.absCents <= reliableCents);
  const scored = sung.filter((entry) => entry.confidence !== 'low');
  const ranked = (scored.length ? scored : sung).slice().sort((a, b) => a.absCents - b.absCents);

  return {
    low,
    high,
    lowName: midiToName(low),
    highName: midiToName(high),
    span: high - low,
    reliableLow: reliable.length ? reliable[0].midi : null,
    reliableHigh: reliable.length ? reliable[reliable.length - 1].midi : null,
    reliableSpan: reliable.length ? reliable[reliable.length - 1].midi - reliable[0].midi : 0,
    strongest: ranked[0] ?? null,
    weakest: ranked[ranked.length - 1] ?? null,
    notes: sung.reduce((sum, entry) => sum + entry.notes, 0),
  };
}

/** Overall-score history, for the progress chart. */
export function scoreHistory(attempts) {
  return [...attempts]
    .sort((a, b) => a.at - b.at)
    .map((attempt) => ({
      at: attempt.at,
      overall: attempt.score?.overall ?? 0,
      label: `${attempt.projectTitle} — ${attempt.partName}`,
    }));
}

// --- helpers ---------------------------------------------------------------

/** 100 at `good` or better, 0 at `bad` or worse, linear between. */
function points(value, good, bad) {
  if (value === null || value === undefined || !isFinite(value)) return 0;
  if (value <= good) return 100;
  if (value >= bad) return 0;
  return 100 * (1 - (value - good) / (bad - good));
}

function describeTiming(notes) {
  const offsets = notes.map((note) => note.timingOffset).filter((value) => value !== null);
  if (!offsets.length) return '';
  const average = mean(offsets) * 1000;
  if (Math.abs(average) < 25) return 'entries land on the beat';
  return `entries average ${Math.abs(Math.round(average))} ms ${average > 0 ? 'late' : 'early'}`;
}

function mean(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function weightedMean(pairs) {
  let num = 0;
  let den = 0;
  for (const [value, weight] of pairs) {
    num += value * weight;
    den += weight;
  }
  return den === 0 ? 0 : num / den;
}

const round = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;
const signed = (n) => `${n > 0 ? '+' : ''}${n}`;
