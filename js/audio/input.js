// Windows input handling: enumerate capture devices, open one, monitor its
// level and live pitch, and capture transport-aligned takes from it.

const WORKLET_URL = new URL('./worklets/recorder-processor.js', import.meta.url);

/**
 * Device labels are hidden until the page holds a capture permission, so we ask
 * for one first. On Windows this surfaces every WASAPI capture endpoint: your
 * interface inputs, USB mics, and loopback devices such as "Stereo Mix" or a
 * VoiceMeeter output.
 */
export async function listInputDevices({ prompt = false } = {}) {
  if (prompt) {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
    probe.getTracks().forEach((t) => t.stop());
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'audioinput')
    .map((d, index) => ({
      deviceId: d.deviceId,
      label: d.label || `Input ${index + 1}`,
      groupId: d.groupId,
    }));
}

export class InputChain {
  /** @param {AudioNode} [output] where monitoring is heard; defaults to the speakers. */
  constructor(context, output = null) {
    this.context = context;
    this.stream = null;
    this.source = null;
    this.splitter = null;
    this.worklet = null;
    this.analyser = null;
    this.monitorGain = context.createGain();
    this.monitorGain.gain.value = 0;
    this.monitorGain.connect(output ?? context.destination);
    this.deviceId = null;
    this.channel = 0;
    this.channelCount = 1;
    this.reportedLatency = 0;

    this.onLevel = null;
    this._chunks = [];
    this._capturing = false;
    this._startContextTime = 0;
  }

  get isOpen() {
    return Boolean(this.stream);
  }

  /**
   * Open a capture device. Browser voice processing is disabled outright — echo
   * cancellation and noise suppression both mangle sung pitch and would make
   * the accuracy scores meaningless.
   */
  async open({ deviceId, channel = 0 } = {}) {
    await this.close();
    // Preferred: an exact device, untouched by voice processing. If the
    // platform refuses that combination — iOS rejects an exact deviceId it did
    // not offer, and some devices refuse a stereo request — fall back rather
    // than leaving the singer with no microphone at all.
    const processing = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
    const attempts = [
      { audio: { deviceId: deviceId ? { exact: deviceId } : undefined, ...processing, channelCount: { ideal: 2 } } },
      { audio: { deviceId: deviceId ? { ideal: deviceId } : undefined, ...processing } },
      { audio: processing },
      { audio: true },
    ];

    let lastError = null;
    for (const constraints of attempts) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (error) {
        lastError = error;
        // A refusal is the user's decision, not a constraint problem.
        if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') throw error;
      }
    }
    if (!this.stream) throw lastError ?? new Error('No microphone available.');
    const track = this.stream.getAudioTracks()[0];
    const settings = track.getSettings?.() ?? {};
    this.deviceId = settings.deviceId ?? deviceId ?? null;
    this.channelCount = settings.channelCount ?? 1;
    this.reportedLatency = typeof settings.latency === 'number' ? settings.latency : 0;
    this.label = track.label;

    if (!InputChain._workletLoaded) {
      await this.context.audioWorklet.addModule(WORKLET_URL);
      InputChain._workletLoaded = true;
    }

    this.source = this.context.createMediaStreamSource(this.stream);
    this.splitter = this.context.createChannelSplitter(Math.max(1, this.channelCount));
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.worklet = new AudioWorkletNode(this.context, 'recorder-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    this.worklet.port.onmessage = (event) => this._handleWorkletMessage(event.data);

    this.source.connect(this.splitter);
    this._connectChannel(channel);

    // The worklet has an output so the graph stays live, but nothing downstream
    // consumes it — monitoring is a separate, explicitly-enabled path.
    const sink = this.context.createGain();
    sink.gain.value = 0;
    this.worklet.connect(sink).connect(this.context.destination);
    this._sink = sink;

    return { label: this.label, channelCount: this.channelCount, latency: this.reportedLatency };
  }

  /** Pick which channel of a multi-channel interface this part is sung into. */
  setChannel(channel) {
    if (!this.splitter) return;
    this._connectChannel(channel);
  }

  _connectChannel(channel) {
    const index = Math.max(0, Math.min(channel, this.channelCount - 1));
    try {
      this.splitter.disconnect();
    } catch { /* nothing connected yet */ }
    this.channel = index;
    this.splitter.connect(this.analyser, index);
    this.splitter.connect(this.worklet, index);
    this.splitter.connect(this.monitorGain, index);
  }

  setMonitor(enabled, gain = 0.7) {
    const target = enabled ? gain : 0;
    this.monitorGain.gain.setTargetAtTime(target, this.context.currentTime, 0.02);
  }

  _handleWorkletMessage(message) {
    if (message.type === 'level') {
      this.onLevel?.(message.peak);
    } else if (message.type === 'chunk') {
      if (!this._capturing) return;
      if (this._chunks.length === 0) this._startContextTime = message.contextTime;
      this._chunks.push(message.pcm);
    }
  }

  startCapture() {
    if (!this.worklet) throw new Error('No input device is open.');
    this._chunks = [];
    this._startContextTime = 0;
    this._capturing = true;
    this.worklet.port.postMessage({ command: 'start' });
  }

  /**
   * @returns {{samples:Float32Array, startContextTime:number, sampleRate:number}}
   *   `startContextTime` is the AudioContext time of sample 0, which is what
   *   lets a take be placed on the timeline without drift.
   */
  stopCapture() {
    this.worklet?.port.postMessage({ command: 'stop' });
    this._capturing = false;
    // Give the worklet's final flush a moment to land before concatenating.
    return new Promise((resolve) => {
      setTimeout(() => {
        const total = this._chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const samples = new Float32Array(total);
        let offset = 0;
        for (const chunk of this._chunks) {
          samples.set(chunk, offset);
          offset += chunk.length;
        }
        const result = {
          samples,
          startContextTime: this._startContextTime,
          sampleRate: this.context.sampleRate,
        };
        this._chunks = [];
        resolve(result);
      }, 60);
    });
  }

  async close() {
    this._capturing = false;
    this._chunks = [];
    try {
      this.worklet?.port.postMessage({ command: 'stop' });
      this.worklet?.disconnect();
      this._sink?.disconnect();
      this.splitter?.disconnect();
      this.source?.disconnect();
    } catch { /* already torn down */ }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.source = null;
    this.splitter = null;
    this.worklet = null;
    this.analyser = null;
  }
}

InputChain._workletLoaded = false;
