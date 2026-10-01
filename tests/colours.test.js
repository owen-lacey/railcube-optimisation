// The colours prose may be written in: named tokens only, never a raw colour.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { COLOUR_TOKENS, colourOf } from "../site/src/lib/colours.js";
import { COLORS } from "../site/src/lib/render/dimensions.js";

const stylesheet = readFileSync(new URL("../site/src/app.css", import.meta.url), "utf8");
const theme = COLOUR_TOKENS.filter(t => !Object.hasOwn(COLORS, t));

test("every theme token is a property the stylesheet declares", () => {
	assert.equal(theme.length, 5);
	for (const token of theme) {
		assert.equal(colourOf(token), `var(--${token})`);
		assert.ok(stylesheet.includes(`--${token}:`), `app.css declares --${token}`);
	}
});

test("every piece type is the colour its cubes are drawn in", () => {
	for (const [type, hex] of Object.entries(COLORS)) assert.equal(colourOf(type), hex);
});

test("anything that is not a token is refused", () => {
	for (const raw of ["#4f75b8", "red", "rgb(0,0,0)", "--grid-color", "grid-opacity", "constructor", undefined]) {
		assert.throws(() => colourOf(raw), /Unknown colour token/);
	}
});
