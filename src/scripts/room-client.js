import { RoomPlayer } from "../lib/room-player.js";

export function bootRoom(roomName) {
  const $ = id => document.getElementById(id);
  const conn = $("conn"), count = $("uc"), username = $("uname");
  const queueList = $("q-list"), urlInput = $("url-in"), addButton = $("add-btn");
  const playButton = $("play-btn"), nextButton = $("next-btn"), enableButton = $("enable-btn");
  let socket = null, room = null, joined = false, stopping = false;
  let reconnectTimer, joinTimer, toastTimer, delay = 1000, lastMessage = 0;
  let lastServerTime = -1, latency = 0, adding = false;
  const requests = new Map();

  function getStored(storage, key, fallback) {
    try {
      const value = storage.getItem(key) || fallback;
      storage.setItem(key, value);
      return value;
    } catch { return fallback; }
  }
  let name = getStored(localStorage, "pp_user", "Guest" + Math.floor(Math.random() * 9000 + 1000));
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
      if (blocked) toast("Click Enable playback to join the video");
    },
  });

  function controls() {
    const hasVideo = !!room?.queue[room.currentIndex];
    playButton.disabled = !joined || !hasVideo;
    nextButton.disabled = !joined || !hasVideo;
    addButton.disabled = !joined || adding;
    queueList.querySelectorAll("button").forEach(button => { button.disabled = !joined; });
    playButton.textContent = room?.isPlaying ? "Pause" : "Play";
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
    queueList.replaceChildren();
    room.queue.forEach((item, index) => {
      const li = document.createElement("li");
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
      queueList.append(li);
    });
    const item = room.queue[room.currentIndex];
    $("placeholder").style.display = item ? "none" : "flex";
    $("nowplay").textContent = item ? "Now playing: " + item.title : "Nothing playing";
    controls();
  }

  username.addEventListener("click", () => {
    const value = prompt("Display name:", name);
    if (!value?.trim()) return;
    name = value.trim().slice(0, 32);
    try { localStorage.setItem("pp_user", name); } catch {}
    username.textContent = name;
    requestState("join");
  });

  playButton.addEventListener("click", () => {
    if (room?.isPlaying) playback.command("pause", playback.targetTime());
    else {
      // Keep this call in the gesture handler for browser autoplay policy.
      playback.enablePlayback(true);
      playback.command("play", playback.targetTime());
    }
  });
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
    addButton.textContent = "Loading…";
    let title = url;
    try {
      const response = await fetch("https://www.youtube.com/oembed?url=" + encodeURIComponent(url) + "&format=json", { signal: AbortSignal.timeout(4000) });
      if (response.ok) title = (await response.json()).title || url;
    } catch {}
    if (send({ type: "add", url, title })) urlInput.value = "";
    else toast("Connection lost. Your URL is still here; try again after reconnecting.");
    addButton.textContent = "Add to Queue";
    adding = false;
    controls();
  });

  window.onYouTubeIframeAPIReady = () => {
    const player = new window.YT.Player("yt-player", {
      height: "100%", width: "100%",
      playerVars: { controls: 1, rel: 0, playsinline: 1, origin: location.origin },
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

  const sampleTimer = setInterval(() => playback.tick(), 250);
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
