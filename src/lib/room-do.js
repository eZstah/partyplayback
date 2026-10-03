// Plain JS: exported from the worker by scripts/post-build.mjs.
export class RoomDO {
  static GUEST_ROOM_TTL = 30 * 24 * 60 * 60 * 1000;
  // SponsorBlock categories a room can skip, in the order the room settings list them.
  static SKIP_CATEGORIES = ["sponsor", "selfpromo", "interaction", "intro", "outro", "preview", "music_offtopic", "filler"];
  static DEFAULT_SKIP = ["sponsor", "selfpromo", "interaction"];
  // Shorter jumps fall inside the players' drift tolerance and would desync them.
  static MIN_SEGMENT = 2;

  static initialState() {
    return {
      queue: [], currentIndex: -1, isPlaying: false, currentTime: 0,
      updatedAt: Date.now(), playbackId: null, revision: 0, autoClear: false,
      sponsorSkip: { enabled: true, categories: [...RoomDO.DEFAULT_SKIP] },
      segments: [], segmentsFor: null, skipFrom: 0,
    };
  }

  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.state = RoomDO.initialState();
    // Room state and socket identities must survive WebSocket hibernation.
    this.ready = ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get("room");
      if (saved) this.state = { ...this.state, ...saved };
      this.details = await ctx.storage.get("details") || null;
      // Rooms from before skip alarms existed keep a full TTL from their next wake.
      this.expiresAt = await ctx.storage.get("expiresAt") || Date.now() + RoomDO.GUEST_ROOM_TTL;
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
      // Other people's saved rooms this account has joined, most recent first.
      if (url.pathname === "/joined") {
        let rooms = await this.ctx.storage.get("joined") || [];
        if (request.method === "POST") {
          const room = await request.json();
          rooms = [room, ...rooms.filter(item => item.slug !== room.slug)].slice(0, 20);
          await this.ctx.storage.put("joined", rooms);
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
    if (userId) server.serializeAttachment({
      joined: false, userId, verifiedName: decodeURIComponent(request.headers.get("X-Party-Name") || "Member"),
      avatar: this._avatar(request.headers.get("X-Party-Avatar")),
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    await this.ready;
    let data;
    try {
      const text = typeof message === "string" ? message : new TextDecoder().decode(message);
      if (text.length > 32768) return this._error(ws, "Message too large");
      data = JSON.parse(text);
      if (!data || typeof data !== "object" || Array.isArray(data)) return;
      if (text.length > 8192 && data.type !== "share-signal") return this._error(ws, "Message too large");
    } catch { return; }

    if (data.type === "join") {
      const identity = ws.deserializeAttachment();
      ws.serializeAttachment({
        ...identity,
        joined: true, userId: identity?.userId, verifiedName: identity?.verifiedName, avatar: identity?.avatar || null,
        peerId: identity?.peerId || crypto.randomUUID(),
        username: identity?.verifiedName || (typeof data.username === "string" ? data.username : "Guest").slice(0, 32) || "Guest",
        sessionId: identity?.sessionId || (typeof data.sessionId === "string" ? data.sessionId : crypto.randomUUID()).slice(0, 64),
        joinedAt: identity?.joinedAt || Date.now(),
      });
      this._sendState(ws, data.requestId);
      this._broadcastUsers();
      this.lookup = this._findSegments().catch(() => {});
      return;
    }
    if (!ws.deserializeAttachment()?.joined) return;
    if (data.type === "sync") {
      this._sendState(ws, data.requestId);
      return;
    }
    if (typeof data.type === "string" && data.type.startsWith("share-")) return this._shareMessage(ws, data);
    // A shared tab owns the stage. Keep the YouTube timeline paused until it ends,
    // including commands from older clients or viewers in Aquarium.
    if (this._share() && ["play", "pause", "seek", "select", "next", "ended"].includes(data.type)) return this._sendState(ws);

    const s = this.state;
    switch (data.type) {
      case "auto-clear": {
        if (typeof data.enabled !== "boolean") return this._error(ws, "Invalid Auto-clear setting");
        if (s.autoClear === data.enabled) return this._sendState(ws);
        s.autoClear = data.enabled;
        break;
      }
      case "sponsor-skip": {
        const enabled = data.enabled ?? s.sponsorSkip.enabled;
        const categories = data.categories ?? s.sponsorSkip.categories;
        if (typeof enabled !== "boolean" || !Array.isArray(categories) || categories.length > 20 ||
          categories.some(category => !RoomDO.SKIP_CATEGORIES.includes(category))) {
          return this._error(ws, "Invalid sponsor skip setting");
        }
        s.sponsorSkip = { enabled, categories: RoomDO.SKIP_CATEGORIES.filter(category => categories.includes(category)) };
        break;
      }
      case "play":
      case "pause":
      case "seek": {
        if (!this._matchesPlayback(data, true)) return this._sendState(ws);
        if (!this._validTime(data.currentTime)) return this._error(ws, "Invalid playback time");
        s.currentTime = data.currentTime;
        s.updatedAt = Date.now();
        // Seeking into a segment means someone wants to watch it.
        if (data.type === "seek") s.skipFrom = data.currentTime;
        if (data.type !== "seek") s.isPlaying = data.type === "play";
        if (data.type === "pause") s.pausedBy = ws.deserializeAttachment().username;
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
        if (s.currentIndex === -1) this._load(0, !this._share());
        break;
      }
      case "remove": {
        // Item identity avoids removing the wrong video after a concurrent edit.
        const index = s.queue.findIndex(item => item.id === data.itemId);
        if (index === -1) return this._sendState(ws);
        s.queue.splice(index, 1);
        if (!s.queue.length) {
          Object.assign(s, { currentIndex: -1, isPlaying: false, currentTime: 0, updatedAt: Date.now(), playbackId: null, segments: [], segmentsFor: null });
        } else if (index < s.currentIndex) {
          s.currentIndex--;
        } else if (index === s.currentIndex) {
          this._load(Math.min(index, s.queue.length - 1), s.isPlaying);
        }
        break;
      }
      case "select": {
        // Resolve the item on the server: queue positions can change between clicks.
        let index = s.queue.findIndex(item => item.id === data.itemId);
        if (index === -1 || (index === s.currentIndex && s.isPlaying)) return this._sendState(ws);
        if (index === s.currentIndex) {
          s.isPlaying = true;
          s.updatedAt = Date.now();
        } else {
          if (s.autoClear && s.currentIndex >= 0) {
            s.queue.splice(s.currentIndex, 1);
            index = s.queue.findIndex(item => item.id === data.itemId);
          }
          this._load(index, true);
        }
        break;
      }
      case "next":
      case "ended": {
        // Load identities distinguish consecutive copies and reject late end reports.
        if (!this._matchesPlayback(data) || (data.type === "ended" && !s.isPlaying)) {
          return this._sendState(ws);
        }
        if (s.autoClear) {
          const index = s.currentIndex;
          s.queue.splice(index, 1);
          if (index < s.queue.length) this._load(index, true);
          else Object.assign(s, { currentIndex: -1, currentTime: 0, isPlaying: false, updatedAt: Date.now(), playbackId: null });
        } else if (s.currentIndex + 1 < s.queue.length) this._load(s.currentIndex + 1, true);
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
    // Only an explicit pause names who paused; anything else that stops playback doesn't.
    if (s.isPlaying || data.type === "next" || data.type === "ended" || s.currentIndex === -1) s.pausedBy = null;
    s.revision++;
    await this.ctx.storage.put("room", s);
    this._broadcast(ws => this._snapshot(undefined, ws));
    await this._schedule();
    this.lookup = this._findSegments().catch(() => {});
  }

  // SponsorBlock lookups use a hash prefix, so the API never learns which video a
  // room watches. Results are cached per video in this data center's cache.
  static async lookupSegments(videoId) {
    const cache = globalThis.caches?.default;
    const key = "https://youple.tv/__sponsorblock/v1/" + videoId;
    const hit = await cache?.match(key).catch(() => null);
    if (hit) return hit.json();
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(videoId)));
    const prefix = [...digest.slice(0, 2)].map(byte => byte.toString(16).padStart(2, "0")).join("");
    const response = await fetch("https://sponsor.ajay.app/api/skipSegments/" + prefix + "?actionType=skip&categories=" +
      encodeURIComponent(JSON.stringify(RoomDO.SKIP_CATEGORIES)), {
      headers: { "User-Agent": "youple.tv (https://youple.tv/about)" }, signal: AbortSignal.timeout(5000),
    });
    // 404 means SponsorBlock has nothing for any video with this prefix.
    if (response.status !== 200 && response.status !== 404) throw new Error("SponsorBlock answered " + response.status);
    const videos = response.status === 200 ? await response.json() : [];
    const found = Array.isArray(videos) ? videos.find(video => video?.videoID === videoId)?.segments : null;
    const segments = (Array.isArray(found) ? found : [])
      .filter(item => item?.actionType === "skip" && RoomDO.SKIP_CATEGORIES.includes(item.category) && Array.isArray(item.segment))
      .map(item => ({ start: Number(item.segment[0]), end: Number(item.segment[1]), category: item.category }))
      .filter(item => Number.isFinite(item.start) && item.start >= 0 && item.end - item.start >= RoomDO.MIN_SEGMENT)
      .sort((a, b) => a.start - b.start).slice(0, 50);
    await cache?.put(key, new Response(JSON.stringify(segments), {
      headers: { "Content-Type": "application/json", "Cache-Control": "max-age=" + (segments.length ? 21600 : 3600) },
    })).catch(() => {});
    return segments;
  }

  async _findSegments() {
    const s = this.state;
    const videoId = s.queue[s.currentIndex]?.videoId;
    if (!videoId || !s.sponsorSkip.enabled || s.segmentsFor === videoId || this.lookingUp === videoId || this.lookupFailed === videoId) return;
    this.lookingUp = videoId;
    let segments = null;
    try { segments = await RoomDO.lookupSegments(videoId); } catch {}
    if (this.lookingUp === videoId) this.lookingUp = null;
    // A failed lookup isn't retried for this video, so a struggling API isn't hammered.
    if (!segments) { this.lookupFailed = videoId; return; }
    if (s.queue[s.currentIndex]?.videoId !== videoId) return;
    s.segments = segments;
    s.segmentsFor = videoId;
    await this.ctx.storage.put("room", s);
    // An intro at 0:00 is already due by the time its segments arrive.
    const skipped = await this._skipDue();
    this._broadcast(ws => this._snapshot(undefined, ws));
    if (skipped) this._broadcast({ type: "skipped", skips: skipped });
    await this._schedule();
  }

  // The next segment the room will jump over, with the wall-clock time it starts.
  _nextSkip() {
    const s = this.state;
    if (!s.isPlaying || !s.sponsorSkip.enabled || !s.segmentsFor || s.segmentsFor !== s.queue[s.currentIndex]?.videoId) return null;
    const now = this._time();
    let next = null;
    for (const segment of s.segments) {
      if (!s.sponsorSkip.categories.includes(segment.category) || segment.start < s.skipFrom - 0.5 || segment.end <= now + 1) continue;
      if (!next || segment.start < next.start) next = segment;
    }
    return next && { ...next, at: Date.now() + Math.max(0, next.start - now) * 1000 };
  }

  // One authoritative jump for the whole room; players follow it like any seek.
  async _skipDue() {
    const s = this.state;
    const skipped = [];
    for (let next = this._nextSkip(); next && next.at <= Date.now() + 250 && skipped.length < 10; next = this._nextSkip()) {
      skipped.push({ category: next.category, from: this._time(), to: next.end });
      s.currentTime = Math.min(next.end, 604800);
      s.updatedAt = Date.now();
      // Overlapping segments that start later still count.
      s.skipFrom = next.start;
    }
    if (!skipped.length) return null;
    s.revision++;
    await this.ctx.storage.put("room", s);
    return skipped;
  }

  // One alarm serves both the next skip and guest-room expiry.
  async _schedule() {
    const expiry = this.details?.mode === "member" ? Infinity : this.expiresAt;
    const at = Math.min(this._nextSkip()?.at ?? Infinity, expiry);
    if (at === this.alarmAt) return;
    this.alarmAt = at;
    if (at === Infinity) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(at);
  }

  _matchesPlayback(data, checkRevision = false) {
    return this.state.currentIndex >= 0 && data.playbackId === this.state.playbackId &&
      (!checkRevision || data.revision === this.state.revision);
  }

  _validTime(value) { return Number.isFinite(value) && value >= 0 && value <= 604800; }

  _load(index, isPlaying) {
    const videoId = this.state.queue[index]?.videoId;
    Object.assign(this.state, {
      currentIndex: index, currentTime: 0, updatedAt: Date.now(),
      isPlaying, playbackId: crypto.randomUUID(), skipFrom: 0,
    });
    if (videoId !== this.state.segmentsFor) Object.assign(this.state, { segments: [], segmentsFor: null });
  }

  _time() {
    return this.state.currentTime + (this.state.isPlaying ? Math.max(0, Date.now() - this.state.updatedAt) / 1000 : 0);
  }

  _snapshot(requestId, ws) {
    const members = this._people(ws);
    return {
      ...this.state, type: "state", currentTime: this._time(),
      serverTime: Date.now(), userCount: members.length, members,
      peerId: ws?.deserializeAttachment()?.peerId, share: this._share(),
      ...(typeof requestId === "string" ? { requestId: requestId.slice(0, 64) } : {}),
    };
  }

  // One entry per person: several tabs of the same account or session count once.
  // Account ids and session ids stay on the server; `you` marks the recipient.
  _people(viewer) {
    const own = viewer?.deserializeAttachment();
    const people = new Map();
    for (const ws of this._members()) {
      const member = ws.deserializeAttachment();
      const key = member.userId ? "u:" + member.userId : "s:" + member.sessionId;
      const person = people.get(key);
      if (person && person.joinedAt <= member.joinedAt) continue;
      people.set(key, {
        joinedAt: member.joinedAt || 0, name: member.username, avatar: member.avatar || null,
        member: !!member.userId,
        you: !!own && (member.userId ? member.userId === own.userId : member.sessionId === own.sessionId),
      });
    }
    return [...people.values()].sort((a, b) => a.joinedAt - b.joinedAt)
      .map(({ joinedAt, ...person }, index) => ({ id: index, ...person }));
  }

  _avatar(value) {
    if (typeof value !== "string" || value.length > 1000) return null;
    try { return new URL(value).protocol === "https:" ? value : null; } catch { return null; }
  }

  _sendState(ws, requestId) { this._send(ws, this._snapshot(requestId, ws)); }
  _error(ws, message) { this._send(ws, { type: "error", message }); }
  _send(ws, data) { try { ws.send(JSON.stringify(data)); } catch {} }
  _members() { return this.ctx.getWebSockets().filter(ws => ws.deserializeAttachment()?.joined); }
  _broadcast(data) { for (const ws of this._members()) this._send(ws, typeof data === "function" ? data(ws) : data); }
  _broadcastUsers() {
    this._broadcast(ws => {
      const members = this._people(ws);
      return { type: "users", userCount: members.length, members };
    });
  }

  async webSocketClose(ws, code, reason) {
    await this.ready;
    const leaving = ws.deserializeAttachment();
    ws.serializeAttachment(null);
    // Required with the project's pre-April-2026 compatibility date.
    try { ws.close(code === 1005 ? 1000 : code, reason); } catch {}
    await this._shareDeparted(leaving);
    await this._departed();
  }

  async webSocketError(ws) {
    await this.ready;
    const leaving = ws.deserializeAttachment();
    ws.serializeAttachment(null);
    try { ws.close(1011, "Connection error"); } catch {}
    await this._shareDeparted(leaving);
    await this._departed();
  }

  async _departed() {
    if (!this._members().length && this.state.isPlaying) {
      this.state.currentTime = this._time();
      this.state.updatedAt = Date.now();
      this.state.isPlaying = false;
      this.state.pausedBy = null;
      this.state.revision++;
      await this.ctx.storage.put("room", this.state);
    }
    this._broadcastUsers();
    await this._keepAlive();
  }

  // Capture is tied to one live socket, never to a user-supplied session id.
  // Attachments keep ownership through hibernation without persisting SDP/media.
  _share() {
    const host = this._members().map(ws => ws.deserializeAttachment()).find(person => person.sharing);
    return host ? { ...host.sharing, hostId: host.peerId, name: host.username } : null;
  }

  async _shareChanged() {
    this.state.revision++;
    await this.ctx.storage.put("room", this.state);
    this._broadcast(ws => this._snapshot(undefined, ws));
    await this._schedule();
  }

  _clearViewers() {
    for (const ws of this._members()) {
      const person = ws.deserializeAttachment();
      if (person.watching) ws.serializeAttachment({ ...person, watching: null });
    }
  }

  async _shareDeparted(person) {
    if (person?.sharing) {
      this._clearViewers();
      await this._shareChanged();
    } else if (person?.watching) {
      const host = this._members().find(ws => ws.deserializeAttachment().sharing?.id === person.watching);
      if (host) this._send(host, { type: "share-left", shareId: person.watching, peerId: person.peerId });
    }
  }

  async _shareMessage(ws, data) {
    let person = ws.deserializeAttachment();
    const share = this._share();
    const fail = message => this._send(ws, { type: "share-error", requestId: data.requestId, message });
    // ICE candidates arrive in bursts. Bound signaling without storing its payload.
    const now = Date.now();
    const rate = person.shareRate?.at > now - 10000 ? person.shareRate : { at: now, count: 0 };
    if (++rate.count > 120) return;
    person = { ...person, shareRate: rate };
    ws.serializeAttachment(person);
    if (data.type === "share-start") {
      if (share) return fail("Someone is already sharing. Wait for them to stop.");
      if (typeof data.requestId !== "string" || data.requestId.length > 64) return;
      ws.serializeAttachment({ ...person, sharing: { id: crypto.randomUUID(), requestId: data.requestId, audio: data.audio === true } });
      Object.assign(this.state, { currentTime: this._time(), updatedAt: now, isPlaying: false, pausedBy: null });
      return this._shareChanged();
    }
    if (!share || data.shareId !== share.id) return;
    const host = this._members().find(socket => socket.deserializeAttachment().peerId === share.hostId);
    if (data.type === "share-stop") {
      if (person.peerId !== share.hostId) return;
      ws.serializeAttachment({ ...person, sharing: null });
      this._clearViewers();
      return this._shareChanged();
    }
    if (data.type === "share-watch") {
      if (person.peerId === share.hostId) return;
      if (typeof data.connectionId !== "string" || !data.connectionId || data.connectionId.length > 64) return;
      if (person.watching !== share.id && this._members().filter(socket => socket.deserializeAttachment().watching === share.id).length >= 4) {
        return fail("This shared tab has four viewers already. Try again when someone leaves.");
      }
      ws.serializeAttachment({ ...person, watching: share.id, watchingConnectionId: data.connectionId });
      this._send(host, { type: "share-viewer", shareId: share.id, peerId: person.peerId, connectionId: data.connectionId });
      return;
    }
    if (data.type === "share-leave") {
      if (person.watching !== share.id) return;
      ws.serializeAttachment({ ...person, watching: null });
      this._send(host, { type: "share-left", shareId: share.id, peerId: person.peerId });
      return;
    }
    if (data.type === "share-ice") {
      // Reserve a viewer slot before minting relay credentials. This also bounds
      // credential issuance to the same small group that can receive the media.
      if (person.peerId !== share.hostId && person.watching !== share.id) {
        if (this._members().filter(socket => socket.deserializeAttachment().watching === share.id).length >= 4) {
          return fail("This shared tab has four viewers already. Try again when someone leaves.");
        }
        person = { ...person, watching: share.id };
        ws.serializeAttachment(person);
      }
      this.shareIce ??= new Map();
      for (const [id, config] of this.shareIce) if (config.expiresAt <= now || !this._members().some(socket => socket.deserializeAttachment().peerId === id)) this.shareIce.delete(id);
      const cached = this.shareIce.get(person.peerId);
      if (cached) return this._send(ws, { type: "share-ice", shareId: share.id, iceServers: cached.iceServers, relay: cached.relay });
      if (person.iceShare === share.id && person.iceAt > now - 30000) return fail("Please wait a moment before reconnecting the shared tab.");
      ws.serializeAttachment({ ...person, iceAt: now, iceShare: share.id });
      const iceServers = [{ urls: "stun:stun.cloudflare.com:3478" }];
      let relay = false;
      if (this.env.TURN_KEY_ID && this.env.TURN_KEY_API_TOKEN) {
        try {
          const response = await fetch("https://rtc.live.cloudflare.com/v1/turn/keys/" + encodeURIComponent(this.env.TURN_KEY_ID) + "/credentials/generate-ice-servers", {
            method: "POST", headers: { Authorization: "Bearer " + this.env.TURN_KEY_API_TOKEN, "Content-Type": "application/json" },
            body: JSON.stringify({ ttl: 14400 }), signal: AbortSignal.timeout(5000),
          });
          if (!response.ok) throw new Error("TURN unavailable");
          const result = await response.json();
          if (!Array.isArray(result.iceServers)) throw new Error("Invalid TURN response");
          for (const server of result.iceServers.slice(0, 8)) {
            const urls = (Array.isArray(server.urls) ? server.urls : [server.urls]).filter(url => typeof url === "string" && /^turns?:/.test(url) && !/:53(?:\?|$)/.test(url));
            if (urls.length && typeof server.username === "string" && typeof server.credential === "string") {
              iceServers.push({ urls, username: server.username, credential: server.credential });
              relay = true;
            }
          }
        } catch { /* Direct connections can still work when the relay is unavailable. */ }
      }
      if (this._share()?.id === share.id && ws.deserializeAttachment()?.joined) {
        this.shareIce.set(person.peerId, { iceServers, relay, expiresAt: now + (relay ? 3600000 : 30000) });
        this._send(ws, { type: "share-ice", shareId: share.id, iceServers, relay });
      }
      return;
    }
    if (data.type !== "share-signal") return;
    const target = this._members().find(socket => socket.deserializeAttachment().peerId === data.to);
    if (!target || target === ws) return;
    const recipient = target.deserializeAttachment();
    const fromHost = person.peerId === share.hostId && recipient.watching === share.id;
    const toHost = recipient.peerId === share.hostId && person.watching === share.id;
    if (!fromHost && !toHost) return;
    if (!data.connectionId || data.connectionId !== (fromHost ? recipient : person).watchingConnectionId) return;
    const payload = { type: "share-signal", shareId: share.id, from: person.peerId, connectionId: data.connectionId };
    if (data.description) {
      const { type, sdp } = data.description;
      if (type !== (fromHost ? "offer" : "answer") || typeof sdp !== "string" || sdp.length > 24000) return;
      payload.description = { type, sdp };
    } else if (data.candidate && typeof data.candidate.candidate === "string" && data.candidate.candidate.length <= 2048) {
      const { candidate, sdpMid, sdpMLineIndex, usernameFragment } = data.candidate;
      if (sdpMid != null && (typeof sdpMid !== "string" || sdpMid.length > 64)) return;
      if (sdpMLineIndex != null && (!Number.isInteger(sdpMLineIndex) || sdpMLineIndex < 0 || sdpMLineIndex > 10)) return;
      if (usernameFragment != null && (typeof usernameFragment !== "string" || usernameFragment.length > 256)) return;
      payload.candidate = { candidate, sdpMid, sdpMLineIndex, usernameFragment };
    } else return;
    this._send(target, payload);
  }

  // Unsaved rooms are cleared once nobody has opened them for a while.
  // Saved (member) rooms and account catalogs never schedule an alarm.
  async _keepAlive() {
    if (this.details?.mode === "member") return this._schedule();
    this.expiresAt = Date.now() + RoomDO.GUEST_ROOM_TTL;
    await this.ctx.storage.put("expiresAt", this.expiresAt);
    await this._schedule();
  }

  async alarm() {
    await this.ready;
    this.alarmAt = undefined;
    if (this.details?.mode !== "member" && this.expiresAt <= Date.now()) {
      if (this.ctx.getWebSockets().length) return this._keepAlive();
      await this.ctx.storage.deleteAll();
      this.details = null;
      this.expiresAt = Date.now() + RoomDO.GUEST_ROOM_TTL;
      this.state = RoomDO.initialState();
      return;
    }
    const skipped = await this._skipDue();
    if (skipped) {
      this._broadcast(ws => this._snapshot(undefined, ws));
      this._broadcast({ type: "skipped", skips: skipped });
    }
    await this._schedule();
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
