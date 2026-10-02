import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const head = readFileSync(new URL("../src/components/PortalArrival.astro", import.meta.url), "utf8").match(/<script is:inline>([\s\S]*?)<\/script>/)[1];
const client = readFileSync(new URL("../src/scripts/room-transition.js", import.meta.url), "utf8").replaceAll("export ", "");
const marker = { at: 10000, url: "/room/g-test", x: 60, y: 70 };

function setup({ arrival = marker, reducedMotion = false } = {}) {
  let clock = 10000, nextId = 0, stored = JSON.stringify(arrival);
  const timers = new Map(), frames = [], classes = new Set(), marks = [];
  const events = new EventTarget();
  const root = {
    classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)), contains: name => classes.has(name) },
    style: { setProperty() {} },
  };
  const context = vm.createContext({
    Date: { now: () => clock },
    location: { pathname: marker.url },
    sessionStorage: { getItem: () => stored, removeItem: () => { stored = null; } },
    matchMedia: () => ({ matches: reducedMotion }),
    document: { documentElement: root, fonts: { ready: Promise.resolve() }, addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) },
    setTimeout(fn, delay) { const id = ++nextId; timers.set(id, { fn, at: clock + delay }); return id; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: fn => frames.push(fn),
    performance: { mark: name => marks.push(name) },
  });
  vm.runInContext(head, context);
  vm.runInContext(client + "\nglobalThis.reveal = revealCreatedRoom;", context);
  async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
  async function advance(ms) {
    clock += ms;
    for (const [id, timer] of timers) {
      if (timer.at <= clock) { timers.delete(id); timer.fn(); }
    }
    await flush();
  }
  async function paint() { await flush(); frames.splice(0).forEach(fn => fn()); await flush(); }
  return { classes, marks, context, events, advance, paint, flush };
}

test("the arrival cover holds until connected, then fades once and clears", async () => {
  const env = setup();
  assert.ok(env.classes.has("room-arriving"));
  const finished = env.context.reveal();
  await env.advance(100);
  assert.ok(!env.classes.has("room-revealing"));
  env.events.dispatchEvent(new Event("youple:room-ready"));
  await env.paint();
  await env.paint();
  assert.ok(env.classes.has("room-revealing"));
  await env.advance(480);
  await finished;
  assert.equal(env.classes.size, 0);
  assert.deepEqual(env.marks, ["youple:room-reveal", "youple:room-visible"]);
});

test("a stalled room connection still reveals usable room controls", async () => {
  const env = setup();
  const finished = env.context.reveal();
  await env.advance(1200);
  await env.paint();
  await env.paint();
  assert.ok(env.classes.has("room-revealing"));
  await env.advance(480);
  await finished;
  assert.equal(env.classes.size, 0);
});

test("the cover recovers even when the client bundle fails to run", async () => {
  const env = setup();
  await env.advance(4000);
  assert.equal(env.classes.size, 0);
});

test("stale, malformed, or different-room markers never cover a room", () => {
  for (const arrival of [null, 123, { ...marker, at: -10000 }, { ...marker, at: 20000 }, { ...marker, url: "/room/g-other" }, { ...marker, at: "invalid" }]) {
    assert.equal(setup({ arrival }).classes.size, 0);
  }
});

test("reduced motion skips the portal handoff", async () => {
  const env = setup({ reducedMotion: true });
  await env.context.reveal();
  assert.equal(env.classes.size, 0);
  assert.equal(env.marks.length, 0);
});

test("direct room visits do not wait for an arrival animation", async () => {
  const env = setup({ arrival: null });
  await env.context.reveal();
  assert.equal(env.classes.size, 0);
  assert.equal(env.marks.length, 0);
});
