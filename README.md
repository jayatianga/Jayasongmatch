# Jayasongmatch

A harmony-part recorder for learning stacked vocal arrangements — the Beach Boys
kind. Record each part of a section one at a time, hear the parts you have
already sung while you record the next one, get a measured accuracy score for
every part, and mix any part in or out as you go.

Runs in Chrome or Edge on Windows, reads any Windows capture device, and keeps
everything on your PC. Nothing is uploaded.

---

## Getting started

1. Install Python if you do not have it — [python.org/downloads/windows](https://www.python.org/downloads/windows/),
   and tick **Add python.exe to PATH** during setup.
2. Double-click **`start-windows.bat`**. A browser opens at `http://localhost:8770/`.
3. Click the **⟳** button next to *Input* and allow microphone access when Windows
   asks. Your capture devices now appear by name in the dropdown.
4. **Put on headphones.** Everything below assumes the playback is not leaking
   into your microphone.

To stop, close the terminal window or press Ctrl+C in it.

> On a Mac or Linux box, run `python3 serve.py` instead. The app itself is the same.

### On an iPhone or iPad

Start the server with `python serve.py --https`, trust its certificate on the
device once, then open the network address it prints. Full instructions, and
what differs on iOS, are in **[docs/ios.md](docs/ios.md)**.

Two things genuinely cannot work there: iOS chooses the microphone itself, so
there is no input or channel selector, and there is no loopback device, so
backing tracks have to be imported as files. Everything else — recording,
calibration, lyrics, references, the mixer and the whole Trainer — works, and
the app can be added to the Home Screen to run full-screen and offline.

### First five minutes

The app opens on a built-in drill with target notes already set, so you can
check your whole signal path before touching a real song:

1. Pick **Drills → Sustain and tuning test**.
2. Sing into your mic and watch the tuner strip under the ribbon. If the needle
   moves and the note name is right, your input works.
3. In **⚙ → Calibrate latency**, run the calibration once (see below).
4. Arm the **Lead** part (the red **Arm** button on its mixer strip), press
   **●**, and sing the three long notes. Stop, and read your score.
5. When the signal path works, switch to the **Trainer** tab and run the
   baseline test — it measures your range and gives the coach something to
   work from.

---

## Using it

How the app actually works — targets, lyrics, references, the accuracy
score and the Trainer — is in **[docs/guide.md](docs/guide.md)**. That guide
ships inside both built versions as `GUIDE.md`.

---

## Platforms

| | Windows / macOS / Linux | iPhone / iPad |
|---|---|---|
| Recording, scoring, Trainer | yes | yes |
| Choose input device and channel | yes | no — iOS picks the device |
| Loopback capture (Stereo Mix and similar) | yes | no — import files instead |
| Install to Home Screen, works offline | — | yes |
| Needs | a browser | iOS 15.4+, and HTTPS via `--https` |

The app checks what the platform supports when it starts and says plainly which
piece is missing, rather than failing part-way through a take.

---

## Windows input notes

The **Input** dropdown lists every Windows capture endpoint, so you can use:

- a USB microphone or audio-interface input;
- a specific channel of a multi-channel interface, via the **Ch** dropdown;
- **Stereo Mix**, or a virtual device like VoiceMeeter or VB-Cable, to capture
  what is playing on the PC rather than a microphone.

If Stereo Mix does not appear, enable it in *Sound settings → More sound
settings → Recording → right-click → Show Disabled Devices*.

Windows voice processing is switched off deliberately — echo cancellation, noise
suppression and auto gain all distort sung pitch and would make the scores
meaningless. If your input sounds gated or hollow, check for processing enabled
in your interface's own control panel.

**Monitor** lets you hear yourself through the app. On speakers this will feed
back and will also pollute your recording; use headphones.

---

## Building the two versions

This source tree is the *universal* build: it keeps every platform's code and
decides what to show at runtime. `build.py` turns it into two self-contained
distributions that can be copied anywhere and run on their own:

```
python build.py            # both
python build.py windows    # just one
```

```
dist/
  jayasongmatch-windows/   double-click start-windows.bat
  jayasongmatch-ios/       double-click start-ios-server.bat
```

| | Windows build | iOS build |
|---|---|---|
| Input and channel pickers | included | left out — iOS chooses the device |
| Loopback capture notes | included | not applicable |
| Connection | `http://localhost` | `https` with a trustable certificate |
| Manifest, icons, service worker | no | yes — installs to the Home Screen, works offline |
| Launcher | `start-windows.bat` | `start-ios-server.bat` / `.sh` |

Both contain the same recorder, scoring, lyrics and Trainer code. The
difference is which controls exist, how the server is started, and what each
README explains.

Edit the source, not `dist/` — a rebuild overwrites it. Which build is running
is decided by the generated `js/build.js`; in the source tree it says
`universal`, and the app then adapts at runtime as before.

---

## Development

```
npm test                      # pitch detection, note parsing and scoring
```

There is also an optional end-to-end check that drives the real app in a
browser. It needs Playwright and a running server:

```
npm i -D playwright
python serve.py --no-browser  # in another terminal
node tests/browser-smoke.mjs
```

Layout:

```
js/audio/    AudioContext graph, transport, mixer, capture worklet, WAV I/O
js/dsp/      YIN pitch detection, contour tracking, note segmentation
js/score.js  accuracy scoring
js/ui/       pitch ribbon canvas, lyric band and sheet, trainer views
js/data/     song structures, built-in drills, LRC lyric timing
js/trainer/  skill model, baseline test, coach, attempt records
js/platform.js  capability checks and the iOS differences
sw.js        offline caching for the installed app
js/state.js  project model and persistence
```
