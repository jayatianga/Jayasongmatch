// Two lyric views: a band under the ribbon showing the line you are singing
// right now, and a full sheet you can click through and time.

import { activeLineIndex, lineProgress, lineEnd, formatLrcTime } from '../data/lyrics.js';

export class LyricBand {
  constructor({ previous, current, next, progress }) {
    this.previousEl = previous;
    this.currentEl = current;
    this.nextEl = next;
    this.progressEl = progress;
    this.lines = [];
    this.index = -2;
    this.empty = 'No lyrics yet — open the Lyrics tab below to add the words.';
  }

  setLines(lines) {
    this.lines = lines ?? [];
    this.index = -2; // force a repaint
  }

  update(position) {
    if (!this.lines.length) {
      if (this.index !== -3) {
        this.previousEl.textContent = '';
        this.currentEl.textContent = this.empty;
        this.currentEl.classList.add('placeholder');
        this.nextEl.textContent = '';
        this.progressEl.style.width = '0%';
        this.index = -3;
      }
      return;
    }

    const index = activeLineIndex(this.lines, position);
    if (index !== this.index) {
      this.index = index;
      this.currentEl.classList.remove('placeholder');
      this.previousEl.textContent = index > 0 ? this.lines[index - 1].text : '';
      this.currentEl.textContent = index >= 0 ? this.lines[index].text : upcomingHint(this.lines);
      this.nextEl.textContent = this.lines[index + 1]?.text ?? '';
      if (index < 0) this.currentEl.classList.add('placeholder');
    }
    this.progressEl.style.width = index >= 0 ? `${lineProgress(this.lines, index, position) * 100}%` : '0%';
  }
}

function upcomingHint(lines) {
  const first = lines.find((line) => line.time !== null && line.time !== undefined);
  if (!first) return 'Lines are not timed yet — use Tap to time while the track plays.';
  return `↓ ${first.text}`;
}

export class LyricSheet {
  constructor(container, { onSeek, onTap } = {}) {
    this.container = container;
    this.onSeek = onSeek;
    this.onTap = onTap;
    this.lines = [];
    this.index = -2;
    this.rows = [];
    this.tapMode = false;
  }

  setLines(lines) {
    this.lines = lines ?? [];
    this.render();
  }

  setTapMode(enabled) {
    this.tapMode = enabled;
    this.container.classList.toggle('tapping', enabled);
    this.render();
  }

  render() {
    this.container.innerHTML = '';
    this.rows = [];
    this.index = -2;

    if (!this.lines.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No lyrics for this part yet. Press “Edit lyrics…” to paste the words in, then time them.';
      this.container.appendChild(empty);
      return;
    }

    const list = document.createElement('div');
    list.className = 'sheet-list';
    this.lines.forEach((line, index) => {
      const row = document.createElement('div');
      row.className = 'sheet-line';
      if (line.time === null || line.time === undefined) row.classList.add('untimed');

      const stamp = document.createElement('span');
      stamp.className = 'sheet-time';
      stamp.textContent = line.time === null || line.time === undefined ? '--:--' : formatLrcTime(line.time).slice(1, -1);

      const text = document.createElement('span');
      text.className = 'sheet-text';
      text.textContent = line.text;

      row.append(stamp, text);
      row.addEventListener('click', () => {
        if (this.tapMode) this.onTap?.(index);
        else if (line.time !== null && line.time !== undefined) this.onSeek?.(line.time);
      });
      list.appendChild(row);
      this.rows.push(row);
    });
    this.container.appendChild(list);
  }

  update(position, { follow = true } = {}) {
    if (!this.rows.length) return;
    const index = activeLineIndex(this.lines, position);
    if (index === this.index) return;
    if (this.rows[this.index]) this.rows[this.index].classList.remove('active');
    this.index = index;
    const row = this.rows[index];
    if (!row) return;
    row.classList.add('active');
    if (follow) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /** Highlight the line waiting to be stamped, so tapping has a visible target. */
  markPending(index) {
    for (const row of this.rows) row.classList.remove('pending');
    if (index >= 0 && this.rows[index]) {
      this.rows[index].classList.add('pending');
      this.rows[index].scrollIntoView({ block: 'nearest' });
    }
  }
}

/** Lyric line boundaries, drawn as ticks on the ribbon ruler. */
export function lyricMarkers(lines) {
  return (lines ?? [])
    .filter((line) => line.time !== null && line.time !== undefined)
    .map((line, index, timed) => ({
      time: line.time,
      end: index + 1 < timed.length ? timed[index + 1].time : line.time + 4,
      text: line.text,
    }));
}

export { lineEnd };
