import { test } from "node:test";
import assert from "node:assert/strict";
import { TabShare } from "../src/lib/tab-share.js";

const flush = () => new Promise(resolve => setImmediate(resolve));

test("no broadcast while selecting an area; cancellation aborts capture preparation", async () => {
  let signal;
  const { share, sent, errors } = setup(options => new Promise((resolve, reject) => {
    signal = options.signal;
    signal.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")));
  }));
  const starting = share.start();
  assert.equal(sent.length, 0);
  share.disconnect();
  await starting;
  assert.equal(signal.aborted, true);
  assert.deepEqual(errors, []);
});

test("stopping a cropped broadcast releases its source and worker once", async () => {
  const output = media(), source = media();
  let releases = 0;
  const { share, active, ice, peers } = setup(async () => ({ stream: output, stop: () => {
    releases++; source.track.stop(); output.track.stop();
  } }));
  await share.start();
  share.update({ peerId: "self", share: active() });
  await ice(); await flush();
  await share.handle({ type: "share-viewer", shareId: "capture-1", peerId: "viewer", connectionId: "cropped" });
  assert.deepEqual(peers[0].tracks, [output.track]);
  assert.ok(!peers[0].tracks.includes(source.track));
  share.stop(); share.disconnect();
  assert.equal(source.track.readyState, "ended");
  assert.equal(releases, 1);
});

test("late cropped preparation after cancellation runs its full cleanup", async () => {
  let finish, releases = 0;
  const output = media();
  const { share, sent } = setup(() => new Promise(resolve => { finish = resolve; }));
  const starting = share.start();
  share.stop();
  finish({ stream: output, stop: () => { releases++; output.track.stop(); } });
  await starting;
  assert.equal(releases, 1);
  assert.equal(sent.length, 0);
  assert.equal(output.track.readyState, "ended");
});
function media() {
  const track = new EventTarget();
  Object.assign(track, { readyState: "live", stop() { this.readyState = "ended"; } });
  return { track, getTracks: () => [track], getVideoTracks: () => [track], getAudioTracks: () => [] };
}
function fakePeer() {
  return {
    connectionState: "new", remoteDescription: null, localDescription: null, tracks: [], candidates: [], closed: false,
    addTrack(track) { this.tracks.push(track); },
    getSenders() { return this.tracks.map(track => ({ track })); },
    async createOffer() { return { type: "offer", sdp: "test offer" }; },
    async createAnswer() { return { type: "answer", sdp: "test answer" }; },
    async setLocalDescription(description) { this.localDescription = { ...description, toJSON: () => description }; },
    async setRemoteDescription(description) { this.remoteDescription = description; },
    async addIceCandidate(candidate) { this.candidates.push(candidate); },
    close() { this.closed = true; },
  };
}
function setup(capture) {
  const stream = media(), sent = [], streams = [], errors = [], peers = [];
  const share = new TabShare({ send: data => { sent.push(data); return true; }, capture: capture || (async () => stream),
    createPeer: config => { const peer = { ...fakePeer(), config }; peers.push(peer); return peer; },
    onStream: (stream, local) => streams.push({ stream, local }), onError: error => errors.push(error) });
  share.update({ peerId: "self", share: null });
  const active = () => ({ id: "capture-1", hostId: "self", name: "Alice", requestId: share.pending.id, audio: false });
  const ice = () => share.handle({ type: "share-ice", shareId: "capture-1", iceServers: [], relay: false });
  return { share, stream, sent, streams, errors, peers, active, ice };
}

test("cancelling the picker is quiet and cancelling an outstanding capture stops late tracks", async () => {
  const denied = setup(async () => { throw new DOMException("cancelled", "NotAllowedError"); });
  await denied.share.start();
  assert.equal(denied.share.pending, null);
  assert.deepEqual(denied.errors, []);
  let complete;
  const { share, stream, sent } = setup(() => new Promise(resolve => { complete = resolve; }));
  const starting = share.start();
  share.stop();
  complete(stream);
  await starting;
  assert.equal(stream.track.readyState, "ended");
  assert.equal(sent.length, 0);
});

test("a late start acknowledgement after cancellation cannot leave an empty broadcast", async () => {
  const { share, active, stream, sent } = setup();
  await share.start();
  const state = active();
  share.stop();
  share.update({ peerId: "self", share: state });
  assert.equal(stream.track.readyState, "ended");
  assert.equal(sent.at(-1).type, "share-stop");
  share.disconnect();
});

test("host shares tracks with late viewers and browser Stop sharing closes everything", async () => {
  const { share, stream, active, ice, peers, streams, sent } = setup();
  await share.start();
  share.update({ peerId: "self", share: active() });
  assert.equal(streams.at(-1).local, true);
  await share.handle({ type: "share-viewer", connectionId: "connection-1", shareId: "capture-1", peerId: "viewer" });
  assert.equal(peers.length, 0);
  await ice(); await flush();
  assert.deepEqual(peers[0].tracks, [stream.track]);
  assert.equal(sent.at(-1).description.type, "offer");
  stream.track.dispatchEvent(new Event("ended"));
  assert.equal(stream.track.readyState, "ended");
  assert.equal(peers[0].closed, true);
  assert.equal(sent.at(-1).type, "share-stop");
  share.disconnect();
});

test("viewer queues early ICE, answers the offer and ignores an older share", async () => {
  const { share, ice, sent, peers } = setup();
  share.update({ peerId: "self", share: { id: "capture-1", hostId: "host", name: "Alice" } });
  await ice(); await flush();
  assert.equal(sent.at(-1).type, "share-watch");
  share.connectionId = "connection-1";
  const candidate = { candidate: "candidate:1" };
  await share.handle({ type: "share-signal", connectionId: "connection-1", shareId: "capture-1", from: "host", candidate });
  assert.equal(peers[0].candidates.length, 0);
  await share.handle({ type: "share-signal", connectionId: "connection-1", shareId: "capture-1", from: "host", description: { type: "offer", sdp: "v=0" } });
  assert.deepEqual(peers[0].candidates, [candidate]);
  assert.equal(sent.at(-1).description.type, "answer");
  await share.handle({ type: "share-signal", connectionId: "connection-1", shareId: "old-capture", from: "host", candidate });
  assert.equal(peers[0].candidates.length, 1);
  share.watch();
  await share.handle({ type: "share-signal", connectionId: "connection-1", shareId: "capture-1", from: "host", candidate });
  assert.equal(share.peers.size, 0, "late ICE from before Reconnect is discarded");
  share.disconnect();
  assert.equal(peers[0].closed, true);
});

test("host applies video quality after the answer, and unsupported hints keep the viewer connected", async () => {
  const { share, active, ice, peers } = setup();
  await share.start();
  share.update({ peerId: "self", share: active() });
  await ice(); await flush();
  await share.handle({ type: "share-viewer", shareId: "capture-1", peerId: "viewer", connectionId: "quality" });
  const pc = peers[0];
  let attempted = false;
  pc.getSenders = () => [{
    track: { kind: "video", getSettings: () => ({ width: 546, height: 972 }) },
    getParameters() { assert.equal(pc.remoteDescription.type, "answer"); return { encodings: [{}] }; },
    async setParameters() { attempted = true; throw new Error("unsupported"); },
  }];
  await share.handle({ type: "share-signal", shareId: "capture-1", from: "viewer", connectionId: "quality", description: { type: "answer", sdp: "v=0" } });
  assert.equal(attempted, true);
  assert.equal(pc.closed, false);
  share.disconnect();
});

test("losing the room while picking a tab stops the late capture", async () => {
  let complete;
  const { share, stream, sent } = setup(() => new Promise(resolve => { complete = resolve; }));
  const starting = share.start();
  share.disconnect();
  complete(stream);
  await starting;
  assert.equal(stream.track.readyState, "ended");
  assert.equal(sent.length, 0);
});

test("an older server cannot enable a paid relay on a peer connection", async () => {
  const { share, peers } = setup();
  share.update({ peerId: "self", share: { id: "capture-1", hostId: "host", name: "Alice" } });
  await share.handle({ type: "share-ice", shareId: "capture-1", relay: true,
    iceServers: [{ urls: "turn:turn.cloudflare.com:3478", username: "legacy", credential: "temporary" }] });
  await flush();
  await share.handle({ type: "share-signal", shareId: "capture-1", connectionId: share.connectionId,
    from: "host", description: { type: "offer", sdp: "v=0" } });
  assert.deepEqual(peers[0].config, { iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] });
  peers[0].connectionState = "failed";
  peers[0].onconnectionstatechange();
  assert.match(share.status, /couldn’t connect directly/);
  share.disconnect();
});

test("a new sharer supersedes a pending local picker without leaking capture", async () => {
  let complete;
  const { share, stream, sent } = setup(() => new Promise(resolve => { complete = resolve; }));
  const starting = share.start();
  share.update({ peerId: "self", share: { id: "another", hostId: "other", name: "Bob" } });
  complete(stream);
  await starting;
  assert.equal(stream.track.readyState, "ended");
  assert.equal(sent.some(data => data.type === "share-start"), false);
  share.disconnect();
});
