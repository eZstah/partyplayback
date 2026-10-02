import { RoomPlayer } from "../lib/room-player.js";

export function bootRoom(roomName) {
  const $ = id => document.getElementById(id);
  const conn = $("conn"), count = $("uc"), username = $("uname");
  const queueList = $("q-list"), urlInput = $("url-in"), addButton = $("add-btn");
  const playButton = $("play-btn"), nextButton = $("next-btn"), enableButton = $("enable-btn");
  let socket = null, room = null, joined = false, stopping = false;
  let reconnectTimer, joinTimer, toastTimer, delay = 1000, lastMessage = 0;
  let lastServerTime = -1, latency = 0, adding = false;
  let queueSignature = "", scrubbing = false;
  const progress = $("progress");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const requests = new Map();

  function getStored(storage, key, fallback) {
    try {
      const value = storage.getItem(key) || fallback;
      storage.setItem(key, value);
      return value;
    } catch { return fallback; }
  }
  let name = document.body.dataset.userName || getStored(localStorage, "pp_user", "Guest" + Math.floor(Math.random() * 9000 + 1000));
  const sessionId = getStored(sessionStorage, "pp_sid", crypto.randomUUID());
  username.textContent = name;

  function toast(message) {
    $("toast").textContent = message;
    $("toast").classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("toast").classList.remove("show"), 4500);
  }

  function send(data) {
    if (!joined || socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(data));
    return true;
  }

  const playback = new RoomPlayer({
    send,
    onBlocked(blocked) {
      enableButton.hidden = !blocked;
      if (blocked) toast("Press Join playback to watch with everyone");
    },
  });

  function controls() {
    const hasVideo = !!room?.queue[room.currentIndex];
    playButton.disabled = !joined || !hasVideo;
    nextButton.disabled = !joined || !hasVideo || room.currentIndex + 1 >= room.queue.length;
    addButton.disabled = !joined || adding;
    queueList.querySelectorAll("button").forEach(button => { button.disabled = !joined; });
    const playing = !!room?.isPlaying;
    const mood = !hasVideo ? "idle" : playing ? "playing" : "paused";
    if (document.body.dataset.playback !== mood) document.body.dataset.playback = mood;
    $("play-label").textContent = playing ? "Pause" : "Play";
    playButton.setAttribute("aria-label", playing ? "Pause" : "Play");
    $("play-icon").hidden = playing;
    $("pause-icon").hidden = !playing;
  }

  function setConnection(state) {
    conn.className = state;
    conn.textContent = state === "connected" ? "Live" : state === "connecting" ? "Connecting" : "Reconnecting…";
    controls();
  }

  function requestState(type = "sync") {
    if (socket?.readyState !== WebSocket.OPEN) return;
    const requestId = crypto.randomUUID();
    // Bound the map even when the network silently stalls.
    for (const [id, at] of requests) if (performance.now() - at > 20000) requests.delete(id);
    requests.set(requestId, performance.now());
    socket.send(JSON.stringify({ type, requestId, username: name, sessionId }));
  }

  function connect() {
    if (stopping || (socket && socket.readyState < WebSocket.CLOSING)) return;
    joined = false;
    setConnection("connecting");
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const current = new WebSocket(protocol + "//" + location.host + "/api/ws/" + roomName);
    socket = current;
    joinTimer = setTimeout(() => current.close(), 15000);
    current.addEventListener("open", () => {
      lastMessage = performance.now();
      requestState("join");
    });
    current.addEventListener("message", event => {
      if (current !== socket) return;
      lastMessage = performance.now();
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (data.type === "state") {
        // Clock comparison uses only server timestamps; browser clocks may differ.
        if (room && (data.revision < room.revision || (data.revision === room.revision && data.serverTime < lastServerTime))) return;
        if (requests.has(data.requestId)) {
          latency = Math.min((performance.now() - requests.get(data.requestId)) / 2000, 2);
          requests.delete(data.requestId);
        }
        clearTimeout(joinTimer);
        joined = true;
        delay = 1000;
        lastServerTime = data.serverTime;
        room = data;
        playback.receive(data, latency);
        render();
        setConnection("connected");
      } else if (data.type === "users") {
        setCount(data.userCount);
      } else if (data.type === "error") {
        toast(data.message);
        requestState();
      }
    });
    current.addEventListener("close", () => {
      if (current !== socket) return;
      clearTimeout(joinTimer);
      joined = false;
      requests.clear();
      playback.disconnected();
      setConnection("disconnected");
      clearTimeout(reconnectTimer);
      if (!stopping) reconnectTimer = setTimeout(connect, delay);
      delay = Math.min(delay * 2, 30000);
    });
    current.addEventListener("error", () => current.close());
  }

  function setCount(value) { count.textContent = value + " viewer" + (value === 1 ? "" : "s"); }

  function render() {
    setCount(room.userCount);
    const signature = JSON.stringify([room.queue, room.currentIndex]);
    if (signature !== queueSignature) {
    queueSignature = signature;
    const rows = new Map([...queueList.children].map(li => [li.dataset.itemId, li]));
    room.queue.forEach((item, index) => {
      let existing = rows.get(item.id);
      if (existing) {
        rows.delete(item.id);
        existing.classList.toggle("now", index === room.currentIndex);
        existing.querySelector(".qi-sub").textContent = index === room.currentIndex ? "Now playing" : "#" + (index + 1);
        if (queueList.children[index] !== existing) queueList.insertBefore(existing, queueList.children[index] || null);
        return;
      }
      const li = document.createElement("li");
      li.dataset.itemId = item.id;
      li.className = "qi" + (index === room.currentIndex ? " now" : "");
      const img = document.createElement("img");
      img.className = "qi-thumb";
      img.src = "https://img.youtube.com/vi/" + item.videoId + "/mqdefault.jpg";
      img.alt = "";
      img.loading = "lazy";
      const info = document.createElement("div");
      info.className = "qi-info";
      const title = document.createElement("div");
      title.className = "qi-title";
      title.textContent = item.title;
      const sub = document.createElement("div");
      sub.className = "qi-sub";
      sub.textContent = index === room.currentIndex ? "Now playing" : "#" + (index + 1);
      info.append(title, sub);
      const remove = document.createElement("button");
      remove.className = "qi-rm";
      remove.type = "button";
      remove.title = "Remove " + item.title;
      remove.setAttribute("aria-label", remove.title);
      remove.textContent = "×";
      remove.addEventListener("click", () => send({ type: "remove", itemId: item.id }));
      li.append(img, info, remove);
      queueList.insertBefore(li, queueList.children[index] || null);
      if (!reducedMotion.matches) li.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: 450, easing: "cubic-bezier(.22,1,.36,1)" });
    });
    for (const row of rows.values()) row.remove();
    }
    const item = room.queue[room.currentIndex];
    $("placeholder").style.display = item ? "none" : "flex";
    const status = item ? (room.isPlaying ? "Playing: " : "Paused: ") + item.title : "No video selected.";
    if ($("playing-status").textContent !== status) $("playing-status").textContent = status;
    $("queue-count").textContent = String(room.queue.length).padStart(2, "0");
    $("queue-empty").hidden = !!room.queue.length;
    controls();
  }

  username.addEventListener("click", () => {
    $("guest-name").value = name;
    $("name-dialog").showModal();
  });
  $("name-form").addEventListener("submit", event => {
    event.preventDefault();
    const value = $("guest-name").value;
    if (!value?.trim()) return;
    name = value.trim().slice(0, 32);
    try { localStorage.setItem("pp_user", name); } catch {}
    username.textContent = name;
    requestState("join");
    $("name-dialog").close();
  });

  function togglePlayback() {
    if (playButton.disabled) return;
    if (room?.isPlaying) playback.command("pause", playback.targetTime());
    else {
      // Keep this call in the gesture handler for browser autoplay policy.
      playback.enablePlayback(true);
      playback.command("play", playback.targetTime());
    }
  }
  playButton.addEventListener("click", togglePlayback);
  nextButton.addEventListener("click", () => playback.command("next"));
  enableButton.addEventListener("click", () => playback.enablePlayback());

  $("add-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (adding) return;
    if (!joined) { toast("Wait for the room to reconnect"); return; }
    const url = urlInput.value.trim();
    if (!url) return;
    adding = true;
    addButton.disabled = true;
    addButton.setAttribute("aria-label", "Adding video");
    let title = url;
    try {
      const response = await fetch("https://www.youtube.com/oembed?url=" + encodeURIComponent(url) + "&format=json", { signal: AbortSignal.timeout(4000) });
      if (response.ok) title = (await response.json()).title || url;
    } catch {}
    if (send({ type: "add", url, title })) urlInput.value = "";
    else toast("Connection lost. Your URL is still here; try again after reconnecting.");
    addButton.setAttribute("aria-label", "Add to playlist");
    adding = false;
    controls();
  });

  function timeLabel(time) {
    const seconds = Math.max(0, Math.floor(time || 0));
    return seconds >= 3600 ? Math.floor(seconds / 3600) + ":" + String(Math.floor(seconds / 60) % 60).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0") : Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
  }
  function updateProgress() {
    const p = playback.player;
    const duration = p?.getDuration?.() || 0;
    const hasVideo = !!room?.queue[room.currentIndex];
    progress.disabled = !joined || !hasVideo || !duration;
    progress.max = String(duration || Math.max(1, playback.targetTime()));
    $("duration").textContent = timeLabel(duration);
    if (!scrubbing) progress.value = String(hasVideo ? Math.min(playback.targetTime(), duration || playback.targetTime()) : 0);
    $("elapsed").textContent = timeLabel(Number(progress.value));
    progress.style.setProperty("--progress", (duration ? Number(progress.value) / duration * 100 : 0) + "%");
    progress.setAttribute("aria-valuetext", timeLabel(Number(progress.value)) + " of " + timeLabel(duration));
  }
  function seek(time) {
    if (!joined || !room?.queue[room.currentIndex]) return;
    const duration = playback.player?.getDuration?.() || 604800;
    playback.command("seek", Math.max(0, Math.min(time, duration)));
  }
  progress.addEventListener("input", () => { scrubbing = true; updateProgress(); });
  progress.addEventListener("change", () => { seek(Number(progress.value)); scrubbing = false; });
  progress.addEventListener("blur", () => { scrubbing = false; });
  function setPlaylist(open) {
    document.body.classList.toggle("playlist-hidden", !open);
    $("playlist-btn").setAttribute("aria-expanded", String(open));
  }
  $("playlist-btn").addEventListener("click", async () => {
    if (document.fullscreenElement) { await document.exitFullscreen(); setPlaylist(true); $("sidebar").scrollIntoView({ block: "nearest" }); }
    else setPlaylist(document.body.classList.contains("playlist-hidden"));
  });
  $("first-video-btn").addEventListener("click", async () => { if (document.fullscreenElement) await document.exitFullscreen(); setPlaylist(true); urlInput.focus(); urlInput.scrollIntoView({ block: "center", behavior: reducedMotion.matches ? "instant" : "smooth" }); });
  $("theater-btn").addEventListener("click", async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    const active = document.body.classList.toggle("theater");
    $("theater-btn").setAttribute("aria-pressed", String(active));
    if (!reducedMotion.matches) $("stage").animate([{ opacity: .65 }, { opacity: 1 }], { duration: 400 });
  });
  $("fullscreen-btn").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if ($("room-shell").requestFullscreen) await $("room-shell").requestFullscreen();
      else toast("Fullscreen is unavailable in this browser. Try theater mode.");
    } catch { toast("Fullscreen couldn't open. Try theater mode."); }
  });
  document.addEventListener("fullscreenchange", () => {
    const active = document.fullscreenElement === $("room-shell");
    $("fullscreen-btn").setAttribute("aria-pressed", String(active));
    $("fullscreen-btn").setAttribute("aria-label", active ? "Exit fullscreen" : "Fullscreen");
    $("fullscreen-btn").title = active ? "Exit fullscreen (F)" : "Fullscreen (F)";
  });
  $("mute-btn").addEventListener("click", () => {
    const player = playback.player;
    if (!player) return;
    const muted = !player.isMuted();
    if (muted) player.mute(); else player.unMute();
    $("mute-btn").setAttribute("aria-pressed", String(muted));
    $("mute-btn").setAttribute("aria-label", muted ? "Unmute" : "Mute");
    $("volume-icon").hidden = muted; $("mute-icon").hidden = !muted;
  });
  for (const button of document.querySelectorAll("[data-close-dialog]")) button.addEventListener("click", () => button.closest("dialog").close());
  for (const dialog of document.querySelectorAll("dialog")) dialog.addEventListener("click", event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
  $("help-btn").addEventListener("click", () => $("help-dialog").showModal());
  $("invite-btn").addEventListener("click", () => { $("invite-link").value = location.origin + location.pathname; $("invite-dialog").showModal(); });
  $("copy-link-btn").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("invite-link").value); $("invite-dialog").close(); toast("Room link copied. Send it to your friends."); }
    catch { $("invite-link").focus(); $("invite-link").select(); toast("Select and copy the room link."); }
  });
  document.addEventListener("keydown", event => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.target.closest?.("input,textarea,select,[contenteditable=true]") || document.querySelector("dialog[open]")) return;
    const key = event.key.toLowerCase();
    const actions = {
      " ": togglePlayback, k: togglePlayback,
      arrowleft: () => seek(playback.targetTime() - 5), arrowright: () => seek(playback.targetTime() + 5),
      j: () => seek(playback.targetTime() - 10), l: () => seek(playback.targetTime() + 10),
      n: () => { if (!nextButton.disabled) nextButton.click(); },
      f: () => $("fullscreen-btn").click(), t: () => $("theater-btn").click(),
      p: () => $("playlist-btn").click(), m: () => $("mute-btn").click(),
      "?": () => $("help-btn").click(),
    };
    if (actions[key]) { event.preventDefault(); actions[key](); }
  });

  window.onYouTubeIframeAPIReady = () => {
    const player = new window.YT.Player("yt-player", {
      height: "100%", width: "100%",
      playerVars: { controls: 0, disablekb: 1, rel: 0, playsinline: 1, origin: location.origin },
      events: {
        onReady() { playback.ready(player); },
        onStateChange(event) { playback.stateChanged(event.data); },
        onAutoplayBlocked() { playback.autoplayBlocked(); },
        onError() {
          playback.failed();
          toast("Video unavailable or embedding blocked. Try another video or use Next.");
        },
      },
    });
  };

  const sampleTimer = setInterval(() => { playback.tick(); updateProgress(); }, 250);
  const syncTimer = setInterval(() => {
    if (joined && performance.now() - lastMessage > 20000) socket?.close();
    else if (joined) requestState();
  }, 5000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) { playback.sample = null; requestState(); }
  });
  window.addEventListener("pagehide", () => {
    stopping = true;
    clearInterval(sampleTimer);
    clearInterval(syncTimer);
    clearTimeout(reconnectTimer);
    clearTimeout(joinTimer);
    socket?.close(1000, "Leaving room");
  });
  window.addEventListener("pageshow", event => { if (event.persisted) location.reload(); });
  connect();
  const script = document.createElement("script");
  script.src = "https://www.youtube.com/iframe_api";
  script.addEventListener("error", () => toast("Could not load YouTube. Check your connection and reload."));
  document.head.append(script);
}
