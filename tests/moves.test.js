// What each piece does to the train, as the post words it and draws it.

import test from "node:test";
import assert from "node:assert/strict";

import { POSES, isValidPose, startCell, step } from "../src/track.js";
import { describeDelta, describeMove, describePose, trackCell } from "../site/src/lib/catalogue.js";
import { pieceMove, poseCycle, poseGhost } from "../site/src/lib/scenes.js";

// Where the next piece goes, with Owen's convention of digits and upwards/downwards.
const CAPTIONS = {
	straight: "Next piece goes 1 forwards",
	cross: "Next piece goes 1 forwards",
	leftCurve: "Next piece goes 1 forwards and 2 left, facing left",
	rightCurve: "Next piece goes 1 forwards and 2 right, facing right",
	insideCurve: "Next piece goes 1 forwards and 2 up, facing upwards",
	outsideCurve: "Next piece goes 1 down, facing downwards"
};

test("every piece's caption is read off the model in the post's words", () => {
	for (const [type, caption] of Object.entries(CAPTIONS))
		assert.equal(describeMove(type), caption);
});

test("the piece's cube and the cube it hands on are outlined, before and after", () => {
	for (const type of Object.keys(CAPTIONS)) {
		const { outlines, after } = pieceMove(type);
		assert.deepEqual(after, step(startCell("DF"), "DF", type));
		assert.deepEqual(outlines, [
			{ cell: trackCell({ cell: startCell("DF"), pose: "DF" }), tint: "before" },
			{ cell: trackCell(after), tint: "after" }
		]);
	}
});

test("the pose cycle stands the train in one cell in every pose, floor by floor", () => {
	const ghosts = POSES.map(poseGhost);
	const { grid } = poseCycle();
	assert.equal(new Set(ghosts.map((g) => g.pose)).size, 24);
	for (const ghost of ghosts) {
		assert.ok(isValidPose(ghost.pose), ghost.pose);
		assert.deepEqual([grid.lo, grid.hi], [ghost.cell, ghost.cell]);
	}
	// Four headings on each floor before moving on to the next.
	assert.deepEqual(
		POSES.slice(0, 4).map((p) => p[0]),
		["U", "U", "U", "U"]
	);
});

test("a pose is worded as its face and heading, with its code", () => {
	assert.equal(describePose("DF"), "down face, heading forwards (−z +y)");
	assert.equal(describePose("UR"), "up face, heading right (+z −x)");
	assert.equal(describePose("BD"), "back face, heading down (−y −z)");
	assert.equal(describePose("LU"), "left face, heading up (+x +z)");
});

test("a move is written as the change from (x, y, z), in the reader's frame", () => {
	const start = startCell("DF");
	const after = (type) => step(start, "DF", type).cell;
	assert.equal(describeDelta(start, start), "(x, y, z)");
	// Two left and one forwards: x is left and y forwards.
	assert.equal(describeDelta(start, after("leftCurve")), "(x + 2, y + 1, z)");
	assert.equal(describeDelta(start, after("rightCurve")), "(x − 2, y + 1, z)");
	assert.equal(describeDelta(start, after("insideCurve")), "(x, y, z + 1)");
	assert.equal(describeDelta(start, after("outsideCurve")), "(x, y + 1, z − 2)");
});

test("from every pose, the lattice is exactly the piece and the cube it hands on, and the move is the model's", () => {
	const origin = [0, 0, 0];
	for (const pose of POSES) {
		for (const type of Object.keys(CAPTIONS)) {
			const { pieces, grid, after, ghosts } = pieceMove(type, { pose, cell: origin });
			assert.deepEqual(after, step(origin, pose, type));
			assert.equal(ghosts, undefined, `${pose} ${type}: no train is drawn`);
			const cells = [...pieces[0].material, trackCell(after)];
			const bound = (pick) => [0, 1, 2].map((a) => pick(...cells.map((c) => c[a])));
			assert.deepEqual(grid, { lo: bound(Math.min), hi: bound(Math.max) }, `${pose} ${type}`);
		}
	}
});
