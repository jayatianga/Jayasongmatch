// Song library.
//
// These entries describe *structure*: which harmony parts exist, roughly where
// each sits in your range, and the order and length of the sections. They do
// not contain transcriptions of the recordings. Target pitches for scoring come
// from you — sing a reference take, import a guide stem, or draw the notes in
// the note editor. See docs/song-library.md for how to add your own.
//
// Keys and tempos are the usual performance values and are editable per project;
// nudge them to match whatever recording or backing track you are singing to.

/** Typical comfortable ranges for the five stacked parts, as MIDI numbers. */
export const PART_ROLES = {
  falsetto: { name: 'Falsetto / Top', low: 67, high: 81, color: '#ff8fd0', tip: 'Sits above the stack. Straight tone, minimal vibrato, or it will beat against the tenor.' },
  tenor1:   { name: 'Tenor 1',        low: 60, high: 74, color: '#7fd4ff', tip: 'Usually the busiest inner part. Learn it against the lead, not alone.' },
  tenor2:   { name: 'Tenor 2',        low: 57, high: 69, color: '#8effc0', tip: 'Often doubles or shadows the lead a third below.' },
  lead:     { name: 'Lead',           low: 55, high: 71, color: '#ffd479', tip: 'Sets the phrasing everybody else has to match.' },
  baritone: { name: 'Baritone',       low: 50, high: 64, color: '#c9a7ff', tip: 'The glue. Small intervals, easy to sing flat — watch the tuning meter.' },
  bass:     { name: 'Bass',           low: 40, high: 57, color: '#ff9f7a', tip: 'Roots and fifths. Land the note squarely; the whole chord is judged against it.' },
};

const P = (role, overrides = {}) => ({
  id: role,
  role,
  name: PART_ROLES[role].name,
  low: PART_ROLES[role].low,
  high: PART_ROLES[role].high,
  color: PART_ROLES[role].color,
  tip: PART_ROLES[role].tip,
  ...overrides,
});

/** Sections are measured in bars; the app turns bars into seconds using the
 *  project tempo plus an anchor you set against your own audio. */
const S = (name, bars, tip = '') => ({ id: crypto.randomUUID?.() ?? `${name}-${bars}-${Math.random()}`, name, bars, tip });

export const SONGS = [
  {
    id: 'god-only-knows',
    title: 'God Only Knows',
    artist: 'The Beach Boys',
    year: 1966,
    key: 'A / E',
    bpm: 120,
    timeSig: [4, 4],
    difficulty: 5,
    summary: 'The round at the end is the whole exercise: three independent lines entering in turn and repeating against each other.',
    parts: [P('falsetto'), P('tenor1'), P('lead'), P('baritone'), P('bass')],
    sections: [
      S('Intro', 8, 'Instrumental. Use it to find your entry pitch.'),
      S('Verse 1', 16, 'Lead carries it; the stack is sparse. Get the lead solid before layering.'),
      S('Chorus 1', 8, 'First full block harmony. Match vowel shapes before worrying about volume.'),
      S('Verse 2', 16),
      S('Chorus 2', 8),
      S('Instrumental break', 8),
      S('Bridge', 8),
      S('Final round — entry 1', 8, 'Record this part alone first, then mute it and sing the next entry against it.'),
      S('Final round — entry 2', 8, 'Come in against the take you just made. This is where the tuning score matters most.'),
      S('Final round — full', 16, 'All lines together. Solo pairs of parts to find which two are fighting.'),
    ],
  },
  {
    id: 'wouldnt-it-be-nice',
    title: "Wouldn't It Be Nice",
    artist: 'The Beach Boys',
    year: 1966,
    key: 'A / F',
    bpm: 125,
    timeSig: [4, 4],
    difficulty: 4,
    summary: 'Dense block harmony in the chorus with a bass line that moves independently under it.',
    parts: [P('falsetto'), P('tenor1'), P('lead'), P('baritone'), P('bass')],
    sections: [
      S('Intro', 4, 'Free-time guitar figure — set your section anchor at the downbeat after it.'),
      S('Verse 1', 16),
      S('Chorus 1', 8, 'Full stack. Blend beats consistency of vowel more than volume.'),
      S('Verse 2', 16),
      S('Chorus 2', 8),
      S('Bridge', 16, 'Key shift. Check your part is still inside your range before recording.'),
      S('Tag', 16, 'Overlapping call and response — record the answers as a separate part.'),
    ],
  },
  {
    id: 'good-vibrations',
    title: 'Good Vibrations',
    artist: 'The Beach Boys',
    year: 1966,
    key: 'Eb / Bb (modulating)',
    bpm: 132,
    timeSig: [4, 4],
    difficulty: 5,
    summary: 'Modular: each section is effectively its own arrangement. Build it section by section rather than end to end.',
    parts: [P('falsetto'), P('tenor1'), P('lead'), P('baritone'), P('bass')],
    sections: [
      S('Verse 1', 8, 'Lead alone over organ.'),
      S('Chorus 1', 8, 'The falsetto hook sits on top — the highest sustained part in the set.'),
      S('Verse 2', 8),
      S('Chorus 2', 8),
      S('Breakdown', 16, 'Sparse. Tuning is fully exposed here; aim for the perfect band on the meter.'),
      S('Build', 8),
      S('Final chorus', 8),
      S('Coda', 8, 'Wordless stacked vowels. Great for practising blend without diction getting in the way.'),
    ],
  },
  {
    id: 'sloop-john-b',
    title: 'Sloop John B',
    artist: 'The Beach Boys',
    year: 1966,
    key: 'B',
    bpm: 118,
    timeSig: [4, 4],
    difficulty: 3,
    summary: 'The most approachable full-stack chorus in the catalogue. Best first project.',
    parts: [P('falsetto'), P('tenor1'), P('lead'), P('baritone'), P('bass')],
    sections: [
      S('Intro', 4),
      S('Verse 1', 16, 'Lead with light support.'),
      S('Chorus 1', 8, 'Everyone in. Start here if this is your first harmony stack.'),
      S('Verse 2', 16),
      S('Chorus 2', 8),
      S('A cappella breakdown', 8, 'No instruments. Record with the click on, then mute the click for playback.'),
      S('Final chorus', 16),
    ],
  },
  {
    id: 'surfer-girl',
    title: 'Surfer Girl',
    artist: 'The Beach Boys',
    year: 1963,
    key: 'C',
    bpm: 78,
    timeSig: [12, 8],
    difficulty: 2,
    summary: 'Slow doo-wop changes in compound time. Long held notes make tuning errors obvious — ideal for training the meter.',
    parts: [P('falsetto'), P('tenor1'), P('lead'), P('baritone'), P('bass')],
    sections: [
      S('Intro', 2),
      S('Verse 1', 8),
      S('Verse 2', 8),
      S('Bridge', 8, 'Key change. Re-check your range fit for this section.'),
      S('Verse 3', 8),
      S('Outro', 4, 'Held final chord — the single best passage for scoring your sustain stability.'),
    ],
  },
  {
    id: 'in-my-room',
    title: 'In My Room',
    artist: 'The Beach Boys',
    year: 1963,
    key: 'D',
    bpm: 84,
    timeSig: [4, 4],
    difficulty: 3,
    summary: 'Close three-part writing sung softly. Quiet singing drifts flat; watch the pitch-bias readout.',
    parts: [P('tenor1'), P('lead'), P('baritone'), P('bass')],
    sections: [
      S('Intro', 4),
      S('Verse 1', 16),
      S('Verse 2', 16),
      S('Bridge', 8),
      S('Verse 3', 16),
      S('Outro', 8, 'Repeated tag, fading. Sing it at full volume and fade with the fader instead.'),
    ],
  },
  {
    id: 'dont-worry-baby',
    title: "Don't Worry Baby",
    artist: 'The Beach Boys',
    year: 1964,
    key: 'E',
    bpm: 132,
    timeSig: [4, 4],
    difficulty: 4,
    summary: 'High lead with answering falsetto figures. Check the lead sits in your range before committing.',
    parts: [P('falsetto'), P('tenor1'), P('lead'), P('baritone'), P('bass')],
    sections: [
      S('Intro', 4),
      S('Verse 1', 16),
      S('Chorus 1', 8, 'Answering falsetto over the lead — record them as separate parts, not one pass.'),
      S('Verse 2', 16),
      S('Chorus 2', 8),
      S('Verse 3', 16),
      S('Outro', 8),
    ],
  },
  {
    id: 'barbara-ann',
    title: 'Barbara Ann',
    artist: 'The Beach Boys',
    year: 1965,
    key: 'F',
    bpm: 138,
    timeSig: [4, 4],
    difficulty: 2,
    summary: 'Call and response over a repeating figure. Easy notes, unforgiving timing — good for training the timing score.',
    parts: [P('tenor1'), P('lead'), P('baritone'), P('bass')],
    sections: [
      S('Intro', 4, 'The backing figure that runs under everything.'),
      S('Verse 1', 16),
      S('Chorus 1', 8),
      S('Verse 2', 16),
      S('Chorus 2', 8),
      S('Outro', 16, 'Repeats to fade — loop this section and stack passes.'),
    ],
  },
  {
    id: 'fun-fun-fun',
    title: 'Fun, Fun, Fun',
    artist: 'The Beach Boys',
    year: 1964,
    key: 'C',
    bpm: 168,
    timeSig: [4, 4],
    difficulty: 3,
    summary: 'Fast. The backing vocals are rhythmic more than sustained, so timing dominates the score here.',
    parts: [P('falsetto'), P('tenor1'), P('lead'), P('baritone'), P('bass')],
    sections: [
      S('Intro', 8),
      S('Verse 1', 16),
      S('Chorus 1', 8),
      S('Verse 2', 16),
      S('Chorus 2', 8),
      S('Solo', 8),
      S('Final chorus', 16, 'Stacked answers over the lead. Halve the tempo to learn it, then take it up.'),
    ],
  },
  {
    id: 'kokomo',
    title: 'Kokomo',
    artist: 'The Beach Boys',
    year: 1988,
    key: 'F',
    bpm: 130,
    timeSig: [4, 4],
    difficulty: 2,
    summary: 'Wide, simple block harmony. A gentle introduction to recording four parts in one sitting.',
    parts: [P('tenor1'), P('lead'), P('baritone'), P('bass')],
    sections: [
      S('Intro', 8),
      S('Chorus 1', 16),
      S('Verse 1', 16),
      S('Chorus 2', 16),
      S('Verse 2', 16),
      S('Bridge', 8),
      S('Final chorus', 16),
    ],
  },
  {
    id: 'custom',
    title: 'Blank project',
    artist: 'Your own arrangement',
    year: null,
    key: 'C',
    bpm: 120,
    timeSig: [4, 4],
    difficulty: 1,
    summary: 'Start empty. Add parts and sections yourself, for any song you like.',
    parts: [P('lead'), P('tenor1'), P('baritone'), P('bass')],
    sections: [S('Section 1', 16)],
  },
];

export function getSong(id) {
  return SONGS.find((song) => song.id === id) ?? null;
}

/** Seconds per bar at a given tempo and time signature. */
export function barDuration(bpm, timeSig = [4, 4]) {
  const [beats, unit] = timeSig;
  const beatSeconds = 60 / bpm;
  // A 12/8 bar is four dotted-quarter beats, so scale the eighth-note count.
  return beats * beatSeconds * (4 / unit);
}

/** Absolute start/end times for each section, given tempo and an anchor offset. */
export function layoutSections(song, { bpm = song.bpm, timeSig = song.timeSig, anchor = 0 } = {}) {
  const bar = barDuration(bpm, timeSig);
  let cursor = anchor;
  return song.sections.map((section) => {
    const start = cursor;
    const duration = section.bars * bar;
    cursor += duration;
    return { ...section, start, duration, end: start + duration };
  });
}
