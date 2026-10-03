// One broadcaster, a few viewers. The room socket carries signaling only;
// picture and sound travel directly between browsers over WebRTC. No relay.
export class TabShare {
  constructor({ send, capture, createPeer, onChange = () => {}, onStream = () => {}, onError = () => {}, canWatch = () => true }) {
    Object.assign(this, { send, capture, createPeer, onChange, onStream, onError, canWatch });
    this.share = null;
    this.peerId = null;
    this.local = null;
    this.pending = null;
    this.peers = new Map();
    this.waiting = new Map();
    this.status = "";
    this.connected = false;
    this.generation = 0;
  }

  get hosting() { return !!this.share && this.share.hostId === this.peerId; }
  changed(status = this.status) { this.status = status; this.onChange(this); }

  async start() {
    if (!this.connected || this.share || this.pending) return;
    const generation = ++this.generation;
    this.pending = { id: crypto.randomUUID() };
    this.changed("Choose a browser tab and turn on Share tab audio.");
    try {
      // Called directly from the button gesture, before any network request.
      const stream = await this.capture();
      if (generation !== this.generation || !this.connected || this.share) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      const track = stream.getVideoTracks()[0];
      this.local = stream;
      if (!track || track.readyState === "ended") throw new Error("No shared picture was received. Choose a browser tab and try again.");
      track.contentHint = "motion";
      track.addEventListener("ended", () => this.stop(), { once: true });
      if (!this.send({ type: "share-start", requestId: this.pending.id, audio: stream.getAudioTracks().length > 0 })) {
        throw new Error("The room disconnected. Reconnect and share again.");
      }
      this.startTimer = setTimeout(() => { this.stop(); this.onError("The room did not respond. Try sharing again."); }, 12000);
      this.changed("Starting your shared tab…");
    } catch (error) {
      if (generation !== this.generation) return;
      this.stop();
      if (error.name !== "NotAllowedError" && error.name !== "AbortError") this.onError(error.message || "Tab sharing could not start. Try desktop Chrome.");
    }
  }

  update(room, connected = true) {
    this.connected = connected;
    this.peerId = room.peerId;
    const next = room.share || null;
    if (this.share?.id === next?.id) { this.share = next; this.changed(); return; }
    const ownCapture = next && next.hostId === this.peerId && this.pending?.id === next.requestId && this.local;
    this.resetPeers();
    if (!ownCapture) this.releaseCapture();
    this.share = next;
    if (!next) { this.changed(""); return; }
    if (next.hostId === this.peerId) {
      clearTimeout(this.startTimer);
      this.pending = null;
      if (!this.local) { this.send({ type: "share-stop", shareId: next.id }); return; }
      this.onStream(this.local, true);
      this.changed("You’re sharing. Scroll in the tab you selected.");
      void this.prepare(next.id);
    } else {
      this.changed("Connecting to " + next.name + "’s tab…");
      if (this.canWatch()) void this.prepare(next.id);
    }
  }

  async prepare(id) {
    if (this.preparing || this.prepared === id) return;
    this.preparing = true;
    this.prepared = id;
    try {
      this.config = await new Promise((resolve, reject) => {
        this.iceWait = { resolve, reject };
        this.iceTimer = setTimeout(() => reject(new Error("Could not set up sharing. Try reconnecting.")), 10000);
        if (!this.send({ type: "share-ice", shareId: id })) reject(new Error("The room disconnected."));
      });
      if (this.share?.id !== id) return;
      if (this.hosting) {
        for (const [viewer, connectionId] of this.waiting) void this.offer(viewer, connectionId);
        this.waiting.clear();
      } else this.watch();
    } catch (error) {
      if (this.share?.id === id) this.changed(error.message);
    } finally {
      // An older capture's completion must not clear a newer capture's waiter.
      if (this.share?.id === id) {
        clearTimeout(this.iceTimer);
        this.iceWait = null;
        this.preparing = false;
      }
    }
  }

  watch() {
    if (!this.share || this.hosting || !this.config || !this.canWatch()) return;
    this.closePeer(this.share.hostId);
    this.changed("Connecting to " + this.share.name + "’s tab…");
    this.connectionId = crypto.randomUUID();
    this.send({ type: "share-watch", shareId: this.share.id, connectionId: this.connectionId });
    clearTimeout(this.watchTimer);
    this.watchTimer = setTimeout(() => {
      if (this.status.startsWith("Connecting")) this.connectionFailed();
    }, 25000);
  }

  async handle(data) {
    if (data.type === "share-error") {
      if (this.pending && data.requestId === this.pending.id) { this.stop(); this.onError(data.message); }
      else if (this.iceWait) this.iceWait.reject(new Error(data.message));
      else this.changed(data.message);
      return;
    }
    if (!this.share || data.shareId !== this.share.id) return;
    if (data.type === "share-ice") {
      // Keep direct-only sharing even if an older server returns TURN credentials.
      this.iceWait?.resolve({ iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] });
    } else if (data.type === "share-viewer" && this.hosting) {
      if (!this.config) this.waiting.set(data.peerId, data.connectionId);
      else await this.offer(data.peerId, data.connectionId);
    } else if (data.type === "share-left") {
      this.waiting.delete(data.peerId);
      this.closePeer(data.peerId);
      this.changed();
    } else if (data.type === "share-signal") {
      await this.signal(data);
    }
  }

  makePeer(id, connectionId) {
    const pc = this.createPeer(this.config);
    const peer = { pc, id, connectionId, shareId: this.share.id, candidates: [], chain: Promise.resolve() };
    this.peers.set(id, peer);
    const current = () => this.share?.id === peer.shareId && this.peers.get(id) === peer;
    pc.onicecandidate = event => {
      if (current() && event.candidate) this.send({ type: "share-signal", shareId: peer.shareId, connectionId, to: id, candidate: event.candidate.toJSON() });
    };
    pc.ontrack = event => {
      if (!current() || this.hosting) return;
      if (event.streams[0]) this.onStream(event.streams[0], false);
    };
    pc.onconnectionstatechange = () => {
      if (!current()) return;
      clearTimeout(peer.disconnectTimer);
      if (pc.connectionState === "connected") {
        clearTimeout(this.watchTimer);
        this.changed(this.hosting ? "You’re sharing. Scroll in the tab you selected." : "Watching " + this.share.name + "’s tab");
      } else if (pc.connectionState === "failed") {
        this.closePeer(id);
        if (!this.hosting) this.connectionFailed();
        else this.changed("A viewer couldn’t connect. They can try Reconnect.");
      } else if (pc.connectionState === "disconnected") {
        peer.disconnectTimer = setTimeout(() => {
          if (!current()) return;
          this.closePeer(id);
          if (!this.hosting) this.connectionFailed();
        }, 10000);
      }
    };
    return peer;
  }

  async offer(id, connectionId) {
    if (!this.hosting || !this.local || !this.config) return;
    this.closePeer(id);
    const peer = this.makePeer(id, connectionId);
    try {
      for (const track of this.local.getTracks()) peer.pc.addTrack(track, this.local);
      const offer = await peer.pc.createOffer();
      if (this.peers.get(id) !== peer) return;
      await peer.pc.setLocalDescription(offer);
      if (this.peers.get(id) === peer) this.send({ type: "share-signal", shareId: peer.shareId, connectionId, to: id, description: peer.pc.localDescription.toJSON() });
    } catch {
      if (this.peers.get(id) === peer) { this.closePeer(id); this.changed("A viewer couldn’t connect. They can try Reconnect."); }
    }
  }

  async signal(data) {
    if (!this.config) return;
    if (!this.hosting && data.from !== this.share.hostId) return;
    if (!this.hosting && data.connectionId !== this.connectionId) return;
    let peer = this.peers.get(data.from);
    if (this.hosting && peer?.connectionId !== data.connectionId) return;
    if (!this.hosting && data.description?.type === "offer") {
      // ICE may arrive before the offer. Keep those candidates on the new peer.
      if (peer?.pc.remoteDescription) this.closePeer(data.from);
      peer = this.peers.get(data.from) || this.makePeer(data.from, data.connectionId);
    } else if (!peer && !this.hosting && data.candidate) peer = this.makePeer(data.from, data.connectionId);
    if (!peer) return;
    // Serialize each peer's async SDP/ICE operations to avoid candidate races.
    peer.chain = peer.chain.then(async () => {
      if (this.peers.get(data.from) !== peer) return;
      const pc = peer.pc;
      if (data.description) {
        if (data.description.type !== (this.hosting ? "answer" : "offer")) return;
        await pc.setRemoteDescription(data.description);
        for (const candidate of peer.candidates.splice(0)) await pc.addIceCandidate(candidate);
        if (!this.hosting) {
          await pc.setLocalDescription(await pc.createAnswer());
          if (this.peers.get(data.from) === peer) this.send({ type: "share-signal", shareId: peer.shareId, connectionId: peer.connectionId, to: data.from, description: pc.localDescription.toJSON() });
        }
      } else if (data.candidate) {
        if (pc.remoteDescription) await pc.addIceCandidate(data.candidate);
        else if (peer.candidates.length < 64) peer.candidates.push(data.candidate);
      }
    }).catch(() => {
      if (this.peers.get(data.from) !== peer) return;
      this.closePeer(data.from);
      if (!this.hosting) this.connectionFailed();
    });
    await peer.chain;
  }

  connectionFailed() {
    clearTimeout(this.watchTimer);
    this.changed("These networks couldn’t connect directly. Try Reconnect or another network.");
  }

  closePeer(id) {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    clearTimeout(peer.disconnectTimer);
    peer.pc.onicecandidate = peer.pc.ontrack = peer.pc.onconnectionstatechange = null;
    peer.pc.close();
  }

  resetPeers() {
    for (const id of this.peers.keys()) this.closePeer(id);
    this.waiting.clear();
    clearTimeout(this.watchTimer);
    clearTimeout(this.iceTimer);
    this.iceWait?.reject(new Error("Sharing stopped."));
    this.iceWait = null;
    this.config = null;
    this.preparing = false;
    this.prepared = null;
    this.onStream(null, false);
  }

  releaseCapture() {
    ++this.generation;
    clearTimeout(this.startTimer);
    this.pending = null;
    const stream = this.local;
    this.local = null;
    stream?.getTracks().forEach(track => track.stop());
  }

  stop() {
    if (this.hosting) this.send({ type: "share-stop", shareId: this.share.id });
    this.releaseCapture();
    this.resetPeers();
    this.changed("");
  }

  disconnect() {
    this.connected = false;
    this.share = null;
    this.releaseCapture();
    this.resetPeers();
    this.changed("");
  }
}
