// The trainer: deriving skills from a take, accumulating them across attempts,
// measuring a range from the baseline sweeps, and what the coach concludes.

import test from 'node:test';
import assert from 'node:assert/strict';

import { skillsFromScore, aggregateSkills, aggregateRange, rangeSummary, scoreHistory, SKILL_IDS } from '../js/trainer/profile.js';
import { buildAttempt, attemptSummary, formatReportText } from '../js/trainer/attempt.js';
import { coachReport, songReadiness } from '../js/trainer/coach.js';
import { rangeFromSweeps, baselineProgress, baselineSource, BASELINE_STAGES } from '../js/trainer/baseline.js';
import { drillsForSkill } from '../js/data/exercises.js';

/** A score object shaped like the real scorer's output. */
function makeScore(notes, overrides = {}) {
  const sung = notes.filter((n) => n.coverage >= 0.25 && n.cents !== null);
  return {
    overall: 80,
    grade: 'B',
    parts: { pitch: 80, timing: 80, coverage: 90, stability: 85, ...overrides.parts },
    stats: {
      notesTotal: notes.length,
      notesSung: sung.length,
      notesMissed: notes.length - sung.length,
      medianCents: 10,
      bias: 0,
      withinPerfect: 50,
      withinGood: 80,
      withinFair: 95,
      ...overrides.stats,
    },
    notes,
    rangeProfile: overrides.rangeProfile ?? [],
    advice: overrides.advice ?? [],
  };
}

function note(overrides = {}) {
  return {
    time: 0, duration: 1, midi: 60, name: 'C4',
    cents: 5, centsAbs: 5, centsSpread: 8, coverage: 1,
    timingOffset: 0.02, verdict: 'perfect', level: 0.2,
    leap: null, scoop: -5, drift: 2, fade: 0.05, settleTime: 0.04,
    ...overrides,
  };
}

test('a skill is only scored when the take actually tested it', () => {
  // Three slow, stepwise notes: nothing here tests agility or leaps.
  const score = makeScore([note(), note({ time: 2, midi: 62 }), note({ time: 4, midi: 64 })]);
  const skills = skillsFromScore(score);
  assert.ok(skills.pitch, 'pitch is always measurable');
  assert.equal(skills.agility, null, 'no fast notes means no agility measurement');
  assert.equal(skills.leaps, null, 'no wide intervals means no leap measurement');
  assert.equal(skills.rangeEdges, null, 'range extremes need a known range');
});

test('fast notes produce an agility measurement', () => {
  const fast = Array.from({ length: 6 }, (_, i) => note({ time: i * 0.3, duration: 0.25, midi: 60 + i, centsAbs: 8, cents: 8 }));
  const skills = skillsFromScore(makeScore(fast));
  assert.ok(skills.agility, 'short notes should be measurable');
  assert.equal(skills.agility.samples, 6);
  assert.ok(skills.agility.value > 80, `clean fast notes should score well, got ${skills.agility.value}`);
});

test('wide intervals produce a leap measurement, narrow ones do not', () => {
  const stepwise = [note(), note({ time: 2, midi: 62, leap: 2 })];
  assert.equal(skillsFromScore(makeScore(stepwise)).leaps, null);

  const jumps = [note(), note({ time: 2, midi: 72, leap: 12, cents: 40, centsAbs: 40 })];
  const skills = skillsFromScore(makeScore(jumps));
  assert.ok(skills.leaps);
  assert.equal(skills.leaps.samples, 1);
  assert.ok(skills.leaps.value < 80, 'a 40-cent miss on a leap should cost something');
});

test('breath support reads sag on long notes, not short ones', () => {
  const shortNotes = [note({ duration: 0.4, drift: 60 })];
  assert.equal(skillsFromScore(makeScore(shortNotes)).breath, null, 'short notes cannot test breath');

  const steady = skillsFromScore(makeScore([note({ duration: 6, drift: 2, fade: 0.02 })]));
  const sagging = skillsFromScore(makeScore([note({ duration: 6, drift: -45, fade: 0.4 })]));
  assert.ok(steady.breath.value > sagging.breath.value + 30,
    `sagging should cost breath points (${steady.breath.value} vs ${sagging.breath.value})`);
});

test('onsets read the scoop into the note', () => {
  const clean = skillsFromScore(makeScore([note({ scoop: -3, settleTime: 0.03 })]));
  const scooped = skillsFromScore(makeScore([note({ scoop: -90, settleTime: 0.3 })]));
  assert.ok(clean.onset.value > scooped.onset.value + 30,
    `a big scoop should cost onset points (${clean.onset.value} vs ${scooped.onset.value})`);
});

test('range extremes are only measured against a known range', () => {
  const notes = [note({ midi: 48, cents: 60, centsAbs: 60 }), note({ time: 2, midi: 60 })];
  assert.equal(skillsFromScore(makeScore(notes)).rangeEdges, null);
  const withRange = skillsFromScore(makeScore(notes), { range: { low: 48, high: 72 } });
  assert.ok(withRange.rangeEdges, 'the bottom note is at the edge of that range');
  assert.ok(withRange.rangeEdges.value < 80);
});

test('a take with nothing sung yields no skills at all', () => {
  const skills = skillsFromScore(makeScore([note({ coverage: 0, cents: null, centsAbs: null, verdict: 'missed' })]));
  for (const id of SKILL_IDS) assert.equal(skills[id], null, `${id} should be unmeasured`);
});

// --- aggregation -----------------------------------------------------------

function attempt(at, skillValues, extra = {}) {
  const skills = {};
  for (const id of SKILL_IDS) skills[id] = null;
  for (const [id, value] of Object.entries(skillValues)) skills[id] = { value, samples: 6, detail: '' };
  return { id: `a${at}`, at, skills, score: { overall: skillValues.pitch ?? 70, stats: { bias: 0 } }, rangeProfile: [], projectTitle: 'T', partName: 'P', ...extra };
}

test('aggregate weights recent attempts more heavily', () => {
  const skills = aggregateSkills([attempt(1, { pitch: 40 }), attempt(2, { pitch: 40 }), attempt(3, { pitch: 90 }), attempt(4, { pitch: 90 })]);
  const plain = (40 + 40 + 90 + 90) / 4;
  assert.ok(skills.pitch.value > plain, `recency weighting should pull above the flat mean (${skills.pitch.value} vs ${plain})`);
});

test('trend compares recent attempts with earlier ones', () => {
  const improving = aggregateSkills([attempt(1, { pitch: 50 }), attempt(2, { pitch: 52 }), attempt(3, { pitch: 70 }), attempt(4, { pitch: 74 })]);
  assert.ok(improving.pitch.trend > 10, `expected a positive trend, got ${improving.pitch.trend}`);

  const declining = aggregateSkills([attempt(1, { pitch: 80 }), attempt(2, { pitch: 78 }), attempt(3, { pitch: 60 }), attempt(4, { pitch: 58 })]);
  assert.ok(declining.pitch.trend < -10);
});

test('trend stays null until there is enough history', () => {
  const skills = aggregateSkills([attempt(1, { pitch: 50 }), attempt(2, { pitch: 90 })]);
  assert.equal(skills.pitch.trend, null);
});

test('an untested skill aggregates to null rather than zero', () => {
  const skills = aggregateSkills([attempt(1, { pitch: 80 })]);
  assert.equal(skills.leaps.value, null);
  assert.equal(skills.leaps.samples, 0);
  assert.match(skills.leaps.detail, /not tested/i);
});

test('a thinly-measured skill is marked provisional, not presented as settled', () => {
  const thin = { id: 'x', at: 1, skills: { pitch: { value: 100, samples: 2, detail: '' } }, score: { overall: 100, stats: {} }, rangeProfile: [] };
  const skills = aggregateSkills([thin]);
  assert.equal(skills.pitch.samples, 2);
  assert.equal(skills.pitch.provisional, true);

  const solid = aggregateSkills([{ ...thin, skills: { pitch: { value: 100, samples: 20, detail: '' } } }]);
  assert.equal(solid.pitch.provisional, false);
});

test('the coach separates never-tested skills from barely-tested ones', () => {
  const attempts = Array.from({ length: 4 }, (_, i) => attempt(i + 1, { pitch: 80 }));
  // Give steadiness a value, but from too few notes to act on.
  attempts[3].skills.intonation = { value: 95, samples: 2, detail: '' };

  const skills = aggregateSkills(attempts);
  const report = coachReport({ skills, range: rangeSummary([]), attempts });
  const text = report.observations.join(' | ');

  assert.ok(/Only lightly tested.*Steadiness/i.test(text), text);
  assert.ok(!/Not tested yet[^|]*Steadiness/i.test(text),
    'a skill the panel shows a number for must not be called untested');
  assert.ok(/Not tested yet[^|]*Agility/i.test(text), 'genuinely untested skills are still listed');
});

test('range aggregation merges per-pitch accuracy across attempts', () => {
  const attempts = [
    { at: 1, rangeProfile: [{ midi: 60, name: 'C4', notes: 2, seconds: 2, absCents: 10, bias: 10, inTunePct: 100 }] },
    { at: 2, rangeProfile: [{ midi: 60, name: 'C4', notes: 2, seconds: 2, absCents: 30, bias: -30, inTunePct: 0 },
                            { midi: 72, name: 'C5', notes: 1, seconds: 1, absCents: 60, bias: 60, inTunePct: 0 }] },
  ];
  const map = aggregateRange(attempts);
  assert.equal(map.length, 2);
  const c4 = map.find((entry) => entry.midi === 60);
  assert.equal(c4.notes, 4);
  assert.equal(c4.absCents, 20, 'weighted mean of 10 and 30');
  assert.equal(c4.bias, -10);
  assert.equal(c4.inTunePct, 50);
  assert.equal(map.find((entry) => entry.midi === 72).confidence, 'low', 'one note is not confident');
});

test('range summary separates what you can reach from what you can rely on', () => {
  const map = aggregateRange([{
    at: 1,
    rangeProfile: [
      { midi: 48, name: 'C3', notes: 8, seconds: 8, absCents: 70, bias: -70, inTunePct: 10 },  // reachable, unreliable
      { midi: 60, name: 'C4', notes: 8, seconds: 8, absCents: 8, bias: 2, inTunePct: 95 },
      { midi: 64, name: 'E4', notes: 8, seconds: 8, absCents: 12, bias: 4, inTunePct: 88 },
      { midi: 76, name: 'E5', notes: 8, seconds: 8, absCents: 80, bias: 80, inTunePct: 5 },    // reachable, unreliable
    ],
  }]);
  const summary = rangeSummary(map);
  assert.equal(summary.low, 48);
  assert.equal(summary.high, 76);
  assert.equal(summary.reliableLow, 60, 'the unreliable bottom note is excluded');
  assert.equal(summary.reliableHigh, 64);
  assert.equal(summary.strongest.midi, 60);
  assert.equal(summary.weakest.midi, 76);
});

test('score history is ordered oldest first', () => {
  const history = scoreHistory([attempt(3, { pitch: 90 }), attempt(1, { pitch: 50 }), attempt(2, { pitch: 70 })]);
  assert.deepEqual(history.map((point) => point.at), [1, 2, 3]);
});

// --- baseline --------------------------------------------------------------

function sweepAttempt(stageId, notes) {
  return { id: stageId, at: 1, stageId, projectId: 'p', notes };
}

test('range comes from the sweeps, ignoring notes that were not sung', () => {
  const down = sweepAttempt('range-down', [
    note({ midi: 60, cents: 5, centsAbs: 5 }),
    note({ midi: 58, cents: 8, centsAbs: 8 }),
    note({ midi: 56, cents: 12, centsAbs: 12 }),
    note({ midi: 54, coverage: 0, cents: null, centsAbs: null }),  // ran out of voice
    note({ midi: 52, coverage: 0, cents: null, centsAbs: null }),
  ]);
  const up = sweepAttempt('range-up', [
    note({ midi: 60, cents: 4, centsAbs: 4 }),
    note({ midi: 62, cents: 9, centsAbs: 9 }),
    note({ midi: 64, cents: 15, centsAbs: 15 }),
    note({ midi: 66, coverage: 0, cents: null, centsAbs: null }),
  ]);

  const range = rangeFromSweeps([down, up]);
  assert.equal(range.low, 56);
  assert.equal(range.high, 64);
  assert.equal(range.lowName, 'G#3');
  assert.equal(range.semitones, 8);
});

test('a stray detection far from the rest does not extend the range', () => {
  const down = sweepAttempt('range-down', [
    note({ midi: 60, cents: 3, centsAbs: 3 }),
    note({ midi: 58, cents: 5, centsAbs: 5 }),
    note({ midi: 56, coverage: 0, cents: null, centsAbs: null }),
    note({ midi: 54, coverage: 0, cents: null, centsAbs: null }),
    note({ midi: 40, cents: 20, centsAbs: 20 }),   // a thump, an octave below anything real
  ]);
  const range = rangeFromSweeps([down]);
  assert.equal(range.low, 58, 'the disconnected note is not part of the range');
  assert.equal(range.high, 60);
});

test('the comfortable band is narrower than what can be reached', () => {
  const up = sweepAttempt('range-up', [
    note({ midi: 60, cents: 4, centsAbs: 4 }),
    note({ midi: 62, cents: 6, centsAbs: 6 }),
    note({ midi: 64, cents: 85, centsAbs: 85, coverage: 0.5 }), // reached but not controlled
  ]);
  const range = rangeFromSweeps([up]);
  assert.equal(range.high, 64);
  assert.equal(range.comfortableHigh, 62);
});

test('sweeps with nothing sung report no range at all', () => {
  const empty = sweepAttempt('range-down', [note({ coverage: 0, cents: null, centsAbs: null })]);
  assert.equal(rangeFromSweeps([empty]), null);
});

test('baseline progress tracks which stages are done', () => {
  const source = baselineSource();
  const project = { id: 'p', tracks: source.parts.map((part) => ({ id: `t-${part.id}`, role: part.role })) };
  const attempts = [{ projectId: 'p', stageId: 'range-down' }, { projectId: 'p', stageId: 'sustain' }];
  const progress = baselineProgress(project, attempts);

  assert.equal(progress.total, BASELINE_STAGES.length);
  assert.equal(progress.completed, 2);
  assert.equal(progress.next.id, 'range-up', 'the next incomplete stage in order');
  assert.equal(progress.finished, false);
});

test('the baseline source builds a part per stage with notes attached', () => {
  const source = baselineSource();
  assert.equal(source.parts.length, BASELINE_STAGES.length);
  assert.ok(source.parts.every((part) => part.notes.length > 0));

  // Every stage starts at zero and shares one timeline, so the project is as
  // long as its longest stage — not the sum of them. You record the stages one
  // after another, but each is its own pass over the same few seconds.
  const longest = Math.max(...BASELINE_STAGES.map((stage) => {
    const last = stage.notes[stage.notes.length - 1];
    return last.time + last.duration;
  }));
  assert.ok(source.duration >= longest, `project must cover its longest stage (${longest}s)`);
  assert.ok(source.duration < longest + 5, 'and should not pad far beyond it');
  assert.ok(source.parts.every((part) => part.notes[0].time === 0), 'each stage starts at zero');
});

// --- coach -----------------------------------------------------------------

test('the coach asks for a baseline when nothing has been measured', () => {
  const report = coachReport({ skills: aggregateSkills([]), range: rangeSummary([]), attempts: [] });
  assert.equal(report.level, null);
  assert.equal(report.nextStep.action, 'baseline');
});

test('the coach focuses on the weakest skills and prescribes a drill', () => {
  const attempts = Array.from({ length: 4 }, (_, i) => attempt(i + 1, { pitch: 90, timing: 35, breath: 88, intonation: 86 }));
  const report = coachReport({ skills: aggregateSkills(attempts), range: rangeSummary([]), attempts });

  assert.equal(report.focus[0].id, 'timing');
  assert.ok(report.focus[0].drills.length, 'a weak skill should come with a drill');
  assert.ok(report.strengths.some((skill) => skill.id === 'pitch'));
  assert.match(report.headline, /timing/i);
});

test('the coach never sets more than three things to work on', () => {
  const weak = {};
  for (const id of SKILL_IDS) weak[id] = 30;
  const attempts = Array.from({ length: 4 }, (_, i) => attempt(i + 1, weak));
  const report = coachReport({ skills: aggregateSkills(attempts), range: rangeSummary([]), attempts });
  assert.ok(report.focus.length <= 3, `expected at most 3 focus areas, got ${report.focus.length}`);
});

test('the coach names a persistent tuning bias as one habit', () => {
  const attempts = Array.from({ length: 4 }, (_, i) => ({
    ...attempt(i + 1, { pitch: 70 }),
    score: { overall: 70, stats: { bias: -22 } },
  }));
  const report = coachReport({ skills: aggregateSkills(attempts), range: rangeSummary([]), attempts });
  assert.ok(report.observations.some((text) => /flat/i.test(text)), report.observations.join(' | '));
});

test('every skill has at least one drill that trains it', () => {
  for (const id of SKILL_IDS) {
    if (id === 'rangeEdges') continue; // covered by the leaps drill and by transposing songs
    assert.ok(drillsForSkill(id).length > 0, `no drill trains ${id}`);
  }
});

// --- song readiness --------------------------------------------------------

function projectWith(targets) {
  return {
    id: 'p', title: 'Song', transpose: 0,
    tracks: [{ id: 't', name: 'Falsetto', color: '#fff', targets }],
  };
}

test('readiness flags a part that sits above your range', () => {
  const project = projectWith([{ time: 0, duration: 1, midi: 81 }, { time: 2, duration: 1, midi: 79 }]);
  const readiness = songReadiness(project, {
    skills: aggregateSkills([attempt(1, { pitch: 90 })]),
    range: { low: 48, high: 72, comfortableLow: 52, comfortableHigh: 69 },
  });
  assert.equal(readiness.parts[0].verdict, 'out-of-range');
  assert.match(readiness.parts[0].issues[0].text, /above your reliable top/i);
  assert.match(readiness.parts[0].issues[0].text, /transpose down 12/i);
});

test('readiness passes a part that fits and needs nothing you are weak at', () => {
  const project = projectWith([{ time: 0, duration: 1, midi: 60 }, { time: 2, duration: 1, midi: 62 }]);
  const strong = {};
  for (const id of SKILL_IDS) strong[id] = 92;
  const readiness = songReadiness(project, {
    skills: aggregateSkills(Array.from({ length: 4 }, (_, i) => attempt(i + 1, strong))),
    range: { low: 48, high: 72, comfortableLow: 52, comfortableHigh: 69 },
  });
  assert.equal(readiness.parts[0].verdict, 'ready');
});

test('readiness says so when there are no targets to measure against', () => {
  const readiness = songReadiness(projectWith([]), { skills: aggregateSkills([]), range: null });
  assert.match(readiness.message, /no target notes/i);
});

// --- attempt records -------------------------------------------------------

const sampleProject = { id: 'p', title: 'Sloop', kind: 'song', sourceId: 's', transpose: 0 };
const sampleTrack = { id: 't', name: 'Bass', role: 'bass', color: '#f00' };
const sampleTake = { id: 'tk', name: 'Take 2', duration: 12.5 };

test('an attempt record stands alone from the project it came from', () => {
  const score = makeScore([note(), note({ time: 2, midi: 64 })]);
  const record = buildAttempt({ project: sampleProject, track: sampleTrack, take: sampleTake, score });

  assert.equal(record.projectTitle, 'Sloop');
  assert.equal(record.partName, 'Bass');
  assert.equal(record.takeName, 'Take 2');
  assert.equal(record.notes.length, 2);
  assert.ok(record.at > 0);
  assert.ok(record.skills.pitch, 'skills are computed at record time');
});

test('a skill filter limits what a baseline stage reports', () => {
  const score = makeScore([note(), note({ time: 2, midi: 64 })]);
  const record = buildAttempt({
    project: sampleProject, track: sampleTrack, take: sampleTake, score,
    stageId: 'range-down', skillFilter: ['pitch'],
  });
  assert.ok(record.skills.pitch, 'the filtered-in skill survives');
  assert.equal(record.skills.timing, null, 'a range sweep must not report timing');
  assert.equal(record.stageId, 'range-down');
});

test('attemptSummary reports the pitches covered', () => {
  const score = makeScore([note({ midi: 55 }), note({ time: 2, midi: 67 })]);
  const summary = attemptSummary(buildAttempt({ project: sampleProject, track: sampleTrack, take: sampleTake, score }));
  assert.equal(summary.lowest, 'G3');
  assert.equal(summary.highest, 'G4');
  assert.equal(summary.notesSung, 2);
});

test('the text report contains the headline numbers', () => {
  const score = makeScore([note(), note({ time: 2, midi: 64, cents: -40, centsAbs: 40, verdict: 'fair' })]);
  const text = formatReportText(buildAttempt({ project: sampleProject, track: sampleTrack, take: sampleTake, score }));

  assert.match(text, /ATTEMPT REPORT — Sloop/);
  assert.match(text, /Part: Bass/);
  assert.match(text, /OVERALL\s+80\/100/);
  assert.match(text, /Note by note/);
  assert.match(text, /-40c/, 'the per-note errors are listed');
});
