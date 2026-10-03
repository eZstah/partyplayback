import { test } from "node:test";
import assert from "node:assert/strict";
import { bindFullscreenControls } from "../src/scripts/fullscreen-controls.js";

function setup() {
  const target = () => ({ handlers: new Map(), addEventListener(type, fn) { this.handlers.set(type, fn); }, removeEventListener(type) { this.handlers.delete(type); }, emit(type, event = {}) { this.handlers.get(type)?.(event); } });
  const document = target(), shell = target(), nav = target(), bottom = target(), window = target();
  document.defaultView = window;
  document.hasFocus = () => true;
  shell.dataset = {};
  shell.querySelectorAll = () => [nav, bottom];
  shell.contains = element => element?.inShell === true;
  shell.focus = () => { document.activeElement = shell; shell.emit("focusin"); };
  let clock = 0, id = 0;
  const timers = new Map();
  const controller = bindFullscreenControls({ shell, document,
    setTimeout(fn, delay) { const next = ++id; timers.set(next, { fn, at: clock + delay }); return next; },
    clearTimeout(key) { timers.delete(key); },
  });
  function advance(ms) { clock += ms; for (const [key, timer] of [...timers]) if (timer.at <= clock) { timers.delete(key); timer.fn(); } }
  function fullscreen(active = true) { document.fullscreenElement = active ? shell : null; document.emit("fullscreenchange"); }
  const controlsTarget = { closest: () => nav };
  const videoTarget = { closest: () => null };
  const hidden = () => shell.dataset.controlsHidden === "true";
  return { controller, document, window, shell, nav, bottom, advance, fullscreen, controlsTarget, videoTarget, hidden, timers };
}

test("controls hide after three inactive seconds only in eligible fullscreen playback", () => {
  const s = setup(); s.controller.update(true, "load-1");
  s.advance(4000); assert.equal(s.hidden(), false);
  s.fullscreen(); s.advance(2999); assert.equal(s.hidden(), false);
  s.advance(1); assert.equal(s.hidden(), true);
  s.controller.update(false, "load-1"); assert.equal(s.hidden(), false);
  s.advance(10000); assert.equal(s.hidden(), false);
});

test("movement and taps reveal controls and reset idle time", () => {
  const s = setup(); s.fullscreen(); s.controller.update(true, "load-1");
  s.advance(2500); s.shell.emit("pointermove", { target: s.videoTarget });
  s.advance(2500); assert.equal(s.hidden(), false);
  s.advance(500); assert.equal(s.hidden(), true);
  s.shell.emit("pointerdown"); assert.equal(s.hidden(), false);
  s.advance(10000); assert.equal(s.hidden(), false);
  s.document.emit("pointerup"); s.advance(3000); assert.equal(s.hidden(), true);
});

test("hovering controls or navigating their keyboard focus keeps them available", () => {
  const s = setup(); s.fullscreen(); s.controller.update(true, "load-1");
  s.nav.emit("pointerenter"); s.advance(10000); assert.equal(s.hidden(), false);
  s.nav.emit("pointerleave"); s.advance(3000); assert.equal(s.hidden(), true);
  s.document.emit("keydown", { key: "Tab" });
  s.document.activeElement = s.controlsTarget; s.shell.emit("focusin");
  s.advance(10000); assert.equal(s.hidden(), false);
  s.document.activeElement = s.videoTarget; s.shell.emit("focusin");
  s.advance(3000); assert.equal(s.hidden(), true);
  s.document.emit("keydown", { key: "m" }); assert.equal(s.hidden(), false);
});

test("a new video or exiting fullscreen reveals controls and cancels stale timers", () => {
  const s = setup(); s.fullscreen(); s.controller.update(true, "load-1");
  s.advance(3000); assert.equal(s.hidden(), true);
  s.controller.update(true, "load-2"); assert.equal(s.hidden(), false);
  s.fullscreen(false); s.advance(10000); assert.equal(s.hidden(), false);
  assert.equal(s.timers.size, 0);
});

test("unchanged playback samples do not postpone hiding and cleanup restores visibility", () => {
  const s = setup(); s.fullscreen(); s.controller.update(true, "load-1");
  for (let i = 0; i < 12; i++) { s.controller.update(true, "load-1"); s.advance(250); }
  assert.equal(s.hidden(), true);
  s.controller.destroy(); assert.equal(s.hidden(), false);
  assert.equal(s.document.handlers.size, 0);
  assert.equal(s.shell.handlers.size, 0);
});

test("hiding restores shortcut focus from the iframe and released pointer movement recovers", () => {
  const s = setup(); s.fullscreen(); s.controller.update(true, "load-1");
  s.document.activeElement = { tagName: "IFRAME" };
  s.shell.contains = () => true;
  s.shell.focus = () => { s.document.activeElement = s.shell; s.shell.emit("focusin"); };
  s.advance(3000);
  assert.equal(s.document.activeElement, s.shell);
  assert.equal(s.hidden(), true);
  s.shell.emit("pointerdown");
  s.shell.emit("pointermove", { target: s.videoTarget, buttons: 0 });
  s.advance(3000); assert.equal(s.hidden(), true);
});

test("entering fullscreen moves focus off the mode button before Space can activate it again", () => {
  const s = setup();
  s.document.activeElement = s.controlsTarget;
  s.fullscreen();
  assert.equal(s.document.activeElement, s.shell);
  assert.equal(s.document.fullscreenElement, s.shell);
  s.document.activeElement = s.controlsTarget;
  s.fullscreen(false);
  assert.equal(s.document.activeElement, s.controlsTarget, "exiting should not steal the browser's restored focus");
});

test("a pointer-focused control releases focus when hidden, while Tab navigation keeps it", () => {
  const s = setup(); s.fullscreen(); s.controller.update(true, "load-1");
  s.document.activeElement = s.controlsTarget;
  s.advance(3000);
  assert.equal(s.document.activeElement, s.shell);
  s.document.emit("keydown", { key: "Tab" });
  s.document.activeElement = s.controlsTarget;
  s.shell.emit("focusin");
  s.advance(3000);
  assert.equal(s.document.activeElement, s.controlsTarget);
  assert.equal(s.hidden(), false);
});

test("iframe clicks return shortcut focus immediately even when paused; caption controls keep focus", () => {
  const s = setup(); s.fullscreen(); s.controller.update(false, "paused");
  const iframe = { tagName: "IFRAME", inShell: true };
  s.window.emit("blur");
  s.document.activeElement = iframe;
  s.advance(0);
  assert.equal(s.document.activeElement, s.shell);
  s.shell.dataset.youtubeControls = "true";
  s.document.activeElement = iframe;
  s.window.emit("blur"); s.advance(0);
  assert.equal(s.document.activeElement, iframe);
});

test("leaving the window, unrelated frames, and cleanup do not pull focus into the player", () => {
  const s = setup(); s.fullscreen();
  const iframe = { tagName: "IFRAME", inShell: true };
  s.document.activeElement = iframe;
  s.document.hasFocus = () => false;
  s.window.emit("blur"); s.advance(0);
  assert.equal(s.document.activeElement, iframe);
  s.document.hasFocus = () => true;
  iframe.inShell = false;
  s.window.emit("blur"); s.advance(0);
  assert.equal(s.document.activeElement, iframe);
  iframe.inShell = true;
  s.window.emit("blur"); s.controller.destroy(); s.advance(0);
  assert.equal(s.document.activeElement, iframe);
  assert.equal(s.window.handlers.size, 0);
  assert.equal(s.timers.size, 0);
});
