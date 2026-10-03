const PLAYING = 1;
const PAUSED = 2;
const BUFFERING = 3;
const CUED = 5;
const ENDED = 0;
const DRIFT = 1.5;

// Separate the desired room timeline from asynchronous YouTube player events.
// Remote operations settle by observed state, not by an arbitrary timeout.
export class RoomPlayer {
  constructor({ send, now = () => performance.now(), onBlocked = () => {} }) {
    this.send = send;
    this.now = now;
    this.onBlocked = onBlocked;
    this.player = null;
    this.room = null;
    this.receivedAt = 0;
    this.loadedId = null;
    this.pending = null;
    this.sample = null;
    this.blocked = false;
    this.failedId = null;
    this.endedId = null;
    this.localPending = false;
  }

  ready(player) {
    this.player = player;
    this.apply();
  }

  // A new embed must load the latest room timeline, not inherit the old load.
  detach() {
    this.player = null;
    this.loadedId = null;
    this.pending = null;
    this.sample = null;
    this.blocked = false;
    this.failedId = null;
    this.localPending = false;
    this.onBlocked(false);
  }

  receive(room, transitSeconds = 0) {
    if (this.room && room.revision < this.room.revision) return;
    const changed = !this.room || room.playbackId !== this.room.playbackId;
    this.room = { ...room, currentTime: room.currentTime + (room.isPlaying ? transitSeconds : 0) };
    this.receivedAt = this.now();
    this.localPending = false;
    if (changed) {
      this.failedId = null;
      this.endedId = null;
    }
    this.apply();
  }

  targetTime() {
    if (!this.room) return 0;
    return this.room.currentTime + (this.room.isPlaying ? Math.max(0, this.now() - this.receivedAt) / 1000 : 0);
  }

  apply() {
    const p = this.player;
    const r = this.room;
    if (!p || !r) return;
    if (r.share) {
      this.pending = null;
      this.sample = null;
      p.pauseVideo();
      return;
    }
    const item = r.queue[r.currentIndex];
    if (!item) {
      this.loadedId = null;
      this.pending = null;
      this.sample = null;
      p.stopVideo();
      return;
    }
    if (this.failedId === r.playbackId) return;
    const time = this.targetTime();
    if (this.loadedId !== r.playbackId) {
      this.loadedId = r.playbackId;
      this.sample = null;
      this.pending = { lastSeek: this.now() };
      const options = { videoId: item.videoId, startSeconds: time };
      if (r.isPlaying && !this.blocked) p.loadVideoById(options);
      else p.cueVideoById(options);
      return;
    }
    if (this.blocked) return;
    const state = p.getPlayerState();
    const drift = Math.abs(p.getCurrentTime() - time);
    const wantsChange = r.isPlaying ? state !== PLAYING : state !== PAUSED && state !== CUED && state !== ENDED;
    if (drift > DRIFT || wantsChange) {
      this.pending = { lastSeek: this.now() };
      this.sample = null;
      if (drift > DRIFT) p.seekTo(time, true);
      if (r.isPlaying) p.playVideo();
      else p.pauseVideo();
    }
  }

  stateChanged(state) {
    if (this.room?.share) { if (state === PLAYING) this.player?.pauseVideo(); return; }
    if (!this.player || !this.room || !this.room.queue[this.room.currentIndex]) return;
    if (this.blocked && state === PLAYING) {
      // The viewer may use YouTube's own Play button to satisfy autoplay policy.
      const wasPlaying = this.room.isPlaying;
      this.enablePlayback(true);
      if (!wasPlaying) this.command("play", this.targetTime());
      return;
    }
    if (this.pending || this.blocked || this.failedId === this.room.playbackId || this.localPending) {
      this.tick();
      return;
    }
    if (state === ENDED) {
      if (this.room.isPlaying && this.endedId !== this.loadedId) {
        this.endedId = this.loadedId;
        this.command("ended", this.player.getCurrentTime());
      }
      return;
    }
    if (state === PLAYING || state === PAUSED) {
      const playing = state === PLAYING;
      if (playing !== this.room.isPlaying) this.command(playing ? "play" : "pause", this.player.getCurrentTime());
      else this.tick();
    }
    if (state === BUFFERING) this.tick();
  }

  tick() {
    if (this.room?.share) return;
    if (!this.player || !this.room || this.loadedId !== this.room.playbackId) return;
    const state = this.player.getPlayerState();
    const time = this.player.getCurrentTime();
    const now = this.now();
    const sample = { time, at: now, state };
    if (this.pending) {
      const matches = this.room.isPlaying ? state === PLAYING : [PAUSED, CUED, ENDED].includes(state);
      const item = this.room.queue[this.room.currentIndex];
      const videoMatches = item && this.player.getVideoData()?.video_id === item.videoId;
      if (matches && videoMatches) {
        if (Math.abs(time - this.targetTime()) <= DRIFT || (!this.room.isPlaying && state === CUED)) {
          this.pending = null;
        } else if (now - this.pending.lastSeek >= 1000) {
          this.pending.lastSeek = now;
          this.player.seekTo(this.targetTime(), true);
        }
      }
    } else if (!this.blocked && !this.localPending && this.failedId !== this.room.playbackId && this.sample &&
      [PLAYING, PAUSED, BUFFERING].includes(state) && [PLAYING, PAUSED, BUFFERING].includes(this.sample.state)) {
      const elapsed = this.sample.state === PLAYING ? Math.max(0, now - this.sample.at) / 1000 : 0;
      // YouTube has no seek event. Detect jumps against the previous local sample,
      // including backwards/paused seeks. Buffering itself never changes room play state.
      if (Math.abs(time - this.sample.time - elapsed) > DRIFT) this.command("seek", time);
    }
    this.sample = sample;
  }

  command(type, currentTime = this.player?.getCurrentTime() ?? this.targetTime()) {
    if (this.room?.share) return false;
    if (!this.room?.queue[this.room.currentIndex]) return false;
    const accepted = this.send({
      type, currentTime, playbackId: this.room.playbackId, revision: this.room.revision,
    });
    if (accepted) {
      this.localPending = true;
      this.sample = null;
    }
    return accepted;
  }

  autoplayBlocked() {
    this.blocked = true;
    this.pending = null;
    this.onBlocked(true);
  }

  enablePlayback(forcePlay = false) {
    if (this.room?.share) return;
    if (!this.player) return;
    this.blocked = false;
    this.onBlocked(false);
    this.pending = { lastSeek: this.now() };
    this.player.seekTo(this.targetTime(), true);
    if (forcePlay || this.room?.isPlaying) this.player.playVideo();
    else this.player.pauseVideo();
  }

  failed() {
    this.failedId = this.room?.playbackId;
    this.pending = null;
    this.sample = null;
    // One viewer's embed/network error must not skip the room's video.
  }

  disconnected() {
    this.localPending = false;
    this.sample = null;
    this.pending = null;
  }
}
