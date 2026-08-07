// The coach. It reads the measured profile and says what to work on, why, and
// with which drill — and, for a song you want to sing, which of its demands
// your current ability does and does not meet.

import { SKILLS, SKILL_IDS, MIN_CONFIDENT_SAMPLES } from './profile.js';
import { drillsForSkill } from '../data/exercises.js';
import { midiToName } from '../dsp/notes.js';

const STRONG = 82;
const WEAK = 68;
const MIN_SAMPLES = MIN_CONFIDENT_SAMPLES; // below this a figure is not worth acting on

/**
 * @param {object} input {skills, range, attempts, baselineRange}
 * @returns {{headline, level, strengths, focus, observations, nextStep}}
 */
export function coachReport({ skills, range, attempts = [], baselineRange = null } = {}) {
  const measured = SKILL_IDS
    .map((id) => skills?.[id])
    .filter((skill) => skill && skill.value !== null && skill.samples >= MIN_SAMPLES);

  if (!measured.length) {
    return {
      headline: 'Nothing measured yet.',
      level: null,
      strengths: [],
      focus: [],
      observations: ['Run the baseline test, or record a take against some target notes, and the coach will have something to work with.'],
      nextStep: { text: 'Run the baseline vocal test', action: 'baseline' },
    };
  }

  const overall = Math.round(measured.reduce((sum, skill) => sum + skill.value, 0) / measured.length);
  const ranked = [...measured].sort((a, b) => a.value - b.value);
  const strengths = ranked.filter((skill) => skill.value >= STRONG).reverse();
  const weakest = ranked.filter((skill) => skill.value < WEAK);

  // Focus on at most three things. Practising everything at once is how people
  // improve at nothing.
  const focus = (weakest.length ? weakest : ranked.slice(0, 1)).slice(0, 3).map((skill) => ({
    id: skill.id,
    name: skill.name,
    value: skill.value,
    trend: skill.trend,
    why: whyItMatters(skill),
    fix: SKILLS[skill.id].fix,
    drills: drillsForSkill(skill.id).slice(0, 2).map((drill) => ({ id: drill.id, title: drill.title })),
  }));

  return {
    headline: headlineFor(overall, ranked, strengths),
    level: overall,
    strengths: strengths.slice(0, 3).map((skill) => ({ id: skill.id, name: skill.name, value: skill.value, detail: skill.detail })),
    focus,
    observations: observationsFor({ skills, range, attempts, baselineRange, measured }),
    nextStep: focus.length
      ? { text: `Work on ${focus[0].name.toLowerCase()}${focus[0].drills[0] ? ` with “${focus[0].drills[0].title}”` : ''}`, action: 'drill', drillId: focus[0].drills[0]?.id ?? null }
      : { text: 'Take on a harder song section', action: null },
  };
}

function headlineFor(overall, ranked, strengths) {
  const worst = ranked[0];
  if (overall >= 88) return `Solid across the board — ${overall}/100. ${strengths[0]?.name ?? 'Your strongest area'} is carrying you; push into harder material.`;
  if (overall >= 75) return `Coming along at ${overall}/100. ${worst.name} is the thing holding the rest back.`;
  if (overall >= 60) return `${overall}/100 overall. Two or three specific habits are costing you most of the difference.`;
  return `${overall}/100. Start with the fundamentals — ${worst.name.toLowerCase()} first, before anything else.`;
}

function whyItMatters(skill) {
  const trend = skill.trend;
  const direction = trend === null ? '' : trend >= 4 ? ' It is improving.' : trend <= -4 ? ' It has slipped recently.' : ' It has been flat.';
  return `${skill.blurb} Scoring ${skill.value}/100 from ${skill.samples} measured notes.${direction}`;
}

function observationsFor({ skills, range, attempts, baselineRange, measured }) {
  const notes = [];

  const usable = baselineRange ?? range;
  if (usable?.low && usable?.high) {
    const span = usable.high - usable.low;
    notes.push(
      `Your range measures ${midiToName(usable.low)}–${midiToName(usable.high)}, ${span} semitones (${(span / 12).toFixed(1)} octaves).` +
      (usable.comfortableLow && usable.comfortableHigh
        ? ` You are reliable across ${midiToName(usable.comfortableLow)}–${midiToName(usable.comfortableHigh)}.`
        : ''),
    );
  }

  // A consistent pitch bias is one habit, not many mistakes.
  const biases = attempts.map((attempt) => attempt.score?.stats?.bias).filter((value) => typeof value === 'number');
  if (biases.length >= 3) {
    const average = biases.reduce((a, b) => a + b, 0) / biases.length;
    if (Math.abs(average) >= 8) {
      notes.push(`Across ${biases.length} takes you sing ${Math.abs(Math.round(average))} cents ${average > 0 ? 'sharp' : 'flat'} on average — one habit to fix, not a scatter of mistakes.`);
    }
  }

  if (skills?.breath?.value !== null && skills?.intonation?.value !== null && skills?.breath?.samples >= MIN_SAMPLES) {
    if (skills.breath.value < skills.intonation.value - 12) {
      notes.push('Your ear is ahead of your breath: short notes land but long ones sag. That is a support problem, and sustain drills fix it faster than pitch practice will.');
    }
  }

  if (skills?.agility?.value !== null && skills?.pitch?.value !== null && skills?.agility?.samples >= MIN_SAMPLES) {
    if (skills.agility.value < skills.pitch.value - 15) {
      notes.push('You are accurate when you have time and inaccurate when you do not. Practise the fast passages slowly rather than repeatedly at speed.');
    }
  }

  const rangeEdges = skills?.rangeEdges;
  if (rangeEdges?.value !== null && rangeEdges?.samples >= MIN_SAMPLES && rangeEdges.value < 65) {
    notes.push('The extremes of your range are noticeably weaker than the middle. Choose parts that sit inside the reliable band, or transpose them there, until the edges catch up.');
  }

  if (attempts.length >= 6) {
    const recent = attempts.slice(0, 3).map((a) => a.score?.overall ?? 0);
    const older = attempts.slice(3, 6).map((a) => a.score?.overall ?? 0);
    const delta = recent.reduce((a, b) => a + b, 0) / recent.length - older.reduce((a, b) => a + b, 0) / older.length;
    if (Math.abs(delta) >= 5) {
      notes.push(`Your last three takes average ${Math.abs(Math.round(delta))} points ${delta > 0 ? 'better' : 'worse'} than the three before them.`);
    }
  }

  // Never tested and barely tested are different situations, and saying
  // "not tested" about a skill the panel above shows a number for is just
  // confusing.
  const missing = SKILL_IDS.filter((id) => !measured.some((skill) => skill.id === id));
  const untested = missing.filter((id) => !skills?.[id]?.samples).map((id) => SKILLS[id].name);
  const thin = missing.filter((id) => skills?.[id]?.samples).map((id) => SKILLS[id].name);
  if (untested.length) notes.push(`Not tested yet: ${untested.join(', ')}. The baseline test covers all of them in a few minutes.`);
  if (thin.length) notes.push(`Only lightly tested, so treat the figures as provisional: ${thin.join(', ')}. A few more takes will settle them.`);

  return notes;
}

/**
 * What a piece actually demands, measured from its target notes, set against
 * what you can currently do. This is the bridge from "a song I want to sing" to
 * "the skills it needs".
 */
export function songReadiness(project, { skills, range } = {}) {
  if (!project) return null;
  const parts = project.tracks
    .filter((track) => track.targets?.length)
    .map((track) => partDemands(track, project.transpose ?? 0));

  if (!parts.length) {
    return { parts: [], message: 'No target notes set yet, so there is nothing to measure this song against. Set targets on a part first.' };
  }

  const reliableLow = range?.comfortableLow ?? range?.reliableLow ?? range?.low ?? null;
  const reliableHigh = range?.comfortableHigh ?? range?.reliableHigh ?? range?.high ?? null;

  const assessed = parts.map((part) => {
    const issues = [];

    if (reliableHigh !== null && part.high > reliableHigh) {
      issues.push({
        severity: part.high > (range?.high ?? reliableHigh) ? 'blocking' : 'stretch',
        text: `Reaches ${midiToName(part.high)}, above your reliable top of ${midiToName(reliableHigh)}. Transpose down ${part.high - reliableHigh} semitones, or pick a lower part.`,
      });
    }
    if (reliableLow !== null && part.low < reliableLow) {
      issues.push({
        severity: part.low < (range?.low ?? reliableLow) ? 'blocking' : 'stretch',
        text: `Goes down to ${midiToName(part.low)}, below your reliable bottom of ${midiToName(reliableLow)}. Transpose up ${reliableLow - part.low} semitones, or pick a higher part.`,
      });
    }

    for (const [skillId, demanded] of Object.entries(part.demands)) {
      if (!demanded) continue;
      const skill = skills?.[skillId];
      if (!skill || skill.value === null || skill.samples < MIN_SAMPLES) {
        issues.push({ severity: 'unknown', text: `Needs ${SKILLS[skillId].name.toLowerCase()}, which you have not tested yet.` });
      } else if (skill.value < WEAK) {
        issues.push({ severity: 'stretch', text: `Needs ${SKILLS[skillId].name.toLowerCase()} (yours: ${skill.value}/100). ${SKILLS[skillId].fix}` });
      }
    }

    return {
      ...part,
      issues,
      verdict: issues.some((issue) => issue.severity === 'blocking')
        ? 'out-of-range'
        : issues.length ? 'stretch' : 'ready',
    };
  });

  return { parts: assessed };
}

/** Measure what one part asks of a singer. */
function partDemands(track, transpose) {
  const notes = track.targets.map((note) => ({ ...note, midi: note.midi + transpose })).sort((a, b) => a.time - b.time);
  const midis = notes.map((note) => note.midi);
  const low = Math.min(...midis);
  const high = Math.max(...midis);

  let leaps = 0;
  let gapEntries = 0;
  for (let i = 1; i < notes.length; i++) {
    if (Math.abs(notes[i].midi - notes[i - 1].midi) >= 5) leaps++;
    if (notes[i].time - (notes[i - 1].time + notes[i - 1].duration) >= 0.4) gapEntries++;
  }
  const fast = notes.filter((note) => note.duration <= 0.35).length;
  const long = notes.filter((note) => note.duration >= 1.5).length;

  return {
    trackId: track.id,
    name: track.name,
    color: track.color,
    low,
    high,
    span: high - low,
    noteCount: notes.length,
    demands: {
      rangeEdges: high - low >= 14,
      leaps: leaps >= Math.max(2, notes.length * 0.12),
      agility: fast >= Math.max(3, notes.length * 0.25),
      breath: long >= 2,
      onset: gapEntries >= Math.max(3, notes.length * 0.3),
      timing: notes.length >= 8,
      pitch: true,
      intonation: long >= 1,
    },
  };
}
