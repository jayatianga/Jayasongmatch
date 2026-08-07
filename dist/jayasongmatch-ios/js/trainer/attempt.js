// One record per analysed take. This is what the progress database stores and
// what every trainer view is computed from, so it has to stand alone: the
// project it came from may later be edited or deleted.

import { skillsFromScore } from './profile.js';
import { midiToName } from '../dsp/notes.js';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `attempt-${Date.now()}-${Math.random().toString(16).slice(2)}`);

/** Keep the per-note detail the trainer needs, drop what it does not. */
function compactNotes(notes) {
  return (notes ?? []).map((note) => ({
    time: note.time,
    duration: note.duration,
    midi: note.midi,
    name: note.name,
    cents: note.cents,
    centsAbs: note.centsAbs,
    centsSpread: note.centsSpread,
    coverage: note.coverage,
    timingOffset: note.timingOffset,
    verdict: note.verdict,
    leap: note.leap,
    scoop: note.scoop,
    drift: note.drift,
    fade: note.fade,
    settleTime: note.settleTime,
    level: note.level,
  }));
}

/**
 * @param {string[]|null} skillFilter  Only keep these skills. Used by baseline
 *   stages that are not trying to measure everything: a range sweep is one long
 *   glide through your compass, so its "entries" say nothing about your timing
 *   and would drag that skill down for no reason.
 */
export function buildAttempt({ project, track, take, score, range = null, stageId = null, skillFilter = null }) {
  return {
    id: uid(),
    at: Date.now(),
    takeId: take.id,
    takeName: take.name,
    trackId: track.id,
    projectId: project.id,
    projectTitle: project.title ?? project.name,
    projectKind: project.kind ?? 'song',
    sourceId: project.sourceId ?? null,
    stageId,
    partName: track.name,
    role: track.role,
    color: track.color,
    duration: take.duration ?? 0,
    transpose: project.transpose ?? 0,
    score: {
      overall: score.overall,
      grade: score.grade,
      parts: { ...score.parts },
      stats: { ...score.stats },
    },
    skills: filterSkills(skillsFromScore(score, { range }), skillFilter),
    rangeProfile: score.rangeProfile ?? [],
    notes: compactNotes(score.notes),
    advice: score.advice ?? [],
  };
}

function filterSkills(skills, allowed) {
  if (!allowed) return skills;
  const kept = {};
  for (const [id, skill] of Object.entries(skills)) kept[id] = allowed.includes(id) ? skill : null;
  return kept;
}

/** Headline facts about one attempt, used by both the report and the history. */
export function attemptSummary(attempt) {
  const notes = attempt.notes ?? [];
  const sung = notes.filter((note) => note.coverage >= 0.25 && note.cents !== null);
  const midis = sung.map((note) => note.midi);
  const worst = sung.slice().sort((a, b) => (b.centsAbs ?? 0) - (a.centsAbs ?? 0))[0] ?? null;
  const best = sung.slice().sort((a, b) => (a.centsAbs ?? 0) - (b.centsAbs ?? 0))[0] ?? null;

  return {
    when: new Date(attempt.at),
    overall: attempt.score?.overall ?? 0,
    grade: attempt.score?.grade ?? '—',
    notesSung: sung.length,
    notesTotal: notes.length,
    lowest: midis.length ? midiToName(Math.min(...midis)) : null,
    highest: midis.length ? midiToName(Math.max(...midis)) : null,
    bias: attempt.score?.stats?.bias ?? null,
    medianCents: attempt.score?.stats?.medianCents ?? null,
    best,
    worst,
    skillsTested: Object.entries(attempt.skills ?? {})
      .filter(([, skill]) => skill && skill.samples > 0)
      .map(([id, skill]) => ({ id, value: Math.round(skill.value), samples: skill.samples, detail: skill.detail })),
  };
}

/** A plain-text version of the report, for keeping outside the app. */
export function formatReportText(attempt) {
  const summary = attemptSummary(attempt);
  const lines = [];
  const rule = '='.repeat(60);

  lines.push(rule);
  lines.push(`ATTEMPT REPORT — ${attempt.projectTitle}`);
  lines.push(`Part: ${attempt.partName}   Take: ${attempt.takeName ?? '—'}`);
  lines.push(`Recorded: ${summary.when.toLocaleString()}`);
  lines.push(rule);
  lines.push('');
  lines.push(`OVERALL   ${summary.overall}/100  (${summary.grade})`);
  lines.push('');
  lines.push('Components');
  for (const [label, value] of Object.entries(attempt.score?.parts ?? {})) {
    lines.push(`  ${label.padEnd(12)} ${String(Math.round(value)).padStart(3)}/100  ${bar(value)}`);
  }
  lines.push('');

  const stats = attempt.score?.stats ?? {};
  lines.push('Accuracy');
  lines.push(`  Notes sung          ${summary.notesSung}/${summary.notesTotal}`);
  lines.push(`  Median error        ${stats.medianCents === null || stats.medianCents === undefined ? '—' : `${stats.medianCents} cents`}`);
  lines.push(`  Tuning bias         ${stats.bias === null || stats.bias === undefined ? '—' : `${stats.bias > 0 ? '+' : ''}${stats.bias} cents ${stats.bias > 5 ? '(sharp)' : stats.bias < -5 ? '(flat)' : ''}`}`);
  lines.push(`  Within 10 cents     ${Math.round(stats.withinPerfect ?? 0)}%`);
  lines.push(`  Within 25 cents     ${Math.round(stats.withinGood ?? 0)}%`);
  if (summary.lowest && summary.highest) lines.push(`  Pitches covered     ${summary.lowest} to ${summary.highest}`);
  lines.push('');

  if (summary.skillsTested.length) {
    lines.push('Skills this take tested');
    for (const skill of summary.skillsTested) {
      lines.push(`  ${skill.id.padEnd(12)} ${String(skill.value).padStart(3)}/100  (${skill.samples} notes) ${skill.detail ?? ''}`.trimEnd());
    }
    lines.push('');
  }

  if (attempt.advice?.length) {
    lines.push('What to fix');
    for (const tip of attempt.advice) lines.push(`  - ${tip}`);
    lines.push('');
  }

  const notes = attempt.notes ?? [];
  if (notes.length) {
    lines.push('Note by note');
    lines.push(`  ${'TIME'.padEnd(8)}${'NOTE'.padEnd(6)}${'ERROR'.padEnd(9)}${'STEADY'.padEnd(9)}${'ENTRY'.padEnd(10)}${'SUNG'.padEnd(7)}VERDICT`);
    for (const note of notes) {
      lines.push(
        `  ${clock(note.time).padEnd(8)}${String(note.name).padEnd(6)}` +
        `${(note.cents === null ? '—' : `${note.cents > 0 ? '+' : ''}${note.cents}c`).padEnd(9)}` +
        `${(note.centsSpread === null ? '—' : `+/-${note.centsSpread}c`).padEnd(9)}` +
        `${(note.timingOffset === null ? '—' : `${note.timingOffset > 0 ? '+' : ''}${Math.round(note.timingOffset * 1000)}ms`).padEnd(10)}` +
        `${`${Math.round((note.coverage ?? 0) * 100)}%`.padEnd(7)}${note.verdict}`,
      );
    }
    lines.push('');
  }

  lines.push(rule);
  lines.push('Generated by Jayasongmatch');
  return lines.join('\n');
}

function bar(value) {
  const filled = Math.round(Math.max(0, Math.min(100, value)) / 5);
  return `${'#'.repeat(filled)}${'.'.repeat(20 - filled)}`;
}

function clock(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
