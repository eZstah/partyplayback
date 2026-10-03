import { test } from "node:test";
import assert from "node:assert/strict";
import { youtubeUrl, extensionVideo } from "../src/scripts/room-paste.js";
import { videoLink } from "../extension/video.js";
import { readFileSync } from "node:fs";

const id = "M7lc1UVf-VE", canonical = "https://www.youtube.com/watch?v=" + id;

test("the extension recognizes the same YouTube links as the room", () => {
  for (const value of [canonical, `https://youtu.be/${id}?si=share`, `https://www.youtube.com/watch?v=${id}&list=PL1&t=42s`, `https://m.youtube.com/shorts/${id}`,
    `https://music.youtube.com/watch?v=${id}`, `https://youtube.com/live/${id}/`, "https://www.youtube.com/", "https://www.youtube.com/@channel",
    `https://youtube.com.evil.test/watch?v=${id}`, "chrome://newtab/", "", "not a url"]) {
    assert.equal(videoLink(value), youtubeUrl(value), value);
  }
});

test("the room takes videos only from the extension in its own window", () => {
  const page = { location: { origin: "https://youple.tv" } };
  const data = { source: "youple-extension", type: "add", url: `https://youtu.be/${id}` };
  assert.equal(extensionVideo({ source: page, origin: "https://youple.tv", data }, page), canonical);
  assert.equal(extensionVideo({ source: {}, origin: "https://youple.tv", data }, page), null);
  assert.equal(extensionVideo({ source: page, origin: "https://evil.test", data }, page), null);
  assert.equal(extensionVideo({ source: page, origin: "https://youple.tv", data: { ...data, source: "other" } }, page), null);
  assert.equal(extensionVideo({ source: page, origin: "https://youple.tv", data: { ...data, url: "https://evil.test/" } }, page), null);
  assert.equal(extensionVideo({ source: page, origin: "https://youple.tv", data: "add" }, page), null);
});

test("the store package drops the localhost development matches", async () => {
  const { storeManifest } = await import("../scripts/pack-extension.mjs");
  const manifest = JSON.parse(readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));
  const packed = JSON.stringify(storeManifest(manifest));
  assert.ok(manifest.host_permissions.some(match => match.startsWith("http://localhost")));
  assert.ok(!packed.includes("localhost"));
  assert.ok(packed.includes("https://youple.tv/room/*"));
});
