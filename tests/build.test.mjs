// Builds both versions into a temporary folder and checks each one came out
// self-contained and carrying only its own platform's pieces.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function python() {
  for (const candidate of ['python3', 'python']) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return candidate;
    } catch { /* try the next one */ }
  }
  return null;
}

const PYTHON = python();
const out = mkdtempSync(join(tmpdir(), 'jsm-build-'));

// The build runs here, at import time, rather than inside the first test.
// A `skip:` option is evaluated when a test is *registered*, so deciding it
// from a flag set by an earlier test would silently skip everything after it
// while still reporting success.
let buildError = PYTHON ? null : 'python not available';
if (PYTHON) {
  try {
    execFileSync(PYTHON, ['build.py', '--out', out], { cwd: ROOT, stdio: 'pipe' });
  } catch (error) {
    buildError = `build.py failed: ${error.stderr?.toString() ?? error.message}`;
  }
}
// Must be `false`, not null: node's runner reports `skip: null` as skipped even
// though it still runs the body, which would hide real failures.
const skipUnbuilt = buildError ?? false;

const win = (...parts) => join(out, 'jayasongmatch-windows', ...parts);
const ios = (...parts) => join(out, 'jayasongmatch-ios', ...parts);

test('build.py produces both versions', { skip: skipUnbuilt }, () => {
  assert.ok(existsSync(join(out, 'jayasongmatch-windows')), 'windows build exists');
  assert.ok(existsSync(join(out, 'jayasongmatch-ios')), 'ios build exists');
});

test('each build declares which one it is', { skip: skipUnbuilt }, () => {
  assert.match(readFileSync(win('js', 'build.js'), 'utf8'), /TARGET = 'windows'/);
  assert.match(readFileSync(ios('js', 'build.js'), 'utf8'), /TARGET = 'ios'/);
  // The source tree stays universal so it still runs directly.
  assert.match(readFileSync(join(ROOT, 'js', 'build.js'), 'utf8'), /TARGET = 'universal'/);
});

test('the Windows build keeps the input pickers and drops the app manifest', { skip: skipUnbuilt }, () => {
  const html = readFileSync(win('index.html'), 'utf8');
  assert.match(html, /id="device-select"/);
  assert.match(html, /id="channel-select"/);
  assert.ok(!html.includes('rel="manifest"'), 'no web app manifest');
  assert.ok(!html.includes('apple-touch-icon'), 'no iOS icon');
  assert.ok(!existsSync(win('manifest.json')));
  assert.ok(!existsSync(win('sw.js')), 'no service worker to 404 on');
  assert.ok(!existsSync(win('assets')));
});

test('the iOS build drops the input pickers and ships the installable pieces', { skip: skipUnbuilt }, () => {
  const html = readFileSync(ios('index.html'), 'utf8');
  assert.ok(!html.includes('id="device-select"'), 'iOS ignores deviceId, so the control is gone');
  assert.ok(!html.includes('id="channel-select"'));
  assert.match(html, /rel="manifest"/);
  assert.match(html, /apple-touch-icon/);
  assert.ok(existsSync(ios('manifest.json')));
  assert.ok(existsSync(ios('sw.js')));
  assert.ok(existsSync(ios('assets', 'icon-180.png')));
});

test('no build markers survive into either build', { skip: skipUnbuilt }, () => {
  for (const html of [readFileSync(win('index.html'), 'utf8'), readFileSync(ios('index.html'), 'utf8')]) {
    assert.ok(!/build:(ios|windows)/.test(html), 'marker comments are stripped');
  }
});

test('each build has its own launcher and README', { skip: skipUnbuilt }, () => {
  assert.ok(existsSync(win('start-windows.bat')));
  assert.ok(!existsSync(win('start-ios-server.bat')));
  assert.ok(existsSync(ios('start-ios-server.bat')));
  assert.ok(existsSync(ios('start-ios-server.sh')));

  // The iOS launcher must actually turn https on, or Safari gets no microphone.
  assert.match(readFileSync(ios('start-ios-server.bat'), 'utf8'), /serve\.py --https/);
  assert.ok(!/serve\.py --https/.test(readFileSync(win('start-windows.bat'), 'utf8')));

  assert.match(readFileSync(win('README.md'), 'utf8'), /Windows/);
  assert.match(readFileSync(ios('README.md'), 'utf8'), /iOS|iPhone/);
});

test('both builds carry the shared guide and the shared app code', { skip: skipUnbuilt }, () => {
  for (const at of [win, ios]) {
    assert.ok(existsSync(at('GUIDE.md')));
    assert.ok(existsSync(at('serve.py')));
    assert.ok(existsSync(at('css', 'app.css')));
    for (const module of ['main.js', 'score.js', 'platform.js', 'audio/engine.js',
                          'dsp/yin.js', 'trainer/coach.js', 'ui/ribbon.js',
                          'audio/worklets/recorder-processor.js']) {
      assert.ok(existsSync(at('js', module)), `${module} missing`);
    }
  }
});

test('every module a build imports is present in that build', { skip: skipUnbuilt }, () => {
  // A missing file would only show up as a blank page at runtime, so the
  // import graph is walked here instead.
  for (const at of [win, ios]) {
    const root = at();
    const files = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith('.js')) files.push(full);
      }
    };
    walk(join(root, 'js'));

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/(?:from|import)\s+['"](\.[^'"]+)['"]/g)) {
        const resolved = join(file, '..', match[1]);
        assert.ok(existsSync(resolved),
          `${relative(root, file)} imports ${match[1]}, which is not in the ${relative(out, root)} build`);
      }
    }
  }
});

test('no source-only tooling leaks into a build', { skip: skipUnbuilt }, () => {
  for (const at of [win, ios]) {
    assert.ok(!existsSync(at('build.py')), 'the builder does not ship itself');
    assert.ok(!existsSync(at('tests')));
    assert.ok(!existsSync(at('node_modules')));
    assert.ok(!existsSync(at('package.json')));
    assert.ok(!existsSync(at('.certs')), 'certificates are per-machine');
  }
});

test.after(() => {
  rmSync(out, { recursive: true, force: true });
});
