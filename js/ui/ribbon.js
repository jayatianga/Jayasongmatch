// The pitch ribbon: target notes as bars, your sung contour drawn over them and
// coloured by how far off it is, plus sections, playhead and loop region.

import { midiToName } from '../dsp/notes.js';
import { isVoiced } from '../dsp/pitch.js';
import { TOLERANCE_CENTS } from '../score.js';

const RULER_HEIGHT = 26;
const KEYS_WIDTH = 46;

const ACCURACY_COLORS = [
  { limit: TOLERANCE_CENTS.perfect, color: '#3ddc84' },
  { limit: TOLERANCE_CENTS.good, color: '#9ede3f' },
  { limit: TOLERANCE_CENTS.fair, color: '#ffc93c' },
  { limit: Infinity, color: '#ff5f56' },
];

export function colorForCents(centsAbs) {
  for (const band of ACCURACY_COLORS) if (centsAbs <= band.limit) return band.color;
  return ACCURACY_COLORS[ACCURACY_COLORS.length - 1].color;
}

export class Ribbon {
  constructor(canvas, { onSeek, onLoop } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onSeek = onSeek;
    this.onLoop = onLoop;

    this.project = null;
    this.track = null;
    this.take = null;
    this.sections = [];
    this.position = 0;
    this.view = { start: 0, duration: 20 };
    this.livePitch = null;   // {midi, clarity}
    this.liveTrail = [];     // recent live pitches, for a short comet tail
    this.follow = true;
    this.recording = false;

    this._dragging = null;
    this._bindPointer();

    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.width = rect.width;
    this.height = rect.height;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render();
  }

  setContext({ project, track, take, sections }) {
    this.project = project ?? this.project;
    this.track = track;
    this.take = take;
    if (sections) this.sections = sections;
    this.render();
  }

  setPosition(position, { recording = false } = {}) {
    this.position = position;
    this.recording = recording;
    if (this.follow) this._followPlayhead();
    this.render();
  }

  setLivePitch(pitch) {
    this.livePitch = pitch;
    if (pitch && pitch.midi > 0) {
      this.liveTrail.push({ t: this.position, midi: pitch.midi });
      const cutoff = this.position - 1.5;
      while (this.liveTrail.length && this.liveTrail[0].t < cutoff) this.liveTrail.shift();
    }
  }

  setView(start, duration) {
    this.view = { start: Math.max(0, start), duration: Math.max(1, duration) };
    this.render();
  }

  zoom(factor, aroundTime = null) {
    const centre = aroundTime ?? this.view.start + this.view.duration / 2;
    const duration = Math.max(1, Math.min(600, this.view.duration * factor));
    this.setView(centre - (centre - this.view.start) * (duration / this.view.duration), duration);
  }

  fitAll(totalDuration) {
    this.follow = false;
    this.setView(0, Math.max(4, totalDuration));
  }

  _followPlayhead() {
    const { start, duration } = this.view;
    if (this.position < start || this.position > start + duration * 0.85) {
      this.view.start = Math.max(0, this.position - duration * 0.25);
    }
  }

  // --- coordinate helpers -------------------------------------------------
  timeToX(time) {
    return KEYS_WIDTH + ((time - this.view.start) / this.view.duration) * (this.width - KEYS_WIDTH);
  }

  xToTime(x) {
    return this.view.start + ((x - KEYS_WIDTH) / (this.width - KEYS_WIDTH)) * this.view.duration;
  }

  get pitchRange() {
    let low = Infinity;
    let high = -Infinity;
    for (const note of this.track?.targets ?? []) {
      const midi = note.midi + (this.project?.transpose ?? 0);
      low = Math.min(low, midi);
      high = Math.max(high, midi);
    }
    if (this.take?.pitch) {
      const { midi } = this.take.pitch;
      for (let i = 0; i < midi.length; i++) {
        if (midi[i] > 0) {
          low = Math.min(low, midi[i]);
          high = Math.max(high, midi[i]);
        }
      }
    }
    if (this.livePitch?.midi > 0) {
      low = Math.min(low, this.livePitch.midi);
      high = Math.max(high, this.livePitch.midi);
    }
    if (!isFinite(low) || !isFinite(high)) {
      low = this.track?.low ?? 48;
      high = this.track?.high ?? 72;
    }
    const padding = Math.max(3, (high - low) * 0.25);
    return { low: Math.floor(low - padding), high: Math.ceil(high + padding) };
  }

  midiToY(midi) {
    const { low, high } = this._range;
    const span = Math.max(1, high - low);
    const usable = this.height - RULER_HEIGHT;
    return RULER_HEIGHT + usable - ((midi - low) / span) * usable;
  }

  // --- rendering ----------------------------------------------------------
  render() {
    const ctx = this.ctx;
    if (!ctx || !this.width) return;
    this._range = this.pitchRange;

    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = '#12151c';
    ctx.fillRect(0, 0, this.width, this.height);

    this._drawPitchGrid();
    this._drawSections();
    this._drawLoop();
    this._drawTargets();
    this._drawContour();
    this._drawLive();
    this._drawRuler();
    this._drawPlayhead();
  }

  _drawPitchGrid() {
    const ctx = this.ctx;
    const { low, high } = this._range;
    for (let midi = low; midi <= high; midi++) {
      const isBlack = [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
      const y = this.midiToY(midi);
      const nextY = this.midiToY(midi + 1);
      const rowHeight = Math.abs(y - nextY);
      ctx.fillStyle = isBlack ? '#161a23' : '#1b202b';
      ctx.fillRect(KEYS_WIDTH, nextY, this.width - KEYS_WIDTH, rowHeight);

      // Piano key strip on the left.
      ctx.fillStyle = isBlack ? '#20242e' : '#2b313d';
      ctx.fillRect(0, nextY, KEYS_WIDTH, rowHeight - 1);
      if (rowHeight > 11 && !isBlack) {
        ctx.fillStyle = '#8b93a5';
        ctx.font = '10px ui-monospace, monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(midiToName(midi), KEYS_WIDTH - 5, nextY + rowHeight / 2);
      }
      if (((midi % 12) + 12) % 12 === 0) {
        ctx.strokeStyle = '#2f3644';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(KEYS_WIDTH, Math.round(nextY) + 0.5);
        ctx.lineTo(this.width, Math.round(nextY) + 0.5);
        ctx.stroke();
      }
    }
  }

  _drawSections() {
    const ctx = this.ctx;
    for (const section of this.sections) {
      const x = this.timeToX(section.start);
      if (x < KEYS_WIDTH - 200 || x > this.width) continue;
      ctx.strokeStyle = 'rgba(140,160,200,0.35)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, RULER_HEIGHT);
      ctx.lineTo(Math.round(x) + 0.5, this.height);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  _drawLoop() {
    const loop = this.project?.loop;
    if (!loop) return;
    const ctx = this.ctx;
    const x1 = this.timeToX(loop.start);
    const x2 = this.timeToX(loop.end);
    ctx.fillStyle = 'rgba(90,150,255,0.10)';
    ctx.fillRect(x1, RULER_HEIGHT, x2 - x1, this.height - RULER_HEIGHT);
    ctx.strokeStyle = 'rgba(120,175,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, RULER_HEIGHT);
    ctx.lineTo(x1, this.height);
    ctx.moveTo(x2, RULER_HEIGHT);
    ctx.lineTo(x2, this.height);
    ctx.stroke();
  }

  _drawTargets() {
    const track = this.track;
    if (!track?.targets?.length) {
      this._drawEmptyHint();
      return;
    }
    const ctx = this.ctx;
    const transpose = this.project?.transpose ?? 0;
    const scored = new Map();
    for (const note of this.take?.score?.notes ?? []) scored.set(`${note.time}:${note.midi}`, note);

    for (const note of track.targets) {
      const midi = note.midi + transpose;
      const x = this.timeToX(note.time);
      const w = Math.max(2, this.timeToX(note.time + note.duration) - x);
      if (x + w < KEYS_WIDTH || x > this.width) continue;
      const y = this.midiToY(midi + 0.5);
      const h = Math.max(4, Math.abs(this.midiToY(midi - 0.5) - y));

      const result = scored.get(`${note.time}:${midi}`);
      ctx.fillStyle = track.color ? hexToRgba(track.color, 0.28) : 'rgba(120,180,255,0.28)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = result ? colorForCents(result.centsAbs ?? 999) : (track.color ?? '#7fd4ff');
      ctx.lineWidth = result ? 2 : 1.5;
      ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);

      if (w > 26 && h > 10) {
        ctx.fillStyle = '#e8ecf5';
        ctx.font = '10px ui-monospace, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(midiToName(midi), x + 4, y + h / 2);
      }
    }
  }

  _drawEmptyHint() {
    const ctx = this.ctx;
    ctx.fillStyle = '#6b7385';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      'No target notes for this part yet — record a reference take, or draw notes in the target editor.',
      KEYS_WIDTH + (this.width - KEYS_WIDTH) / 2,
      this.height / 2,
    );
  }

  /** The recorded contour, coloured by distance from the nearest target note. */
  _drawContour() {
    const pitch = this.take?.pitch;
    if (!pitch) return;
    const ctx = this.ctx;
    const startAt = this.take.startAt ?? 0;
    const transpose = this.project?.transpose ?? 0;
    const targets = this.track?.targets ?? [];

    let previous = null;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    for (let i = 0; i < pitch.times.length; i++) {
      if (!isVoiced(pitch, i)) {
        previous = null;
        continue;
      }
      const t = startAt + pitch.times[i];
      const x = this.timeToX(t);
      const y = this.midiToY(pitch.midi[i]);
      if (x < KEYS_WIDTH || x > this.width) {
        previous = null;
        continue;
      }
      const target = targets.find((n) => t >= n.time && t <= n.time + n.duration);
      const cents = target ? Math.abs((pitch.midi[i] - (target.midi + transpose)) * 100) : null;
      ctx.strokeStyle = cents === null ? 'rgba(230,238,255,0.55)' : colorForCents(cents);
      if (previous) {
        ctx.beginPath();
        ctx.moveTo(previous.x, previous.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      previous = { x, y };
    }
  }

  _drawLive() {
    const ctx = this.ctx;
    if (this.liveTrail.length > 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      this.liveTrail.forEach((point, index) => {
        const x = this.timeToX(point.t);
        const y = this.midiToY(point.midi);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    if (!this.livePitch || !(this.livePitch.midi > 0)) return;
    const x = this.timeToX(this.position);
    const y = this.midiToY(this.livePitch.midi);
    ctx.fillStyle = this.livePitch.color ?? '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  _drawRuler() {
    const ctx = this.ctx;
    ctx.fillStyle = '#0d1016';
    ctx.fillRect(0, 0, this.width, RULER_HEIGHT);
    ctx.strokeStyle = '#252b36';
    ctx.beginPath();
    ctx.moveTo(0, RULER_HEIGHT + 0.5);
    ctx.lineTo(this.width, RULER_HEIGHT + 0.5);
    ctx.stroke();

    const step = niceStep(this.view.duration);
    const first = Math.ceil(this.view.start / step) * step;
    ctx.font = '10px ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    for (let t = first; t < this.view.start + this.view.duration; t += step) {
      const x = this.timeToX(t);
      ctx.strokeStyle = '#333b49';
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, RULER_HEIGHT - 6);
      ctx.lineTo(Math.round(x) + 0.5, RULER_HEIGHT);
      ctx.stroke();
      ctx.fillStyle = '#7b8496';
      ctx.textAlign = 'left';
      ctx.fillText(formatClock(t), x + 3, 8);
    }

    for (const section of this.sections) {
      const x = this.timeToX(section.start);
      const end = this.timeToX(section.end);
      if (end < KEYS_WIDTH || x > this.width) continue;
      ctx.fillStyle = 'rgba(120,160,230,0.16)';
      ctx.fillRect(x, RULER_HEIGHT - 12, Math.max(1, end - x - 1), 12);
      ctx.fillStyle = '#aab6cd';
      ctx.textAlign = 'left';
      ctx.save();
      ctx.beginPath();
      ctx.rect(Math.max(KEYS_WIDTH, x), RULER_HEIGHT - 12, Math.max(0, end - Math.max(KEYS_WIDTH, x)), 12);
      ctx.clip();
      ctx.fillText(section.name, Math.max(KEYS_WIDTH, x) + 4, RULER_HEIGHT - 6);
      ctx.restore();
    }
  }

  _drawPlayhead() {
    const ctx = this.ctx;
    const x = this.timeToX(this.position);
    if (x < KEYS_WIDTH || x > this.width) return;
    ctx.strokeStyle = this.recording ? '#ff4d4d' : '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, this.height);
    ctx.stroke();
  }

  // --- interaction --------------------------------------------------------
  _bindPointer() {
    const canvas = this.canvas;
    canvas.addEventListener('pointerdown', (event) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const time = Math.max(0, this.xToTime(x));
      if (event.shiftKey) {
        this._dragging = { mode: 'loop', from: time };
        canvas.setPointerCapture(event.pointerId);
      } else {
        this.follow = false;
        this.onSeek?.(time);
      }
    });

    canvas.addEventListener('pointermove', (event) => {
      if (!this._dragging) return;
      const rect = canvas.getBoundingClientRect();
      const time = Math.max(0, this.xToTime(event.clientX - rect.left));
      if (this._dragging.mode === 'loop') {
        const start = Math.min(this._dragging.from, time);
        const end = Math.max(this._dragging.from, time);
        if (end - start > 0.2) this.onLoop?.({ start, end });
      }
    });

    canvas.addEventListener('pointerup', (event) => {
      this._dragging = null;
      canvas.releasePointerCapture?.(event.pointerId);
    });

    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const time = this.xToTime(event.clientX - rect.left);
      if (event.ctrlKey || event.metaKey) {
        this.zoom(event.deltaY > 0 ? 1.15 : 0.87, time);
      } else {
        this.follow = false;
        this.setView(this.view.start + (event.deltaY / 300) * this.view.duration, this.view.duration);
      }
    }, { passive: false });
  }

  destroy() {
    this._resizeObserver.disconnect();
  }
}

function niceStep(duration) {
  const target = duration / 8;
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120];
  return steps.find((step) => step >= target) ?? 300;
}

function formatClock(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(s < 10 ? 1 : 0).padStart(s < 10 ? 4 : 2, '0')}`;
}

function hexToRgba(hex, alpha) {
  const value = hex.replace('#', '');
  const bigint = parseInt(value.length === 3 ? value.split('').map((c) => c + c).join('') : value, 16);
  return `rgba(${(bigint >> 16) & 255}, ${(bigint >> 8) & 255}, ${bigint & 255}, ${alpha})`;
}
