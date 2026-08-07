// Capture worklet. Buffers raw input frames and ships them to the main thread
// in chunks, each stamped with the AudioContext time of its first sample so a
// take can be aligned to the transport exactly.

const CHUNK_FRAMES = 4096;

class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunk = new Float32Array(CHUNK_FRAMES);
    this.filled = 0;
    this.chunkStartTime = 0;
    this.capturing = false;
    this.peak = 0;
    this.blocksSincePeak = 0;

    this.port.onmessage = (event) => {
      const { command } = event.data;
      if (command === 'start') {
        this.filled = 0;
        this.capturing = true;
        this.chunkStartTime = currentTime;
        this.port.postMessage({ type: 'started', contextTime: currentTime });
      } else if (command === 'stop') {
        this.flush();
        this.capturing = false;
        this.port.postMessage({ type: 'stopped', contextTime: currentTime });
      }
    };
  }

  flush() {
    if (this.filled === 0) return;
    const pcm = this.chunk.slice(0, this.filled);
    this.port.postMessage({ type: 'chunk', pcm, contextTime: this.chunkStartTime }, [pcm.buffer]);
    this.filled = 0;
  }

  process(inputs) {
    const input = inputs[0];
    const channel = input && input[0];
    if (!channel) return true;

    // Always report level so the input meter works before arming.
    for (let i = 0; i < channel.length; i++) {
      const magnitude = Math.abs(channel[i]);
      if (magnitude > this.peak) this.peak = magnitude;
    }
    if (++this.blocksSincePeak >= 8) {
      this.port.postMessage({ type: 'level', peak: this.peak });
      this.peak = 0;
      this.blocksSincePeak = 0;
    }

    if (!this.capturing) return true;

    let read = 0;
    while (read < channel.length) {
      if (this.filled === 0) {
        // Time of the first sample in this chunk: start of the render quantum
        // plus however far into it we are.
        this.chunkStartTime = currentTime + read / sampleRate;
      }
      const space = CHUNK_FRAMES - this.filled;
      const take = Math.min(space, channel.length - read);
      this.chunk.set(channel.subarray(read, read + take), this.filled);
      this.filled += take;
      read += take;
      if (this.filled === CHUNK_FRAMES) this.flush();
    }
    return true;
  }
}

registerProcessor('recorder-processor', RecorderProcessor);
