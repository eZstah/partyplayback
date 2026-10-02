import { test } from "node:test";
import assert from "node:assert/strict";
import { bindVolumeControl } from "../src/scripts/volume-control.js";

function setup(preference = null, deviceVolume = false) {
  const element = () => ({ value: "100", dataset: {}, attributes: {}, handlers: {}, style: { setProperty() {} }, setAttribute(k,v) { this.attributes[k] = v; }, addEventListener(k,fn) { this.handlers[k] = fn; } });
  const slider = element(), muteButton = element(), muteLabel = element(), muteIcon = element(), unmuteIcon = element();
  let player = null, stored = preference && JSON.stringify(preference);
  const toggles = [];
  const controller = bindVolumeControl({ slider, muteButton, muteLabel, muteIcon, unmuteIcon, getPlayer: () => player, deviceVolume, storage: { getItem: () => stored, setItem(k,v) { stored = v; } }, onToggle: value => toggles.push(value) });
  function ready() {
    player = { volume: 100, muted: false, getVolume() { return this.volume; }, setVolume(v) { this.volume = v; }, isMuted() { return this.muted; }, mute() { this.muted = true; }, unMute() { this.muted = false; } };
    controller.ready(player);
    return player;
  }
  const change = value => { slider.value = String(value); slider.handlers.input(); };
  return { slider, muteButton, muteLabel, controller, ready, change, toggles, saved: () => JSON.parse(stored) };
}

test("sound controls stay disabled until the iframe is ready", () => {
  const s = setup();
  assert.equal(s.slider.disabled, true);
  assert.equal(s.muteButton.disabled, true);
  s.ready();
  assert.equal(s.slider.disabled, false);
});

test("adjusting volume unmutes locally and persists the chosen level", () => {
  const s = setup(); const player = s.ready();
  player.mute(); s.change(35);
  assert.equal(player.volume, 35);
  assert.equal(player.muted, false);
  assert.deepEqual(s.saved(), { volume: 35, muted: false });
  assert.equal(s.slider.attributes['aria-valuetext'], '35%');
});

test("zero mutes and Unmute restores the last audible level", () => {
  const s = setup(); const player = s.ready();
  s.change(28); s.change(0);
  assert.equal(player.muted, true);
  assert.equal(s.muteLabel.textContent, 'Unmute');
  s.muteButton.handlers.click();
  assert.equal(player.volume, 28);
  assert.equal(player.muted, false);
  assert.deepEqual(s.toggles, [false]);
});

test("muting preserves the slider's level for unmuting and reload", () => {
  const s = setup(); s.ready(); s.change(46);
  s.muteButton.handlers.click();
  const restored = setup(s.saved()); const player = restored.ready();
  assert.equal(player.volume, 46);
  assert.equal(player.muted, true);
  restored.muteButton.handlers.click();
  assert.equal(player.volume, 46);
  assert.equal(player.muted, false);
});

test("device-controlled volume hides the slider and ignores persisted software level", () => {
  const s = setup({volume: 23, muted: false}, true); const player = s.ready();
  assert.equal(s.slider.hidden, true);
  assert.equal(player.volume, 100);
  s.change(20);
  assert.equal(player.volume, 100);
});

test("invalid stored settings cannot set an out-of-range volume", () => {
  const s = setup({volume: -90, muted: true}); const player = s.ready();
  assert.equal(player.volume, 100);
  assert.equal(player.muted, false);
});

test("delayed iframe replies do not reverse mute preference or reset the chosen level", () => {
  const s = setup(); const player = s.ready();
  player.setVolume = () => {}; player.mute = () => {}; player.unMute = () => {};
  s.change(35);
  s.controller.sync();
  assert.equal(s.slider.value, '35');
  s.muteButton.handlers.click();
  assert.equal(s.muteLabel.textContent, 'Unmute');
  assert.deepEqual(s.saved(), {volume: 35, muted: true});
  s.muteButton.handlers.click();
  assert.equal(s.muteLabel.textContent, 'Mute');
  assert.deepEqual(s.saved(), {volume: 35, muted: false});
  player.volume = 35;
  s.controller.sync();
  assert.equal(s.slider.value, '35');
});
