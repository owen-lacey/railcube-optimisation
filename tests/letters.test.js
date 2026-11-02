// The title's letters are pictures sized in cubes, so a picture whose pixels are not
// its cubes at PER_CUBE_PX would be drawn with cubes of a different size from the
// rest. Each PNG's own header is checked against the table, and so is every
// picture the page loads in its place, made from it by vite-imagetools — which is
// run here, through Vite, on the module the page imports them from.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'vite';
import { imagetools } from 'vite-imagetools';
import { WIDTHS, HEIGHT, PER_CUBE_PX, WEB_PER_CUBE_PX, O_TRACK } from '../site/src/lib/letters.js';
import { squareOn } from '../site/src/lib/scenes.js';

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

test('the O is its track, square on as it was snapped', () => {
  const perCube = 60;
  const { width, height } = squareOn(O_TRACK.shape, { ...O_TRACK, perCube });
  assert.deepEqual({ width, height }, { width: WIDTHS.O * perCube, height: HEIGHT * perCube });
});

test('the page loads every letter as WebP at 1, 2 and 3 times WEB_PER_CUBE_PX a cube', async () => {
  const server = await createServer({
    configFile: false,
    root: new URL('..', import.meta.url).pathname,
    logLevel: 'silent',
    plugins: [imagetools()],
    server: { middlewareMode: true, ws: false },
  });
  try {
    const { LETTER_IMAGES, letterImage } = await server.ssrLoadModule('/site/src/lib/letter-images.js');
    assert.deepEqual(Object.keys(LETTER_IMAGES).sort(), Object.keys(WIDTHS).sort());
    for (const [letter, across] of Object.entries(WIDTHS)) {
      const sizes = LETTER_IMAGES[letter].map(({ width, height, format }) => ({ width, height, format }));
      const wanted = [1, 2, 3].map(ratio => ({
        width: across * WEB_PER_CUBE_PX * ratio, height: HEIGHT * WEB_PER_CUBE_PX * ratio, format: 'webp',
      }));
      assert.deepEqual(sizes, wanted, letter);
      const { src, srcset } = letterImage(letter);
      const [one, two, three] = LETTER_IMAGES[letter].map(image => image.src);
      assert.equal(src, one, letter);
      assert.equal(srcset, `${one} 1x, ${two} 2x, ${three} 3x`, letter);
    }
  } finally {
    await server.close();
  }
});
