// Capability detection. These run under Node, which has none of the browser
// APIs, so they double as a check that the module degrades rather than throwing
// when something is missing — the exact situation on an older iOS.

import test from 'node:test';
import assert from 'node:assert/strict';

/** Node 22 exposes `navigator` as a getter-only global, so it has to be redefined. */
function setGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

/** A minimal browser-ish global, built per test so cases stay independent. */
function stubBrowser({ userAgent = 'node', touchPoints = 0, secure = true, extras = {} } = {}) {
  setGlobal('navigator', { userAgent, maxTouchPoints: touchPoints, platform: 'Linux', ...extras.navigator });
  globalThis.window = {
    isSecureContext: secure,
    matchMedia: () => ({ matches: false }),
    navigator: globalThis.navigator,
    innerWidth: 1280,
    ...extras.window,
  };
  globalThis.document = { addEventListener() {}, visibilityState: 'visible' };
  globalThis.indexedDB = extras.indexedDB ?? {};
  globalThis.HTMLDialogElement = extras.HTMLDialogElement ?? function () {};
  if (extras.HTMLDialogElement !== null) globalThis.HTMLDialogElement.prototype.showModal = () => {};
  globalThis.AudioWorkletNode = extras.AudioWorkletNode === null ? undefined : function () {};
  globalThis.AudioContext = extras.AudioContext === null ? undefined : function () {};
  if (globalThis.AudioContext) {
    // `audioWorklet` is a getter on the prototype in real browsers, and reading
    // it without an instance throws — the capability check must not do that.
    Object.defineProperty(globalThis.AudioContext.prototype, 'audioWorklet', {
      configurable: true,
      get() { throw new TypeError('Illegal invocation'); },
    });
  }
  // In a browser `window` is globalThis, so the stub mirrors that.
  globalThis.window.AudioContext = globalThis.AudioContext;
  globalThis.window.AudioWorkletNode = globalThis.AudioWorkletNode;
  globalThis.window.indexedDB = globalThis.indexedDB;
  globalThis.Worker = extras.Worker ?? function () { this.terminate = () => {}; };
  globalThis.URL.createObjectURL ??= () => 'blob:stub';
  globalThis.URL.revokeObjectURL ??= () => {};
  globalThis.Blob = globalThis.Blob ?? function () {};
}

async function freshImport() {
  // A query string defeats the module cache so each test sees its own globals.
  return import(`../js/platform.js?v=${Math.random()}`);
}

test('capability checks never invoke the audioWorklet getter', async () => {
  stubBrowser();
  const { capabilities } = await freshImport();
  // Would throw "Illegal invocation" if the check read the property.
  const report = capabilities();
  const worklet = report.checks.find((check) => check.id === 'audioWorklet');
  assert.equal(worklet.ok, true, 'presence should be detected without calling the getter');
});

test('a missing AudioWorklet is reported as blocking, not as a crash', async () => {
  stubBrowser({ extras: { AudioWorkletNode: null } });
  const { capabilities } = await freshImport();
  const report = capabilities();
  assert.ok(report.blocked.some((check) => check.id === 'audioWorklet'));
  assert.match(report.blocked.find((c) => c.id === 'audioWorklet').detail, /14\.5/);
});

test('an insecure context is blocking and explains the fix', async () => {
  stubBrowser({ secure: false });
  const { capabilities } = await freshImport();
  const blocked = (await freshImport()).capabilities().blocked;
  assert.ok(blocked.some((check) => check.id === 'secureContext'));
  assert.match(blocked.find((c) => c.id === 'secureContext').detail, /https|localhost/i);
});

test('a missing dialog element degrades rather than blocks', async () => {
  stubBrowser({ extras: { HTMLDialogElement: null } });
  globalThis.HTMLDialogElement = undefined;
  const { capabilities } = await freshImport();
  const report = capabilities();
  assert.ok(report.degraded.some((check) => check.id === 'dialog'));
  assert.ok(!report.blocked.some((check) => check.id === 'dialog'));
});

test('iPhone user agents are detected', async () => {
  stubBrowser({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' });
  const { isIOS } = await freshImport();
  assert.equal(isIOS, true);
});

test('iPadOS is detected despite reporting itself as a Mac', async () => {
  stubBrowser({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
    touchPoints: 5,
    extras: { navigator: { platform: 'MacIntel' } },
  });
  const { isIOS } = await freshImport();
  assert.equal(isIOS, true, 'a touch-capable Mac user agent is an iPad');
});

test('a real Mac is not mistaken for an iPad', async () => {
  stubBrowser({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
    touchPoints: 0,
    extras: { navigator: { platform: 'MacIntel' } },
  });
  const { isIOS } = await freshImport();
  assert.equal(isIOS, false);
});

test('the input picker is offered off iOS and withheld on it', async () => {
  stubBrowser({ userAgent: 'Windows NT 10.0', extras: { navigator: { mediaDevices: { enumerateDevices() {} } } } });
  assert.equal((await freshImport()).canChooseInputDevice(), true);

  stubBrowser({ userAgent: 'iPhone', extras: { navigator: { mediaDevices: { enumerateDevices() {} } } } });
  assert.equal((await freshImport()).canChooseInputDevice(), false, 'iOS ignores deviceId, so the control would do nothing');
});

test('platform notes mention the iOS limits and stay quiet elsewhere', async () => {
  stubBrowser({ userAgent: 'iPhone' });
  const notes = (await freshImport()).platformNotes();
  assert.ok(notes.some((note) => /microphone/i.test(note)));
  assert.ok(notes.some((note) => /loopback/i.test(note)), 'the missing loopback is worth saying out loud');

  stubBrowser({ userAgent: 'Windows NT 10.0' });
  assert.deepEqual((await freshImport()).platformNotes(), []);
});

test('persistent storage request survives a browser that lacks the API', async () => {
  stubBrowser();
  const { requestPersistentStorage } = await freshImport();
  assert.deepEqual(await requestPersistentStorage(), { supported: false, persisted: false });
});

test('persistent storage reports what the browser decided', async () => {
  stubBrowser({ extras: { navigator: { storage: { persisted: async () => false, persist: async () => true } } } });
  assert.deepEqual(await (await freshImport()).requestPersistentStorage(), { supported: true, persisted: true });

  stubBrowser({ extras: { navigator: { storage: { persisted: async () => false, persist: async () => false } } } });
  assert.deepEqual(await (await freshImport()).requestPersistentStorage(), { supported: true, persisted: false });
});

test('the screen lock is a no-op where wake lock is unavailable', async () => {
  stubBrowser();
  const { ScreenLock } = await freshImport();
  const lock = new ScreenLock();
  assert.equal(await lock.acquire(), false);
  await lock.release(); // must not throw
});

test('the screen lock takes and releases a sentinel when supported', async () => {
  let released = false;
  stubBrowser({
    extras: { navigator: { wakeLock: { request: async () => ({ release: async () => { released = true; } }) } } },
  });
  const { ScreenLock } = await freshImport();
  const lock = new ScreenLock();
  assert.equal(await lock.acquire(), true);
  await lock.release();
  assert.equal(released, true);
});
