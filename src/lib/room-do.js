// Durable Object for PartyPlayback rooms.
// Plain JS — no compilation needed. Appended to the Astro worker bundle by scripts/post-build.mjs.
// One instance per room slug, keyed via idFromName(slug).

export class RoomDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;

    // Room state — kept in memory, intentionally ephemeral (lost when DO evicts)
    this.queue = [];          // Array<{videoId: string, title: string, url: string}>
    this.currentIndex = -1;   // -1 = nothing queued
    this.isPlaying = false;
    this.currentTime = 0;     // video seconds at the moment of lastTimeUpdate
    this.lastTimeUpdate = Date.now();

    // Per-connection data — not persisted across hibernation, rebuilt via 'join'
    this.sessions = new Map(); // WebSocket -> {username: string, sessionId: string}
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Hibernation API: DO can sleep between messages, saving resources
    this.ctx.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    let data;
    try {
      data = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
    } catch {
      return;
    }

    const session = this.sessions.get(ws);

    switch (data.type) {
      case "join": {
        const sessionId = (typeof data.sessionId === "string" ? data.sessionId : crypto.randomUUID()).slice(0, 64);
        const username = (typeof data.username === "string" ? data.username : "Guest").slice(0, 32) || "Guest";
        this.sessions.set(ws, { username, sessionId });

        // Compensate for elapsed time so late joiners sync correctly
        const adjustedTime = this.isPlaying
          ? this.currentTime + (Date.now() - this.lastTimeUpdate) / 1000
          : this.currentTime;

        ws.send(JSON.stringify({
          type: "state",
          queue: this.queue,
          currentIndex: this.currentIndex,
          isPlaying: this.isPlaying,
          currentTime: adjustedTime,
          userCount: this.ctx.getWebSockets().length,
        }));

        this._broadcastUserCount();
        break;
      }

      case "play": {
        if (!session) return;
        this.isPlaying = true;
        if (typeof data.currentTime === "number") {
          this.currentTime = data.currentTime;
          this.lastTimeUpdate = Date.now();
        }
        // Broadcast to others only — sender already applied this locally
        this._broadcast({ type: "play", currentTime: this.currentTime }, ws);
        break;
      }

      case "pause": {
        if (!session) return;
        this.isPlaying = false;
        if (typeof data.currentTime === "number") {
          this.currentTime = data.currentTime;
          this.lastTimeUpdate = Date.now();
        }
        this._broadcast({ type: "pause", currentTime: this.currentTime }, ws);
        break;
      }

      case "seek": {
        if (!session) return;
        if (typeof data.currentTime !== "number") return;
        this.currentTime = data.currentTime;
        this.lastTimeUpdate = Date.now();
        this._broadcast({ type: "seek", currentTime: this.currentTime }, ws);
        break;
      }

      case "add": {
        if (!session) return;
        const videoId = this._extractVideoId(data.url);
        if (!videoId) return;
        const title = (typeof data.title === "string" ? data.title : String(data.url || "")).slice(0, 200) || "Untitled";
        const url = String(data.url || "").slice(0, 500);
        this.queue.push({ videoId, title, url });

        // Auto-start if nothing is loaded yet
        if (this.currentIndex === -1) {
          this.currentIndex = 0;
          this.isPlaying = true;
          this.currentTime = 0;
          this.lastTimeUpdate = Date.now();
        }

        this._broadcastAll({
          type: "queue",
          queue: this.queue,
          currentIndex: this.currentIndex,
          isPlaying: this.isPlaying,
          currentTime: this.currentTime,
        });
        break;
      }

      case "remove": {
        if (!session) return;
        const idx = data.index;
        if (typeof idx !== "number" || idx < 0 || idx >= this.queue.length) return;
        this.queue.splice(idx, 1);

        if (this.queue.length === 0) {
          this.currentIndex = -1;
          this.isPlaying = false;
          this.currentTime = 0;
        } else if (idx < this.currentIndex) {
          this.currentIndex--;
        } else if (idx === this.currentIndex) {
          // Current video removed — stay at same index (now the next video)
          if (this.currentIndex >= this.queue.length) {
            this.currentIndex = this.queue.length - 1;
          }
          this.currentTime = 0;
          this.lastTimeUpdate = Date.now();
        }

        this._broadcastAll({
          type: "queue",
          queue: this.queue,
          currentIndex: this.currentIndex,
          isPlaying: this.isPlaying,
          currentTime: 0,
        });
        break;
      }

      case "next": {
        if (!session) return;
        if (this.currentIndex + 1 < this.queue.length) {
          this.currentIndex++;
          this.currentTime = 0;
          this.isPlaying = true;
          this.lastTimeUpdate = Date.now();
          this._broadcastAll({
            type: "queue",
            queue: this.queue,
            currentIndex: this.currentIndex,
            isPlaying: true,
            currentTime: 0,
          });
        } else {
          this.isPlaying = false;
          this._broadcastAll({ type: "ended" });
        }
        break;
      }
    }
  }

  async webSocketClose(ws) {
    this.sessions.delete(ws);
    this._broadcastUserCount();
  }

  async webSocketError(ws) {
    this.sessions.delete(ws);
  }

  _broadcast(msg, excludeWs) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== excludeWs) {
        try { ws.send(text); } catch {}
      }
    }
  }

  _broadcastAll(msg) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(text); } catch {}
    }
  }

  _broadcastUserCount() {
    this._broadcastAll({ type: "users", userCount: this.ctx.getWebSockets().length });
  }

  _extractVideoId(url) {
    try {
      const u = new URL(url);
      if (u.searchParams.has("v")) return u.searchParams.get("v");
      if (u.hostname === "youtu.be") return u.pathname.slice(1).split("?")[0] || null;
      const em = u.pathname.match(/\/embed\/([^/?]+)/);
      if (em) return em[1];
    } catch {}
    return null;
  }
}
