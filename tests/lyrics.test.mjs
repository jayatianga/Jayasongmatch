// Lyric timing: parsing, the line lookup that drives the display, and the
// tap-to-time stamping.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseLyrics,
  formatLyrics,
  activeLineIndex,
  lineEnd,
  lineProgress,
  nextUntimedIndex,
  stampLine,
  clearTimings,
  shiftLyrics,
  lyricsSummary,
  formatLrcTime,
} from '../js/data/lyrics.js';

test('parses LRC timestamps', () => {
  const { lines, errors } = parseLyrics('[00:00.00] one\n[00:04.50] two\n[01:02.25] three');
  assert.deepEqual(errors, []);
  assert.equal(lines.length, 3);
  assert.deepEqual(lines.map((l) => l.text), ['one', 'two', 'three']);
  assert.equal(lines[0].time, 0);
  assert.equal(lines[1].time, 4.5);
  assert.equal(lines[2].time, 62.25);
});

test('keeps untimed lines, in order, after the timed ones', () => {
  const { lines } = parseLyrics('[00:01.00] timed\nnot timed yet\nalso untimed');
  assert.equal(lines.length, 3);
  assert.equal(lines[0].time, 1);
  assert.equal(lines[1].time, null);
  assert.equal(lines[1].text, 'not timed yet');
  assert.equal(lines[2].text, 'also untimed');
});

test('a repeated line may carry several timestamps', () => {
  const { lines } = parseLyrics('[00:10.00][00:40.00] the refrain');
  assert.equal(lines.length, 2);
  assert.deepEqual(lines.map((l) => l.time), [10, 40]);
  assert.ok(lines.every((l) => l.text === 'the refrain'));
});

test('reads metadata and applies the LRC offset tag', () => {
  const { lines, meta } = parseLyrics('[ti:Working title]\n[offset:500]\n[00:10.00] shifted');
  assert.equal(meta.ti, 'Working title');
  // A positive offset means the words are early relative to the audio.
  assert.equal(lines[0].time, 9.5);
});

test('accepts the plain @seconds form used by the target editor', () => {
  const { lines } = parseLyrics('@3.5 a line\n@8 another');
  assert.deepEqual(lines.map((l) => l.time), [3.5, 8]);
  assert.equal(lines[0].text, 'a line');
});

test('sorts out-of-order timestamps', () => {
  const { lines } = parseLyrics('[00:20.00] second\n[00:05.00] first');
  assert.deepEqual(lines.map((l) => l.text), ['first', 'second']);
});

test('formatLyrics round-trips through parseLyrics', () => {
  const source = '[00:00.00] one\n[00:04.50] two\n[01:02.25] three';
  const { lines } = parseLyrics(source);
  assert.equal(formatLyrics(lines), source);
  assert.deepEqual(parseLyrics(formatLyrics(lines)).lines, lines);
});

test('formatLrcTime pads to the standard shape', () => {
  assert.equal(formatLrcTime(0), '[00:00.00]');
  assert.equal(formatLrcTime(4.5), '[00:04.50]');
  assert.equal(formatLrcTime(62.25), '[01:02.25]');
});

test('activeLineIndex tracks the playhead', () => {
  const { lines } = parseLyrics('[00:00.00] one\n[00:04.00] two\n[00:08.00] three');
  assert.equal(activeLineIndex(lines, 0), 0);
  assert.equal(activeLineIndex(lines, 3.9), 0);
  assert.equal(activeLineIndex(lines, 4.0), 1);
  assert.equal(activeLineIndex(lines, 7.99), 1);
  assert.equal(activeLineIndex(lines, 20), 2);
});

test('activeLineIndex returns -1 before the first line', () => {
  const { lines } = parseLyrics('[00:05.00] first');
  assert.equal(activeLineIndex(lines, 0), -1);
  assert.equal(activeLineIndex(lines, 4.9), -1);
  assert.equal(activeLineIndex(lines, 5), 0);
});

test('untimed lines never become the active line', () => {
  const { lines } = parseLyrics('[00:00.00] one\nuntimed');
  assert.equal(activeLineIndex(lines, 30), 0);
});

test('lineEnd is the next timed line, or a fallback for the last one', () => {
  const { lines } = parseLyrics('[00:00.00] one\n[00:04.00] two\nuntimed tail');
  assert.equal(lineEnd(lines, 0), 4);
  assert.equal(lineEnd(lines, 1, 3), 7, 'the trailing untimed line must not end line 2');
});

test('lineProgress runs 0 to 1 across a line', () => {
  const { lines } = parseLyrics('[00:00.00] one\n[00:04.00] two');
  assert.equal(lineProgress(lines, 0, 0), 0);
  assert.equal(lineProgress(lines, 0, 2), 0.5);
  assert.equal(lineProgress(lines, 0, 4), 1);
  assert.equal(lineProgress(lines, 0, 99), 1, 'progress is clamped');
});

test('tap-to-time stamps lines in order and re-sorts', () => {
  let { lines } = parseLyrics('first\nsecond\nthird');
  assert.equal(nextUntimedIndex(lines), 0);

  lines = stampLine(lines, 0, 1.5);
  assert.equal(lines[0].time, 1.5);
  assert.equal(nextUntimedIndex(lines), 1);

  lines = stampLine(lines, 1, 6);
  lines = stampLine(lines, 2, 11);
  assert.equal(nextUntimedIndex(lines), -1);
  assert.deepEqual(lines.map((l) => l.text), ['first', 'second', 'third']);
  assert.deepEqual(lines.map((l) => l.time), [1.5, 6, 11]);
});

test('stamping a line early re-sorts rather than corrupting the order', () => {
  const { lines } = parseLyrics('[00:10.00] late\nearly');
  const stamped = stampLine(lines, 1, 2);
  assert.deepEqual(stamped.map((l) => l.text), ['early', 'late']);
  assert.deepEqual(stamped.map((l) => l.time), [2, 10]);
});

test('stampLine does not mutate the array it is given', () => {
  const { lines } = parseLyrics('one\ntwo');
  const before = JSON.stringify(lines);
  stampLine(lines, 0, 5);
  assert.equal(JSON.stringify(lines), before);
});

test('clearTimings keeps the words and drops the times', () => {
  const { lines } = parseLyrics('[00:01.00] one\n[00:02.00] two');
  const cleared = clearTimings(lines);
  assert.deepEqual(cleared.map((l) => l.text), ['one', 'two']);
  assert.ok(cleared.every((l) => l.time === null));
});

test('shiftLyrics nudges timed lines and never goes negative', () => {
  const { lines } = parseLyrics('[00:00.05] one\n[00:10.00] two\nuntimed');
  const shifted = shiftLyrics(lines, -0.1);
  assert.equal(shifted[0].time, 0);
  assert.ok(Math.abs(shifted[1].time - 9.9) < 1e-9);
  assert.equal(shifted[2].time, null);
});

test('lyricsSummary reports how much is left to time', () => {
  const { lines } = parseLyrics('[00:01.00] one\ntwo\nthree');
  assert.match(lyricsSummary(lines), /3 lines/);
  assert.match(lyricsSummary(lines), /2 to time/);
  assert.equal(lyricsSummary([]), 'none');
});

test('empty and whitespace input is handled without throwing', () => {
  assert.deepEqual(parseLyrics('').lines, []);
  assert.deepEqual(parseLyrics('\n\n   \n').lines, []);
  assert.deepEqual(parseLyrics(null).lines, []);
  assert.equal(activeLineIndex([], 5), -1);
  assert.equal(lineEnd([], 0), null);
});
