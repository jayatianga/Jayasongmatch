// YIN fundamental-frequency estimator (de Cheveigne & Kawahara, 2002).
//
// The search range is bounded to the human vocal range, which keeps the O(n*tau)
// difference function cheap enough to run per animation frame on the main thread
// and fast enough to analyse a whole take in a worker.

const DEFAULT_MIN_HZ = 65;   // ~C2, below a low bass part
const DEFAULT_MAX_HZ = 1200; // ~D6, above a falsetto top part

/**
 * @param {Float32Array} buf  windowed time-domain samples
 * @param {number} sampleRate
 * @returns {{hz:number, clarity:number}} hz is 0 when nothing periodic is found.
 *   `clarity` is 1 - the YIN dip value, so 1.0 is a perfectly periodic signal.
 */
export function yin(buf, sampleRate, opts = {}) {
  const threshold = opts.threshold ?? 0.15;
  const minHz = opts.minHz ?? DEFAULT_MIN_HZ;
  const maxHz = opts.maxHz ?? DEFAULT_MAX_HZ;

  const halfLen = buf.length >> 1;
  const tauMin = Math.max(2, Math.floor(sampleRate / maxHz));
  const tauMax = Math.min(halfLen - 1, Math.ceil(sampleRate / minHz));
  if (tauMax <= tauMin) return { hz: 0, clarity: 0 };

  // Step 1-2: squared difference function, cumulative-mean normalised.
  const d = new Float32Array(tauMax + 1);
  for (let tau = tauMin; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < halfLen; i++) {
      const delta = buf[i] - buf[i + tau];
      sum += delta * delta;
    }
    d[tau] = sum;
  }

  const cmnd = new Float32Array(tauMax + 1);
  let running = 0;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    running += d[tau];
    cmnd[tau] = running === 0 ? 1 : (d[tau] * (tau - tauMin + 1)) / running;
  }

  // Step 3: first local minimum below the absolute threshold, else global min.
  let tauEstimate = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (cmnd[tau] < threshold) {
      while (tau + 1 <= tauMax && cmnd[tau + 1] < cmnd[tau]) tau++;
      tauEstimate = tau;
      break;
    }
  }
  if (tauEstimate === -1) {
    let best = tauMin;
    for (let tau = tauMin; tau <= tauMax; tau++) if (cmnd[tau] < cmnd[best]) best = tau;
    // Nothing crossed the threshold: only trust it if the dip is still shallow.
    if (cmnd[best] > 0.6) return { hz: 0, clarity: 0 };
    tauEstimate = best;
  }

  // Step 4: parabolic interpolation around the dip for sub-sample precision.
  let betterTau = tauEstimate;
  if (tauEstimate > tauMin && tauEstimate < tauMax) {
    const s0 = cmnd[tauEstimate - 1];
    const s1 = cmnd[tauEstimate];
    const s2 = cmnd[tauEstimate + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) betterTau = tauEstimate + (s2 - s0) / denom;
  }

  const hz = sampleRate / betterTau;
  if (!isFinite(hz) || hz < minHz || hz > maxHz) return { hz: 0, clarity: 0 };
  return { hz, clarity: Math.max(0, Math.min(1, 1 - cmnd[tauEstimate])) };
}

/** RMS level of a block, in linear amplitude. */
export function rms(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}
