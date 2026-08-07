// Rendering for the Trainer view: the range map, the skill bars, the coach
// panel, the progress chart and the attempt history.

import { midiToName } from '../dsp/notes.js';
import { SKILL_IDS, SKILLS } from '../trainer/profile.js';
import { attemptSummary } from '../trainer/attempt.js';

/** Green (accurate) through red (inaccurate), matching the pitch ribbon. */
export function accuracyColor(absCents) {
  if (absCents === null || absCents === undefined) return '#2a3040';
  if (absCents <= 10) return '#3ddc84';
  if (absCents <= 25) return '#9ede3f';
  if (absCents <= 50) return '#ffc93c';
  return '#ff5f56';
}

function scoreColor(value) {
  if (value === null) return '#2a3040';
  if (value >= 88) return '#3ddc84';
  if (value >= 75) return '#9ede3f';
  if (value >= 60) return '#ffc93c';
  return '#ff5f56';
}

/**
 * The range map: a keyboard from your lowest to highest measured pitch, each
 * key shaded by how accurately you sing it.
 */
export function drawRangeMap(canvas, rangeMap, summary) {
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const width = rect.width;
  const height = rect.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#12151c';
  ctx.fillRect(0, 0, width, height);

  if (!rangeMap.length) {
    ctx.fillStyle = '#6b7385';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No pitches measured yet — run the baseline test or record a take.', width / 2, height / 2);
    return;
  }

  // Show a little beyond what has been measured, so the edges are visible.
  const low = Math.min(...rangeMap.map((entry) => entry.midi)) - 2;
  const high = Math.max(...rangeMap.map((entry) => entry.midi)) + 2;
  const span = Math.max(1, high - low + 1);
  const keyWidth = width / span;
  const byMidi = new Map(rangeMap.map((entry) => [entry.midi, entry]));

  const keyTop = 26;
  const keyHeight = height - keyTop - 20;

  for (let midi = low; midi <= high; midi++) {
    const x = (midi - low) * keyWidth;
    const entry = byMidi.get(midi);
    const isBlack = [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);

    ctx.fillStyle = entry ? accuracyColor(entry.absCents) : isBlack ? '#191d26' : '#1e232e';
    if (entry && entry.confidence === 'low') ctx.globalAlpha = 0.45;
    ctx.fillRect(x + 0.5, keyTop, Math.max(1, keyWidth - 1), keyHeight);
    ctx.globalAlpha = 1;

    // Mark the reliable band.
    if (summary?.reliableLow !== null && summary?.reliableLow !== undefined &&
        midi >= summary.reliableLow && midi <= summary.reliableHigh) {
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(x + 0.5, keyTop, Math.max(1, keyWidth - 1), 5);
    }

    if (((midi % 12) + 12) % 12 === 0) {
      ctx.fillStyle = '#8b93a5';
      ctx.font = '9px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(midiToName(midi), x + keyWidth / 2, keyTop + keyHeight + 4);
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, keyTop);
      ctx.lineTo(Math.round(x) + 0.5, keyTop + keyHeight);
      ctx.stroke();
    }
  }

  ctx.fillStyle = '#8b93a5';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('Accuracy by pitch — brighter bar marks the band you are reliable across', 4, 6);
}

/** Overall score over time. */
export function drawHistory(canvas, history) {
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const width = rect.width;
  const height = rect.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#12151c';
  ctx.fillRect(0, 0, width, height);

  if (history.length < 2) {
    ctx.fillStyle = '#6b7385';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(history.length ? 'One attempt so far — record more to see a trend.' : 'No attempts recorded yet.', width / 2, height / 2);
    return;
  }

  const padding = { left: 26, right: 8, top: 10, bottom: 16 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const x = (index) => padding.left + (index / (history.length - 1)) * plotWidth;
  const y = (value) => padding.top + (1 - Math.max(0, Math.min(100, value)) / 100) * plotHeight;

  for (const line of [0, 50, 75, 100]) {
    ctx.strokeStyle = line === 75 ? 'rgba(90,169,255,0.25)' : 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.moveTo(padding.left, Math.round(y(line)) + 0.5);
    ctx.lineTo(width - padding.right, Math.round(y(line)) + 0.5);
    ctx.stroke();
    ctx.fillStyle = '#5f6878';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(line), padding.left - 4, y(line));
  }

  // Trend line: a simple moving average, so a single bad take does not look
  // like a collapse.
  const windowSize = Math.min(5, Math.max(2, Math.floor(history.length / 4)));
  ctx.strokeStyle = 'rgba(90,169,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  history.forEach((point, index) => {
    const from = Math.max(0, index - windowSize + 1);
    const slice = history.slice(from, index + 1);
    const average = slice.reduce((sum, item) => sum + item.overall, 0) / slice.length;
    const px = x(index);
    const py = y(average);
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  history.forEach((point, index) => {
    ctx.fillStyle = scoreColor(point.overall);
    ctx.beginPath();
    ctx.arc(x(index), y(point.overall), 2.6, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Skill bars with trend arrows. */
export function renderSkills(container, skills, { onDrill } = {}) {
  container.innerHTML = '';
  for (const id of SKILL_IDS) {
    const skill = skills[id];
    const row = document.createElement('div');
    row.className = 'skill-row';
    if (skill.value === null) row.classList.add('untested');

    const name = document.createElement('div');
    name.className = 'skill-name';
    name.textContent = skill.name;
    name.title = SKILLS[id].blurb;

    const bar = document.createElement('div');
    bar.className = 'skill-bar';
    const fill = document.createElement('div');
    fill.style.width = `${skill.value ?? 0}%`;
    fill.style.background = scoreColor(skill.value);
    bar.appendChild(fill);

    const value = document.createElement('div');
    value.className = 'skill-value';
    value.textContent = skill.value === null ? '—' : String(Math.round(skill.value));

    const trend = document.createElement('div');
    trend.className = 'skill-trend';
    if (skill.trend !== null && skill.trend !== undefined && Math.abs(skill.trend) >= 2) {
      trend.textContent = `${skill.trend > 0 ? '▲' : '▼'}${Math.abs(Math.round(skill.trend))}`;
      trend.style.color = skill.trend > 0 ? '#3ddc84' : '#ff8f88';
      trend.title = 'Recent attempts against earlier ones';
    }

    const detail = document.createElement('div');
    detail.className = 'skill-detail';
    if (skill.value === null) {
      detail.textContent = 'Not tested yet';
    } else {
      const body = skill.detail || `${skill.samples} notes measured`;
      // Say when a figure rests on very little, rather than presenting a number
      // from three notes as though it were settled.
      detail.textContent = skill.provisional ? `provisional — only ${skill.samples} notes so far · ${body}` : body;
      if (skill.provisional) row.classList.add('provisional');
    }

    row.append(name, bar, value, trend, detail);
    if (onDrill && skill.value !== null) {
      row.classList.add('clickable');
      row.addEventListener('click', () => onDrill(id));
      row.title = `Practise ${skill.name.toLowerCase()}`;
    }
    container.appendChild(row);
  }
}

/** The coach's written assessment. */
export function renderCoach(container, report, { onDrill, onBaseline } = {}) {
  container.innerHTML = '';

  const headline = document.createElement('div');
  headline.className = 'coach-headline';
  headline.textContent = report.headline;
  container.appendChild(headline);

  if (report.strengths.length) {
    const strengths = document.createElement('div');
    strengths.className = 'coach-strengths';
    strengths.innerHTML = '<span class="coach-label">Working well</span>';
    for (const skill of report.strengths) {
      const pill = document.createElement('span');
      pill.className = 'pill perfect';
      pill.textContent = `${skill.name} ${Math.round(skill.value)}`;
      strengths.appendChild(pill);
    }
    container.appendChild(strengths);
  }

  for (const focus of report.focus) {
    const card = document.createElement('div');
    card.className = 'focus-card';

    const head = document.createElement('div');
    head.className = 'focus-head';
    const title = document.createElement('strong');
    title.textContent = focus.name;
    const score = document.createElement('span');
    score.className = 'focus-score';
    score.textContent = `${Math.round(focus.value)}/100`;
    score.style.color = scoreColor(focus.value);
    head.append(title, score);

    const why = document.createElement('div');
    why.className = 'focus-why';
    why.textContent = focus.why;

    const fix = document.createElement('div');
    fix.className = 'focus-fix';
    fix.textContent = focus.fix;

    card.append(head, why, fix);

    if (focus.drills.length) {
      const actions = document.createElement('div');
      actions.className = 'focus-drills';
      for (const drill of focus.drills) {
        const button = document.createElement('button');
        button.className = 'small-btn';
        button.textContent = `Practise: ${drill.title}`;
        button.addEventListener('click', () => onDrill?.(drill.id));
        actions.appendChild(button);
      }
      card.appendChild(actions);
    }
    container.appendChild(card);
  }

  if (report.observations.length) {
    const list = document.createElement('ul');
    list.className = 'advice';
    for (const observation of report.observations) {
      const item = document.createElement('li');
      item.textContent = observation;
      list.appendChild(item);
    }
    container.appendChild(list);
  }

  if (report.nextStep?.action === 'baseline') {
    const button = document.createElement('button');
    button.className = 'small-btn primary';
    button.textContent = report.nextStep.text;
    button.addEventListener('click', () => onBaseline?.());
    container.appendChild(button);
  }
}

/** How a song's demands line up with what you can currently do. */
export function renderReadiness(container, readiness) {
  container.innerHTML = '';
  if (!readiness) {
    container.innerHTML = '<div class="hint">Open a project in the Studio to see how its parts match your ability.</div>';
    return;
  }
  if (readiness.message) {
    container.innerHTML = `<div class="hint">${readiness.message}</div>`;
    return;
  }

  for (const part of readiness.parts) {
    const card = document.createElement('div');
    card.className = `readiness-card ${part.verdict}`;

    const head = document.createElement('div');
    head.className = 'readiness-head';
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = part.color ?? '#555';
    const name = document.createElement('strong');
    name.textContent = part.name;
    const verdict = document.createElement('span');
    verdict.className = `pill ${part.verdict === 'ready' ? 'perfect' : part.verdict === 'stretch' ? 'fair' : 'off'}`;
    verdict.textContent = part.verdict === 'ready' ? 'in reach' : part.verdict === 'stretch' ? 'a stretch' : 'out of range';
    const span = document.createElement('span');
    span.className = 'readiness-span';
    span.textContent = `${midiToName(part.low)}–${midiToName(part.high)} · ${part.noteCount} notes`;
    head.append(swatch, name, verdict, span);
    card.appendChild(head);

    if (part.issues.length) {
      const list = document.createElement('ul');
      list.className = 'advice';
      for (const issue of part.issues) {
        const item = document.createElement('li');
        item.textContent = issue.text;
        if (issue.severity === 'blocking') item.style.color = '#ffb4b0';
        list.appendChild(item);
      }
      card.appendChild(list);
    } else {
      const ok = document.createElement('div');
      ok.className = 'hint';
      ok.textContent = 'Sits inside your range and needs nothing you are currently weak at.';
      card.appendChild(ok);
    }
    container.appendChild(card);
  }
}

/** The attempt history list. */
export function renderHistory(container, attempts, { onOpen } = {}) {
  container.innerHTML = '';
  if (!attempts.length) {
    container.innerHTML = '<div class="hint">No attempts yet. Every take you record and score is kept here.</div>';
    return;
  }

  for (const attempt of attempts) {
    const summary = attemptSummary(attempt);
    const row = document.createElement('div');
    row.className = 'history-row';

    const score = document.createElement('div');
    score.className = 'history-score';
    score.textContent = String(Math.round(summary.overall));
    score.style.color = scoreColor(summary.overall);

    const body = document.createElement('div');
    body.className = 'history-body';
    const title = document.createElement('div');
    title.className = 'history-title';
    title.textContent = `${attempt.projectTitle} — ${attempt.partName}`;
    const meta = document.createElement('div');
    meta.className = 'history-meta';
    meta.textContent = [
      summary.when.toLocaleString(),
      `${summary.notesSung}/${summary.notesTotal} notes`,
      summary.lowest && summary.highest ? `${summary.lowest}–${summary.highest}` : null,
      summary.medianCents === null ? null : `${summary.medianCents}¢ median`,
    ].filter(Boolean).join(' · ');
    body.append(title, meta);

    const open = document.createElement('button');
    open.className = 'small-btn';
    open.textContent = 'Report';
    open.addEventListener('click', () => onOpen?.(attempt));

    row.append(score, body, open);
    container.appendChild(row);
  }
}

/** The full per-attempt summary report, for the dialog. */
export function renderReport(container, attempt) {
  const summary = attemptSummary(attempt);
  container.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'report-head';
  head.innerHTML = `
    <div>
      <h4></h4>
      <div class="report-meta"></div>
    </div>
    <div class="report-score"><div class="report-value"></div><div class="report-grade"></div></div>`;
  head.querySelector('h4').textContent = `${attempt.projectTitle} — ${attempt.partName}`;
  head.querySelector('.report-meta').textContent = `${attempt.takeName ?? 'Take'} · ${summary.when.toLocaleString()} · ${attempt.duration.toFixed(1)}s`;
  head.querySelector('.report-value').textContent = String(Math.round(summary.overall));
  head.querySelector('.report-value').style.color = scoreColor(summary.overall);
  head.querySelector('.report-grade').textContent = summary.grade;
  container.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'report-grid';
  for (const [label, value] of Object.entries(attempt.score?.parts ?? {})) {
    const cell = document.createElement('div');
    cell.className = 'report-cell';
    cell.innerHTML = '<div class="report-cell-label"></div><div class="report-cell-value"></div>';
    cell.querySelector('.report-cell-label').textContent = label;
    cell.querySelector('.report-cell-value').textContent = String(Math.round(value));
    cell.querySelector('.report-cell-value').style.color = scoreColor(value);
    grid.appendChild(cell);
  }
  container.appendChild(grid);

  const facts = document.createElement('div');
  facts.className = 'score-stats';
  const stats = attempt.score?.stats ?? {};
  facts.innerHTML = `
    <span>Notes <b>${summary.notesSung}/${summary.notesTotal}</b></span>
    <span>Median error <b>${stats.medianCents ?? '—'}¢</b></span>
    <span>Bias <b>${stats.bias === null || stats.bias === undefined ? '—' : `${stats.bias > 0 ? '+' : ''}${stats.bias}¢`}</b></span>
    <span>Within 25¢ <b>${Math.round(stats.withinGood ?? 0)}%</b></span>
    ${summary.lowest ? `<span>Pitches <b>${summary.lowest}–${summary.highest}</b></span>` : ''}`;
  container.appendChild(facts);

  if (summary.skillsTested.length) {
    const skills = document.createElement('div');
    skills.className = 'report-skills';
    skills.innerHTML = '<span class="coach-label">Skills tested</span>';
    for (const skill of summary.skillsTested) {
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.style.background = 'rgba(255,255,255,0.06)';
      pill.style.color = scoreColor(skill.value);
      pill.textContent = `${SKILLS[skill.id]?.name ?? skill.id} ${skill.value}`;
      pill.title = skill.detail ?? '';
      skills.appendChild(pill);
    }
    container.appendChild(skills);
  }

  if (attempt.advice?.length) {
    const list = document.createElement('ul');
    list.className = 'advice';
    for (const tip of attempt.advice) {
      const item = document.createElement('li');
      item.textContent = tip;
      list.appendChild(item);
    }
    container.appendChild(list);
  }

  const table = document.createElement('table');
  table.className = 'notes';
  table.innerHTML = '<thead><tr><th>Time</th><th>Note</th><th>Error</th><th>Steadiness</th><th>Entry</th><th>Sung</th><th></th></tr></thead><tbody></tbody>';
  const body = table.querySelector('tbody');
  for (const note of attempt.notes ?? []) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${clock(note.time)}</td>
      <td>${note.name}</td>
      <td>${note.cents === null ? '—' : `${note.cents > 0 ? '+' : ''}${note.cents}¢`}</td>
      <td>${note.centsSpread === null ? '—' : `±${note.centsSpread}¢`}</td>
      <td>${note.timingOffset === null ? '—' : `${note.timingOffset > 0 ? '+' : ''}${Math.round(note.timingOffset * 1000)} ms`}</td>
      <td>${Math.round((note.coverage ?? 0) * 100)}%</td>
      <td><span class="pill ${note.verdict}">${note.verdict}</span></td>`;
    body.appendChild(row);
  }
  container.appendChild(table);
}

function clock(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
