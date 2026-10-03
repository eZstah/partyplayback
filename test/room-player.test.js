import { test } from "node:test";
import assert from "node:assert/strict";
import { RoomPlayer } from "../src/lib/room-player.js";

function setup() {
  let clock = 0;
  const messages = [], calls = [];
  const player = {
    state: 1, time: 0, videoId: "M7lc1UVf-VE",
    getPlayerState() { return this.state; },
    getCurrentTime() { return this.time; },
    getVideoData() { return { video_id: this.videoId }; },
    loadVideoById(options) { calls.push(["load", options]); this.videoId = options.videoId; this.time = options.startSeconds; this.state = 3; },
    cueVideoById(options) { calls.push(["cue", options]); this.videoId = options.videoId; this.time = options.startSeconds; this.state = 5; },
    seekTo(time) { calls.push(["seek", time]); this.time = time; },
    playVideo() { calls.push(["play"]); },
    pauseVideo() { calls.push(["pause"]); },
    stopVideo() { calls.push(["stop"]); this.state = 0; },
  };
  const sync = new RoomPlayer({ send(data) { messages.push(data); return true; }, now: () => clock });
  const room = {
    queue: [{ id: "item-1", videoId: player.videoId }], currentIndex: 0,
    playbackId: "load-1", revision: 1, isPlaying: true, currentTime: 0,
  };
  function settle() { player.state = 1; player.time = sync.targetTime(); sync.tick(); }
  function advance(ms, seconds = ms / 1000) { clock += ms; player.time += seconds; }
  sync.ready(player);
  sync.receive(room);
  settle();
  return { sync, player, room, messages, calls, settle, advance };
}

test("shared tabs suspend YouTube events and controls until returning to the playlist", () => {
  const { sync, player, room, messages, calls } = setup();
  sync.receive({ ...room, revision: 2, isPlaying: false, currentTime: 23, share: { id: "share-1" } });
  assert.equal(calls.at(-1)[0], "pause");
  sync.stateChanged(1);
  sync.stateChanged(0);
  sync.tick();
  sync.enablePlayback(true);
  assert.equal(sync.command("play"), false);
  assert.equal(messages.length, 0);
  sync.receive({ ...room, revision: 3, isPlaying: false, currentTime: 23, share: null });
  player.state = 2;
  sync.tick();
  assert.equal(sync.command("play"), true);
});

test("missing YouTube video metadata waits for the load to settle", () => {
  const { sync, player, room, messages } = setup();
  sync.receive({ ...room, playbackId: "load-2", revision: 2 });
  const videoData = player.getVideoData;
  player.getVideoData = () => undefined;
  player.state = 1;
  assert.doesNotThrow(() => sync.tick());
  assert.ok(sync.pending);
  assert.equal(messages.length, 0);
  player.getVideoData = videoData;
  sync.tick();
  assert.equal(sync.pending, null);
  assert.equal(messages.length, 0);
});

test("remote play/pause events do not echo, even after slow loading", () => {
  const { sync, player, room, messages, advance } = setup();
  sync.receive({ ...room, playbackId: "load-2", revision: 2 });
  advance(5000, 0);
  player.state = 2;
  sync.stateChanged(2);
  assert.equal(messages.length, 0);
  player.state = 1;
  sync.stateChanged(1); sync.tick();
  assert.equal(messages.length, 0);
  assert.equal(sync.pending, null);
  sync.receive({ ...room, playbackId: "load-2", revision: 3, currentTime: 5, isPlaying: false });
  player.state = 2;
  sync.stateChanged(2);
  assert.equal(messages.length, 0);
});

test("native seek during buffering syncs and does not become a pause", () => {
  const { sync, player, messages, advance } = setup();
  advance(250);
  sync.tick();
  player.time = 45;
  player.state = 3;
  sync.stateChanged(3);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "seek");
  assert.equal(messages[0].currentTime, 45);
});

test("backwards and paused seeks sync without depending on a play event", () => {
  const { sync, player, room, messages } = setup();
  sync.receive({ ...room, isPlaying: false, currentTime: 40, revision: 2 });
  player.state = 2; sync.tick();
  player.time = 10; sync.tick();
  assert.equal(messages[0].type, "seek");
  assert.equal(messages[0].currentTime, 10);
});

test("ordinary buffering does not send a seek or pause", () => {
  const { sync, player, messages, advance } = setup();
  advance(250); sync.tick();
  player.state = 3; sync.stateChanged(3);
  advance(5000, 0); sync.tick();
  player.state = 1; sync.stateChanged(1);
  assert.equal(messages.length, 0);
});

test("native pause and play commands include the current load and revision", () => {
  const { sync, player, room, messages } = setup();
  player.state = 2; player.time = 20; sync.stateChanged(2);
  assert.deepEqual(messages[0], { type: "pause", currentTime: 20, playbackId: "load-1", revision: 1 });
  sync.receive({ ...room, currentTime: 20, isPlaying: false, revision: 2 });
  player.state = 1; sync.stateChanged(1);
  assert.equal(messages[1].type, "play");
});

test("the latest room state is applied when YouTube becomes ready", () => {
  const { player, calls, room } = setup();
  calls.length = 0;
  let clock = 0;
  const sync = new RoomPlayer({ send: () => true, now: () => clock });
  sync.receive({ ...room, currentTime: 50 });
  clock = 3000;
  sync.receive({ ...room, currentTime: 70, isPlaying: false, revision: 2 });
  clock = 9000;
  sync.ready(player);
  assert.deepEqual(calls[0], ["cue", { videoId: player.videoId, startSeconds: 70 }]);
});

test("clearing the queue actually stops the old player", () => {
  const { sync, player, room, calls, messages } = setup();
  sync.receive({ ...room, queue: [], currentIndex: -1, playbackId: null, isPlaying: false, revision: 2 });
  assert.deepEqual(calls.at(-1), ["stop"]);
  sync.stateChanged(player.state);
  assert.equal(messages.length, 0);
});

test("autoplay blocking and embed errors stay local to the viewer", () => {
  const { sync, player, room, messages, calls } = setup();
  sync.autoplayBlocked();
  player.state = 2; sync.stateChanged(2);
  assert.equal(messages.length, 0);
  sync.enablePlayback();
  assert.deepEqual(calls.at(-1), ["play"]);
  sync.failed();
  sync.stateChanged(0);
  sync.receive({ ...room, revision: 2 });
  assert.equal(messages.length, 0);
});

test("end reports are deduplicated and old snapshots cannot roll back playback", () => {
  const { sync, player, room, messages } = setup();
  player.state = 0; sync.stateChanged(0); sync.stateChanged(0);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "ended");
  sync.receive({ ...room, playbackId: "load-2", revision: 3 });
  sync.receive({ ...room, revision: 2 });
  assert.equal(sync.loadedId, "load-2");
});

test("YouTube's own Play button also unlocks a blocked viewer at the room position", () => {
  const { sync, player, room, messages, calls } = setup();
  sync.receive({ ...room, currentTime: 60, revision: 2 });
  sync.autoplayBlocked();
  player.time = 5;
  player.state = 1;
  sync.stateChanged(1);
  assert.equal(sync.blocked, false);
  assert.equal(messages.length, 0);
  assert.deepEqual(calls.findLast(call => call[0] === "seek"), ["seek", 60]);
});

test("drift correction is local and compensates for response transit time", () => {
  const { sync, player, room, messages, calls } = setup();
  player.time = 0;
  sync.receive({ ...room, currentTime: 60, revision: 2 }, 0.2);
  assert.deepEqual(calls.findLast(call => call[0] === "seek"), ["seek", 60.2]);
  sync.tick();
  assert.equal(messages.length, 0);
});

test("replacing the embed reloads the current room timeline without broadcasting a command", () => {
  const { sync, player, room, calls, messages, advance } = setup();
  advance(20000);
  sync.tick();
  sync.detach();
  assert.equal(sync.player, null);
  // Other viewers can change the room while YouTube is reloading.
  sync.receive({ ...room, currentTime: 45, revision: 2 });
  advance(3000, 0);
  calls.length = 0;
  const replacement = { ...player, time: 0, videoId: "" };
  sync.ready(replacement);
  assert.deepEqual(calls[0], ["load", { videoId: room.queue[0].videoId, startSeconds: 48 }]);
  replacement.state = 1;
  sync.stateChanged(1);
  assert.equal(sync.pending, null);
  assert.equal(messages.length, 0);
});

test("replacing a paused or blocked embed stays paused at the room position", () => {
  const { sync, player, room, calls, messages } = setup();
  sync.receive({ ...room, currentTime: 60, isPlaying: false, revision: 2 });
  sync.autoplayBlocked();
  sync.failed();
  sync.detach();
  calls.length = 0;
  sync.ready({ ...player, time: 0, videoId: "" });
  assert.deepEqual(calls[0], ["cue", { videoId: room.queue[0].videoId, startSeconds: 60 }]);
  assert.equal(sync.blocked, false);
  assert.equal(sync.failedId, null);
  assert.equal(messages.length, 0);
});
