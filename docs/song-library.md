# Adding songs to the library

Song entries live in `js/data/songs.js`. Each one describes the *shape* of an
arrangement — its parts and its sections — not the notes. Copy an existing entry
and edit it.

```js
{
  id: 'my-song',              // unique, lowercase, no spaces
  title: 'My Song',
  artist: 'Whoever',
  year: 1966,                 // or null
  key: 'A / E',               // free text; shown in the header
  bpm: 120,                   // editable per project afterwards
  timeSig: [4, 4],            // [beats, unit] — [12, 8] works too
  difficulty: 4,              // 1-5, shown in the card
  summary: 'What makes this arrangement hard.',
  parts: [P('falsetto'), P('tenor1'), P('lead'), P('baritone'), P('bass')],
  sections: [
    S('Intro', 8),
    S('Verse 1', 16, 'An optional tip, shown when you jump to the section.'),
    S('Chorus 1', 8),
  ],
}
```

## Parts

`P(role)` builds a part from a preset in `PART_ROLES`: `falsetto`, `tenor1`,
`tenor2`, `lead`, `baritone`, `bass`. Each preset carries a name, a colour and
the usual comfortable range for that voice, which is what drives the range
warning on the mixer.

Override anything you need:

```js
P('lead', { name: 'Lead (Mike)', low: 50, high: 66 })
```

Use only the parts the arrangement actually has. You can always add more from
the **Add** button in the app.

## Sections

`S(name, bars, tip)` — sections are measured in **bars**, not seconds. The app
turns bars into times using the project tempo plus the **Section anchor**
setting, which is where bar 1 begins. That way the section markers line up with
whatever recording or backing track you are singing to, and they follow when you
change the tempo.

Keep the bar counts honest; they are what the section jumps and loops are built
from. A tip is worth adding wherever there is a specific trap — a key change, an
exposed entry, a passage best learned against one other part.

## What not to put here

Do not add note-by-note transcriptions of a copyrighted recording. Target
pitches come from the user: a reference take they sing, a guide stem they
import, or notes they type into the target editor.

The built-in drills in `js/data/exercises.js` are a different case — they are
original exercises written for this app, so they carry their own notes and can
be scored immediately. If you want a scored warm-up of your own, add it there
instead:

```js
{
  id: 'ex-mine',
  title: 'My drill',
  kind: 'exercise',
  bpm: 80,
  timeSig: [4, 4],
  duration: 12,
  loop: { start: 0, end: 12 },
  parts: [
    part('bass', [{ time: 0, duration: 2.8, midi: 48 }]),
    part('lead', [{ time: 0, duration: 2.8, midi: 60 }]),
  ],
}
```

Note times and durations are in seconds from the start of the drill, and `midi`
is a MIDI note number (60 is middle C).
