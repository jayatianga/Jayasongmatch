// Timed lyrics.
//
// The storage format is LRC, the format karaoke tools already use, so words can
// be pasted in from wherever you keep them and timings survive a round trip.
// Lines may also be left untimed and stamped later with tap-to-time.
//
// No lyrics ship with this app; a project starts empty and you supply the words.

const TIMESTAMP = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;
const META = /^\[(ti|ar|al|au|by|offset|length|re|ve):([^\]]*)\]$/i;

/**
 * @returns {{lines: Array<{time:number|null, text:string}>, meta: object, errors: string[]}}
 *   Lines are sorted by time; untimed lines keep their written order and sort
 *   after the timed ones that precede them.
 */
export function parseLyrics(text) {
  const meta = {};
  const errors = [];
  const timed = [];
  const untimed = [];

  const rawLines = String(text ?? '').split(/\r?\n/);
  for (let index = 0; index < rawLines.length; index++) {
    const raw = rawLines[index].trim();
    if (!raw) continue;

    const metaMatch = META.exec(raw);
    if (metaMatch) {
      meta[metaMatch[1].toLowerCase()] = metaMatch[2].trim();
      continue;
    }

    TIMESTAMP.lastIndex = 0;
    const stamps = [];
    let match;
    while ((match = TIMESTAMP.exec(raw)) !== null) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2].replace(':', '.'));
      if (!isFinite(minutes) || !isFinite(seconds)) {
        errors.push(`Line ${index + 1}: could not read the timestamp`);
        continue;
      }
      stamps.push(minutes * 60 + seconds);
    }

    // Everything after the last timestamp is the lyric itself.
    const body = raw.replace(TIMESTAMP, '').trim();
    if (stamps.length === 0) {
      // A bare "@12.5 words" form is accepted too, to match the target editor.
      const at = /^@(\d+(?:\.\d+)?)\s+(.*)$/.exec(raw);
      if (at) timed.push({ time: Number(at[1]), text: at[2].trim() });
      else untimed.push({ time: null, text: raw });
      continue;
    }
    // One line can carry several timestamps when a refrain repeats.
    for (const time of stamps) timed.push({ time, text: body });
  }

  const offset = Number(meta.offset);
  if (isFinite(offset) && offset !== 0) {
    for (const line of timed) line.time = Math.max(0, line.time - offset / 1000);
  }

  timed.sort((a, b) => a.time - b.time);
  return { lines: [...timed, ...untimed], meta, errors };
}

/** Round-trips through parseLyrics(). */
export function formatLyrics(lines) {
  return (lines ?? [])
    .map((line) => (line.time === null || line.time === undefined ? line.text : `${formatLrcTime(line.time)} ${line.text}`))
    .join('\n');
}

export function formatLrcTime(seconds) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `[${String(minutes).padStart(2, '0')}:${rest.toFixed(2).padStart(5, '0')}]`;
}

/**
 * Index of the line being sung at `position`, or -1 before the first one.
 * The boundary is exact: the band already previews the next line, so nudging
 * the changeover early would only blur where a line actually starts — which is
 * the thing tap-to-time and the progress bar depend on.
 */
export function activeLineIndex(lines, position) {
  let found = -1;
  for (let i = 0; i < lines.length; i++) {
    const time = lines[i].time;
    if (time === null || time === undefined) continue;
    if (time <= position) found = i;
    else break;
  }
  return found;
}

/** When a line gives way to the next one. */
export function lineEnd(lines, index, fallback = 4) {
  const line = lines[index];
  if (!line || line.time === null) return null;
  for (let i = index + 1; i < lines.length; i++) {
    if (lines[i].time !== null && lines[i].time !== undefined) return lines[i].time;
  }
  return line.time + fallback;
}

/** How far through the current line we are, 0..1, for the progress underline. */
export function lineProgress(lines, index, position) {
  const line = lines[index];
  if (!line || line.time === null) return 0;
  const end = lineEnd(lines, index);
  if (end === null || end <= line.time) return 0;
  return Math.max(0, Math.min(1, (position - line.time) / (end - line.time)));
}

/** The next line still waiting for a timestamp, for tap-to-time. */
export function nextUntimedIndex(lines, from = 0) {
  for (let i = Math.max(0, from); i < lines.length; i++) {
    if (lines[i].time === null || lines[i].time === undefined) return i;
  }
  return -1;
}

/**
 * Stamp one line and keep the list ordered. Returns a new array; timing a line
 * out of order re-sorts rather than corrupting the sequence.
 */
export function stampLine(lines, index, time) {
  const next = lines.map((line, i) => (i === index ? { ...line, time: Math.max(0, time) } : { ...line }));
  const timed = next.filter((line) => line.time !== null && line.time !== undefined).sort((a, b) => a.time - b.time);
  const rest = next.filter((line) => line.time === null || line.time === undefined);
  return [...timed, ...rest];
}

export function clearTimings(lines) {
  return (lines ?? []).map((line) => ({ ...line, time: null }));
}

/** Shift every timed line, for lining words up with a backing track. */
export function shiftLyrics(lines, seconds) {
  return (lines ?? []).map((line) =>
    line.time === null || line.time === undefined ? { ...line } : { ...line, time: Math.max(0, line.time + seconds) });
}

export function lyricsSummary(lines) {
  if (!lines?.length) return 'none';
  const timed = lines.filter((line) => line.time !== null && line.time !== undefined).length;
  return `${lines.length} lines · ${timed} timed${timed < lines.length ? `, ${lines.length - timed} to time` : ''}`;
}
