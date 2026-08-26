// Application wiring: transport, recording, mixing, scoring and everything the
// UI hangs off.

import { Engine } from './audio/engine.js';
import { InputChain, listInputDevices } from './audio/input.js';
import { bufferToWav, downloadBlob, blobToAudioBuffer } from './audio/wav.js';
import { db } from './store/db.js';
import { Store, createProject, projectSections, projectDuration, activeTake, makeTake, uid, lyricsFor, referenceOf, guideTrackId } from './state.js';
import { SONGS, PART_ROLES } from './data/songs.js';
import { EXERCISES } from './data/exercises.js';
import { parseLyrics, formatLyrics, lyricsSummary, clearTimings, shiftLyrics, stampLine, nextUntimedIndex, activeLineIndex } from './data/lyrics.js';
import { LyricBand, LyricSheet } from './ui/lyrics.js';
import { Ribbon, colorForCents } from './ui/ribbon.js';
import { aggregateSkills, aggregateRange, rangeSummary, scoreHistory } from './trainer/profile.js';
import { buildAttempt, formatReportText } from './trainer/attempt.js';
import { coachReport, songReadiness } from './trainer/coach.js';
import { BASELINE_ID, baselineProgress, isBaselineProject, rangeFromSweeps, stageFor } from './trainer/baseline.js';
import { drawRangeMap, drawHistory, renderSkills, renderCoach, renderReadiness, renderHistory, renderReport } from './ui/trainer.js';
import { isIOS, isTouch, isStandalone, capabilities, canChooseInputDevice, requestPersistentStorage, ScreenLock, platformNotes, IS_DESKTOP_BUILD } from './platform.js';
import { parseTargets, formatTargets, targetsSummary, rangeWarning, shiftTargets } from './ui/noteeditor.js';
import { midiToName, midiToHz, hzToMidi, centsFrom } from './dsp/notes.js';
import { yin, rms } from './dsp/yin.js';
import { formatTime } from './score.js';

const BACKING_TRACK_ID = '__backing';

const el = (id) => document.getElementById(id);
const dom = {
  projectName: el('project-name'),
  deviceSelect: el('device-select'),
  channelSelect: el('channel-select'),
  refreshDevices: el('refresh-devices'),
  inputMeter: el('input-meter'),
  monitorBtn: el('monitor-btn'),
  rewindBtn: el('rewind-btn'),
  playBtn: el('play-btn'),
  recordBtn: el('record-btn'),
  clock: el('clock'),
  loopBtn: el('loop-btn'),
  clickBtn: el('click-btn'),
  bpmInput: el('bpm-input'),
  masterVolume: el('master-volume'),
  settingsBtn: el('settings-btn'),
  libraryList: el('library-list'),
  newProjectBtn: el('new-project-btn'),
  importBackingBtn: el('import-backing-btn'),
  backingInput: el('backing-input'),
  backingInfo: el('backing-info'),
  partSwatch: el('part-swatch'),
  partName: el('part-name'),
  partRange: el('part-range'),
  sectionSelect: el('section-select'),
  targetBtn: el('target-btn'),
  useTakeTargetBtn: el('use-take-target-btn'),
  toneBtn: el('tone-btn'),
  fitBtn: el('fit-btn'),
  ribbon: el('ribbon'),
  tunerNote: el('tuner-note'),
  tunerNeedle: el('tuner-needle'),
  tunerCents: el('tuner-cents'),
  scorecard: el('scorecard'),
  mixerList: el('mixer-list'),
  addPartBtn: el('add-part-btn'),
  exportMixBtn: el('export-mix-btn'),
  targetDialog: el('target-dialog'),
  targetDialogPart: el('target-dialog-part'),
  targetText: el('target-text'),
  targetStatus: el('target-status'),
  targetSave: el('target-save'),
  targetOctaveUp: el('target-octave-up'),
  targetOctaveDown: el('target-octave-down'),
  settingsDialog: el('settings-dialog'),
  latencyInput: el('latency-input'),
  countinInput: el('countin-input'),
  transposeInput: el('transpose-input'),
  a4Input: el('a4-input'),
  octaveAgnostic: el('octave-agnostic'),
  anchorInput: el('anchor-input'),
  calibrateBtn: el('calibrate-btn'),
  calibrateStatus: el('calibrate-status'),
  deleteProjectBtn: el('delete-project-btn'),
  toast: el('toast'),
  lyricPrev: el('lyric-prev'),
  lyricCurrent: el('lyric-current'),
  lyricNext: el('lyric-next'),
  lyricProgress: el('lyric-progress-fill'),
  lyricSheet: el('lyric-sheet'),
  lyricsActions: el('lyrics-actions'),
  lyricsEditBtn: el('lyrics-edit-btn'),
  lyricsTapBtn: el('lyrics-tap-btn'),
  lyricsNudgeBack: el('lyrics-nudge-back'),
  lyricsNudgeFwd: el('lyrics-nudge-fwd'),
  lyricsStatus: el('lyrics-status'),
  lyricsDialog: el('lyrics-dialog'),
  lyricsDialogScope: el('lyrics-dialog-scope'),
  lyricsScope: el('lyrics-scope'),
  lyricsText: el('lyrics-text'),
  lyricsDialogStatus: el('lyrics-dialog-status'),
  lyricsImportBtn: el('lyrics-import-btn'),
  lyricsFile: el('lyrics-file'),
  lyricsClearTimings: el('lyrics-clear-timings'),
  partRefFile: el('part-ref-file'),
  studioMain: document.querySelector('main:not(.trainer-main)'),
  trainerMain: el('trainer-main'),
  trainerLevel: el('trainer-level'),
  trainerHeadline: el('trainer-headline'),
  trainerRangeSummary: el('trainer-range-summary'),
  rangeMap: el('range-map'),
  rangeFacts: el('range-facts'),
  skillList: el('skill-list'),
  coachPanel: el('coach-panel'),
  readinessPanel: el('readiness-panel'),
  readinessProject: el('readiness-project'),
  historyChart: el('history-chart'),
  historyList: el('history-list'),
  clearHistoryBtn: el('clear-history-btn'),
  baselineStartBtn: el('baseline-start-btn'),
  baselineResumeBtn: el('baseline-resume-btn'),
  exportProgressBtn: el('export-progress-btn'),
  baselineBanner: el('baseline-banner'),
  baselineStageName: el('baseline-stage-name'),
  baselineStageCount: el('baseline-stage-count'),
  baselineInstruction: el('baseline-instruction'),
  baselineRecordBtn: el('baseline-record-btn'),
  baselineSkipBtn: el('baseline-skip-btn'),
  baselineFinishBtn: el('baseline-finish-btn'),
  baselineExitBtn: el('baseline-exit-btn'),
  reportDialog: el('report-dialog'),
  reportBody: el('report-body'),
  reportExport: el('report-export'),
  mobileNav: el('mobile-nav'),
  setupBanner: el('setup-banner'),
  setupTitle: el('setup-title'),
  setupDetail: el('setup-detail'),
  setupDismiss: el('setup-dismiss'),
  inputGroup: document.querySelector('.input-group'),
};

const app = {
  engine: new Engine(),
  input: null,
  store: new Store(),
  ribbon: null,
  worker: null,
  buffers: new Map(),   // takeId -> AudioBuffer
  refBuffers: new Map(),// imported reference key -> AudioBuffer
  backingBuffer: null,
  recording: null,      // {trackId, startContextTime, from}
  playhead: 0,
  libraryTab: 'songs',
  bottomTab: 'score',
  devices: [],
  pendingAnalyses: new Map(),
  analysisSeq: 0,
  band: null,
  sheet: null,
  tapMode: false,
  view: 'studio',
  panel: 'stage',        // which column is showing on a phone
  attempts: [],          // every analysed take, newest first
  baselineRange: null,   // range measured by the baseline sweeps
  reportAttempt: null,
  screenLock: new ScreenLock(),
};

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot() {
  app.input = new InputChain(app.engine.context, app.engine.master);
  app.input.onLevel = (peak) => {
    dom.inputMeter.style.width = `${Math.min(100, peak * 140)}%`;
  };

  app.worker = new Worker(new URL('./dsp/analyze-worker.js', import.meta.url), { type: 'module' });
  app.worker.onmessage = handleWorkerMessage;

  app.band = new LyricBand({
    previous: dom.lyricPrev,
    current: dom.lyricCurrent,
    next: dom.lyricNext,
    progress: dom.lyricProgress,
  });
  app.sheet = new LyricSheet(dom.lyricSheet, {
    onSeek: (time) => seek(time),
    onTap: (index) => stampLyricLine(index),
  });

  app.ribbon = new Ribbon(dom.ribbon, {
    onSeek: (time) => seek(time),
    onLoop: ({ start, end }) => {
      app.store.update((project) => { project.loop = { start, end }; }, { type: 'loop' });
      setLoopEnabled(true);
    },
  });

  app.store.addEventListener('project', () => renderAll());
  app.store.addEventListener('change', () => renderAll());
  app.store.addEventListener('mix', () => { syncEngineMix(); renderMixer(); });
  app.store.addEventListener('loop', () => renderRibbon());
  app.store.addEventListener('selection', () => { renderStageHead(); renderMixer(); renderScorecard(); renderRibbon(); renderLyrics(); });
  app.store.addEventListener('error', (event) => toast(event.detail.message, true));

  bindTransport();
  bindLibrary();
  bindStage();
  bindLyrics();
  bindTrainer();
  bindPlatform();
  bindDialogs();
  bindKeyboard();

  await loadAttempts();
  await restoreLastProject();
  await refreshDevices({ prompt: false });
  startAnimationLoop();

  // Only meaningful where a picker exists; the iOS build has no ⟳ button and no
  // device list, so this would point at a control that is not there.
  if (canChooseInputDevice() && !app.devices.some((device) => device.label && !/^Input \d+$/.test(device.label))) {
    toast('Click ⟳ beside "Input" to grant microphone access and list your input devices.');
  }
}

async function restoreLastProject() {
  const lastId = await db.getSetting('lastProjectId');
  if (lastId) {
    const saved = await db.getProject(lastId);
    if (saved) {
      await loadProject(saved);
      return;
    }
  }
  app.store.setProject(createProject('ex-doowop'));
  await db.setSetting('lastProjectId', app.store.project.id);
}

async function loadProject(project) {
  // A new project starts at its own beginning; carrying the old playhead over
  // would put the next take somewhere arbitrary in the new song.
  app.engine.stop({ silent: true });
  app.playhead = 0;
  app.engine.startPosition = 0;
  app.buffers.clear();
  app.refBuffers.clear();
  app.backingBuffer = null;
  setTapMode(false);
  for (const trackId of [...app.engine.tracks.keys()]) app.engine.removeTrack(trackId);

  app.store.setProject(project);
  await db.setSetting('lastProjectId', project.id);
  syncEngineMix();

  // Rehydrate audio in the background so the UI appears immediately.
  const loads = [];
  for (const track of project.tracks) {
    for (const take of track.takes) {
      loads.push(
        db.getAudio(take.audioKey)
          .then((blob) => (blob ? blobToAudioBuffer(blob, app.engine.context) : null))
          .then((buffer) => { if (buffer) app.buffers.set(take.id, buffer); })
          .catch(() => { /* a missing take just cannot be played back */ }),
      );
    }
    if (track.referenceAudio?.key) {
      loads.push(
        db.getAudio(track.referenceAudio.key)
          .then((blob) => (blob ? blobToAudioBuffer(blob, app.engine.context) : null))
          .then((buffer) => { if (buffer) app.refBuffers.set(track.referenceAudio.key, buffer); })
          .catch(() => {}),
      );
    }
  }
  if (project.backing?.key) {
    loads.push(
      db.getAudio(project.backing.key)
        .then((blob) => (blob ? blobToAudioBuffer(blob, app.engine.context) : null))
        .then((buffer) => { app.backingBuffer = buffer; })
        .catch(() => {}),
    );
  }
  await Promise.all(loads);
  renderAll();
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

function bindTransport() {
  dom.playBtn.addEventListener('click', () => (app.engine.playing ? stop() : play()));
  dom.recordBtn.addEventListener('click', () => (app.recording ? stop() : record()));
  dom.rewindBtn.addEventListener('click', () => seek(0));

  dom.loopBtn.addEventListener('click', () => setLoopEnabled(!app.store.project.loopEnabled));
  dom.clickBtn.addEventListener('click', () => {
    app.store.update((project) => { project.clickDuringPlay = !project.clickDuringPlay; });
    dom.clickBtn.classList.toggle('active', app.store.project.clickDuringPlay);
  });

  dom.bpmInput.addEventListener('change', () => {
    const bpm = clamp(Number(dom.bpmInput.value) || 120, 30, 300);
    app.store.update((project) => { project.bpm = bpm; });
  });

  dom.masterVolume.addEventListener('input', () => {
    const value = Number(dom.masterVolume.value);
    app.engine.setMasterLevel(value);
    app.store.update((project) => { project.masterLevel = value; }, { silent: true });
  });

  dom.monitorBtn.addEventListener('click', async () => {
    await ensureInput();
    const enabled = !dom.monitorBtn.classList.contains('active');
    dom.monitorBtn.classList.toggle('active', enabled);
    app.input.setMonitor(enabled);
    if (enabled) toast('Monitoring on — use headphones, or the mic will pick up the playback.');
  });

  // Absent in the iOS build, where the system picks the input device.
  dom.refreshDevices?.addEventListener('click', () => refreshDevices({ prompt: true }));
  dom.deviceSelect?.addEventListener('change', () => openDevice(dom.deviceSelect.value));
  dom.channelSelect?.addEventListener('change', () => {
    app.input?.setChannel(Number(dom.channelSelect.value) || 0);
  });

  app.engine.onStop = () => {
    if (app.recording) finishRecording();
    else updateTransportButtons();
  };
}

/**
 * @param {object} opts
 *   excludeTrackId — silence this part's own take (used while recording it).
 *     Its guide reference still plays: hearing the part you are replacing is
 *     the point of a guide.
 *   guides — include guide references at all (off for the mix export, which
 *     should contain your voices, not your references).
 */
function buildPlan({ excludeTrackId = null, guides = true } = {}) {
  const project = app.store.project;
  const plan = [];
  if (app.backingBuffer) plan.push({ trackId: BACKING_TRACK_ID, buffer: app.backingBuffer, startAt: project.backing?.startAt ?? 0 });

  for (const track of project.tracks) {
    if (track.id !== excludeTrackId) {
      const take = activeTake(track);
      const buffer = take && app.buffers.get(take.id);
      if (buffer) plan.push({ trackId: track.id, buffer, startAt: take.startAt ?? 0 });
    }
    if (!guides || !track.guideEnabled) continue;
    const guide = guideBuffer(track);
    if (guide) plan.push({ trackId: guideTrackId(track.id), buffer: guide.buffer, startAt: guide.startAt });
  }
  return plan;
}

/** Resolve a part's guide to an actual buffer and timeline position. */
function guideBuffer(track) {
  const reference = referenceOf(track);
  if (!reference) return null;
  const buffer = reference.kind === 'audio' ? app.refBuffers.get(reference.key) : app.buffers.get(reference.takeId);
  return buffer ? { buffer, startAt: reference.startAt } : null;
}

async function play({ from = app.playhead, countIn = false } = {}) {
  const project = app.store.project;
  if (!project) return;
  await app.engine.resume();
  const loop = project.loopEnabled ? project.loop : null;
  if (loop && (from < loop.start || from >= loop.end)) from = loop.start;

  app.engine.play(buildPlan(), {
    from,
    bpm: project.bpm,
    countInBeats: countIn ? project.countInBeats : 0,
    clickDuringPlay: project.clickDuringPlay,
    loop,
    duration: projectDuration(project),
  });
  app.ribbon.follow = true;
  updateTransportButtons();
}

function stop() {
  if (app.recording) {
    finishRecording();
    return;
  }
  app.engine.stop({ silent: true });
  app.playhead = clamp(app.engine.position, 0, projectDuration(app.store.project));
  updateTransportButtons();
  renderRibbon();
}

function seek(time) {
  const wasPlaying = app.engine.playing && !app.recording;
  if (app.recording) return; // seeking mid-take would desync the recording
  app.engine.stop({ silent: true });
  app.playhead = Math.max(0, time);
  if (wasPlaying) play({ from: app.playhead });
  else {
    app.ribbon.setPosition(app.playhead);
    updateClock(app.playhead);
    updateTransportButtons();
    app.band.update(app.playhead);
    if (app.bottomTab === 'lyrics') app.sheet.update(app.playhead, { follow: false });
  }
}

function setLoopEnabled(enabled) {
  dom.loopBtn.classList.toggle('active', enabled);
  app.store.update((project) => {
    project.loopEnabled = enabled;
    // Turning looping on without a region yet: loop whatever section you are in.
    if (enabled && !project.loop) {
      const sections = projectSections(project);
      const section = sections.find((s) => app.playhead >= s.start && app.playhead < s.end) ?? sections[0];
      if (section) project.loop = { start: section.start, end: section.end };
    }
  }, { type: 'loop' });
}

function updateTransportButtons() {
  dom.playBtn.classList.toggle('active', app.engine.playing && !app.recording);
  dom.playBtn.textContent = app.engine.playing && !app.recording ? '■' : '▶';
  dom.recordBtn.classList.toggle('active', Boolean(app.recording));
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

async function ensureInput() {
  if (app.input.isOpen) return;
  await app.engine.resume();
  const deviceId = dom.deviceSelect?.value || undefined;
  const info = await app.input.open({ deviceId, channel: Number(dom.channelSelect?.value) || 0 });
  populateChannels(info.channelCount);
  await refreshDevices({ prompt: false });
  if (app.input.deviceId && dom.deviceSelect) dom.deviceSelect.value = app.input.deviceId;
}

async function openDevice(deviceId) {
  try {
    const info = await app.input.open({ deviceId, channel: 0 });
    populateChannels(info.channelCount);
    toast(`Input: ${info.label || 'device'} (${info.channelCount} ch)`);
  } catch (error) {
    toast(`Could not open that input: ${error.message}`, true);
  }
}

async function record() {
  const project = app.store.project;
  const track = app.store.armedTrack;
  if (!track) {
    toast('Arm a part first — press the ● button on a mixer strip.', true);
    return;
  }
  try {
    await ensureInput();
  } catch (error) {
    toast(`Microphone access failed: ${error.message}`, true);
    return;
  }

  await app.engine.resume();
  const loop = project.loopEnabled ? project.loop : null;
  let from = app.playhead;
  if (loop && (from < loop.start || from >= loop.end)) from = loop.start;

  // Everything except the part being recorded plays back, so you sing against
  // the stack you already have.
  const plan = buildPlan({ excludeTrackId: track.id });

  app.input.startCapture();
  const startContextTime = app.engine.play(plan, {
    from,
    bpm: project.bpm,
    countInBeats: project.countInBeats,
    clickDuringPlay: project.clickDuringPlay,
    loop: null, // a take runs once; looping while recording would overwrite it
    duration: projectDuration(project),
  });

  app.recording = { trackId: track.id, startContextTime, from };
  app.screenLock.acquire();
  app.ribbon.follow = true;
  updateTransportButtons();
  // Words up while you sing; the score is only useful once the take is done.
  if (currentLyrics().length && app.bottomTab !== 'lyrics') setBottomTab('lyrics');
}

async function finishRecording() {
  const context = app.recording;
  if (!context) return;
  app.recording = null;
  app.engine.stop({ silent: true });
  app.screenLock.release();
  updateTransportButtons();

  const { samples, startContextTime, sampleRate } = await app.input.stopCapture();
  if (samples.length < sampleRate * 0.15) {
    toast('That take was too short to keep.', true);
    return;
  }

  const project = app.store.project;
  const latency = app.engine.systemLatency + (app.input.reportedLatency || 0) + project.latencyOffsetMs / 1000;
  // Song position of sample 0, pulled earlier by the round-trip delay so what
  // you sang lands where you heard it.
  let startAt = context.from + (startContextTime - context.startContextTime) - latency;

  let trimmed = samples;
  if (startAt < 0) {
    const drop = Math.min(samples.length - 1, Math.round(-startAt * sampleRate));
    trimmed = samples.subarray(drop);
    startAt = 0;
  }

  const buffer = app.engine.createBuffer(trimmed, sampleRate);
  const blob = bufferToWav(buffer);
  const audioKey = `take-${uid()}`;
  await db.putAudio(audioKey, blob);

  const track = project.tracks.find((t) => t.id === context.trackId);
  const take = makeTake({
    trackId: track.id,
    audioKey,
    startAt,
    duration: buffer.duration,
    sampleRate,
    takeNumber: track.takes.length + 1,
  });
  app.buffers.set(take.id, buffer);

  app.store.update((current) => {
    const target = current.tracks.find((t) => t.id === context.trackId);
    target.takes.push(take);
    target.activeTakeId = take.id;
  });
  app.store.selectTake(take.id);
  app.playhead = context.from;
  setBottomTab('score');
  analyseTake(track.id, take.id);
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

function analyseTake(trackId, takeId, { deriveNotes = false, rescore = false } = {}) {
  const project = app.store.project;
  const track = project.tracks.find((t) => t.id === trackId);
  const take = track?.takes.find((t) => t.id === takeId);
  const buffer = app.buffers.get(takeId);
  if (!track || !take || !buffer) return;

  const id = ++app.analysisSeq;
  app.pendingAnalyses.set(id, { trackId, takeId, deriveNotes, rescore });
  take.analyzing = true;
  renderScorecard();

  // Targets are stored in song time; the scorer works in take-relative time.
  const targets = track.targets.map((note) => ({
    time: note.time - take.startAt,
    duration: note.duration,
    midi: note.midi,
  }));

  const samples = buffer.getChannelData(0).slice();
  app.worker.postMessage(
    {
      id,
      type: deriveNotes ? 'derive-notes' : 'analyze',
      samples,
      sampleRate: buffer.sampleRate,
      targets,
      options: {
        octaveAgnostic: project.octaveAgnostic,
        transpose: project.transpose,
        a4: project.a4,
      },
    },
    [samples.buffer],
  );
}

function handleWorkerMessage(event) {
  const { id, type } = event.data;
  const pending = app.pendingAnalyses.get(id);
  if (!pending) return;

  if (type === 'progress') return;
  app.pendingAnalyses.delete(id);

  if (type === 'error') {
    toast(`Analysis failed: ${event.data.message}`, true);
    return;
  }

  app.store.update((project) => {
    const track = project.tracks.find((t) => t.id === pending.trackId);
    const take = track?.takes.find((t) => t.id === pending.takeId);
    if (!take) return;
    take.analyzing = false;
    take.pitch = event.data.track;
    if (event.data.score) take.score = event.data.score;
    if (pending.deriveNotes && event.data.notes) {
      // Convert take-relative notes back into song time.
      track.targets = event.data.notes.map((note) => ({ ...note, time: +(note.time + take.startAt).toFixed(3) }));
      track.targetSource = 'take';
    }
  });

  if (pending.deriveNotes) {
    toast('Targets set from that take. Re-scoring the other takes of this part…');
    rescoreTrack(pending.trackId);
    return;
  }

  // A freshly scored take becomes a permanent progress record. Re-scores of an
  // existing take (after a target or setting change) update in place instead of
  // stacking up duplicate attempts.
  if (event.data.score) recordAttempt(pending.trackId, pending.takeId, { rescore: pending.rescore });
}

function rescoreTrack(trackId) {
  const track = app.store.project.tracks.find((t) => t.id === trackId);
  if (!track) return;
  for (const take of track.takes) {
    if (app.buffers.has(take.id)) analyseTake(trackId, take.id, { rescore: true });
  }
}

// ---------------------------------------------------------------------------
// Live tuner + animation
// ---------------------------------------------------------------------------

function startAnimationLoop() {
  const window1024 = new Float32Array(2048);

  const frame = () => {
    const project = app.store.project;
    if (project) {
      if (app.engine.playing) {
        const position = app.engine.position;
        app.playhead = Math.max(0, position);
        updateClock(position);
        app.ribbon.setPosition(app.playhead, { recording: Boolean(app.recording) });
        app.band.update(app.playhead);
        if (app.bottomTab === 'lyrics') app.sheet.update(app.playhead, { follow: !app.tapMode });
      }

      const analyser = app.input?.analyser;
      if (analyser) {
        analyser.getFloatTimeDomainData(window1024);
        const level = rms(window1024);
        const { hz, clarity } = level > 0.004 ? yin(window1024, app.engine.context.sampleRate) : { hz: 0, clarity: 0 };
        updateTuner(hz, clarity);
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function updateTuner(hz, clarity) {
  const project = app.store.project;
  if (!hz || clarity < 0.7) {
    dom.tunerNote.textContent = '—';
    dom.tunerCents.textContent = 'Live tuning';
    dom.tunerNeedle.style.left = '50%';
    dom.tunerNeedle.style.background = 'var(--muted)';
    app.ribbon.setLivePitch(null);
    return;
  }

  const midi = hzToMidi(hz, project?.a4 ?? 440);
  const track = app.store.armedTrack ?? app.store.selectedTrack;
  const target = findTargetAt(track, app.playhead);

  let cents;
  let label;
  if (target) {
    const targetMidi = target.midi + (project?.transpose ?? 0);
    cents = centsFrom(hz, targetMidi, project?.a4 ?? 440);
    label = `${midiToName(targetMidi)} target`;
  } else {
    const nearest = Math.round(midi);
    cents = (midi - nearest) * 100;
    label = `${midiToName(nearest)} nearest`;
  }

  const clamped = clamp(cents, -60, 60);
  const color = colorForCents(Math.abs(cents));
  dom.tunerNote.textContent = midiToName(Math.round(midi));
  dom.tunerNote.style.color = color;
  dom.tunerCents.textContent = `${cents > 0 ? '+' : ''}${cents.toFixed(0)}¢ · ${label}`;
  dom.tunerNeedle.style.left = `${50 + (clamped / 60) * 48}%`;
  dom.tunerNeedle.style.background = color;
  app.ribbon.setLivePitch({ midi, clarity, color });
}

function findTargetAt(track, position) {
  if (!track?.targets?.length) return null;
  return track.targets.find((note) => position >= note.time - 0.05 && position <= note.time + note.duration) ?? null;
}

function updateClock(position) {
  const countingIn = position < 0;
  dom.clock.classList.toggle('countin', countingIn);
  dom.clock.textContent = countingIn ? `-${formatTime(-position)}` : formatTime(Math.max(0, position));
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

async function refreshDevices({ prompt = false } = {}) {
  if (!dom.deviceSelect) return; // no picker in this build
  try {
    app.devices = await listInputDevices({ prompt });
  } catch (error) {
    toast(`Could not list inputs: ${error.message}`, true);
    return;
  }
  const current = app.input?.deviceId ?? dom.deviceSelect.value;
  dom.deviceSelect.innerHTML = '';
  for (const device of app.devices) {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.textContent = device.label;
    dom.deviceSelect.appendChild(option);
  }
  if (current && app.devices.some((device) => device.deviceId === current)) dom.deviceSelect.value = current;
  if (!app.input?.isOpen) populateChannels(1);
}

function populateChannels(count) {
  if (!dom.channelSelect) return;
  const current = dom.channelSelect.value;
  dom.channelSelect.innerHTML = '';
  for (let i = 0; i < Math.max(1, count); i++) {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = String(i + 1);
    dom.channelSelect.appendChild(option);
  }
  if (current && Number(current) < count) dom.channelSelect.value = current;
}

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

function bindLibrary() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((other) => other.classList.toggle('active', other === tab));
      app.libraryTab = tab.dataset.tab;
      renderLibrary();
    });
  });

  dom.newProjectBtn.addEventListener('click', () => {
    app.libraryTab = 'songs';
    document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === 'songs'));
    renderLibrary();
    toast('Pick a song or drill to start a new project.');
  });

  dom.importBackingBtn.addEventListener('click', () => dom.backingInput.click());
  dom.backingInput.addEventListener('change', async () => {
    const file = dom.backingInput.files?.[0];
    if (!file) return;
    await importBacking(file);
    dom.backingInput.value = '';
  });
}

async function renderLibrary() {
  const list = dom.libraryList;
  list.innerHTML = '';

  if (app.libraryTab === 'projects') {
    const projects = await db.listProjects();
    if (!projects.length) {
      list.innerHTML = '<div class="hint">No saved projects yet.</div>';
      return;
    }
    for (const project of projects) {
      list.appendChild(projectCard(project));
    }
    return;
  }

  const entries = app.libraryTab === 'drills' ? EXERCISES : SONGS;
  for (const entry of entries) {
    list.appendChild(sourceCard(entry));
  }
}

function sourceCard(entry) {
  const card = document.createElement('div');
  card.className = 'song-card';
  if (app.store.project?.sourceId === entry.id) card.classList.add('active');
  const parts = entry.parts.map((part) => part.name.replace(' / Top', '')).join(' · ');
  card.innerHTML = `
    <h3></h3>
    <div class="meta"></div>
    <div class="summary"></div>
    <div class="meta" style="margin-top:5px"></div>`;
  card.querySelector('h3').textContent = entry.title;
  card.querySelectorAll('.meta')[0].textContent = `${entry.artist}${entry.year ? ` · ${entry.year}` : ''} · ${entry.key} · ${entry.bpm} BPM`;
  card.querySelector('.summary').textContent = entry.summary ?? '';
  card.querySelectorAll('.meta')[1].textContent = `${entry.parts.length} ${entry.parts.length === 1 ? 'part' : 'parts'}: ${parts}`;
  card.addEventListener('click', async () => {
    const project = createProject(entry.id);
    await loadProject(project);
    toast(`Started "${project.title}". Arm a part and hit record.`);
  });
  return card;
}

function projectCard(project) {
  const card = document.createElement('div');
  card.className = 'song-card';
  if (app.store.project?.id === project.id) card.classList.add('active');
  const takeCount = project.tracks.reduce((sum, track) => sum + track.takes.length, 0);
  const best = project.tracks
    .flatMap((track) => track.takes.map((take) => take.score?.overall ?? null))
    .filter((score) => score !== null);
  card.innerHTML = '<h3></h3><div class="meta"></div><div class="summary"></div><div class="card-actions"></div>';
  card.querySelector('h3').textContent = project.name;
  card.querySelector('.meta').textContent = new Date(project.updatedAt ?? project.createdAt).toLocaleString();
  card.querySelector('.summary').textContent =
    `${project.tracks.length} parts · ${takeCount} takes${best.length ? ` · best ${Math.max(...best).toFixed(0)}` : ''}`;

  const open = document.createElement('button');
  open.className = 'small-btn';
  open.textContent = 'Open';
  open.addEventListener('click', async (event) => {
    event.stopPropagation();
    await loadProject(project);
  });
  const remove = document.createElement('button');
  remove.className = 'small-btn danger';
  remove.textContent = 'Delete';
  remove.addEventListener('click', async (event) => {
    event.stopPropagation();
    if (!confirm(`Delete "${project.name}" and all of its takes?`)) return;
    await deleteProject(project);
  });
  card.querySelector('.card-actions').append(open, remove);
  card.addEventListener('click', () => loadProject(project));
  return card;
}

async function deleteProject(project) {
  for (const track of project.tracks) {
    for (const take of track.takes) await db.deleteAudio(take.audioKey).catch(() => {});
  }
  if (project.backing?.key) await db.deleteAudio(project.backing.key).catch(() => {});
  await db.deleteProject(project.id);
  if (app.store.project?.id === project.id) {
    await loadProject(createProject('ex-doowop'));
  } else {
    renderLibrary();
  }
  toast('Project deleted.');
}

async function importBacking(file) {
  try {
    const buffer = await blobToAudioBuffer(file, app.engine.context);
    const key = `backing-${uid()}`;
    await db.putAudio(key, file);
    app.backingBuffer = buffer;
    app.store.update((project) => {
      project.backing = { key, name: file.name, duration: buffer.duration, startAt: 0 };
    });
    app.engine.setTrackMix(BACKING_TRACK_ID, { level: 0.7, pan: 0 });
    toast(`Loaded "${file.name}" (${formatTime(buffer.duration)}).`);
  } catch (error) {
    toast(`Could not decode that audio file: ${error.message}`, true);
  }
}

// ---------------------------------------------------------------------------
// Stage (part header, targets, sections)
// ---------------------------------------------------------------------------

function bindStage() {
  dom.fitBtn.addEventListener('click', () => app.ribbon.fitAll(projectDuration(app.store.project)));

  dom.sectionSelect.addEventListener('change', () => {
    const index = Number(dom.sectionSelect.value);
    const sections = projectSections(app.store.project);
    const section = sections[index];
    if (!section) return;
    app.store.update((project) => { project.loop = { start: section.start, end: section.end }; }, { type: 'loop' });
    setLoopEnabled(true);
    seek(section.start);
    app.ribbon.setView(Math.max(0, section.start - 1), section.duration + 2);
    if (section.tip) toast(section.tip);
  });

  dom.toneBtn.addEventListener('click', async () => {
    await app.engine.resume();
    const track = app.store.armedTrack ?? app.store.selectedTrack;
    const project = app.store.project;
    const note = findTargetAt(track, app.playhead) ?? track?.targets?.[0];
    if (!note) {
      toast('This part has no target notes yet.', true);
      return;
    }
    app.engine.playTone(midiToHz(note.midi + project.transpose, project.a4), 1.4);
  });

  dom.useTakeTargetBtn.addEventListener('click', () => {
    const track = app.store.selectedTrack;
    const takeId = app.store.selectedTakeId ?? track?.activeTakeId;
    if (!track || !takeId) {
      toast('Select a take on this part first.', true);
      return;
    }
    analyseTake(track.id, takeId, { deriveNotes: true });
  });

  dom.targetBtn.addEventListener('click', () => openTargetDialog());
}

// ---------------------------------------------------------------------------
// Platform: touch layout, iOS quirks, install, offline
// ---------------------------------------------------------------------------

function bindPlatform() {
  document.body.dataset.view = 'studio';
  document.body.dataset.panel = app.panel;
  document.body.classList.toggle('ios', isIOS);
  document.body.classList.toggle('touch', isTouch);

  dom.mobileNav.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => setPanel(button.dataset.panel));
  });
  dom.setupDismiss.addEventListener('click', () => { dom.setupBanner.hidden = true; });

  // iOS hands the page one microphone and ignores requests for a different
  // one, so controls that cannot do anything are removed rather than left to
  // disappoint.
  if (!canChooseInputDevice()) {
    if (dom.deviceSelect) dom.deviceSelect.hidden = true;
    if (dom.channelSelect) dom.channelSelect.hidden = true;
    if (dom.refreshDevices) dom.refreshDevices.hidden = true;
    dom.inputGroup?.querySelectorAll('.field').forEach((field) => { field.hidden = true; });
  }

  // Any first touch is a good moment to unlock audio: iOS keeps the context
  // suspended until a gesture, and a suspended context records silence.
  const unlock = () => {
    app.engine.resume().catch(() => {});
  };
  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('touchend', unlock, { once: true });

  app.engine.watchForInterruptions();
  app.engine.onInterrupted = () => {
    if (app.recording) {
      app.recording = null;
      updateTransportButtons();
      toast('Recording stopped: another app took the audio. Check the take before keeping it.', true);
    } else {
      toast('Playback stopped — the system took the audio session. Tap play to resume.', true);
    }
    app.screenLock.release();
  };

  // Coming back from the background with a suspended context looks like a
  // broken app otherwise.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') app.engine.resume().catch(() => {});
  });

  reportCapabilities();
  registerServiceWorker();
  requestPersistentStorage().then(({ supported, persisted }) => {
    if (supported && !persisted && isIOS) {
      console.info('Storage is not persisted; iOS may clear recordings after a week of not opening the app.');
    }
  });
}

/** One panel at a time on a phone. */
function setPanel(panel) {
  app.panel = panel;
  document.body.dataset.panel = panel;
  dom.mobileNav.querySelectorAll('button').forEach((button) => {
    button.classList.toggle('active', button.dataset.panel === panel);
  });
  if (panel === 'stage') requestAnimationFrame(() => app.ribbon.resize());
}

/** Say plainly when the platform cannot do something, and what to do about it. */
function reportCapabilities() {
  const { blocked, degraded } = capabilities();
  if (blocked.length) {
    const first = blocked[0];
    dom.setupTitle.textContent = `${first.label} unavailable`;
    dom.setupDetail.textContent = first.detail;
    dom.setupBanner.hidden = false;
    for (const button of [dom.recordBtn, dom.monitorBtn]) button.disabled = true;
    return;
  }
  if (degraded.length) {
    console.info('Running with reduced capability:', degraded.map((check) => check.label).join(', '));
  }
  const notes = platformNotes();
  if (notes.length && !isStandalone) toast(notes[0]);
}

async function registerServiceWorker() {
  // The desktop builds ship no sw.js, so registering would just 404 on every
  // launch. Offline install is an iOS-build feature.
  if (IS_DESKTOP_BUILD) return;
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  try {
    // sw.js sits beside index.html, so resolve against the document rather
    // than this module, which lives a directory down.
    await navigator.serviceWorker.register(new URL('sw.js', document.baseURI), { scope: './' });
  } catch {
    // Offline support is a bonus; the app works without it.
  }
}

// ---------------------------------------------------------------------------
// Trainer: progress database, profile, coach and the baseline test
// ---------------------------------------------------------------------------

function bindTrainer() {
  document.querySelectorAll('.vtab').forEach((tab) => {
    tab.addEventListener('click', () => setView(tab.dataset.view));
  });

  dom.baselineStartBtn.addEventListener('click', () => startBaseline({ fresh: true }));
  dom.baselineResumeBtn.addEventListener('click', () => startBaseline({ fresh: false }));
  dom.exportProgressBtn.addEventListener('click', exportProgress);
  dom.clearHistoryBtn.addEventListener('click', async () => {
    if (!confirm('Delete every attempt record? Your recordings stay, but all progress history and skill measurements are lost.')) return;
    await db.clearAttempts();
    await db.setTrainer('baselineRange', null);
    app.attempts = [];
    app.baselineRange = null;
    renderTrainer();
    toast('Progress history cleared.');
  });

  dom.baselineRecordBtn.addEventListener('click', () => {
    const state = baselineProgress(app.store.project, app.attempts);
    const stage = state.next ?? state.stages[0];
    if (!stage?.trackId) return;
    app.store.armTrack(stage.trackId);
    app.store.selectTrack(stage.trackId);
    seek(0);
    record();
  });
  dom.baselineSkipBtn.addEventListener('click', () => {
    const state = baselineProgress(app.store.project, app.attempts);
    const index = state.stages.findIndex((stage) => !stage.complete);
    const nextStage = state.stages.slice(index + 1).find((stage) => !stage.complete);
    if (nextStage?.trackId) {
      app.store.armTrack(nextStage.trackId);
      app.store.selectTrack(nextStage.trackId);
    }
    renderBaselineBanner();
  });
  dom.baselineFinishBtn.addEventListener('click', () => finishBaseline());
  dom.baselineExitBtn.addEventListener('click', () => {
    dom.baselineBanner.hidden = true;
    toast('Baseline test paused. Resume it any time from the Trainer.');
  });

  dom.reportExport.addEventListener('click', () => {
    if (!app.reportAttempt) return;
    const text = formatReportText(app.reportAttempt);
    downloadBlob(new Blob([text], { type: 'text/plain' }), `${safeName(app.reportAttempt.projectTitle)}-${safeName(app.reportAttempt.partName)}-report.txt`);
  });
}

function setView(view) {
  app.view = view;
  document.body.dataset.view = view;
  document.querySelectorAll('.vtab').forEach((tab) => tab.classList.toggle('active', tab.dataset.view === view));
  dom.studioMain.hidden = view !== 'studio';
  dom.trainerMain.hidden = view !== 'trainer';
  if (view === 'trainer') renderTrainer();
  else app.ribbon.resize();
}

async function loadAttempts() {
  app.attempts = await db.listAttempts();
  app.baselineRange = await db.getTrainer('baselineRange', null);
}

/** Turn a scored take into a permanent progress record. */
async function recordAttempt(trackId, takeId, { rescore = false } = {}) {
  const project = app.store.project;
  const track = project?.tracks.find((t) => t.id === trackId);
  const take = track?.takes.find((t) => t.id === takeId);
  if (!track || !take?.score) return;

  const stage = isBaselineProject(project) ? stageFor(track) : null;
  const attempt = buildAttempt({
    project,
    track,
    take,
    score: take.score,
    range: app.baselineRange ?? currentRangeSummary(),
    stageId: stage?.id ?? null,
    // A baseline stage only reports the skills it was designed to test.
    skillFilter: stage ? (stage.kind === 'sweep' ? ['pitch'] : ['pitch', ...(stage.skills ?? [])]) : null,
  });

  // Re-scoring an existing take (after editing its targets, or changing the
  // transpose) revises that attempt rather than logging a second one — you
  // only sang it once.
  const existing = app.attempts.find((item) => item.takeId === takeId);
  if (existing) {
    attempt.id = existing.id;
    attempt.at = existing.at;
    app.attempts = app.attempts.map((item) => (item.id === existing.id ? attempt : item));
  } else {
    app.attempts = [attempt, ...app.attempts];
  }
  await db.saveAttempt(attempt);

  if (!rescore && isBaselineProject(project)) {
    renderBaselineBanner();
    const state = baselineProgress(project, app.attempts);
    if (state.finished) {
      toast('All seven stages recorded. Building your profile…');
      await finishBaseline();
    } else if (state.next?.trackId) {
      app.store.armTrack(state.next.trackId);
      app.store.selectTrack(state.next.trackId);
      toast(`Stage ${state.completed + 1} of ${state.total}: ${state.next.name.replace(/^\d+ · /, '')}`);
    }
  }
  if (app.view === 'trainer') renderTrainer();
}

function currentRangeSummary() {
  return rangeSummary(aggregateRange(app.attempts));
}

// --- baseline --------------------------------------------------------------

async function startBaseline({ fresh }) {
  let project = null;
  if (!fresh) {
    const saved = await db.listProjects();
    project = saved.find((item) => item.sourceId === BASELINE_ID) ?? null;
  }
  if (!project) project = createProject(BASELINE_ID);

  await loadProject(project);
  setView('studio');
  const state = baselineProgress(project, app.attempts);
  if (state.next?.trackId) {
    app.store.armTrack(state.next.trackId);
    app.store.selectTrack(state.next.trackId);
  }
  renderBaselineBanner();
  toast('Baseline test ready. Read each stage, then press Record this stage.');
}

function renderBaselineBanner() {
  const project = app.store.project;
  if (!isBaselineProject(project)) {
    dom.baselineBanner.hidden = true;
    return;
  }
  const state = baselineProgress(project, app.attempts);
  const stage = state.next ?? state.stages[state.stages.length - 1];
  dom.baselineBanner.hidden = false;
  dom.baselineStageName.textContent = stage.name;
  dom.baselineStageCount.textContent = `${state.completed} of ${state.total} done`;
  dom.baselineInstruction.textContent = stage.instruction;
  dom.baselineFinishBtn.hidden = state.completed === 0;
  dom.baselineRecordBtn.hidden = state.finished;
  dom.baselineSkipBtn.hidden = state.finished;
}

async function finishBaseline() {
  const project = app.store.project;
  const baselineAttempts = app.attempts.filter((attempt) => attempt.projectId === project?.id);
  if (!baselineAttempts.length) {
    toast('Record at least one stage first.', true);
    return;
  }
  const range = rangeFromSweeps(baselineAttempts);
  if (range) {
    app.baselineRange = range;
    await db.setTrainer('baselineRange', range);
    await db.setTrainer('baselineAt', Date.now());
  }
  setView('trainer');
  renderTrainer();
  toast(range
    ? `Range measured: ${range.lowName}–${range.highName}. Your profile is on the Trainer tab.`
    : 'Profile updated. Record the range stages to measure your range.');
}

// --- rendering --------------------------------------------------------------

function renderTrainer() {
  const attempts = app.attempts;
  const rangeMap = aggregateRange(attempts);
  const summary = rangeSummary(rangeMap);
  const effectiveRange = app.baselineRange ?? summary;
  const skills = aggregateSkills(attempts);
  const report = coachReport({ skills, range: summary, attempts, baselineRange: app.baselineRange });

  dom.trainerLevel.textContent = report.level === null ? '—' : String(report.level);
  dom.trainerLevel.style.color = report.level === null ? 'var(--muted)'
    : colorForCents(report.level >= 88 ? 5 : report.level >= 75 ? 20 : report.level >= 60 ? 40 : 80);
  dom.trainerHeadline.textContent = report.headline;

  dom.trainerRangeSummary.textContent = effectiveRange?.low
    ? `Range ${effectiveRange.lowName ?? midiToName(effectiveRange.low)}–${effectiveRange.highName ?? midiToName(effectiveRange.high)}` +
      ` · ${attempts.length} attempt${attempts.length === 1 ? '' : 's'} recorded`
    : `${attempts.length} attempt${attempts.length === 1 ? '' : 's'} recorded — no range measured yet`;

  drawRangeMap(dom.rangeMap, rangeMap, {
    reliableLow: app.baselineRange?.comfortableLow ?? summary.reliableLow,
    reliableHigh: app.baselineRange?.comfortableHigh ?? summary.reliableHigh,
  });
  renderRangeFacts(rangeMap, summary);

  renderSkills(dom.skillList, skills, { onDrill: (skillId) => practiseSkill(skillId) });
  renderCoach(dom.coachPanel, report, {
    onDrill: (drillId) => openDrill(drillId),
    onBaseline: () => startBaseline({ fresh: true }),
  });

  dom.readinessProject.textContent = app.store.project ? `— ${app.store.project.title}` : '';
  renderReadiness(dom.readinessPanel, songReadiness(app.store.project, { skills, range: effectiveRange }));

  drawHistory(dom.historyChart, scoreHistory(attempts));
  renderHistory(dom.historyList, attempts.slice(0, 60), { onOpen: (attempt) => openReport(attempt) });

  dom.baselineResumeBtn.hidden = !app.attempts.some((attempt) => attempt.stageId);
}

function renderRangeFacts(rangeMap, summary) {
  const range = app.baselineRange;
  const facts = [];
  if (range?.low) {
    facts.push(`<span>Measured range <b>${range.lowName}–${range.highName}</b> (${range.semitones} semitones)</span>`);
    if (range.comfortableLow) facts.push(`<span>Reliable across <b>${range.comfortableLowName}–${range.comfortableHighName}</b></span>`);
  } else if (summary.low !== null) {
    facts.push(`<span>Pitches sung <b>${summary.lowName}–${summary.highName}</b></span>`);
  }
  if (summary.strongest) facts.push(`<span>Strongest pitch <b>${summary.strongest.name}</b> (${summary.strongest.absCents}¢)</span>`);
  if (summary.weakest) facts.push(`<span>Weakest pitch <b>${summary.weakest.name}</b> (${summary.weakest.absCents}¢)</span>`);
  if (summary.notes) facts.push(`<span>Notes measured <b>${summary.notes}</b></span>`);
  dom.rangeFacts.innerHTML = facts.join('') || '<span>Nothing measured yet.</span>';
}

function openReport(attempt) {
  app.reportAttempt = attempt;
  renderReport(dom.reportBody, attempt);
  dom.reportDialog.showModal();
}

/** Jump straight from a weak skill into a drill that trains it. */
function practiseSkill(skillId) {
  const drills = EXERCISES.filter((exercise) => exercise.skills?.includes(skillId));
  if (!drills.length) {
    toast('No drill covers that skill yet.', true);
    return;
  }
  openDrill(drills[0].id);
}

async function openDrill(drillId) {
  if (!drillId) return;
  const drill = EXERCISES.find((exercise) => exercise.id === drillId);
  if (!drill) return;
  await loadProject(createProject(drillId));
  setView('studio');
  toast(`${drill.title} — arm a part and record.`);
}

async function exportProgress() {
  if (!app.attempts.length) {
    toast('No progress to export yet.', true);
    return;
  }
  const rangeMap = aggregateRange(app.attempts);
  const payload = {
    exportedAt: new Date().toISOString(),
    baselineRange: app.baselineRange,
    rangeSummary: rangeSummary(rangeMap),
    rangeMap,
    skills: aggregateSkills(app.attempts),
    attempts: app.attempts,
  };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), 'jayasongmatch-progress.json');
  toast(`Exported ${app.attempts.length} attempts.`);
}

// ---------------------------------------------------------------------------
// Lyrics
// ---------------------------------------------------------------------------

function bindLyrics() {
  document.querySelectorAll('.btab').forEach((tab) => {
    tab.addEventListener('click', () => setBottomTab(tab.dataset.btab));
  });

  dom.lyricsEditBtn.addEventListener('click', () => openLyricsDialog());
  dom.lyricsTapBtn.addEventListener('click', () => setTapMode(!app.tapMode));
  dom.lyricsNudgeBack.addEventListener('click', () => nudgeLyrics(-0.1));
  dom.lyricsNudgeFwd.addEventListener('click', () => nudgeLyrics(0.1));

  dom.lyricsImportBtn.addEventListener('click', () => dom.lyricsFile.click());
  dom.lyricsFile.addEventListener('change', async () => {
    const file = dom.lyricsFile.files?.[0];
    if (!file) return;
    dom.lyricsText.value = await file.text();
    updateLyricsDialogStatus();
    dom.lyricsFile.value = '';
  });

  dom.lyricsClearTimings.addEventListener('click', () => {
    const { lines } = parseLyrics(dom.lyricsText.value);
    dom.lyricsText.value = formatLyrics(clearTimings(lines));
    updateLyricsDialogStatus();
  });

  dom.lyricsText.addEventListener('input', updateLyricsDialogStatus);

  dom.lyricsDialog.addEventListener('close', () => {
    if (dom.lyricsDialog.returnValue !== 'save') return;
    const { lines, errors } = parseLyrics(dom.lyricsText.value);
    if (errors.length) toast(errors[0], true);
    const scope = dom.lyricsScope.value;
    const trackId = app.store.selectedTrackId;
    app.store.update((project) => {
      if (scope === 'part') {
        const track = project.tracks.find((t) => t.id === trackId);
        if (track) track.lyrics = lines;
      } else {
        project.lyrics = lines;
        // A part-level override would hide what was just saved for the song.
        const track = project.tracks.find((t) => t.id === trackId);
        if (track && !track.lyrics?.length) track.lyrics = null;
      }
    });
    setBottomTab('lyrics');
  });
}

function setBottomTab(name) {
  app.bottomTab = name;
  document.querySelectorAll('.btab').forEach((tab) => tab.classList.toggle('active', tab.dataset.btab === name));
  dom.scorecard.hidden = name !== 'score';
  dom.lyricSheet.hidden = name !== 'lyrics';
  dom.lyricsActions.hidden = name !== 'lyrics';
  if (name === 'lyrics') renderLyrics();
  else if (app.tapMode) setTapMode(false);
}

function currentLyrics() {
  const project = app.store.project;
  if (!project) return [];
  return lyricsFor(project, app.store.selectedTrack);
}

function renderLyrics() {
  const lines = currentLyrics();
  app.band.setLines(lines);
  app.sheet.setLines(lines);
  app.band.update(app.playhead);
  app.sheet.update(app.playhead, { follow: false });
  const track = app.store.selectedTrack;
  const ownWords = Boolean(track?.lyrics?.length);
  dom.lyricsStatus.textContent = `${lyricsSummary(lines)}${ownWords ? ` · ${track.name} only` : ''}`;
  if (app.tapMode) app.sheet.markPending(nextUntimedIndex(lines));
}

function setTapMode(enabled) {
  app.tapMode = enabled;
  dom.lyricsTapBtn.classList.toggle('active', enabled);
  dom.lyricsTapBtn.textContent = enabled ? 'Tapping — press T' : 'Tap to time';
  app.sheet.setTapMode(enabled);
  if (enabled) {
    const pending = nextUntimedIndex(currentLyrics());
    app.sheet.markPending(pending);
    toast(pending === -1
      ? 'Every line is timed. Clear the timings first if you want to redo them.'
      : 'Play the track and press T (or click a line) as each line comes around.');
  } else {
    app.sheet.markPending(-1);
  }
}

/** Stamp the pending line — or a clicked one — with the current position. */
function stampLyricLine(index = null) {
  const lines = currentLyrics();
  if (!lines.length) return;
  const target = index === null ? nextUntimedIndex(lines) : index;
  if (target < 0) {
    toast('Every line already has a time.');
    setTapMode(false);
    return;
  }
  const stamped = stampLine(lines, target, app.playhead);
  writeLyrics(stamped);
  const remaining = nextUntimedIndex(stamped);
  app.sheet.markPending(remaining);
  if (remaining === -1) {
    setTapMode(false);
    toast('All lines timed.');
  }
}

function nudgeLyrics(seconds) {
  const lines = currentLyrics();
  if (!lines.length) return;
  writeLyrics(shiftLyrics(lines, seconds));
  toast(`Lyrics shifted ${seconds > 0 ? '+' : ''}${Math.round(seconds * 1000)} ms.`);
}

/** Write back to whichever scope the current words came from. */
function writeLyrics(lines) {
  const trackId = app.store.selectedTrackId;
  const usesOwn = Boolean(app.store.selectedTrack?.lyrics?.length);
  app.store.update((project) => {
    if (usesOwn) {
      const track = project.tracks.find((t) => t.id === trackId);
      if (track) track.lyrics = lines;
    } else {
      project.lyrics = lines;
    }
  });
}

function openLyricsDialog() {
  const track = app.store.selectedTrack;
  const usesOwn = Boolean(track?.lyrics?.length);
  dom.lyricsScope.value = usesOwn ? 'part' : 'song';
  dom.lyricsDialogScope.textContent = usesOwn ? track.name : (app.store.project?.title ?? 'song');
  dom.lyricsText.value = formatLyrics(currentLyrics());
  updateLyricsDialogStatus();
  dom.lyricsDialog.showModal();
}

function updateLyricsDialogStatus() {
  const { lines, errors } = parseLyrics(dom.lyricsText.value);
  dom.lyricsDialogStatus.textContent = errors.length ? errors[0] : lyricsSummary(lines);
}

function renderStageHead() {
  const project = app.store.project;
  const track = app.store.selectedTrack;
  dom.projectName.textContent = project ? `${project.title} · ${project.key}` : 'No project';
  dom.partSwatch.style.background = track?.color ?? '#444';
  dom.partName.textContent = track?.name ?? 'No part selected';
  dom.partRange.textContent = track ? `${midiToName(track.low)}–${midiToName(track.high)} · ${targetsSummary(track.targets, project.transpose)}` : '';

  const sections = projectSections(project ?? { sections: [], bpm: 120, timeSig: [4, 4], anchor: 0 });
  dom.sectionSelect.innerHTML = '<option value="">Jump to section…</option>';
  sections.forEach((section, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `${section.name} (${formatTime(section.start)})`;
    dom.sectionSelect.appendChild(option);
  });

  dom.backingInfo.textContent = project?.backing ? `Backing: ${project.backing.name}` : 'No backing track loaded';
}

function openTargetDialog() {
  const track = app.store.selectedTrack;
  if (!track) return;
  dom.targetDialogPart.textContent = track.name;
  dom.targetText.value = formatTargets(track.targets);
  dom.targetStatus.textContent = targetsSummary(track.targets, app.store.project.transpose);
  dom.targetDialog.showModal();
}

function bindDialogs() {
  const shiftDialogOctave = (semitones) => {
    const { notes, errors } = parseTargets(dom.targetText.value, app.store.project.bpm);
    if (errors.length) {
      dom.targetStatus.textContent = errors[0];
      return;
    }
    dom.targetText.value = formatTargets(shiftTargets(notes, { semitones }));
  };
  dom.targetOctaveUp.addEventListener('click', () => shiftDialogOctave(12));
  dom.targetOctaveDown.addEventListener('click', () => shiftDialogOctave(-12));

  dom.targetText.addEventListener('input', () => {
    const { notes, errors } = parseTargets(dom.targetText.value, app.store.project.bpm);
    dom.targetStatus.textContent = errors.length ? errors.slice(0, 2).join('; ') : targetsSummary(notes, app.store.project.transpose);
  });

  dom.targetDialog.addEventListener('close', () => {
    if (dom.targetDialog.returnValue !== 'save') return;
    const track = app.store.selectedTrack;
    if (!track) return;
    const { notes, errors } = parseTargets(dom.targetText.value, app.store.project.bpm);
    if (errors.length) {
      toast(`Targets not saved: ${errors[0]}`, true);
      return;
    }
    app.store.updateTrack(track.id, (current) => {
      current.targets = notes;
      current.targetSource = 'manual';
    });
    const warning = rangeWarning(notes, track, app.store.project.transpose);
    if (warning) toast(warning);
    rescoreTrack(track.id);
  });

  dom.settingsBtn.addEventListener('click', () => {
    const project = app.store.project;
    dom.latencyInput.value = project.latencyOffsetMs;
    dom.countinInput.value = project.countInBeats;
    dom.transposeInput.value = project.transpose;
    dom.a4Input.value = project.a4;
    dom.octaveAgnostic.checked = project.octaveAgnostic;
    dom.anchorInput.value = project.anchor;
    dom.settingsDialog.showModal();
  });

  dom.settingsDialog.addEventListener('close', () => {
    const previous = { transpose: app.store.project.transpose, a4: app.store.project.a4, octaveAgnostic: app.store.project.octaveAgnostic };
    app.store.update((project) => {
      project.latencyOffsetMs = Number(dom.latencyInput.value) || 0;
      project.countInBeats = clamp(Number(dom.countinInput.value) || 0, 0, 16);
      project.transpose = clamp(Number(dom.transposeInput.value) || 0, -24, 24);
      project.a4 = clamp(Number(dom.a4Input.value) || 440, 400, 480);
      project.octaveAgnostic = dom.octaveAgnostic.checked;
      project.anchor = Number(dom.anchorInput.value) || 0;
    });
    const project = app.store.project;
    if (project.transpose !== previous.transpose || project.a4 !== previous.a4 || project.octaveAgnostic !== previous.octaveAgnostic) {
      for (const track of project.tracks) rescoreTrack(track.id);
    }
  });

  dom.calibrateBtn.addEventListener('click', calibrateLatency);
  dom.deleteProjectBtn.addEventListener('click', async () => {
    const project = app.store.project;
    if (!confirm(`Delete "${project.name}" and all of its takes?`)) return;
    dom.settingsDialog.close();
    await deleteProject(project);
  });

  dom.exportMixBtn.addEventListener('click', exportMix);
  dom.addPartBtn.addEventListener('click', addPart);
}

/**
 * Play four clicks, listen for them, and derive the leftover round-trip delay
 * the browser did not already report.
 */
async function calibrateLatency() {
  try {
    await ensureInput();
  } catch (error) {
    dom.calibrateStatus.textContent = `Microphone access failed: ${error.message}`;
    return;
  }
  dom.calibrateBtn.disabled = true;
  dom.calibrateStatus.textContent = 'Listening… keep quiet and let the four clicks through your speakers.';

  const spacing = 0.5;
  const count = 4;
  app.input.startCapture();
  const first = app.engine.context.currentTime + 0.5;
  for (let i = 0; i < count; i++) app.engine.click(first + i * spacing, true);

  await delay((0.5 + count * spacing + 0.5) * 1000);
  const { samples, startContextTime, sampleRate } = await app.input.stopCapture();

  const expected = Array.from({ length: count }, (_, i) => first + i * spacing - startContextTime);
  const detected = detectOnsets(samples, sampleRate, count, expected);
  dom.calibrateBtn.disabled = false;

  if (detected.length < 2) {
    dom.calibrateStatus.textContent = 'Could not hear the clicks. Turn the speakers up (or select a loopback input) and try again.';
    return;
  }

  const deltas = detected.map((time, index) => time - expected[index]).filter((value) => value > -0.05 && value < 0.6);
  if (!deltas.length) {
    dom.calibrateStatus.textContent = 'The detected clicks did not line up. Try again in a quieter room.';
    return;
  }
  deltas.sort((a, b) => a - b);
  const roundTrip = deltas[deltas.length >> 1];
  const already = app.engine.systemLatency + (app.input.reportedLatency || 0);
  const extraMs = Math.round((roundTrip - already) * 1000);

  dom.latencyInput.value = extraMs;
  app.store.update((project) => { project.latencyOffsetMs = extraMs; });
  dom.calibrateStatus.textContent = `Measured ${Math.round(roundTrip * 1000)} ms round trip; ${extraMs} ms of that was not already reported. Saved.`;
}

/** Energy-envelope onset picking, one per expected click window. */
function detectOnsets(samples, sampleRate, count, expected) {
  const frame = Math.round(sampleRate * 0.002);
  const envelope = new Float32Array(Math.floor(samples.length / frame));
  let peak = 0;
  for (let i = 0; i < envelope.length; i++) {
    let sum = 0;
    for (let j = 0; j < frame; j++) {
      const value = samples[i * frame + j];
      sum += value * value;
    }
    envelope[i] = Math.sqrt(sum / frame);
    peak = Math.max(peak, envelope[i]);
  }
  if (peak < 0.01) return [];

  const threshold = peak * 0.35;
  const onsets = [];
  for (let index = 0; index < count; index++) {
    const centre = expected[index];
    const from = Math.max(0, Math.floor(((centre - 0.05) * sampleRate) / frame));
    const to = Math.min(envelope.length - 1, Math.ceil(((centre + 0.45) * sampleRate) / frame));
    let found = null;
    for (let i = from; i <= to; i++) {
      if (envelope[i] >= threshold) {
        found = (i * frame) / sampleRate;
        break;
      }
    }
    if (found !== null) onsets.push(found);
    else onsets.push(NaN);
  }
  return onsets.filter((value) => !Number.isNaN(value)).length >= 2 ? onsets.map((v) => (Number.isNaN(v) ? Infinity : v)) : [];
}

async function exportMix() {
  const project = app.store.project;
  // Guides are references you sang against, not part of the finished stack.
  const plan = buildPlan({ guides: false });
  if (!plan.length) {
    toast('Nothing to export yet — record a part first.', true);
    return;
  }
  toast('Rendering mix…');
  try {
    const buffer = await app.engine.renderMix(plan, projectDuration(project) + 1);
    downloadBlob(bufferToWav(buffer), `${safeName(project.name)}-mix.wav`);
    toast('Mix exported.');
  } catch (error) {
    toast(`Export failed: ${error.message}`, true);
  }
}

function addPart() {
  const project = app.store.project;
  const used = new Set(project.tracks.map((track) => track.role));
  const available = Object.keys(PART_ROLES).find((role) => !used.has(role)) ?? 'tenor1';
  const preset = PART_ROLES[available];
  const name = prompt('Name for the new part:', preset.name);
  if (name === null) return;

  app.store.update((current) => {
    current.tracks.push({
      id: uid(),
      name: name.trim() || preset.name,
      role: available,
      color: preset.color,
      low: preset.low,
      high: preset.high,
      tip: preset.tip,
      level: 0.8,
      pan: current.tracks.length % 2 === 0 ? -0.25 : 0.25,
      mute: false,
      solo: false,
      armed: false,
      targets: [],
      targetSource: 'none',
      takes: [],
      activeTakeId: null,
    });
  });
}

// ---------------------------------------------------------------------------
// Mixer
// ---------------------------------------------------------------------------

function renderMixer() {
  const project = app.store.project;
  if (!project) return;
  const list = dom.mixerList;
  list.innerHTML = '';

  for (const track of project.tracks) list.appendChild(trackStrip(track));
  if (project.backing) list.appendChild(backingStrip(project));
}

function trackStrip(track) {
  const project = app.store.project;
  const strip = document.createElement('div');
  strip.className = 'strip';
  if (track.id === app.store.selectedTrackId) strip.classList.add('selected');
  if (track.armed) strip.classList.add('armed');

  const take = activeTake(track);
  const score = take?.score;

  const head = document.createElement('div');
  head.className = 'strip-head';
  const swatch = document.createElement('span');
  swatch.className = 'swatch';
  swatch.style.background = track.color;
  const name = document.createElement('div');
  name.className = 'strip-name';
  name.textContent = track.name;
  name.title = track.tip || track.name;
  name.addEventListener('click', () => app.store.selectTrack(track.id));
  name.addEventListener('dblclick', () => {
    const next = prompt('Rename part:', track.name);
    if (next) app.store.updateTrack(track.id, (current) => { current.name = next.trim(); });
  });
  const badge = document.createElement('span');
  badge.className = 'strip-score';
  badge.textContent = score ? `${score.overall.toFixed(0)} ${score.grade}` : '—';
  if (score) badge.style.color = colorForCents(score.overall >= 90 ? 5 : score.overall >= 75 ? 20 : score.overall >= 60 ? 40 : 80);
  head.append(swatch, name, badge);

  const buttons = document.createElement('div');
  buttons.className = 'strip-row';
  buttons.append(
    miniButton('Arm', 'arm', track.armed, () => app.store.armTrack(track.id)),
    miniButton('Mute', 'mute', track.mute, () => {
      app.store.updateTrack(track.id, (current) => { current.mute = !current.mute; }, { type: 'mix' });
    }),
    miniButton('Solo', 'solo', track.solo, () => {
      app.store.updateTrack(track.id, (current) => { current.solo = !current.solo; }, { type: 'mix' });
    }),
  );

  const level = sliderRow('Vol', track.level, 0, 1.4, 0.01, (value) => {
    app.store.updateTrack(track.id, (current) => { current.level = value; }, { type: 'mix', silent: true });
    app.engine.setTrackMix(track.id, { level: value });
  });
  const pan = sliderRow('Pan', track.pan, -1, 1, 0.01, (value) => {
    app.store.updateTrack(track.id, (current) => { current.pan = value; }, { type: 'mix', silent: true });
    app.engine.setTrackMix(track.id, { pan: value });
  });

  const takes = document.createElement('div');
  takes.className = 'strip-takes';
  const select = document.createElement('select');
  select.title = 'Which take of this part plays in the mix';
  if (!track.takes.length) {
    const option = document.createElement('option');
    option.textContent = 'No takes yet';
    select.appendChild(option);
    select.disabled = true;
  } else {
    for (const item of track.takes) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = `${item.name}${item.score ? ` — ${item.score.overall.toFixed(0)}` : ''}`;
      select.appendChild(option);
    }
    select.value = track.activeTakeId ?? track.takes[track.takes.length - 1].id;
  }
  select.addEventListener('change', () => {
    app.store.updateTrack(track.id, (current) => { current.activeTakeId = select.value; });
    app.store.selectTrack(track.id);
    app.store.selectTake(select.value);
  });
  const deleteTake = document.createElement('button');
  deleteTake.className = 'mini';
  deleteTake.textContent = '✕';
  deleteTake.title = 'Delete the selected take';
  deleteTake.disabled = !track.takes.length;
  deleteTake.addEventListener('click', async () => {
    const takeId = track.activeTakeId;
    const doomed = track.takes.find((item) => item.id === takeId);
    if (!doomed) return;
    await db.deleteAudio(doomed.audioKey).catch(() => {});
    app.buffers.delete(doomed.id);
    app.store.updateTrack(track.id, (current) => {
      current.takes = current.takes.filter((item) => item.id !== takeId);
      current.activeTakeId = current.takes[current.takes.length - 1]?.id ?? null;
      if (current.referenceTakeId === takeId) {
        current.referenceTakeId = null;
        current.guideEnabled = false;
      }
    });
  });
  takes.append(select, deleteTake);

  // Reference / guide row: what this part sounds like, on the timeline, while
  // you sing it.
  const reference = referenceOf(track);
  const ref = document.createElement('div');
  ref.className = 'strip-ref';
  ref.append(
    miniButton('Ref', 'guide', track.guideEnabled, () => {
      app.store.updateTrack(track.id, (current) => { current.guideEnabled = !current.guideEnabled; }, { type: 'mix' });
      if (app.engine.playing) restartTransport();
    }),
    miniButton('Set★', 'setref', false, () => {
      const takeId = track.activeTakeId;
      if (!takeId) {
        toast('Record or select a take on this part first.', true);
        return;
      }
      app.store.updateTrack(track.id, (current) => {
        current.referenceTakeId = takeId;
        current.referenceAudio = null;
        current.guideEnabled = true;
      }, { type: 'mix' });
      toast(`${track.name}: that take is now the reference. It plays while you record this part.`);
    }),
    miniButton('Load…', 'loadref', false, () => importPartReference(track.id)),
  );
  const refLevel = document.createElement('input');
  refLevel.type = 'range';
  refLevel.min = '0';
  refLevel.max = '1.4';
  refLevel.step = '0.01';
  refLevel.value = String(track.guideLevel);
  refLevel.title = 'Reference level — keep it under your own voice';
  refLevel.addEventListener('input', () => {
    const value = Number(refLevel.value);
    app.store.updateTrack(track.id, (current) => { current.guideLevel = value; }, { type: 'mix', silent: true });
    app.engine.setTrackMix(guideTrackId(track.id), { level: value });
  });
  ref.appendChild(refLevel);

  const refName = document.createElement('div');
  refName.className = `strip-ref-name${reference ? ' set' : ''}`;
  refName.textContent = reference ? `Ref: ${reference.name}` : 'No reference set';
  if (reference) {
    const clear = document.createElement('button');
    clear.className = 'mini';
    clear.textContent = '✕';
    clear.title = 'Clear this reference';
    clear.style.marginLeft = '6px';
    clear.addEventListener('click', (event) => {
      event.stopPropagation();
      app.store.updateTrack(track.id, (current) => {
        current.referenceTakeId = null;
        current.referenceAudio = null;
        current.guideEnabled = false;
      }, { type: 'mix' });
    });
    refName.appendChild(clear);
  }

  const meta = document.createElement('div');
  meta.className = 'strip-meta';
  const warning = rangeWarning(track.targets, track, project.transpose);
  meta.innerHTML = '';
  meta.append(document.createTextNode(targetsSummary(track.targets, project.transpose)));
  if (warning) {
    const span = document.createElement('div');
    span.className = 'warn';
    span.textContent = warning;
    meta.appendChild(span);
  }

  strip.append(head, buttons, level, pan, takes, ref, refName, meta);
  strip.addEventListener('click', (event) => {
    if (event.target.closest('button, select, input')) return;
    app.store.selectTrack(track.id);
  });
  return strip;
}

function backingStrip(project) {
  const strip = document.createElement('div');
  strip.className = 'strip';
  const head = document.createElement('div');
  head.className = 'strip-head';
  const name = document.createElement('div');
  name.className = 'strip-name';
  name.textContent = `Backing — ${project.backing.name}`;
  head.appendChild(name);

  const state = app.engine.tracks.get(BACKING_TRACK_ID);
  const buttons = document.createElement('div');
  buttons.className = 'strip-row';
  buttons.append(
    miniButton('Mute', 'mute', state?.mute ?? false, () => {
      app.engine.setTrackMix(BACKING_TRACK_ID, { mute: !(app.engine.tracks.get(BACKING_TRACK_ID)?.mute ?? false) });
      renderMixer();
    }),
    miniButton('Remove', 'remove', false, async () => {
      await db.deleteAudio(project.backing.key).catch(() => {});
      app.backingBuffer = null;
      app.store.update((current) => { current.backing = null; });
    }),
  );

  const level = sliderRow('Vol', state?.level ?? 0.7, 0, 1.4, 0.01, (value) => {
    app.engine.setTrackMix(BACKING_TRACK_ID, { level: value });
  });

  strip.append(head, buttons, level);
  return strip;
}

function miniButton(label, role, active, onClick) {
  const button = document.createElement('button');
  button.className = 'mini';
  button.dataset.role = role;
  button.textContent = label;
  button.classList.toggle('active', active);
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

function sliderRow(label, value, min, max, step, onInput) {
  const row = document.createElement('div');
  row.className = 'strip-row';
  const text = document.createElement('label');
  text.textContent = label;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.addEventListener('input', () => onInput(Number(input.value)));
  row.append(text, input);
  return row;
}

/** Import an isolated stem or any audio file as this part's reference. */
async function importPartReference(trackId) {
  dom.partRefFile.value = '';
  dom.partRefFile.onchange = async () => {
    const file = dom.partRefFile.files?.[0];
    if (!file) return;
    try {
      const buffer = await blobToAudioBuffer(file, app.engine.context);
      const key = `ref-${uid()}`;
      await db.putAudio(key, file);
      app.refBuffers.set(key, buffer);
      app.store.updateTrack(trackId, (current) => {
        current.referenceAudio = { key, name: file.name, duration: buffer.duration, startAt: 0 };
        current.referenceTakeId = null;
        current.guideEnabled = true;
      }, { type: 'mix' });
      toast(`Reference loaded for that part (${formatTime(buffer.duration)}). It starts at 0:00 — use the section anchor if it needs shifting.`);
    } catch (error) {
      toast(`Could not decode that audio file: ${error.message}`, true);
    }
  };
  dom.partRefFile.click();
}

/** Re-run the transport from the current spot so a mix change takes effect now. */
function restartTransport() {
  if (!app.engine.playing || app.recording) return;
  play({ from: app.playhead });
}

function syncEngineMix() {
  const project = app.store.project;
  if (!project) return;
  for (const track of project.tracks) {
    app.engine.setTrackMix(track.id, { level: track.level, pan: track.pan, mute: track.mute, solo: track.solo });
    // A guide inherits its part's mute and solo, so soloing the part you are
    // learning leaves its reference audible and silences everyone else's.
    app.engine.setTrackMix(guideTrackId(track.id), {
      level: track.guideLevel ?? 0.55,
      pan: 0,
      mute: track.mute,
      solo: track.solo,
    });
  }
  if (project.backing) app.engine.ensureTrack(BACKING_TRACK_ID);
  app.engine.setMasterLevel(project.masterLevel ?? 0.9);
}

// ---------------------------------------------------------------------------
// Scorecard
// ---------------------------------------------------------------------------

function renderScorecard() {
  const track = app.store.selectedTrack;
  const take = track?.takes.find((item) => item.id === (app.store.selectedTakeId ?? track.activeTakeId));
  const card = dom.scorecard;

  if (!take) {
    card.innerHTML = '<div class="empty-state">Record a take to see your accuracy for this part.</div>';
    return;
  }
  if (take.analyzing) {
    card.innerHTML = '<div class="empty-state">Analysing take…</div>';
    return;
  }
  if (!take.score) {
    card.innerHTML = '<div class="empty-state">No score yet. Set target notes for this part, then re-record or use “Take → target”.</div>';
    return;
  }

  const score = take.score;
  card.innerHTML = '';

  const top = document.createElement('div');
  top.className = 'score-top';
  const big = document.createElement('div');
  big.className = 'score-big';
  big.innerHTML = '<div class="score-value"></div><div class="score-grade"></div>';
  big.querySelector('.score-value').textContent = score.overall.toFixed(0);
  big.querySelector('.score-value').style.color = colorForCents(score.overall >= 90 ? 5 : score.overall >= 75 ? 20 : score.overall >= 60 ? 40 : 80);
  big.querySelector('.score-grade').textContent = `${score.grade} · ${take.name}`;

  const bars = document.createElement('div');
  bars.className = 'score-bars';
  for (const [label, value, hint] of [
    ['Pitch', score.parts.pitch, 'How close each note sat to its target'],
    ['Timing', score.parts.timing, 'How close your entries were to the target start. Only counts on notes near enough the target to be that note.'],
    ['Coverage', score.parts.coverage, 'How much of each target note you actually sang, at the right pitch'],
    ['Stability', score.parts.stability, 'How steady each held note was. Only counts on notes near enough the target to be that note.'],
  ]) {
    const name = document.createElement('div');
    name.className = 'label';
    name.textContent = label;
    name.title = hint;
    const bar = document.createElement('div');
    bar.className = 'bar';
    const fill = document.createElement('div');
    fill.style.width = `${clamp(value, 0, 100)}%`;
    fill.style.background = colorForCents(value >= 90 ? 5 : value >= 75 ? 20 : value >= 60 ? 40 : 80);
    bar.appendChild(fill);
    const number = document.createElement('div');
    number.className = 'value';
    number.textContent = value.toFixed(0);
    bars.append(name, bar, number);
  }
  top.append(big, bars);
  card.appendChild(top);

  const stats = document.createElement('div');
  stats.className = 'score-stats';
  const bias = score.stats.bias;
  stats.innerHTML = `
    <span>Notes <b>${score.stats.notesSung}/${score.stats.notesTotal}</b></span>
    <span>Within 10¢ <b>${score.stats.withinPerfect.toFixed(0)}%</b></span>
    <span>Within 25¢ <b>${score.stats.withinGood.toFixed(0)}%</b></span>
    <span>Median error <b>${score.stats.medianCents === null ? '—' : `${score.stats.medianCents}¢`}</b></span>
    <span>Bias <b>${bias === null ? '—' : `${bias > 0 ? '+' : ''}${bias}¢ ${bias > 5 ? 'sharp' : bias < -5 ? 'flat' : ''}`}</b></span>`;
  card.appendChild(stats);

  if (score.advice.length) {
    const advice = document.createElement('ul');
    advice.className = 'advice';
    for (const tip of score.advice) {
      const item = document.createElement('li');
      item.textContent = tip;
      advice.appendChild(item);
    }
    card.appendChild(advice);
  }

  const table = document.createElement('table');
  table.className = 'notes';
  table.innerHTML = `
    <thead><tr>
      <th>Time</th><th>Note</th><th>Error</th><th>Steadiness</th><th>Entry</th><th>Sung</th><th></th>
    </tr></thead><tbody></tbody>`;
  const body = table.querySelector('tbody');
  for (const note of score.notes) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${formatTime(note.time)}</td>
      <td>${note.name}</td>
      <td>${note.cents === null ? '—' : `${note.cents > 0 ? '+' : ''}${note.cents}¢`}</td>
      <td>${note.centsSpread === null ? '—' : `±${note.centsSpread}¢`}</td>
      <td>${note.timingOffset === null ? '—' : `${note.timingOffset > 0 ? '+' : ''}${(note.timingOffset * 1000).toFixed(0)} ms`}</td>
      <td>${(note.coverage * 100).toFixed(0)}%</td>
      <td><span class="pill ${note.verdict}">${note.verdict}</span></td>`;
    row.addEventListener('click', () => {
      seek(Math.max(0, note.time - 0.5));
      app.ribbon.setView(Math.max(0, note.time - 2), 6);
    });
    body.appendChild(row);
  }
  card.appendChild(table);
}

// ---------------------------------------------------------------------------
// Rendering entry points
// ---------------------------------------------------------------------------

function renderAll() {
  const project = app.store.project;
  if (!project) return;
  dom.bpmInput.value = project.bpm;
  dom.masterVolume.value = project.masterLevel ?? 0.9;
  dom.clickBtn.classList.toggle('active', project.clickDuringPlay);
  dom.loopBtn.classList.toggle('active', Boolean(project.loopEnabled && project.loop));
  renderStageHead();
  renderMixer();
  renderScorecard();
  renderRibbon();
  renderLyrics();
  renderBaselineBanner();
  renderLibrary();
}

function renderRibbon() {
  const project = app.store.project;
  if (!project) return;
  const track = app.store.selectedTrack;
  const take = track?.takes.find((item) => item.id === (app.store.selectedTakeId ?? track.activeTakeId)) ?? null;
  app.ribbon.setContext({ project, track, take, sections: projectSections(project) });
}

// ---------------------------------------------------------------------------
// Keyboard + helpers
// ---------------------------------------------------------------------------

function bindKeyboard() {
  document.addEventListener('keydown', (event) => {
    if (event.target.matches('input, textarea, select')) return;
    if (event.key === ' ') {
      event.preventDefault();
      app.engine.playing ? stop() : play();
    } else if (event.key.toLowerCase() === 'r') {
      event.preventDefault();
      app.recording ? stop() : record();
    } else if (event.key === 'Home') {
      seek(0);
    } else if (event.key.toLowerCase() === 't') {
      if (app.tapMode) {
        event.preventDefault();
        stampLyricLine();
      }
    } else if (event.key.toLowerCase() === 'l') {
      setLoopEnabled(!app.store.project.loopEnabled);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const project = app.store.project;
      const index = project.tracks.findIndex((track) => track.id === app.store.selectedTrackId);
      const next = clamp(index + (event.key === 'ArrowDown' ? 1 : -1), 0, project.tracks.length - 1);
      app.store.selectTrack(project.tracks[next].id);
      event.preventDefault();
    }
  });
}

let toastTimer = null;
function toast(message, isError = false) {
  dom.toast.textContent = message;
  dom.toast.classList.toggle('error', isError);
  dom.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { dom.toast.hidden = true; }, isError ? 6000 : 4000);
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const safeName = (name) => String(name).replace(/[^a-z0-9\-_ ]/gi, '').trim().replace(/\s+/g, '-') || 'project';

boot().catch((error) => {
  console.error(error);
  toast(`Startup failed: ${error.message}`, true);
});
