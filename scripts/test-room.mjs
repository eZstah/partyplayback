import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import http from "node:http";
import https from "node:https";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:8787";
const slug = "integration-" + crypto.randomUUID();
const peers = [];

async function connect(room = slug) {
  const socket = new WebSocket(base.replace(/^http/, "ws") + "/api/ws/" + room);
  const messages = [];
  socket.addEventListener("message", event => messages.push(JSON.parse(event.data)));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("WebSocket connection timed out")), 10000);
    socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Start npm run preview before running the integration test")); }, { once: true });
  });
  const peer = {
    socket, messages,
    async wait(predicate, from = 0) {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const result = messages.slice(from).find(predicate);
        if (result) return result;
        await sleep(20);
      }
      throw new Error("Timed out waiting for room state: " + JSON.stringify(messages.slice(from)));
    },
    async send(data) {
      const from = messages.length;
      socket.send(JSON.stringify(data));
      return this.wait(message => message.type === "state" || message.type === "error", from);
    },
    async sync() { return this.send({ type: "sync", requestId: crypto.randomUUID() }); },
    async close() {
      if (socket.readyState === WebSocket.CLOSED) return;
      await new Promise(resolve => { socket.addEventListener("close", resolve, { once: true }); socket.close(1000, "Test complete"); });
    },
  };
  peers.push(peer);
  peer.state = await peer.send({ type: "join", username: "Test viewer" });
  return peer;
}

try {
  const post = (path, body, origin = base) => fetch(base + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post('/api/rooms', { mode: 'guest' }, 'https://unrelated.example')).status, 403);
  assert.equal((await post('/api/rooms', { mode: 'member' })).status, 401);
  assert.equal((await post('/auth/signin', { provider: 'google' }, 'https://unrelated.example')).status, 403);
  const guestResponse = await post('/api/rooms', { mode: 'guest' });
  assert.equal(guestResponse.status, 201);
  const guestRoom = await guestResponse.json();
  assert.ok(guestRoom.url.startsWith('/room/g-'));
  assert.match(guestRoom.room.title, /^(Cosmic|Cozy|Happy|Dreamy|Bouncy|Sunny|Lucky|Mellow) (Popcorn|Peaches|Waffles|Cookies|Noodles|Cherries|Pancakes|Mochi)$/);
  assert.ok((await (await fetch(base + guestRoom.url)).text()).includes(guestRoom.room.title));
  assert.deepEqual(await (await fetch(base + '/api/rooms')).json(), { rooms: [] });
  const callback = await fetch(base + '/auth/callback?next=https://unrelated.example', { redirect: 'manual' });
  assert.equal(callback.status, 303);
  assert.equal(callback.headers.get('Location'), '/?signin=1&auth_error=1');
  const page = await fetch(base + "/room/" + slug);
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes("Room playback controls"));
  assert.equal((await fetch(base + "/api/ws/" + slug)).status, 426);
  const badOriginStatus = await new Promise((resolve, reject) => {
    const transport = base.startsWith("https:") ? https : http;
    const request = transport.get(base + "/api/ws/" + slug, {
      headers: { Connection: "Upgrade", Upgrade: "websocket", Origin: "https://unrelated.example",
        "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": "cGFydHlwbGF5YmFja3Rlcw==" },
    }, response => { response.resume(); resolve(response.statusCode); });
    request.on("error", reject);
    request.on("upgrade", (response, socket) => { socket.destroy(); resolve(response.statusCode); });
    request.setTimeout(10000, () => request.destroy(new Error("Origin check timed out")));
  });
  assert.equal(badOriginStatus, 403);

  const a = await connect(), b = await connect();
  const add = id => a.send({ type: "add", url: "https://youtu.be/" + id, title: "Test video" });
  let state = await add("M7lc1UVf-VE");
  assert.equal(state.userCount, 2);
  const control = async (type, time) => {
    const result = await a.send({ type, currentTime: time, playbackId: state.playbackId, revision: state.revision });
    assert.equal(result.type, "state");
    state = result;
    await b.wait(message => message.type === "state" && message.revision === result.revision);
    return result;
  };
  await control("pause", 20);
  assert.equal((await b.sync()).isPlaying, false);
  await control("seek", 90);
  assert.equal((await b.sync()).currentTime, 90);
  await control("play", 90);
  assert.equal((await b.sync()).isPlaying, true);
  state = await add("M7lc1UVf-VE");
  state = await add("dQw4w9WgXcQ");
  assert.ok(state.currentTime >= 90);

  // Both clients report the same ending concurrently on real sockets.
  const ending = { type: "ended", playbackId: state.playbackId, currentTime: 100 };
  await Promise.all([a.send(ending), b.send(ending)]);
  state = await a.sync();
  assert.equal(state.currentIndex, 1);
  assert.equal(state.currentTime < 5, true);

  await control("seek", 45);
  const c = await connect();
  assert.equal(c.state.userCount, 3);
  assert.ok(c.state.currentTime >= 45 && c.state.currentTime < 50);
  const currentId = state.playbackId;
  state = await a.send({ type: "remove", itemId: state.queue[2].id });
  assert.equal(state.playbackId, currentId);
  assert.ok(state.currentTime >= 45);
  state = await a.send({ type: "remove", itemId: state.queue[0].id });
  assert.equal(state.playbackId, currentId);
  assert.equal(state.currentIndex, 0);

  await a.close(); await b.close();
  await c.wait(message => message.type === "users" && message.userCount === 1);
  await c.close();
  const rejoined = await connect();
  assert.equal(rejoined.state.isPlaying, false);
  assert.ok(rejoined.state.currentTime >= 45);
  const isolated = await connect(slug + "-other");
  assert.equal(isolated.state.queue.length, 0);
  state = await rejoined.send({ type: "remove", itemId: rejoined.state.queue[0].id });
  assert.equal(state.currentIndex, -1);
  assert.equal(state.isPlaying, false);

  console.log("PASS: guest creation, member-room auth guard, origin checks, safe callback, real Cloudflare sockets, two-way controls, seeking, queue edits, duplicate endings, late join, reconnect, and isolation");
} finally {
  await Promise.all(peers.map(peer => peer.close()));
}
