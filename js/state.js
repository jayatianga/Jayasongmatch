// Project model + a tiny observable store. Everything the UI renders comes from
// here, and every mutation goes through it so persistence and redraws stay in
// one place.

import { db } from './store/db.js';
import { getSong, barDuration } from './data/songs.js';
import { getExercise } from './data/exercises.js';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);

export function createProject(sourceId) {
  const exercise = getExercise(sourceId);
  return exercise ? projectFromExercise(exercise) : projectFromSong(getSong(sourceId) ?? getSong('custom'));
}

function baseProject(source) {
  return {
    id: uid(),
    name: source.title,
    sourceId: source.id,
    kind: source.kind === 'exercise' ? 'exercise' : 'song',
    title: source.title,
    artist: source.artist,
    key: source.key,
    bpm: source.bpm,
    timeSig: source.timeSig,
    anchor: 0,           // where bar 1 sits, for lining sections up with imported audio
    transpose: 0,        // semitones applied to every target note
    a4: 440,
    octaveAgnostic: false,
    countInBeats: 4,
    clickDuringPlay: false,
    latencyOffsetMs: 0,  // extra correction on top of the reported system latency
    masterLevel: 0.9,
    loop: source.loop ?? null,
    loopEnabled: false,
    backing: null,
    sections: [],
    tracks: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function projectFromSong(song) {
  const project = baseProject(song);
  project.sections = song.sections.map((section) => ({
    id: uid(),
    name: section.name,
    bars: section.bars,
    tip: section.tip ?? '',
  }));
  project.tracks = song.parts.map((partDefinition, index) => makeTrack(partDefinition, index));
  project.duration = totalBars(project) * barDuration(project.bpm, project.timeSig);
  return project;
}

function projectFromExercise(exercise) {
  const project = baseProject(exercise);
  project.sections = [{ id: uid(), name: 'Full drill', bars: Math.max(1, Math.round(exercise.duration / barDuration(exercise.bpm, exercise.timeSig))), tip: exercise.summary }];
  project.tracks = exercise.parts.map((partDefinition, index) => {
    const track = makeTrack(partDefinition, index);
    track.targets = partDefinition.notes.map((note) => ({ ...note }));
    track.targetSource = 'builtin';
    return track;
  });
  project.duration = exercise.duration;
  return project;
}

function makeTrack(partDefinition, index) {
  return {
    id: uid(),
    name: partDefinition.name,
    role: partDefinition.role ?? partDefinition.id,
    color: partDefinition.color,
    low: partDefinition.low,
    high: partDefinition.high,
    tip: partDefinition.tip ?? '',
    level: 0.8,
    pan: index % 2 === 0 ? -0.25 : 0.25, // spread the stack a little by default
    mute: false,
    solo: false,
    armed: index === 0,
    targets: [],
    targetSource: 'none',
    takes: [],
    activeTakeId: null,
  };
}

export function totalBars(project) {
  return project.sections.reduce((sum, section) => sum + section.bars, 0);
}

export function projectSections(project) {
  const bar = barDuration(project.bpm, project.timeSig);
  let cursor = project.anchor;
  return project.sections.map((section) => {
    const start = cursor;
    const duration = section.bars * bar;
    cursor += duration;
    return { ...section, start, duration, end: start + duration };
  });
}

export function projectDuration(project) {
  const structural = project.anchor + totalBars(project) * barDuration(project.bpm, project.timeSig);
  const takeEnd = project.tracks.reduce((max, track) => {
    for (const take of track.takes) max = Math.max(max, (take.startAt ?? 0) + (take.duration ?? 0));
    return max;
  }, 0);
  const backingEnd = project.backing ? project.backing.duration ?? 0 : 0;
  return Math.max(structural, takeEnd, backingEnd, 8);
}

export function activeTake(track) {
  if (!track.activeTakeId) return null;
  return track.takes.find((take) => take.id === track.activeTakeId) ?? null;
}

export function makeTake({ trackId, audioKey, startAt, duration, sampleRate, takeNumber }) {
  return {
    id: uid(),
    trackId,
    name: `Take ${takeNumber}`,
    createdAt: Date.now(),
    audioKey,
    startAt,
    duration,
    sampleRate,
    score: null,
    pitch: null,
    analyzing: false,
  };
}

export class Store extends EventTarget {
  constructor() {
    super();
    this.project = null;
    this.selectedTrackId = null;
    this.selectedTakeId = null;
    this._saveTimer = null;
  }

  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  setProject(project) {
    this.project = project;
    this.selectedTrackId = project.tracks[0]?.id ?? null;
    this.selectedTakeId = null;
    this.emit('project', { project });
    this.save();
  }

  get selectedTrack() {
    return this.project?.tracks.find((track) => track.id === this.selectedTrackId) ?? null;
  }

  get armedTrack() {
    return this.project?.tracks.find((track) => track.armed) ?? null;
  }

  /** Apply a mutation, then notify and persist. */
  update(mutator, { type = 'change', silent = false } = {}) {
    if (!this.project) return;
    mutator(this.project);
    this.project.updatedAt = Date.now();
    if (!silent) this.emit(type, { project: this.project });
    this.save();
  }

  updateTrack(trackId, mutator, options) {
    this.update((project) => {
      const track = project.tracks.find((t) => t.id === trackId);
      if (track) mutator(track, project);
    }, options);
  }

  selectTrack(trackId) {
    this.selectedTrackId = trackId;
    const track = this.selectedTrack;
    this.selectedTakeId = track?.activeTakeId ?? null;
    this.emit('selection', { trackId });
  }

  selectTake(takeId) {
    this.selectedTakeId = takeId;
    this.emit('selection', { takeId });
  }

  /** Arm exactly one track for recording. */
  armTrack(trackId) {
    this.update((project) => {
      for (const track of project.tracks) track.armed = track.id === trackId;
    }, { type: 'mix' });
  }

  save() {
    if (!this.project) return;
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      db.saveProject(stripTransient(this.project)).catch((error) => {
        console.error('Could not save project', error);
        this.emit('error', { message: 'Saving failed — the browser storage quota may be full.' });
      });
    }, 250);
  }
}

/** Drop fields that only make sense in memory before writing to IndexedDB. */
function stripTransient(project) {
  return {
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      takes: track.takes.map(({ analyzing, buffer, ...take }) => take),
    })),
  };
}

export { uid };
