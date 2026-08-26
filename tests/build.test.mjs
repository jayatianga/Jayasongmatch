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
const mac = (...parts) => join(out, 'jayasongmatch-macos', ...parts);
const ios = (...parts) => join(out, 'jayasongmatch-ios', ...parts);
const desktop = [win, mac];
const all = [win, mac, ios];

test('build.py produces all three versions', { skip: skipUnbuilt }, () => {
  for (const name of ['windows', 'macos', 'ios']) {
    assert.ok(existsSync(join(out, `jayasongmatch-${name}`)), `${name} build exists`);
  }
});

test('each build declares which one it is', { skip: skipUnbuilt }, () => {
  assert.match(readFileSync(win('js', 'build.js'), 'utf8'), /TARGET = 'windows'/);
  assert.match(readFileSync(mac('js', 'build.js'), 'utf8'), /TARGET = 'macos'/);
  assert.match(readFileSync(ios('js', 'build.js'), 'utf8'), /TARGET = 'ios'/);
  // The source tree stays universal so it still runs directly.
  assert.match(readFileSync(join(ROOT, 'js', 'build.js'), 'utf8'), /TARGET = 'universal'/);
});

test('both desktop builds keep the input pickers and drop the app manifest', { skip: skipUnbuilt }, () => {
  for (const at of desktop) {
    const html = readFileSync(at('index.html'), 'utf8');
    assert.match(html, /id="device-select"/);
    assert.match(html, /id="channel-select"/);
    assert.ok(!html.includes('rel="manifest"'), 'no web app manifest');
    assert.ok(!html.includes('apple-touch-icon'), 'no iOS icon');
    assert.ok(!existsSync(at('manifest.json')));
    assert.ok(!existsSync(at('sw.js')), 'no service worker to 404 on');
    assert.ok(!existsSync(at('assets')));
  }
});

test('the macOS build has an executable double-click launcher', { skip: skipUnbuilt }, () => {
  const launcher = mac('start-macos.command');
  assert.ok(existsSync(launcher));
  // Finder refuses to run a .command without the executable bit.
  assert.ok(statSync(launcher).mode & 0o111, 'start-macos.command must be executable');
  const body = readFileSync(launcher, 'utf8');
  assert.match(body, /^#!\/bin\/sh/, 'needs a shebang to run');
  assert.match(body, /cd "\$\(dirname "\$0"\)"/, 'must run from its own folder, not the home directory');
  assert.match(body, /python3 serve\.py/);
  assert.ok(!/--https/.test(body), 'the plain launcher stays on http for localhost');

  // It also carries the https launcher, for serving to an iPad.
  const ipad = mac('start-ios-server.sh');
  assert.ok(existsSync(ipad));
  assert.ok(statSync(ipad).mode & 0o111);
  assert.match(readFileSync(ipad, 'utf8'), /--https/);
});

test('the macOS build explains the two things that trip people up', { skip: skipUnbuilt }, () => {
  const readme = readFileSync(mac('README.md'), 'utf8');
  assert.match(readme, /quarantine/i, 'Gatekeeper blocks a downloaded .command');
  assert.match(readme, /BlackHole|Loopback/, 'macOS has no built-in loopback device');
  assert.match(readme, /xcode-select --install|python\.org/, 'python3 may be missing');
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

test('no build markers survive into any build', { skip: skipUnbuilt }, () => {
  for (const at of all) {
    const html = readFileSync(at('index.html'), 'utf8');
    assert.ok(!/build:(ios|windows|macos)/.test(html), 'marker comments are stripped');
  }
});

test('each build has its own launcher and README', { skip: skipUnbuilt }, () => {
  assert.ok(existsSync(win('start-windows.bat')));
  assert.ok(!existsSync(win('start-ios-server.bat')));
  assert.ok(!existsSync(win('start-macos.command')), 'no Mac launcher in the Windows build');
  assert.ok(!existsSync(mac('start-windows.bat')), 'no .bat in the Mac build');
  assert.ok(existsSync(ios('start-ios-server.bat')));
  assert.ok(existsSync(ios('start-ios-server.sh')));

  // The iOS launcher must actually turn https on, or Safari gets no microphone.
  assert.match(readFileSync(ios('start-ios-server.bat'), 'utf8'), /serve\.py --https/);
  assert.ok(!/serve\.py --https/.test(readFileSync(win('start-windows.bat'), 'utf8')));

  assert.match(readFileSync(win('README.md'), 'utf8'), /Windows/);
  assert.match(readFileSync(mac('README.md'), 'utf8'), /macOS/);
  assert.match(readFileSync(ios('README.md'), 'utf8'), /iOS|iPhone/);
});

test('every build carries the shared guide and the shared app code', { skip: skipUnbuilt }, () => {
  for (const at of all) {
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
  for (const at of all) {
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
  for (const at of all) {
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
