// The title's letters are pictures sized in cubes, so a picture whose pixels are not
// its cubes at PER_CUBE_PX would be drawn with cubes of a different size from the
// rest. Each PNG's own header is checked against the table.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { WIDTHS, HEIGHT, PER_CUBE_PX } from '../site/src/lib/letters.js';

const DIR = new URL('../site/src/lib/assets/letters/', import.meta.url);

// Width and height are the first two fields of IHDR, the chunk every PNG opens with.
function size(file) {
  const bytes = readFileSync(new URL(file, DIR));
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test('there is a picture for every letter in the table, and nothing else', () => {
  const files = readdirSync(DIR).sort();
  assert.deepEqual(files, Object.keys(WIDTHS).map((l) => `${l}.png`).sort());
});

test('every picture is its letter in cubes at PER_CUBE_PX', () => {
  for (const [letter, across] of Object.entries(WIDTHS)) {
    assert.deepEqual(size(`${letter}.png`), { width: across * PER_CUBE_PX, height: HEIGHT * PER_CUBE_PX }, letter);
  }
});
