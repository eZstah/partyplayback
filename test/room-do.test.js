import { test } from "node:test";
import assert from "node:assert/strict";
import { RoomDO } from "../src/lib/room-do.js";

function socket() {
  return {
    attachment: null, messages: [],
    serializeAttachment(value) { this.attachment = structuredClone(value); },
    deserializeAttachment() { return this.attachment; },
    send(text) { this.messages.push(JSON.parse(text)); },
    close() {},
  };
}

async function setup() {
  const saved = new Map();
  const sockets = [socket(), socket()];
  const ctx = {
    storage: {
      async get(key) { return structuredClone(saved.get(key)); },
      async put(key, value) { saved.set(key, structuredClone(value)); },
      async setAlarm(time) { ctx.alarmAt = time; },
      async deleteAll() { saved.clear(); },
    },
    blockConcurrencyWhile(fn) { return fn(); },
    getWebSockets() { return sockets; },
  };
  const room = new RoomDO(ctx, {});
  const send = (data, ws = sockets[0]) => room.webSocketMessage(ws, JSON.stringify(data));
  await send({ type: "join", username: "Alice" });
  await send({ type: "join", username: "Bob" }, sockets[1]);
  const add = (id = "M7lc1UVf-VE") => send({ type: "add", url: "https://youtu.be/" + id });
  const control = (type, currentTime) => send({ type, currentTime, playbackId: room.state.playbackId, revision: room.state.revision });
  return { room, ctx, saved, send, sockets, add, control };
}

test("play, pause, and paused seek broadcast authoritative state to both viewers", async () => {
  const { room, add, control, sockets } = await setup();
  await add();
  await control("pause", 23);
  assert.equal(room.state.isPlaying, false);
  await control("seek", 80);
  for (const ws of sockets) {
    assert.equal(ws.messages.at(-1).currentTime, 80);
    assert.equal(ws.messages.at(-1).isPlaying, false);
  }
  await control("play", 80);
  assert.equal(room.state.isPlaying, true);
});

test("queue additions/removals and late joins preserve the running timeline", async () => {
  const { room, add, control, send, sockets } = await setup();
  await add();
  await control("seek", 40);
  room.state.updatedAt -= 10000;
  await add("dQw4w9WgXcQ");
  assert.ok(sockets[0].messages.at(-1).currentTime >= 50);
  const playbackId = room.state.playbackId;
  await send({ type: "remove", itemId: room.state.queue[1].id });
  assert.equal(room.state.playbackId, playbackId);
  assert.ok(sockets[0].messages.at(-1).currentTime >= 50);
  await send({ type: "join" }, sockets[1]);
  assert.ok(sockets[1].messages.findLast(m => m.type === "state").currentTime >= 50);
});

test("state and joined identities survive object reconstruction without another join", async () => {
  const { room, ctx, add, control, sockets } = await setup();
  await add();
  await control("pause", 42);
  const restored = new RoomDO(ctx, {});
  await restored.webSocketMessage(sockets[1], JSON.stringify({
    type: "seek", currentTime: 60, playbackId: room.state.playbackId, revision: room.state.revision,
  }));
  assert.equal(restored.state.currentTime, 60);
  assert.equal(restored.state.queue.length, 1);
  assert.equal(sockets[0].messages.at(-1).userCount, 2);
});

test("simultaneous end reports advance once, including duplicate video IDs", async () => {
  const { room, add, send, sockets } = await setup();
  await add(); await add(); await add("dQw4w9WgXcQ");
  const firstLoad = room.state.playbackId;
  await send({ type: "ended", playbackId: firstLoad, currentTime: 100 });
  await send({ type: "ended", playbackId: firstLoad, currentTime: 100 }, sockets[1]);
  assert.equal(room.state.currentIndex, 1);
  assert.notEqual(room.state.playbackId, firstLoad);
  assert.equal(room.state.queue[0].videoId, room.state.queue[1].videoId);
  assert.notEqual(room.state.queue[0].id, room.state.queue[1].id);
});

test("stale controls cannot change a newer playback or overwrite an accepted command", async () => {
  const { room, add, send, control } = await setup();
  await add(); await add("dQw4w9WgXcQ");
  const old = { playbackId: room.state.playbackId, revision: room.state.revision };
  await control("pause", 20);
  await send({ type: "seek", currentTime: 0, ...old });
  assert.equal(room.state.currentTime, 20);
  await send({ type: "next", playbackId: room.state.playbackId });
  await send({ type: "pause", currentTime: 20, ...old });
  assert.equal(room.state.isPlaying, true);
  assert.equal(room.state.currentIndex, 1);
});

test("concurrent removal uses item identity and clearing the room stops playback", async () => {
  const { room, add, send } = await setup();
  await add(); await add("dQw4w9WgXcQ");
  const first = room.state.queue[0].id;
  const second = room.state.queue[1].id;
  await send({ type: "remove", itemId: first });
  await send({ type: "remove", itemId: first });
  assert.equal(room.state.queue[0].id, second);
  await send({ type: "remove", itemId: second });
  assert.equal(room.state.currentIndex, -1);
  assert.equal(room.state.playbackId, null);
  assert.equal(room.state.isPlaying, false);
});

test("malformed messages and invalid times do not corrupt state", async () => {
  const { room, add, send, control, sockets } = await setup();
  await add();
  await control("pause", 10);
  for (const currentTime of [-1, "12", null, 999999999]) await control("seek", currentTime);
  for (const message of ["null", "[]", "{broken", "1"]) await room.webSocketMessage(sockets[0], message);
  await send({ type: "add", url: "https://evil.example/watch?v=M7lc1UVf-VE" });
  assert.equal(room.state.currentTime, 10);
  assert.equal(room.state.queue.length, 1);
});

test("supported YouTube URL forms are parsed and lookalike domains are rejected", async () => {
  const { room } = await setup();
  for (const url of [
    "https://www.youtube.com/watch?v=M7lc1UVf-VE&t=20",
    "https://youtu.be/M7lc1UVf-VE?si=abc",
    "https://m.youtube.com/shorts/M7lc1UVf-VE",
    "https://www.youtube.com/live/M7lc1UVf-VE",
    "https://www.youtube-nocookie.com/embed/M7lc1UVf-VE",
  ]) assert.equal(room._extractVideoId(url), "M7lc1UVf-VE");
  for (const url of ["https://youtube.com.evil.example/watch?v=M7lc1UVf-VE", "https://youtu.be/invalid", "file:///watch?v=M7lc1UVf-VE"]) {
    assert.equal(room._extractVideoId(url), null);
  }
});

test("last departure freezes the room instead of playing unattended", async () => {
  const { room, add, sockets } = await setup();
  await add();
  room.state.updatedAt -= 10000;
  await room.webSocketClose(sockets[0], 1000, "Leaving");
  assert.equal(room.state.isPlaying, true);
  await room.webSocketClose(sockets[1], 1000, "Leaving");
  assert.equal(room.state.isPlaying, false);
  assert.ok(room.state.currentTime >= 10);
});

test('member-room metadata survives hibernation and rejects unauthenticated admission', async () => {
  const { room, ctx } = await setup();
  const details = { slug: 'm-test', mode: 'member', ownerId: 'owner', title: 'Our room' };
  const initialized = await room.fetch(new Request('https://room.internal/initialize', { method: 'POST', body: JSON.stringify(details) }));
  assert.equal(initialized.status, 200);
  assert.equal((await room.fetch(new Request('https://room.internal/initialize', { method: 'POST', body: JSON.stringify(details) }))).status, 409);
  const restored = new RoomDO(ctx, {});
  assert.deepEqual(await (await restored.fetch(new Request('https://room.internal/info'))).json(), details);
  assert.equal((await restored.fetch(new Request('https://public.example/api/ws/m-test', { headers: { Upgrade: 'websocket' } }))).status, 401);
});
test('joining cannot replace an identity verified by the server', async () => {
  const { send, sockets } = await setup();
  sockets[0].serializeAttachment({ userId: 'verified-id', verifiedName: 'Verified Member', joined: false });
  await send({ type: 'join', username: 'Impersonator' });
  assert.equal(sockets[0].deserializeAttachment().username, 'Verified Member');
  assert.equal(sockets[0].deserializeAttachment().userId, 'verified-id');
  await send({ type: 'join', username: 'Another name' });
  assert.equal(sockets[0].deserializeAttachment().username, 'Verified Member');
});
test('saved room catalog deduplicates and survives object reconstruction', async () => {
  const { room, ctx } = await setup();
  const request = () => new Request('https://room.internal/catalog', { method: 'POST', body: JSON.stringify({ slug: 'm-one', title: 'Friday' }) });
  await room.fetch(request()); await room.fetch(request());
  const restored = new RoomDO(ctx, {});
  assert.deepEqual(await (await restored.fetch(new Request('https://room.internal/catalog'))).json(), [{ slug: 'm-one', title: 'Friday' }]);
});

test("unsaved rooms clear themselves once nobody has visited for 30 days", async () => {
  const { room, ctx, saved, add, sockets } = await setup();
  await add();
  await room.webSocketClose(sockets[1], 1000, "");
  assert.ok(ctx.alarmAt > Date.now() + RoomDO.GUEST_ROOM_TTL - 60000);
  await room.alarm();
  assert.ok(saved.has("room"), "a room with viewers connected is kept");
  sockets.length = 0;
  await room.alarm();
  assert.equal(saved.size, 0);
  assert.equal(room.state.queue.length, 0);
});

test("saved rooms never schedule or run cleanup", async () => {
  const { room, ctx, saved, add } = await setup();
  room.details = { mode: "member" };
  saved.set("details", room.details);
  ctx.alarmAt = undefined;
  await add();
  await room._departed();
  assert.equal(ctx.alarmAt, undefined);
  ctx.getWebSockets = () => [];
  await room.alarm();
  assert.ok(saved.has("room") && saved.has("details"));
});
