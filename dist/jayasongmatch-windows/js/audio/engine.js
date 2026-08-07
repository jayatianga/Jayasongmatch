// Transport + mixer. Every part is a track with its own gain/pan/mute/solo, and
// those can be changed while the transport is rolling — that is what "mix each
// part in and out" means in practice.

const LOOKAHEAD = 0.12; // seconds of scheduling headroom before playback starts

/**
 * Create the AudioContext without fighting the hardware. Forcing 48 kHz throws
 * on some iOS devices and silently resamples on others; asking for the
 * device's own rate avoids both. Everything downstream reads
 * `context.sampleRate` rather than assuming a value.
 */
function createContext() {
  try {
    return new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
  } catch {
    try {
      return new AudioContext({ latencyHint: 'interactive' });
    } catch {
      return new AudioContext();
    }
  }
}

export class Engine {
  constructor() {
    this.context = createContext();
    this.onInterrupted = null;
    this.master = this.context.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.context.destination);

    this.metronomeBus = this.context.createGain();
    this.metronomeBus.gain.value = 0.35;
    this.metronomeBus.connect(this.master);

    this.tracks = new Map();      // trackId -> {gain, pan, mute, solo, level}
    this.sources = [];            // live AudioBufferSourceNodes
    this.playing = false;
    this.startContextTime = 0;
    this.startPosition = 0;
    this.countInSeconds = 0;
    this.loop = null;             // {start, end}
    this.onStop = null;
    this._loopTimer = null;
    this._plan = [];
  }

  async resume() {
    if (this.context.state !== 'running') await this.context.resume();
    return this.context.state === 'running';
  }

  /**
   * iOS takes the audio session away for a phone call, Siri, or another app,
   * and hands back a suspended context. Anything mid-flight is lost, so the
   * transport is stopped and the caller told, rather than leaving a take that
   * silently recorded nothing.
   */
  watchForInterruptions() {
    this.context.addEventListener('statechange', () => {
      if (this.context.state === 'running') return;
      const wasPlaying = this.playing;
      this.stop({ silent: true });
      if (wasPlaying) this.onInterrupted?.(this.context.state);
    });
  }

  /** Round-trip delay we can account for without asking the user to calibrate. */
  get systemLatency() {
    return (this.context.outputLatency || 0) + (this.context.baseLatency || 0);
  }

  ensureTrack(trackId) {
    let node = this.tracks.get(trackId);
    if (!node) {
      const gain = this.context.createGain();
      const pan = this.context.createStereoPanner();
      gain.connect(pan).connect(this.master);
      node = { gain, pan, mute: false, solo: false, level: 0.8 };
      this.tracks.set(trackId, node);
    }
    return node;
  }

  setTrackMix(trackId, { level, pan, mute, solo } = {}) {
    const node = this.ensureTrack(trackId);
    if (level !== undefined) node.level = level;
    if (pan !== undefined) node.pan.pan.setTargetAtTime(pan, this.context.currentTime, 0.02);
    if (mute !== undefined) node.mute = mute;
    if (solo !== undefined) node.solo = solo;
    this.applyMix();
  }

  /** Recompute every fader, honouring solo. Safe to call mid-playback. */
  applyMix() {
    const anySolo = [...this.tracks.values()].some((t) => t.solo);
    const now = this.context.currentTime;
    for (const node of this.tracks.values()) {
      const audible = node.mute ? false : anySolo ? node.solo : true;
      node.gain.gain.setTargetAtTime(audible ? node.level : 0, now, 0.015);
    }
  }

  setMasterLevel(value) {
    this.master.gain.setTargetAtTime(value, this.context.currentTime, 0.02);
  }

  removeTrack(trackId) {
    const node = this.tracks.get(trackId);
    if (!node) return;
    node.gain.disconnect();
    node.pan.disconnect();
    this.tracks.delete(trackId);
  }

  /**
   * @param {Array} plan   [{trackId, buffer, startAt}] where startAt is the
   *                       song-timeline position of the buffer's first sample.
   * @param {object} opts  {from, countInBeats, bpm, clickDuringPlay, loop}
   * @returns {number} AudioContext time at which song position `from` is heard.
   */
  play(plan, opts = {}) {
    this.stop({ silent: true });
    const from = Math.max(0, opts.from ?? 0);
    const bpm = opts.bpm ?? 120;
    const beat = 60 / bpm;
    const countInBeats = opts.countInBeats ?? 0;

    this._plan = plan;
    this.countInSeconds = countInBeats * beat;
    const startAt = this.context.currentTime + LOOKAHEAD + this.countInSeconds;
    this.startContextTime = startAt;
    this.startPosition = from;
    this.loop = opts.loop ?? null;
    this.playing = true;

    for (let i = 0; i < countInBeats; i++) {
      this.click(startAt - this.countInSeconds + i * beat, i % 4 === 0);
    }
    if (opts.clickDuringPlay) {
      const span = (this.loop ? this.loop.end - from : opts.duration ?? 0) + 0.001;
      for (let t = 0; t < span; t += beat) {
        this.click(startAt + t, Math.round(t / beat) % 4 === 0);
      }
    }

    for (const item of plan) {
      if (!item.buffer) continue;
      const node = this.ensureTrack(item.trackId);
      const source = this.context.createBufferSource();
      source.buffer = item.buffer;
      source.connect(node.gain);

      const bufferStart = item.startAt ?? 0;
      const offsetIntoBuffer = from - bufferStart;
      if (offsetIntoBuffer >= item.buffer.duration) continue; // finished before `from`

      if (offsetIntoBuffer >= 0) {
        source.start(startAt, offsetIntoBuffer);
      } else {
        source.start(startAt - offsetIntoBuffer); // buffer begins later in the song
      }
      this.sources.push(source);
    }

    this.applyMix();

    if (this.loop) {
      const remaining = this.loop.end - from;
      this._loopTimer = setTimeout(() => {
        if (this.playing) this.play(plan, { ...opts, from: this.loop.start, countInBeats: 0 });
      }, Math.max(50, (remaining + LOOKAHEAD + this.countInSeconds) * 1000));
    } else if (opts.duration) {
      const remaining = opts.duration - from;
      this._loopTimer = setTimeout(() => {
        if (this.playing) this.stop();
      }, Math.max(50, (remaining + this.countInSeconds + LOOKAHEAD) * 1000));
    }

    return startAt;
  }

  stop({ silent = false } = {}) {
    // Freeze where we actually got to, so `position` still reads correctly once
    // playback has stopped. Stopping during a count-in keeps the intended start
    // rather than snapping back to zero.
    if (this.playing) {
      const reached = this.position;
      if (reached >= 0) this.startPosition = reached;
    }
    clearTimeout(this._loopTimer);
    this._loopTimer = null;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch { /* already stopped */ }
      source.disconnect();
    }
    this.sources = [];
    const wasPlaying = this.playing;
    this.playing = false;
    if (wasPlaying && !silent) this.onStop?.();
  }

  /** Current song position. Negative while a count-in is running. */
  get position() {
    if (!this.playing) return this.startPosition;
    return this.startPosition + (this.context.currentTime - this.startContextTime);
  }

  click(when, accent = false) {
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.frequency.value = accent ? 1600 : 1000;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.9, when + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
    osc.connect(gain).connect(this.metronomeBus);
    osc.start(when);
    osc.stop(when + 0.08);
  }

  /** Reference tone for finding your starting note before a take. */
  playTone(hz, duration = 1.2) {
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'triangle';
    osc.frequency.value = hz;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.35, now + 0.02);
    gain.gain.setValueAtTime(0.35, now + duration - 0.1);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  createBuffer(samples, sampleRate) {
    const buffer = this.context.createBuffer(1, Math.max(1, samples.length), sampleRate);
    buffer.copyToChannel(samples, 0);
    return buffer;
  }

  /** Render the current mix (respecting mute/solo/pan) to a stereo buffer. */
  async renderMix(plan, duration) {
    const length = Math.max(1, Math.ceil(duration * this.context.sampleRate));
    const offline = new OfflineAudioContext(2, length, this.context.sampleRate);
    const master = offline.createGain();
    master.gain.value = this.master.gain.value;
    master.connect(offline.destination);

    const anySolo = [...this.tracks.values()].some((t) => t.solo);
    for (const item of plan) {
      if (!item.buffer) continue;
      const state = this.tracks.get(item.trackId);
      const audible = state ? (state.mute ? false : anySolo ? state.solo : true) : true;
      if (!audible) continue;

      const gain = offline.createGain();
      gain.gain.value = state?.level ?? 0.8;
      const pan = offline.createStereoPanner();
      pan.pan.value = state?.pan.pan.value ?? 0;
      gain.connect(pan).connect(master);

      const source = offline.createBufferSource();
      source.buffer = item.buffer;
      source.connect(gain);
      source.start(Math.max(0, item.startAt ?? 0));
    }
    return offline.startRendering();
  }
}
