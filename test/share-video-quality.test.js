import { test } from "node:test";
import assert from "node:assert/strict";
import { tuneVideoSender } from "../src/lib/share-video-quality.js";

test("sender preserves negotiated fields and detail while bounding a full 4K tab", async () => {
  const parameters = { transactionId: "negotiated", codecs: [{ mimeType: "video/VP8" }], encodings: [{ active: true, rid: "main" }] };
  let applied;
  const sender = {
    track: { kind: "video", getSettings: () => ({ width: 3840, height: 2160 }) },
    getParameters: () => parameters,
    async setParameters(value) { applied = value; },
  };
  assert.equal(await tuneVideoSender(sender), true);
  assert.equal(applied.transactionId, "negotiated");
  assert.deepEqual(applied.codecs, [{ mimeType: "video/VP8" }]);
  assert.equal(applied.degradationPreference, "maintain-resolution");
  assert.deepEqual(applied.encodings, [{ active: true, rid: "main", maxBitrate: 6_000_000, maxFramerate: 30, scaleResolutionDownBy: 2 }]);
});

test("portrait HD and smaller crops are sent at their original resolution", async () => {
  for (const [width, height] of [[1080, 1920], [546, 972], [364, 648]]) {
    let scale;
    await tuneVideoSender({
      track: { kind: "video", getSettings: () => ({ width, height }) },
      getParameters: () => ({ encodings: [{}] }),
      async setParameters(value) { scale = value.encodings[0].scaleResolutionDownBy; },
    });
    assert.equal(scale, 1);
  }
});

test("quality settings never change audio, invent encodings, or fail the connection", async () => {
  let writes = 0;
  const sender = { track: { kind: "audio" }, getParameters() { throw new Error("must not inspect audio"); } };
  assert.equal(await tuneVideoSender(sender), false);
  sender.track = { kind: "video", getSettings: () => ({ width: 1920, height: 1080 }) };
  sender.getParameters = () => ({ encodings: [] });
  sender.setParameters = async () => { writes++; throw new Error("not supported"); };
  assert.equal(await tuneVideoSender(sender), false);
  assert.equal(writes, 0);
  sender.getParameters = () => ({ encodings: [{}] });
  assert.equal(await tuneVideoSender(sender), false);
  assert.equal(writes, 1);
});
