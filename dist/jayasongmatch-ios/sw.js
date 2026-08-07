// Service worker: caches the app shell so the Home Screen app opens and works
// without the PC being switched on. Recordings live in IndexedDB and are not
// touched here.

const CACHE = 'jayasongmatch-v1';

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './assets/icon-180.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './js/main.js',
  './js/platform.js',
  './js/state.js',
  './js/score.js',
  './js/audio/engine.js',
  './js/audio/input.js',
  './js/audio/wav.js',
  './js/audio/worklets/recorder-processor.js',
  './js/dsp/notes.js',
  './js/dsp/yin.js',
  './js/dsp/pitch.js',
  './js/dsp/analyze-worker.js',
  './js/data/songs.js',
  './js/data/exercises.js',
  './js/data/lyrics.js',
  './js/store/db.js',
  './js/ui/ribbon.js',
  './js/ui/noteeditor.js',
  './js/ui/lyrics.js',
  './js/ui/trainer.js',
  './js/trainer/profile.js',
  './js/trainer/baseline.js',
  './js/trainer/coach.js',
  './js/trainer/attempt.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // One missing file must not fail the whole install, so each is added
      // separately and failures are tolerated.
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Network first, so an edited file is picked up while developing, with the
  // cache as the offline fallback.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached ?? caches.match('./index.html'))),
  );
});
