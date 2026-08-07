// Offline pitch analysis + scoring, off the main thread so the UI keeps
// animating while a take is measured.

import { trackPitch, contourToNotes } from './pitch.js';
import { scoreTake } from '../score.js';

self.onmessage = (event) => {
  const { id, type, samples, sampleRate, targets, options } = event.data;
  try {
    const track = trackPitch(samples, sampleRate, {
      ...options,
      onProgress: (value) => self.postMessage({ id, type: 'progress', value }),
    });

    const payload = { id, type: 'done', track: serialise(track) };
    if (type === 'analyze') {
      payload.score = scoreTake(track, targets, options);
    } else if (type === 'derive-notes') {
      payload.notes = contourToNotes(track, options);
    }

    self.postMessage(payload, [
      payload.track.times.buffer,
      payload.track.hz.buffer,
      payload.track.midi.buffer,
      payload.track.clarity.buffer,
      payload.track.rms.buffer,
    ]);
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error?.message ?? String(error) });
  }
};

function serialise(track) {
  return {
    times: track.times,
    hz: track.hz,
    midi: track.midi,
    clarity: track.clarity,
    rms: track.rms,
    hop: track.hop,
  };
}
