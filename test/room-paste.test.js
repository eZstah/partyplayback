import { test } from "node:test";
import assert from "node:assert/strict";
import { pastedVideo, youtubeUrl, playlistLink } from "../src/scripts/room-paste.js";

const id = "M7lc1UVf-VE", canonical = "https://www.youtube.com/watch?v=" + id;

test("page paste recognizes supported YouTube URLs and normalizes them", () => {
  for (const value of [canonical, ` https://youtu.be/${id}?si=share `, `https://m.youtube.com/shorts/${id}`, `https://music.youtube.com/watch?v=${id}`, `https://www.youtube-nocookie.com/embed/${id}`, `https://youtube.com/live/${id}/`]) {
    assert.equal(youtubeUrl(value), canonical);
    assert.equal(pastedVideo({ clipboardData: { getData: () => value } }), canonical);
  }
});

test("unrelated clipboard content and lookalike URLs are ignored", () => {
  for (const value of [undefined, "hello", "M7lc1UVf-VE", "https://youple.tv/room/g-test", `https://youtube.com.evil.test/watch?v=${id}`, `https://evil.test/?url=${canonical}`, `https://youtu.be/${id}/extra`, `ftp://youtube.com/watch?v=${id}`, canonical + "\n" + canonical, "x".repeat(501)]) {
    assert.equal(youtubeUrl(value), null);
  }
});

test("paste inside fields, dialogs, or an already handled event stays untouched", () => {
  const clipboardData = { getData() { throw new Error("Must not read this paste"); } };
  assert.equal(pastedVideo({ clipboardData, target: { closest: () => ({}) } }), null);
  assert.equal(pastedVideo({ clipboardData }, true), null);
  assert.equal(pastedVideo({ clipboardData, defaultPrevented: true }), null);
});

test("paste still adds a video when the playback slider has focus", () => {
  assert.equal(pastedVideo({ target: { closest: () => ({ tagName: "INPUT", type: "range" }) }, clipboardData: { getData: () => canonical } }), canonical);
});

test("playlist button uses a typed link without requesting clipboard access", async () => {
  assert.deepEqual(await playlistLink({ value: canonical }, { readText() { throw new Error("Must not read"); } }), { value: canonical, fromClipboard: false });
});

test("empty playlist input imports and normalizes a copied YouTube link", async () => {
  assert.deepEqual(await playlistLink({ value: "  " }, { readText: async () => ` https://youtu.be/${id}?si=share ` }), { value: canonical, fromClipboard: true });
});

test("unavailable, denied, and unrelated clipboards fall back without adding", async () => {
  for (const clipboard of [undefined, {}, { readText: async () => { throw new Error("Denied"); } }, { readText: async () => "https://youple.tv/room/g-test" }, { readText: async () => "" }]) {
    assert.equal(await playlistLink({ value: "" }, clipboard), null);
  }
});

test("typing during a clipboard prompt takes priority over the copied link", async () => {
  const input = { value: "" };
  let complete;
  const pending = playlistLink(input, { readText: () => new Promise(resolve => { complete = resolve; }) });
  input.value = "https://youtu.be/aqz-KE-bpKQ";
  complete(canonical);
  assert.deepEqual(await pending, { value: input.value, fromClipboard: false });
});
