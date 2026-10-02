import test from "node:test";
import assert from "node:assert/strict";
import { lookVector, pickLine } from "../src/scripts/mascot-fx.js";
import { PERSONALITIES } from "../src/scripts/home-mascots.js";

test("pupils point toward the target and ease off up close", () => {
  assert.deepEqual(lookVector({ x: 0, y: 0 }, { x: 500, y: 0 }), { x: 4, y: 0 });
  assert.deepEqual(lookVector({ x: 0, y: 0 }, { x: 0, y: -500 }), { x: 0, y: -3 });
  assert.deepEqual(lookVector({ x: 0, y: 0 }, { x: 110, y: 0 }), { x: 2, y: 0 });
  assert.deepEqual(lookVector({ x: 5, y: 5 }, { x: 5, y: 5 }), { x: 0, y: 0 });
});

test("a friend never repeats the line they just said", () => {
  const lines = ["a", "b", "c"];
  for (const r of [0, .5, .99]) assert.notEqual(pickLine(lines, "b", () => r), "b");
  assert.equal(pickLine(["only"], "only"), "only");
});

test("every friend has lines short enough for a phone bubble", () => {
  for (const [kind, voice] of Object.entries(PERSONALITIES)) {
    const all = [...voice.lines, voice.dizzy, voice.petted, voice.wake, voice.cheer, voice.eager];
    for (const line of all) assert.ok(line.length <= 24, `${kind}: "${line}" is too long`);
  }
});
