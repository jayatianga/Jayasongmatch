# Jayasongmatch — using it

How the app works, whichever version you are running. Setup for your
platform is in the README beside this file.

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

## The Trainer

The **Trainer** tab is a separate section from the Studio. The Studio is where
you record; the Trainer is where the results are read back to you as ability,
and where a coach tells you what to do about it.

Everything it shows is computed from attempts you have actually recorded.
Nothing is estimated or assumed.

### Baseline test

Start here. **Run baseline vocal test** builds a seven-stage assessment and
walks you through it — one stage per recording, auto-advancing as you go:

1. **Range downwards** — whole tones down from middle C. Stop when you run out
   of comfortable notes; silence is a valid answer.
2. **Range upwards** — the same going up. Falsetto counts.
3. **Sustain** — three long tones, testing breath support and steadiness.
4. **Onsets** — short notes from silence, testing whether you arrive on the note
   or slide into it.
5. **Leaps** — jumps away from a home note and back.
6. **Agility** — a scale run at speed.
7. **Timing** — one note, once a second, on the click.

You can stop after any stage; **See my results** builds a profile from whatever
you have done. Range detection requires contiguity, so a stray microphone thump
an octave below everything else does not get counted as part of your range.

The result separates two different things: the notes you can **reach at all**,
and the narrower band you are **reliable across**. The second is the one that
matters when choosing a part.

### Range database

Every take contributes per-pitch accuracy to a database that persists across
sessions. The range map shades each semitone by how accurately you sing it —
green through red — with the reliable band marked, and dims pitches measured
from too few notes to trust. Below it: your strongest and weakest pitches by
name, and how many notes each figure rests on.

### Skills

Eight measured abilities, each derived from the notes that actually tested it:

| Skill | Measured from |
|---|---|
| **Pitch accuracy** | How far each note sat from its target |
| **Steadiness** | How much a held pitch wobbles around its centre |
| **Timing** | How close entries land to the target's start |
| **Breath support** | Whether long notes sag or thin in their last third |
| **Onsets** | How far the attack sits from where the note settles |
| **Agility** | Accuracy on notes shorter than a third of a second |
| **Leaps** | Accuracy on notes arrived at by five semitones or more |
| **Range extremes** | Accuracy near the edges of your measured range |

**A skill is only scored when a take actually tested it.** A song with no leaps
says nothing about your leaps, so it contributes no sample rather than a
misleading zero. Recent attempts are weighted more heavily than old ones, and
each skill carries a trend arrow comparing your recent attempts with earlier
ones. A figure resting on fewer than four measured notes is marked provisional
with an asterisk rather than presented as settled.

Click any skill to jump straight into a drill that trains it.

### Your coach

The coach reads the profile and writes an assessment: what is working, at most
**three** things to focus on — practising everything at once is how people
improve at nothing — and, for each, why it matters and a specific drill to fix
it. It also draws conclusions across takes that a single score cannot:

- a consistent sharp or flat bias, named as one habit rather than many mistakes;
- an ear ahead of the breath — short notes land, long ones sag;
- accuracy that holds when you have time and collapses when you do not;
- whether your last three takes are better or worse than the three before.

### Can I sing this?

For whichever project is open in the Studio, the Trainer measures what each part
actually demands from its target notes — its range, how many wide leaps, how
much fast movement, how many sustained notes, how many entries from silence —
and sets that against your measured ability. Each part comes back **in reach**,
**a stretch**, or **out of range**, with the reason and the fix: how many
semitones to transpose, or which skill to work on first.

This is the link from "a song I want to sing" to "the skills it needs".

### Attempt reports and history

Every scored take is kept as a permanent record, independent of the project it
came from — editing or deleting a project does not rewrite your history. Each
one opens a full **summary report**: overall and component scores, accuracy
statistics, the pitches it covered, which skills it tested, what to fix, and the
complete note-by-note table. **Save as text** writes it to a file you can keep.

**Export progress** writes the whole database — every attempt, the range map,
the skill profile — as JSON.

Re-scoring a take (after editing its targets, or changing the transpose) revises
that attempt rather than logging a second one. You only sang it once.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Play / stop |
| `R` | Record / stop |
| `L` | Toggle loop |
| `T` | Stamp the next lyric line (while Tap to time is on) |
| `↑` / `↓` | Select the previous / next part |
| `Home` | Back to the start |
| `↑` / `↓` | Select the previous / next part |

On the ribbon: click to seek, shift-drag to set a loop region, ctrl-wheel to
zoom, wheel to scroll. With a touch screen: tap to seek, drag to scroll, pinch
to zoom, and set loops from the section menu.

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

Projects, lyrics, audio and your whole progress history live in your browser's
IndexedDB, per browser profile. They
survive restarts. Clearing site data for `localhost` deletes them, so export
anything you want to keep with **Export mix as WAV** and **Export progress**.
