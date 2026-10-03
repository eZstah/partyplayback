import { test } from "node:test";
import assert from "node:assert/strict";
import { centeredCrop, clampCrop, cropPixels } from "../src/lib/crop-geometry.js";

test("portrait and wide presets fit landscape and portrait source tabs", () => {
  for (const [w, h] of [[1920, 1080], [720, 1280], [800, 800]]) {
    for (const ratio of [9 / 16, 16 / 9]) {
      const r = centeredCrop(w, h, ratio);
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.width <= 1 && r.y + r.height <= 1);
      assert.ok(Math.abs(r.width * w / (r.height * h) - ratio) < 0.00001);
    }
  }
});

test("dragging and resizing beyond an edge keeps the crop inside the source", () => {
  assert.deepEqual(clampCrop({ x: -2, y: 2, width: 0.4, height: 0.5 }), { x: 0, y: 0.5, width: 0.4, height: 0.5 });
  assert.deepEqual(clampCrop({ x: 0.5, y: 0.5, width: 3, height: -1 }), { x: 0, y: 0.5, width: 1, height: 0.05 });
});

test("crop rounds inward, sends fewer pixels, and caps output without upscaling", () => {
  const rect = { x: 0.301, y: 0.101, width: 0.25, height: 0.799 };
  const p = cropPixels(rect, 1920, 1080);
  assert.ok(p.x >= rect.x * 1920 && p.y >= rect.y * 1080);
  assert.ok(p.x + p.width <= (rect.x + rect.width) * 1920);
  assert.ok(p.y + p.height <= (rect.y + rect.height) * 1080);
  assert.ok(p.outputWidth <= p.width && p.outputHeight <= p.height);
  assert.equal(p.outputWidth % 2, 0);
  assert.equal(p.outputHeight % 2, 0);
  assert.ok(p.outputWidth * p.outputHeight < 1920 * 1080 / 2);
});

test("portrait crop keeps available detail and supports 1080 by 1920 output", () => {
  const hd = cropPixels(centeredCrop(1920, 1080), 1920, 1080);
  assert.equal(hd.outputHeight, 972, "a 1080p source must not be reduced to 720p before sending");
  const uhd = cropPixels(centeredCrop(3840, 2160), 3840, 2160);
  assert.ok(uhd.outputWidth >= 1078 && uhd.outputWidth <= 1080);
  assert.equal(uhd.outputHeight, 1920);
  const wide = cropPixels({ x: 0, y: 0, width: 1, height: 1 }, 3840, 2160);
  assert.equal(wide.outputWidth, 1920);
  assert.equal(wide.outputHeight, 1080);
});
