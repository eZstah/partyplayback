// Plain JS: exported from the worker by scripts/post-build.mjs.
export class RoomDO {
  static GUEST_ROOM_TTL = 30 * 24 * 60 * 60 * 1000;

  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.state = {
      queue: [], currentIndex: -1, isPlaying: false, currentTime: 0,
      updatedAt: Date.now(), playbackId: null, revision: 0,
    };
    // Room state and socket identities must survive WebSocket hibernation.
    this.ready = ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get("room");
      if (saved) this.state = saved;
      this.details = await ctx.storage.get("details") || null;
    });
  }

  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);
    // These calls are reachable only through the Worker's Durable Object binding.
    if (url.hostname === "room.internal") {
      if (url.pathname === "/info") return Response.json(this.details);
      if (url.pathname === "/initialize" && request.method === "POST") {
        if (this.details) return new Response("Room exists", { status: 409 });
        this.details = await request.json();
        await this.ctx.storage.put("details", this.details);
        await this._keepAlive();
        return Response.json({ ok: true });
      }
      if (url.pathname === "/catalog") {
        const rooms = await this.ctx.storage.get("catalog") || [];
        if (request.method === "POST") {
          const room = await request.json();
          if (!rooms.some(item => item.slug === room.slug) && rooms.length < 50) rooms.unshift(room);
          await this.ctx.storage.put("catalog", rooms);
        }
        return Response.json(rooms);
      }
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    const userId = request.headers.get("X-Party-User");
    if (this.details?.mode === "member" && !userId) return new Response("Sign in to join", { status: 401 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    await this._keepAlive();
    if (userId) server.serializeAttachment({ joined: false, userId, verifiedName: decodeURIComponent(request.headers.get("X-Party-Name") || "Member") });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    await this.ready;
    let data;
    try {
      const text = typeof message === "string" ? message : new TextDecoder().decode(message);
      if (text.length > 8192) return this._error(ws, "Message too large");
      data = JSON.parse(text);
      if (!data || typeof data !== "object" || Array.isArray(data)) return;
    } catch { return; }

    if (data.type === "join") {
      const identity = ws.deserializeAttachment();
      ws.serializeAttachment({
        joined: true, userId: identity?.userId, verifiedName: identity?.verifiedName,
        username: identity?.verifiedName || (typeof data.username === "string" ? data.username : "Guest").slice(0, 32) || "Guest",
        sessionId: (typeof data.sessionId === "string" ? data.sessionId : crypto.randomUUID()).slice(0, 64),
      });
      this._sendState(ws, data.requestId);
      this._broadcast({ type: "users", userCount: this._members().length });
      return;
    }
    if (!ws.deserializeAttachment()?.joined) return;
    if (data.type === "sync") {
      this._sendState(ws, data.requestId);
      return;
    }

    const s = this.state;
    switch (data.type) {
      case "play":
      case "pause":
      case "seek": {
        if (!this._matchesPlayback(data, true)) return this._sendState(ws);
        if (!this._validTime(data.currentTime)) return this._error(ws, "Invalid playback time");
        s.currentTime = data.currentTime;
        s.updatedAt = Date.now();
        if (data.type !== "seek") s.isPlaying = data.type === "play";
        break;
      }
      case "add": {
        const videoId = this._extractVideoId(data.url);
        if (!videoId) return this._error(ws, "Please use a valid YouTube video URL");
        if (s.queue.length >= 100) return this._error(ws, "The queue is full (100 videos)");
        s.queue.push({
          id: crypto.randomUUID(), videoId,
          title: (typeof data.title === "string" ? data.title : videoId).slice(0, 200) || videoId,
          url: "https://www.youtube.com/watch?v=" + videoId,
        });
        if (s.currentIndex === -1) this._load(0, true);
        break;
      }
      case "remove": {
        // Item identity avoids removing the wrong video after a concurrent edit.
        const index = s.queue.findIndex(item => item.id === data.itemId);
        if (index === -1) return this._sendState(ws);
        s.queue.splice(index, 1);
        if (!s.queue.length) {
          Object.assign(s, { currentIndex: -1, isPlaying: false, currentTime: 0, updatedAt: Date.now(), playbackId: null });
        } else if (index < s.currentIndex) {
          s.currentIndex--;
        } else if (index === s.currentIndex) {
          this._load(Math.min(index, s.queue.length - 1), s.isPlaying);
        }
        break;
      }
      case "next":
      case "ended": {
        // Load identities distinguish consecutive copies and reject late end reports.
        if (!this._matchesPlayback(data) || (data.type === "ended" && !s.isPlaying)) {
          return this._sendState(ws);
        }
        if (s.currentIndex + 1 < s.queue.length) this._load(s.currentIndex + 1, true);
        else {
          s.currentTime = this._validTime(data.currentTime) ? data.currentTime : this._time();
          s.updatedAt = Date.now();
          s.isPlaying = false;
          s.playbackId = crypto.randomUUID();
        }
        break;
      }
      default: return;
    }
    s.revision++;
    await this.ctx.storage.put("room", s);
    this._broadcast(this._snapshot());
  }

  _matchesPlayback(data, checkRevision = false) {
    return this.state.currentIndex >= 0 && data.playbackId === this.state.playbackId &&
      (!checkRevision || data.revision === this.state.revision);
  }

  _validTime(value) { return Number.isFinite(value) && value >= 0 && value <= 604800; }

  _load(index, isPlaying) {
    Object.assign(this.state, {
      currentIndex: index, currentTime: 0, updatedAt: Date.now(),
      isPlaying, playbackId: crypto.randomUUID(),
    });
  }

  _time() {
    return this.state.currentTime + (this.state.isPlaying ? Math.max(0, Date.now() - this.state.updatedAt) / 1000 : 0);
  }

  _snapshot(requestId) {
    return {
      ...this.state, type: "state", currentTime: this._time(),
      serverTime: Date.now(), userCount: this._members().length,
      ...(typeof requestId === "string" ? { requestId: requestId.slice(0, 64) } : {}),
    };
  }

  _sendState(ws, requestId) { this._send(ws, this._snapshot(requestId)); }
  _error(ws, message) { this._send(ws, { type: "error", message }); }
  _send(ws, data) { try { ws.send(JSON.stringify(data)); } catch {} }
  _members() { return this.ctx.getWebSockets().filter(ws => ws.deserializeAttachment()?.joined); }
  _broadcast(data) { for (const ws of this._members()) this._send(ws, data); }

  async webSocketClose(ws, code, reason) {
    await this.ready;
    ws.serializeAttachment(null);
    // Required with the project's pre-April-2026 compatibility date.
    try { ws.close(code === 1005 ? 1000 : code, reason); } catch {}
    await this._departed();
  }

  async webSocketError(ws) {
    await this.ready;
    ws.serializeAttachment(null);
    try { ws.close(1011, "Connection error"); } catch {}
    await this._departed();
  }

  async _departed() {
    if (!this._members().length && this.state.isPlaying) {
      this.state.currentTime = this._time();
      this.state.updatedAt = Date.now();
      this.state.isPlaying = false;
      this.state.revision++;
      await this.ctx.storage.put("room", this.state);
    }
    this._broadcast({ type: "users", userCount: this._members().length });
    await this._keepAlive();
  }

  // Unsaved rooms are cleared once nobody has opened them for a while.
  // Saved (member) rooms and account catalogs never schedule an alarm.
  async _keepAlive() {
    if (this.details?.mode === "member") return;
    await this.ctx.storage.setAlarm(Date.now() + RoomDO.GUEST_ROOM_TTL);
  }

  async alarm() {
    await this.ready;
    if (this.details?.mode === "member") return;
    if (this.ctx.getWebSockets().length) return this._keepAlive();
    await this.ctx.storage.deleteAll();
    this.details = null;
    this.state = { queue: [], currentIndex: -1, isPlaying: false, currentTime: 0, updatedAt: Date.now(), playbackId: null, revision: 0 };
  }

  _extractVideoId(value) {
    if (typeof value !== "string" || value.length > 500) return null;
    try {
      const url = new URL(value);
      if (!["https:", "http:"].includes(url.protocol)) return null;
      let id;
      if (url.hostname === "youtu.be") id = url.pathname.slice(1);
      else if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(url.hostname)) {
        id = url.pathname === "/watch" ? url.searchParams.get("v") : url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)\/?$/)?.[1];
      }
      return typeof id === "string" && /^[\w-]{11}$/.test(id) ? id : null;
    } catch { return null; }
  }
}
