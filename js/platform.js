// Platform detection and capability checks.
//
// iOS is the awkward one. Every browser there is WebKit, microphone access
// needs a secure context, the OS picks the input device rather than the page,
// and the audio session is taken away on a phone call or when you switch apps.
// The app adapts rather than pretending those differences do not exist.

export const ua = navigator.userAgent;

/** iPadOS reports itself as a Mac, so touch support is the giveaway. */
export const isIOS = /iPad|iPhone|iPod/.test(ua) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
  (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);

export const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
export const isTouch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
export const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

/** Roughly, does the layout need the single-column treatment? */
export const isNarrow = () => window.innerWidth < 780;

/**
 * Everything the app needs, and whether it is available. `blocking` entries
 * stop recording from working at all.
 */
export function capabilities() {
  const checks = [
    {
      id: 'secureContext',
      ok: window.isSecureContext,
      blocking: true,
      label: 'Secure connection',
      detail: 'Microphone access needs https:// or localhost. Over a home network that means serving the app with the --https option and trusting its certificate.',
    },
    {
      id: 'getUserMedia',
      ok: Boolean(navigator.mediaDevices?.getUserMedia),
      blocking: true,
      label: 'Microphone capture',
      detail: 'This browser will not hand over a microphone stream.',
    },
    {
      id: 'audioWorklet',
      // `in` rather than reading the property: `audioWorklet` is a getter on
      // the prototype, and invoking it without an instance throws.
      ok: typeof AudioWorkletNode !== 'undefined' &&
        typeof AudioContext === 'function' &&
        'audioWorklet' in AudioContext.prototype,
      blocking: true,
      label: 'AudioWorklet',
      detail: 'Sample-accurate recording needs AudioWorklet — iOS 14.5 or newer.',
    },
    {
      id: 'moduleWorker',
      ok: supportsModuleWorker(),
      blocking: false,
      label: 'Module workers',
      detail: 'Pitch analysis runs on the main thread instead, so the display stutters while a take is scored.',
    },
    {
      id: 'indexedDB',
      ok: Boolean(window.indexedDB),
      blocking: false,
      label: 'Local storage',
      detail: 'Projects and progress cannot be saved between visits.',
    },
    {
      id: 'dialog',
      ok: typeof HTMLDialogElement !== 'undefined' && 'showModal' in (HTMLDialogElement.prototype ?? {}),
      blocking: false,
      label: 'Dialogs',
      detail: 'Editors open as plain panels — iOS 15.4 or newer for the proper ones.',
    },
  ];
  return {
    checks,
    blocked: checks.filter((check) => check.blocking && !check.ok),
    degraded: checks.filter((check) => !check.blocking && !check.ok),
  };
}

let moduleWorkerSupport = null;
function supportsModuleWorker() {
  if (moduleWorkerSupport !== null) return moduleWorkerSupport;
  moduleWorkerSupport = false;
  try {
    // Constructing with a `type` getter reveals whether the option is read.
    const url = URL.createObjectURL(new Blob([''], { type: 'text/javascript' }));
    let read = false;
    const worker = new Worker(url, { get type() { read = true; return 'module'; } });
    worker.terminate();
    URL.revokeObjectURL(url);
    moduleWorkerSupport = read;
  } catch {
    moduleWorkerSupport = false;
  }
  return moduleWorkerSupport;
}

/**
 * iOS only reveals one usable input and ignores deviceId selection, so the
 * input and channel pickers are meaningless there. Better to say so than to
 * offer controls that do nothing.
 */
export function canChooseInputDevice() {
  return !isIOS && Boolean(navigator.mediaDevices?.enumerateDevices);
}

/**
 * Ask the browser not to evict our recordings. Safari clears site data after a
 * week of not visiting unless storage is persisted, which would take every take
 * with it.
 */
export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return { supported: false, persisted: false };
  try {
    const already = await navigator.storage.persisted?.();
    if (already) return { supported: true, persisted: true };
    return { supported: true, persisted: await navigator.storage.persist() };
  } catch {
    return { supported: true, persisted: false };
  }
}

/** Keep the screen awake while recording — a locked phone stops the take. */
export class ScreenLock {
  constructor() {
    this.sentinel = null;
    // Re-acquire after the tab comes back; iOS drops the lock on backgrounding.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.wanted) this.acquire();
    });
    this.wanted = false;
  }

  async acquire() {
    this.wanted = true;
    if (!navigator.wakeLock) return false;
    try {
      this.sentinel = await navigator.wakeLock.request('screen');
      return true;
    } catch {
      return false;
    }
  }

  async release() {
    this.wanted = false;
    try {
      await this.sentinel?.release();
    } catch { /* already gone */ }
    this.sentinel = null;
  }
}

/** A short, honest description of what this platform can and cannot do. */
export function platformNotes() {
  const notes = [];
  if (isIOS) {
    notes.push('On iOS the system chooses the microphone — plug in an interface or headset and iOS will switch to it automatically.');
    notes.push('There is no loopback input on iOS, so import backing tracks as files rather than capturing what is playing.');
    if (!isStandalone) notes.push('Add this page to your Home Screen for a full-screen app that keeps its own storage.');
  }
  return notes;
}
