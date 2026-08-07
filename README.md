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

### First five minutes

The app opens on a built-in drill with target notes already set, so you can
check your whole signal path before touching a real song:

1. Pick **Drills → Sustain and tuning test**.
2. Sing into your mic and watch the tuner strip under the ribbon. If the needle
   moves and the note name is right, your input works.
3. In **⚙ → Calibrate latency**, run the calibration once (see below).
4. Arm the **Lead** part (the red **Arm** button on its mixer strip), press
   **●**, and sing the three long notes. Stop, and read your score.

---

## How it works

### Choosing what to sing

The **Library** has three tabs:

- **Songs** — Beach Boys arrangements, broken into their sections with the
  harmony parts each one uses. See *What the song library does and does not
  contain* below.
- **Drills** — short original exercises that ship with real target notes, so
  scoring works with no setup.
- **Saved** — your own projects. Everything you record is saved automatically.

Clicking a song builds a project: one mixer strip per harmony part, and a
section list you can jump between.

### Target notes — what your singing is scored against

A part can only be scored once it has target notes. There are three ways to get
them, and you will normally use the first:

1. **Sing a reference and convert it.** Record the part once as well as you can
   (or have someone else sing it), select that take, and press **Take → target**.
   The app extracts the pitch contour, segments it into notes, and uses that as
   the target for every later take of that part.
2. **Type them in.** Press **Target notes…** and enter them. Two forms, freely
   mixed:
   - `C4:4 E4:2 R:2 G4:4` — sequential; the number after the colon is a length
     in beats, and `R` is a rest.
   - `C4 @3.5 1.25` — absolute; the note starts at 3.5 s and lasts 1.25 s.
3. **Use a drill**, which already has them.

**Transpose** in ⚙ shifts every target in the project without re-entering
anything, so you can move a part into your range. The mixer warns you when a
part's targets sit outside the usual range for that voice.

### Lyrics, timed to the track

The band under the ribbon shows the line you are singing now, the line before
it, and the line coming next, with a progress bar running across the current
line. The **Lyrics** tab at the bottom holds the full sheet — the active line
highlights and scrolls itself into view, and clicking any line seeks there.

You supply the words; none ship with the app. **Edit lyrics…** takes plain
pasted text, or timestamped [LRC](https://en.wikipedia.org/wiki/LRC_(file_format))
which you can also import from a `.lrc` file:

```
[00:00.00] first line
[00:04.50] second line
third line, to be timed later
```

Lines can also carry **several timestamps** — useful when a refrain comes round
more than once.

**Timing them without typing numbers:** press **Tap to time**, start playback,
and press `T` (or click a line) as each one comes around. Each tap stamps the
next untimed line and moves on. If a line lands early or late, tap it again
later, or nudge the whole sheet with **−100 ms** / **+100 ms** until the words
sit against the track.

Lyrics belong to the whole song by default. Set the scope to **This part only**
when a part sings different words — answering figures, a counter-melody, or the
wordless vowels the top part often gets.

### Reference playback — hear a part while you sing it

Any part can have a **reference** (a guide) that plays in time underneath you.
This is the fastest way to learn a line: hear it, then sing along with it, then
turn it down and sing without it.

- **Set★** on a mixer strip makes the part's currently selected take its
  reference. Sing the line once, mark it, and it becomes the guide.
- **Load…** imports an audio file instead — an isolated stem, or a phrase you
  bounced elsewhere.
- **Ref** toggles it on and off, and the slider beside it sets its level. Keep
  it under your own voice.

The important part: **a reference keeps playing while you record that same
part.** Normally the part you are recording is silenced so you do not sing along
with your old take — but the reference is exactly what you *do* want to hear, so
it stays. Both stay in time automatically, because takes remember where on the
timeline they were recorded.

A reference follows its part's mute and solo, so soloing the part you are
learning leaves its guide audible and silences everyone else. References are
excluded from **Export mix as WAV** — the export is your voices, not the things
you sang against.

### Recording a part

1. Click **Arm** on the part you want to sing. Only one part is armed at a time.
2. Optionally pick a section from the **Jump to section…** dropdown — that seeks
   there and loops it.
3. Press **●** (or `R`). You get a count-in, then everything *except* the part
   you are recording plays back, so you are singing into the existing stack —
   plus that part's reference, if it has one. The bottom panel switches to the
   lyrics while you sing and back to the score when you stop.
4. Press **●** again (or `Space`) to stop. The take is saved, analysed, and
   scored automatically.

Each part keeps all its takes. The dropdown on the mixer strip chooses which one
plays in the mix, and each take carries its own score, so you can keep the best.

### Mixing parts in and out

Every strip has **Vol**, **Pan**, **Mute** and **Solo**, all live while the
transport is rolling. Solo a pair of parts to find which two are fighting each
other; mute your own part to hear the rest of the stack. Mute and solo also
apply to **Export mix as WAV**.

### Backing tracks

**Import backing / reference audio…** loads any audio file as a backing track
with its own fader. Use the **Section anchor** setting in ⚙ to line the section
markers up with your audio: set it to the time, in seconds, where bar 1 begins.

---

## The accuracy score

After each take you get an overall score out of 100, a letter grade, four
component scores, and a per-note table. Clicking any row jumps the playhead
there.

| Component | What it measures |
|---|---|
| **Pitch** | How far each note sat from its target, in cents. Full marks inside about 10 cents, decaying to nothing a semitone out. |
| **Timing** | How close your entry was to the target's start. Within 30 ms is free; 250 ms out scores nothing. |
| **Coverage** | How much of each target note you actually sang, at the right pitch. Catches notes you dropped or cut short. |
| **Stability** | How steady each held note was. Wide vibrato costs you here — block harmonies lock better with a straight tone. |

Two rules keep the number honest:

- **Timing, coverage and stability only count on notes near enough the target to
  be that note.** Singing a confident, steady, perfectly-timed *wrong* pitch
  scores close to zero, not a comfortable pass.
- **Every note the recording covers is averaged in, including ones you skipped.**
  Nailing one note of three does not score as a matched part. Targets that fall
  outside the take entirely are excluded, so punching in on four bars is not
  marked down for the bars you never attempted.

The scorecard also reports your **bias** — whether you are systematically sharp
or flat, which is a different problem from being merely inconsistent — and
written notes on what to fix next.

Other readouts:

- The **ribbon** draws your sung pitch over the target notes, coloured green
  through red by how far off you were, so you can see exactly where a phrase
  drifts.
- The **tuner** strip shows live cents against whichever target note the
  playhead is inside, before you commit to a take.
- **Give me the note** plays your entry pitch.

### Latency calibration

Your voice reaches the app later than you sang it, because of the round trip
through Windows audio. The app corrects for the part of that delay the browser
reports, and calibration measures the rest.

In **⚙ → Calibrate latency**: take your headphones off so the speakers are
audible to the mic (or select a loopback input), keep the room quiet, and press
the button. It plays four clicks, listens for them, and stores the difference.

You only need to do this once per machine and audio setup — but redo it if you
change interface or buffer size. If your takes come out consistently early or
late, this is the setting to check first.

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

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Play / stop |
| `R` | Record / stop |
| `L` | Toggle loop |
| `T` | Stamp the next lyric line (while Tap to time is on) |
| `Home` | Back to the start |
| `↑` / `↓` | Select the previous / next part |

On the ribbon: click to seek, shift-drag to set a loop region, ctrl-wheel to
zoom, wheel to scroll.

---

## What the song library does and does not contain

The song entries describe **structure**: which harmony parts an arrangement
uses, roughly where each sits in your range, and the order and length of the
sections, with notes on what makes each one hard. Tempos and keys are the usual
performance values, and every one of them is editable per project.

They deliberately **do not** contain transcriptions of the recordings, and no
lyrics ship with the app at all. Both the target pitches you are scored against
and the words you follow come from you — a reference take you sing, a guide stem
you import, notes you type in, and lyrics you paste or load from a `.lrc` file. The built-in drills are original
exercises written for this app, which is why they can ship with notes attached.

To add your own song, copy an entry in `js/data/songs.js`.

---

## Storage

Projects, lyrics and audio live in your browser's IndexedDB, per browser
profile. They
survive restarts. Clearing site data for `localhost` deletes them, so export
anything you want to keep with **Export mix as WAV**.

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
js/ui/       pitch ribbon canvas, lyric band and sheet, target-note notation
js/data/     song structures, built-in drills, LRC lyric timing
js/state.js  project model and persistence
```
