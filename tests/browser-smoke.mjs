// Optional end-to-end check. Unlike the unit tests it needs a real browser, so
// it is not part of `npm test`.
//
//   npm i -D playwright          (once)
//   python serve.py --no-browser (in another terminal)
//   node tests/browser-smoke.mjs
//
// Set CHROMIUM_PATH if Playwright's bundled browser is not installed, and
// BASE_URL if you served on a different port.
//
// It drives the real app: loads a drill, records a take from a synthetic C4
// injected in place of the microphone, and asserts that the take lands on the
// timeline in the right place and scores as a match. That is the part unit
// tests cannot cover, because it depends on the audio graph and the transport.

import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8770/';
const launchOptions = {
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
};
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;

const errors = [];
const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ permissions: ['microphone'] });
const page = await context.newPage();
page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('requestfailed', (request) => errors.push(`requestfailed: ${request.url()}`));

// Replace the microphone with a steady C4 so the expected result is known.
await page.addInitScript(() => {
  navigator.mediaDevices.getUserMedia = async () => {
    const audio = new AudioContext({ sampleRate: 48000 });
    const destination = audio.createMediaStreamDestination();
    for (const [harmonic, level] of [[1, 0.35], [2, 0.17], [3, 0.09]]) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.frequency.value = 261.6255653 * harmonic; // C4
      gain.gain.value = level;
      oscillator.connect(gain).connect(destination);
      oscillator.start();
    }
    return destination.stream;
  };
});

await page.goto(BASE_URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

// The default project is a drill, so parts and targets exist immediately.
assert.ok((await page.textContent('#project-name')).length > 3, 'a project should load on startup');
assert.ok((await page.$$('.strip')).length >= 4, 'the mixer should show the parts');

// "Sustain and tuning test" starts with a six-second C4 at position 0.
await page.click('.tab[data-tab="drills"]');
await page.waitForTimeout(300);
await page.click('#library-list .song-card >> nth=3');
await page.waitForTimeout(800);

await page.click('#settings-btn');
await page.waitForTimeout(300);
await page.fill('#countin-input', '0');
await page.evaluate(() => document.getElementById('settings-dialog').close('close'));
await page.waitForTimeout(400);

await page.click('.strip >> nth=0 >> .mini[data-role="arm"]');
await page.click('#record-btn');
await page.waitForTimeout(6500);
await page.click('#record-btn');
await page.waitForTimeout(4000);

const rows = await page.$$eval('table.notes tbody tr', (trs) =>
  trs.map((tr) => [...tr.children].map((td) => td.textContent.trim())));
assert.ok(rows.length >= 1, 'the scorecard should list the target notes');

const [time, name, error, , entry, coverage, verdict] = rows[0];
console.log(`first note: ${name} at ${time} — error ${error}, entry ${entry}, sung ${coverage}, ${verdict}`);

assert.equal(name, 'C4');
const centsOff = Math.abs(parseFloat(error));
assert.ok(centsOff < 20, `injected C4 should read as in tune, got ${error}`);
const entryMs = Math.abs(parseFloat(entry));
assert.ok(entryMs < 90, `the take should land on the timeline within 90 ms, got ${entry}`);
assert.equal(verdict, 'perfect');

const overall = Number(await page.textContent('.score-value'));
assert.ok(overall > 85, `a matched take should score well, got ${overall}`);

assert.deepEqual(errors, [], 'the page should run without console errors');
console.log(`overall ${overall} — browser smoke test passed`);
await browser.close();
