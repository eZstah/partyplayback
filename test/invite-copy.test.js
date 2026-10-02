import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/scripts/invite-copy.js", import.meta.url), "utf8").replaceAll("export ", "");
function setup({ deferred = true, denied = false, fallback = false, notice = null } = {}) {
  let copied = "existing clipboard", calls = 0, restored = false, stored = JSON.stringify(notice);
  const field = { setAttribute() {}, style: {}, select() {}, remove() {} };
  const context = vm.createContext({
    Blob,
    ClipboardItem: deferred ? class { constructor(data) { this.data = data; } } : undefined,
    navigator: { clipboard: {
      async write(items) { calls++; if (denied) throw new Error("Blocked"); const blob = await items[0].data["text/plain"]; copied = await blob.text(); },
      async writeText(text) { if (denied) throw new Error("Blocked"); copied = text; },
    } },
    location: { origin: "https://youple.tv", pathname: "/room/g-test" },
    Date: { now: () => 10000 },
    sessionStorage: { getItem: () => stored, removeItem: () => { stored = null; } },
    document: { activeElement: { focus() { restored = true; } }, createElement: () => field, querySelector: () => null, body: { append() {} }, execCommand: () => fallback },
  });
  vm.runInContext(source + "\nglobalThis.api = { beginInviteCopy, copyText, takeCreatedRoomNotice };", context);
  return { api: context.api, copied: () => copied, calls: () => calls, restored: () => restored };
}

test("room creation starts copying in the gesture and writes the returned invite URL", async () => {
  const env = setup();
  const copy = env.api.beginInviteCopy();
  assert.equal(env.calls(), 1);
  assert.equal(env.copied(), "existing clipboard");
  assert.equal(await copy.complete("/room/g-test"), true);
  assert.equal(env.copied(), "https://youple.tv/room/g-test");
});

test("failed room creation leaves the existing clipboard intact", async () => {
  const env = setup();
  const copy = env.api.beginInviteCopy();
  copy.cancel();
  assert.equal(await copy.complete("/room/g-test"), false);
  assert.equal(env.copied(), "existing clipboard");
});

test("room creation never copies an invalid or external invite URL", async () => {
  for (const path of ["https://evil.test/room/x", "//evil.test/room/x", "/room/../x", "/room/x?next=bad"]) {
    const env = setup();
    assert.equal(await env.api.beginInviteCopy().complete(path), false);
    assert.equal(env.copied(), "existing clipboard");
  }
});

test("browsers without deferred clipboard items still copy through writeText", async () => {
  const env = setup({ deferred: false });
  assert.equal(await env.api.beginInviteCopy().complete("/room/g-test"), true);
  assert.equal(env.copied(), "https://youple.tv/room/g-test");
});

test("denied clipboard access reports failure and restores focus", async () => {
  const env = setup({ denied: true });
  assert.equal(await env.api.beginInviteCopy().complete("/room/g-test"), false);
  assert.equal(env.copied(), "existing clipboard");
  assert.equal(env.restored(), true);
});

test("creation copy notices belong to one recent matching room visit", () => {
  const env = setup({ notice: { at: 9500, url: "/room/g-test", copied: true } });
  assert.equal(env.api.takeCreatedRoomNotice().copied, true);
  assert.equal(env.api.takeCreatedRoomNotice(), null);
  for (const notice of [null, { at: -10000, url: "/room/g-test", copied: true }, { at: 11000, url: "/room/g-test", copied: true }, { at: 9500, url: "/room/g-other", copied: true }]) {
    assert.equal(setup({ notice }).api.takeCreatedRoomNotice(), null);
  }
  assert.equal(setup({ notice: { at: 9500, url: "/room/g-test", copied: false } }).api.takeCreatedRoomNotice().copied, false);
});
