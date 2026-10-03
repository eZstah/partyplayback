import { RoomPlayer } from "../lib/room-player.js";
import { bootTabSharing } from "./tab-sharing.js";
import { bootAuth } from "./auth-client.js";
import { bootRoomMascots } from "./room-mascots.js";
import { copyText, takeCreatedRoomNotice } from "./invite-copy.js";
import { pastedVideo, youtubeUrl, playlistLink, extensionVideo } from "./room-paste.js";
import { bindVolumeControl } from "./volume-control.js";
import { hostKey } from "./host-key.js";
import { bindFullscreenControls } from "./fullscreen-controls.js";
import { createMusicSelector, paintMusicShelf, followScene, MUSIC_MIXES } from "./music-shelf.js";

export function bootRoom(roomName, arrival = Promise.resolve()) {
  bootAuth();
  const pals = bootRoomMascots();
  const $ = id => document.getElementById(id);
  const conn = $("conn"), count = $("uc"), username = $("uname"), usernameLabel = $("uname-label");
  const queueList = $("q-list"), urlInput = $("url-in"), addButton = $("add-btn");
  const addForm = $("add-form"), addError = $("add-error"), addFeedback = $("add-feedback");
  const playButton = $("play-btn"), nextButton = $("next-btn"), enableButton = $("enable-btn");
  let socket = null, room = null, joined = false, stopping = false;
  let reconnectTimer, joinTimer, toastTimer, linkFeedbackTimer, linkFeedbackHideTimer, delay = 1000, lastMessage = 0;
  let lastServerTime = -1, latency = 0, adding = false, readingClipboard = false;
  let queueSignature = "", peopleSignature = "", scrubbing = false, overlayTimer;
  const progress = $("progress");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const requests = new Map();
  let pastedAddition = null, incomingVideo = null;
  let youtubePlayer = null, youtubeControls = false;
  const youtubeButton = $("youtube-controls-btn");
  const skipToggle = $("skip-toggle"), skipBoxes = [...document.querySelectorAll("#skip-categories input")];
  const SKIPPED = {
    sponsor: "sponsor", selfpromo: "self-promo", interaction: "subscribe reminder", intro: "intro",
    outro: "outro", preview: "preview", music_offtopic: "non-music part", filler: "filler",
  };
  let segmentSignature = "";

  function getStored(storage, key, fallback) {
    try {
      const value = storage.getItem(key) || fallback;
      storage.setItem(key, value);
      return value;
    } catch { return fallback; }
  }
  let name = document.body.dataset.userName || getStored(localStorage, "pp_user", "Guest" + Math.floor(Math.random() * 9000 + 1000));
  const sessionId = getStored(sessionStorage, "pp_sid", crypto.randomUUID());
  const browserId = getStored(localStorage, "pp_browser", crypto.randomUUID());
  usernameLabel.textContent = name;

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
  const sharing = document.body.dataset.tabSharingEnabled === "true"
    ? bootTabSharing({ send, toast, onChange: () => controls() }) : null;

  const musicShelf = document.querySelector('.music-shelf');
  const music = createMusicSelector({ send, enablePlayback: () => playback.enablePlayback(true),
    onChange: state => paintMusicShelf(musicShelf, state) });
  followScene(musicShelf);
  musicShelf?.querySelectorAll('[data-music-mix]').forEach(button => {
    button.addEventListener('click', () => music.select(button.dataset.musicMix));
  });
  const fullscreenControls = bindFullscreenControls({ shell: $("room-shell"), document });
  function updateFullscreenControls() {
    const canHide = !!(!youtubeControls && joined && room?.isPlaying && room.queue[room.currentIndex] &&
      playback.player?.getPlayerState() === 1 && !playback.blocked && !playback.pending &&
      playback.failedId !== room.playbackId && !document.querySelector("dialog[open]"));
    fullscreenControls.update(canHide, room?.playbackId);
  }
  function controls() {
    music.update(room, joined);
    const hasVideo = !!room?.queue[room.currentIndex] && !room?.share;
    youtubeButton.disabled = !hasVideo || !playback.player;
    playButton.disabled = !joined || !hasVideo;
    nextButton.disabled = !joined || !hasVideo || (room.currentIndex + 1 >= room.queue.length && !room.autoClear);
    addButton.disabled = !joined || adding || readingClipboard;
    $("auto-clear-btn").disabled = !joined;
    $("auto-clear-btn").setAttribute("aria-checked", String(!!room?.autoClear));
    const skip = room?.sponsorSkip;
    $("skip-btn").disabled = !joined || !skip;
    $("skip-btn").dataset.on = String(!!skip?.enabled);
    $("skip-btn").title = skip?.enabled ? "Skipping sponsors for everyone" : "Sponsor skipping is off";
    skipToggle.disabled = !joined;
    skipToggle.setAttribute("aria-checked", String(!!skip?.enabled));
    for (const box of skipBoxes) {
      box.checked = !!skip?.categories.includes(box.value);
      box.disabled = !joined || !skip?.enabled;
    }
    const playing = !!room?.isPlaying;
    queueList.querySelectorAll(".qi-rm").forEach(button => { button.disabled = !joined; });
    queueList.querySelectorAll(".qi-play").forEach(button => {
      const current = button.closest("li").dataset.itemId === room?.queue[room.currentIndex]?.id;
      const active = current && playing;
      button.disabled = !joined || active || !!room?.share;
      button.dataset.playing = String(active);
      button.title = (active ? "Playing " : "Play ") + button.dataset.videoTitle;
      button.setAttribute("aria-label", button.title);
      if (current) button.closest("li").querySelector(".qi-sub").textContent = playing ? "Now playing" : "Paused";
    });
    const mood = !hasVideo ? "idle" : playing ? "playing" : "paused";
    if (document.body.dataset.playback !== mood) {
      const previous = document.body.dataset.playback;
      document.body.dataset.playback = mood;
      showOverlay(mood, previous);
    }
    if (mood === "paused") {
      const by = room.pausedBy;
      const caption = !by ? "Paused" : by === name ? "You paused" : "Paused by " + by;
      if ($("overlay-caption").textContent !== caption) $("overlay-caption").textContent = caption;
    }
    $("play-label").textContent = playing ? "Pause" : "Play";
    playButton.setAttribute("aria-label", playing ? "Pause" : "Play");
    $("play-icon").hidden = playing;
    $("pause-icon").hidden = !playing;
    updateFullscreenControls();
  }

  // Like a desktop player: pausing leaves a big pause sign up, resuming flashes play,
  // and muting flashes on this device only, since mute isn't shared with the room.
  function showOverlay(mood, previous) {
    flashOverlay(mood === "playing" && previous === "paused" ? "resumed" : null);
  }
  function flashOverlay(flash) {
    const overlay = $("playback-overlay");
    const resting = document.body.dataset.playback === "paused" ? "paused" : "";
    clearTimeout(overlayTimer);
    if (!flash) { overlay.dataset.state = resting; return; }
    // Restart the animation when the same flash repeats.
    overlay.dataset.state = "";
    void overlay.offsetWidth;
    overlay.dataset.state = flash;
    overlayTimer = setTimeout(() => { overlay.dataset.state = document.body.dataset.playback === "paused" ? "paused" : ""; }, flash === "resumed" ? 650 : 900);
  }

  const avatarColors = ["#aadf97", "#f4adc0", "#c3afff", "#f5be70", "#9fd3e6"];
  function avatar(person, className) {
    const face = document.createElement("span");
    face.className = className;
    const initial = [...person.name.trim()][0]?.toUpperCase() || "?";
    let hash = 0;
    for (const char of person.name) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
    face.style.setProperty("--face", avatarColors[hash % avatarColors.length]);
    face.textContent = initial;
    if (person.avatar) {
      const img = document.createElement("img");
      img.src = person.avatar;
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => img.remove());
      face.append(img);
    }
    return face;
  }

  // Asks the host to confirm before removing someone or deleting the room.
  function confirmHost(heading, text, action, onConfirm) {
    const dialog = $("host-dialog"), confirm = $("host-confirm");
    $("host-heading").textContent = heading;
    $("host-text").textContent = text;
    confirm.textContent = action;
    confirm.onclick = () => { dialog.close(); onConfirm(); };
    dialog.showModal();
  }

  // The host removed you or deleted the room: stop and say so instead of reconnecting.
  let deleting = false;
  function leaveRoom(reason) {
    if (deleting) return location.assign("/");
    if (stopping) return;
    stopping = true;
    clearTimeout(reconnectTimer);
    try { playback.player?.pauseVideo(); } catch {}
    const deleted = reason === "closed";
    $("gone-heading").textContent = deleted ? "This room was deleted" : "You were removed";
    $("gone-text").textContent = deleted ? "The host deleted this room, so it's closed for everyone." : "The host removed you from this room.";
    for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
    $("gone-dialog").showModal();
  }
  $("gone-dialog").addEventListener("cancel", event => { event.preventDefault(); location.href = "/"; });

  function renderHostTools(roster) {
    $("host-tools").hidden = !roster.host;
    $("delete-room-btn").hidden = !roster.deletable;
    const blocked = roster.host && Array.isArray(roster.blocked) ? roster.blocked : [];
    $("blocked-people").hidden = !blocked.length;
    $("blocked-list").replaceChildren(...blocked.map(entry => {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = entry.name;
      const undo = document.createElement("button");
      undo.type = "button";
      undo.textContent = "Let back in";
      undo.addEventListener("click", () => send({ type: "unblock", id: entry.id }));
      li.append(label, undo);
      return li;
    }));
  }

  $("delete-room-btn").addEventListener("click", () => confirmHost(
    "Delete this room?", "Everyone in it is sent out, the link stops working, and the playlist is gone for good.", "Delete room",
    async () => {
      deleting = true;
      try {
        const response = await fetch("/api/rooms", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: roomName }) });
        if (!response.ok) throw new Error();
        leaveRoom("closed");
      } catch { deleting = false; toast("Could not delete the room. Try again."); }
    }));

  function renderPeople(roster) {
    const members = roster?.members;
    if (!Array.isArray(members)) return;
    const signature = JSON.stringify([members, roster.host, roster.blocked]);
    if (signature === peopleSignature) return;
    peopleSignature = signature;
    renderHostTools(roster);
    // You already see yourself in the name chip, so "watching" lists everyone else.
    const others = members.filter(person => !person.you);
    const list = $("people-list");
    list.replaceChildren(...others.map(person => {
      const li = document.createElement("li");
      li.className = "person";
      const label = document.createElement("span");
      label.className = "person-name";
      label.textContent = person.name;
      li.append(avatar(person, "person-face"), label);
      if (person.host) {
        const tag = document.createElement("em");
        tag.className = "person-host";
        tag.textContent = "Host";
        li.append(tag);
      } else if (roster.host) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "person-remove";
        remove.setAttribute("aria-label", "Remove " + person.name);
        remove.title = "Remove from room";
        remove.textContent = "×";
        remove.addEventListener("click", () => confirmHost(
          "Remove " + person.name + "?", person.member
            ? "They leave the room now and can't come back unless you let them back in."
            : "They leave the room now. Guests can come back from a new tab, so for real trouble use a saved room.",
          "Remove", () => send({ type: "remove-person", peerId: person.peerId })));
        li.append(remove);
      }
      return li;
    }));
    if (!others.length) {
      const alone = document.createElement("li");
      alone.className = "people-alone";
      alone.textContent = "Just you so far. Invite friends to watch together.";
      list.append(alone);
    }
    $("people-count").textContent = String(others.length).padStart(2, "0");
    $("uc-label").textContent = others.length ? others.length + " watching" : "Just you";
    const me = members.find(person => person.you);
    $("uname-face").replaceChildren(...(me ? [avatar(me, "person-face")] : []));
    const faces = document.querySelector(".facepile-faces");
    const shown = others.length > 4 ? others.slice(0, 3) : others;
    faces.replaceChildren(...shown.map(person => avatar(person, "facepile-face")));
    if (shown.length < others.length) {
      const more = document.createElement("span");
      more.className = "facepile-face facepile-more";
      more.textContent = "+" + (others.length - shown.length);
      faces.append(more);
    }
    count.title = others.length ? others.map(person => person.name).join(", ") : "No one else is here yet";
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
    socket.send(JSON.stringify({ type, requestId, username: name, sessionId, browserId, ...(type === "join" ? { hostKey: hostKey(roomName) } : {}) }));
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
        const firstState = !room;
        joined = true;
        delay = 1000;
        lastServerTime = data.serverTime;
        room = data;
        playback.receive(data, latency);
        sharing?.update(data);
        render();
        setConnection("connected");
        if (pastedAddition && room.queue.some(item => item.url === pastedAddition.url && !pastedAddition.before.has(item.id))) {
          clearTimeout(pastedAddition.timer);
          pastedAddition = null;
          toast("Video added to playlist");
        }
        if (firstState) {
          const arrivalVideo = new URL(location.href);
          if (arrivalVideo.searchParams.has('add')) {
            incomingVideo = youtubeUrl(arrivalVideo.searchParams.get('add')) || incomingVideo;
            arrivalVideo.searchParams.delete('add');
            history.replaceState(history.state, '', arrivalVideo);
          }
          performance.mark("youple:room-connected");
          document.dispatchEvent(new Event("youple:room-ready"));
          const arrivalUrl = new URL(location.href);
          const arrivalMix = arrivalUrl.searchParams.get('mix');
          if (arrivalMix) {
            arrivalUrl.searchParams.delete('mix');
            history.replaceState(history.state, '', arrivalUrl);
            if (MUSIC_MIXES.some(mix => mix.key === arrivalMix)) music.select(arrivalMix);
          }
        }
        ensurePlayer();
        addIncomingVideo();
      } else if (typeof data.type === "string" && data.type.startsWith("share-")) {
        void sharing?.handle(data).catch(() => toast("The shared tab could not connect. Try Reconnect."));
      } else if (data.type === "skipped" && Array.isArray(data.skips) && data.skips.length) {
        const seconds = Math.round(data.skips.reduce((total, skip) => total + Math.max(0, skip.to - skip.from), 0));
        const names = [...new Set(data.skips.map(skip => SKIPPED[skip.category] || "segment"))].join(" and ");
        toast("Skipped " + names + (seconds ? " · " + seconds + "s" : ""));
      } else if (data.type === "removed" || data.type === "closed") {
        leaveRoom(data.type);
      } else if (data.type === "users") {
        renderPeople(data);
        pals.observe({ users: data.userCount });
      } else if (data.type === "error") {
        if (music.state().pending) music.fail(data.message);
        if (pastedAddition) { clearTimeout(pastedAddition.timer); pastedAddition = null; }
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
      sharing?.disconnect();
      setConnection("disconnected");
      clearTimeout(reconnectTimer);
      if (!stopping) reconnectTimer = setTimeout(connect, delay);
      delay = Math.min(delay * 2, 30000);
    });
    current.addEventListener("error", () => current.close());
  }

  function setPeopleOpen(open) {
    document.body.classList.toggle("people-open", open);
    count.setAttribute("aria-expanded", String(open));
    try { localStorage.setItem("youple-people", String(open)); } catch {}
  }
  setPeopleOpen(document.body.classList.contains("people-open"));
  count.addEventListener("click", () => setPeopleOpen(!document.body.classList.contains("people-open")));

  function render() {
    renderPeople(room);
    pals.observe({ users: room.userCount, queue: room.queue.length, current: room.queue[room.currentIndex]?.id ?? null, title: room.queue[room.currentIndex]?.title || '' });
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
      const select = document.createElement("button");
      select.className = "qi-play";
      select.type = "button";
      select.dataset.videoTitle = item.title;
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("aria-hidden", "true");
      const triangle = document.createElementNS("http://www.w3.org/2000/svg", "path");
      triangle.setAttribute("d", "M8 5v14l11-7-11-7Z");
      triangle.setAttribute("class", "qi-play-symbol");
      const bars = document.createElementNS("http://www.w3.org/2000/svg", "path");
      bars.setAttribute("d", "M6 10v4M12 6v12M18 8v8");
      bars.setAttribute("class", "qi-playing-symbol");
      icon.append(triangle, bars);
      select.append(img, icon);
      select.addEventListener("click", () => {
        if (!joined) return;
        playback.enablePlayback(true);
        send({ type: "select", itemId: item.id });
      });
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
      li.append(select, info, remove);
      queueList.insertBefore(li, queueList.children[index] || null);
      if (!reducedMotion.matches) li.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: 450, easing: "cubic-bezier(.22,1,.36,1)" });
    });
    for (const row of rows.values()) row.remove();
    }
    const item = room.queue[room.currentIndex];
    $("placeholder").style.display = item || room.share ? "none" : "flex";
    const status = room.share ? room.share.name + " is sharing a browser tab." : item ? (room.isPlaying ? "Playing: " : "Paused: ") + item.title : "No video selected.";
    if ($("playing-status").textContent !== status) $("playing-status").textContent = status;
    $("queue-count").textContent = String(room.queue.length).padStart(2, "0");
    $("queue-empty").hidden = !!room.queue.length;
    controls();
  }

  username.addEventListener("click", () => {
    $("guest-name").value = name;
    $("name-dialog").showModal();
    $("guest-name").select();
  });
  $("name-form").addEventListener("submit", event => {
    event.preventDefault();
    const value = $("guest-name").value;
    if (!value?.trim()) return;
    name = value.trim().slice(0, 32);
    try { localStorage.setItem("pp_user", name); } catch {}
    usernameLabel.textContent = name;
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
  $("auto-clear-btn").addEventListener("click", () => send({ type: "auto-clear", enabled: !room.autoClear }));
  $("skip-btn").addEventListener("click", () => $("skip-dialog").showModal());
  skipToggle.addEventListener("click", () => send({ type: "sponsor-skip", enabled: !room.sponsorSkip.enabled }));
  for (const box of skipBoxes) box.addEventListener("change", () => {
    send({ type: "sponsor-skip", categories: skipBoxes.filter(item => item.checked).map(item => item.value) });
  });
  enableButton.addEventListener("click", () => playback.enablePlayback());

  async function addVideo(value, fromPaste = false) {
    if (adding || pastedAddition || readingClipboard) { if (fromPaste) toast("A video is being added. Paste again in a moment."); return; }
    if (!joined) { toast("Wait for the room to reconnect"); return; }
    const url = youtubeUrl(value);
    if (!url) { showLinkError(value.trim() ? "Use a YouTube video link." : "Paste a YouTube link."); return; }
    showLinkError();
    if (room.queue.length >= 100) { toast("The playlist is full"); return; }
    adding = true;
    if (fromPaste) toast("Adding video…");
    addButton.disabled = true;
    addButton.setAttribute("aria-label", "Adding video");
    let title = url;
    try {
      const response = await fetch("https://www.youtube.com/oembed?url=" + encodeURIComponent(url) + "&format=json", { signal: AbortSignal.timeout(4000) });
      if (response.ok) title = (await response.json()).title || url;
    } catch {}
    if (send({ type: "add", url, title })) {
      if (fromPaste) {
        pastedAddition = { url, before: new Set(room.queue.map(item => item.id)), timer: setTimeout(() => {
          pastedAddition = null;
          toast("Room is slow to respond. Check the playlist.");
        }, 6000) };
      } else if (urlInput.value.trim() === value.trim()) urlInput.value = "";
    } else toast(fromPaste ? "Connection lost. Reconnect and paste again." : "Connection lost. Your URL is still here; try again after reconnecting.");
    addButton.setAttribute("aria-label", "Add to playlist");
    adding = false;
    controls();
  }
  function showLinkError(message = "") {
    clearTimeout(linkFeedbackTimer);
    clearTimeout(linkFeedbackHideTimer);
    addFeedback.classList.remove("is-leaving");
    addError.textContent = message;
    addFeedback.hidden = !message;
    urlInput.setAttribute("aria-invalid", String(!!message));
    addForm.dataset.invalid = String(!!message);
    if (message) {
      urlInput.focus();
      pals.linkError(message);
      linkFeedbackTimer = setTimeout(hideLinkFeedback, 4000);
    }
  }
  function hideLinkFeedback() {
    clearTimeout(linkFeedbackTimer);
    clearTimeout(linkFeedbackHideTimer);
    if (addFeedback.hidden) return;
    urlInput.setAttribute("aria-invalid", "false");
    addForm.dataset.invalid = "false";
    addFeedback.classList.add("is-leaving");
    linkFeedbackHideTimer = setTimeout(() => showLinkError(), reducedMotion.matches ? 0 : 180);
  }
  urlInput.addEventListener("input", () => showLinkError());
  addForm.addEventListener("focusout", event => {
    if (!addForm.contains(event.relatedTarget)) hideLinkFeedback();
  });
  addForm.addEventListener("submit", event => {
    event.preventDefault();
    if (readingClipboard) return;
    addVideo(urlInput.value);
  });
  addButton.addEventListener("click", async () => {
    if (!joined || adding || readingClipboard || pastedAddition) return;
    readingClipboard = true;
    controls();
    const link = await playlistLink(urlInput, navigator.clipboard);
    readingClipboard = false;
    if (stopping) return;
    controls();
    if (!link) {
      showLinkError("Paste a YouTube link.");
      return;
    }
    addVideo(link.value, link.fromClipboard);
  });
  // Videos sent from the browser extension wait until the room is ready for them.
  function addIncomingVideo() {
    if (!incomingVideo || !joined || adding || readingClipboard || pastedAddition) return;
    const url = incomingVideo;
    incomingVideo = null;
    addVideo(url, true);
  }
  window.addEventListener("message", event => {
    const url = extensionVideo(event, window);
    if (!url) return;
    incomingVideo = url;
    addIncomingVideo();
  });
  document.addEventListener("paste", event => {
    const url = pastedVideo(event, !!document.querySelector("dialog[open]"));
    if (!url) return;
    event.preventDefault();
    addVideo(url, true);
  });

  function timeLabel(time) {
    const seconds = Math.max(0, Math.floor(time || 0));
    return seconds >= 3600 ? Math.floor(seconds / 3600) + ":" + String(Math.floor(seconds / 60) % 60).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0") : Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
  }
  function updateProgress() {
    const hasVideo = !!room?.queue[room.currentIndex];
    // A stopped embed still reports the last video's length.
    const duration = hasVideo ? playback.player?.getDuration?.() || 0 : 0;
    progress.disabled = !joined || !hasVideo || !duration;
    progress.max = String(duration || Math.max(1, playback.targetTime()));
    $("duration").textContent = timeLabel(duration);
    if (!scrubbing) progress.value = String(hasVideo ? Math.min(playback.targetTime(), duration || playback.targetTime()) : 0);
    $("elapsed").textContent = timeLabel(Number(progress.value));
    progress.style.setProperty("--progress", (duration ? Number(progress.value) / duration * 100 : 0) + "%");
    progress.setAttribute("aria-valuetext", timeLabel(Number(progress.value)) + " of " + timeLabel(duration));
    // Parts the room will skip show as marks on the timeline.
    const skip = room?.sponsorSkip;
    const marks = hasVideo && duration && skip?.enabled && room.segmentsFor === room.queue[room.currentIndex].videoId
      ? room.segments.filter(segment => skip.categories.includes(segment.category)) : [];
    const signature = JSON.stringify([marks, duration]);
    if (signature !== segmentSignature) {
      segmentSignature = signature;
      const stops = marks.map(segment => {
        const from = (Math.min(segment.start, duration) / duration * 100).toFixed(2) + "%";
        const to = (Math.min(segment.end, duration) / duration * 100).toFixed(2) + "%";
        return "transparent " + from + ",var(--segment) " + from + ",var(--segment) " + to + ",transparent " + to;
      });
      if (stops.length) progress.style.setProperty("--segments", "linear-gradient(to right," + stops.join(",") + ")");
      else progress.style.removeProperty("--segments");
    }
  }
  function seek(time) {
    if (!joined || room?.share || !room?.queue[room.currentIndex]) return;
    const duration = playback.player?.getDuration?.() || 604800;
    playback.command("seek", Math.max(0, Math.min(time, duration)));
  }
  function setTheater(active) {
    document.body.classList.toggle("theater", active);
    $("theater-btn").setAttribute("aria-pressed", String(active));
    try { localStorage.setItem("youple-theater", String(active)); } catch {}
  }
  $("theater-btn").setAttribute("aria-pressed", String(document.body.classList.contains("theater")));
  progress.addEventListener("input", () => { scrubbing = true; updateProgress(); });
  progress.addEventListener("change", () => { seek(Number(progress.value)); scrubbing = false; });
  progress.addEventListener("blur", () => { scrubbing = false; });
  $("first-video-btn").addEventListener("click", async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    setTheater(false);
    urlInput.focus();
    urlInput.scrollIntoView({ block: "center", behavior: reducedMotion.matches ? "instant" : "smooth" });
  });
  $("theater-btn").addEventListener("click", async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    setTheater(!document.body.classList.contains("theater"));
    if (!reducedMotion.matches) $("stage").animate([{ opacity: .65 }, { opacity: 1 }], { duration: 400 });
  });
  $("fullscreen-btn").hidden = !document.fullscreenEnabled || !$("room-shell").requestFullscreen;
  $("fullscreen-btn").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if ($("room-shell").requestFullscreen) await $("room-shell").requestFullscreen();
      else toast("Fullscreen is unavailable in this browser.");
    } catch { toast("Fullscreen couldn't open in this browser."); }
  });
  document.addEventListener("fullscreenchange", () => {
    const active = document.fullscreenElement === $("room-shell");
    $("fullscreen-btn").setAttribute("aria-pressed", String(active));
    $("fullscreen-btn").setAttribute("aria-label", active ? "Exit fullscreen" : "Fullscreen");
    $("fullscreen-btn").title = active ? "Exit fullscreen (F)" : "Fullscreen (F)";
  });
  const deviceVolume = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  $("device-volume-hint").hidden = !deviceVolume;
  $("device-volume-hint").title = "Use your device’s volume buttons";
  let volumeStorage;
  try { volumeStorage = localStorage; } catch {}
  const sound = bindVolumeControl({
    slider: $("volume"), muteButton: $("mute-btn"), muteLabel: $("mute-label"), muteIcon: $("mute-icon"), unmuteIcon: $("unmute-icon"),
    getPlayer: () => playback.player, storage: volumeStorage, deviceVolume,
    onToggle(muted) { if (room?.queue[room.currentIndex]) flashOverlay(muted ? "muted" : "unmuted"); },
  });
  function updateMuteControl() { sound.sync(); }
  $("help-btn").addEventListener("click", () => $("help-dialog").showModal());
  let copyingInvite = false, inviteTimer, copiedTimer;
  // Copy confirmations pop up mid-screen so nobody misses that the link is ready to paste.
  function showCopiedInvite(message = "Paste it anywhere to invite friends.") {
    pals.inviteCopied();
    clearTimeout(inviteTimer);
    $("invite-icon").hidden = true;
    $("invite-success-icon").hidden = false;
    $("invite-label").textContent = "Link copied";
    $("invite-btn").dataset.copied = "true";
    $("invite-btn").setAttribute("aria-label", "Link copied");
    $("copied-pop-title").textContent = "Link copied";
    $("copied-pop-text").textContent = message;
    $("copied-pop").classList.remove("show");
    void $("copied-pop").offsetWidth;
    $("copied-pop").classList.add("show");
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => $("copied-pop").classList.remove("show"), 2400);
    inviteTimer = setTimeout(() => {
      $("invite-icon").hidden = false;
      $("invite-success-icon").hidden = true;
      $("invite-label").textContent = "Invite friends";
      delete $("invite-btn").dataset.copied;
      $("invite-btn").setAttribute("aria-label", "Invite friends");
    }, 3200);
  }
  const created = takeCreatedRoomNotice();
  if (created) arrival.then(() => {
    if (stopping) return;
    if (created.copied) showCopiedInvite("Your room is ready. Send the link to your friends.");
    else toast("Room ready. Tap Invite friends to copy the link.");
  });
  $("invite-btn").addEventListener("click", async () => {
    if (copyingInvite) return;
    copyingInvite = true;
    const link = location.origin + location.pathname;
    try {
      if (!await copyText(link)) throw new Error("Copy unavailable");
      showCopiedInvite();
    } catch { toast("Couldn't copy. Copy the link from your address bar."); }
    finally { copyingInvite = false; }
  });
  document.addEventListener("keydown", event => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.target.closest?.("input,textarea,select,[contenteditable=true]") || document.querySelector("dialog[open]")) return;
    if ((event.key === " " || event.key === "Enter") && event.target.closest?.("button")) return;
    const key = event.key.toLowerCase();
    const actions = {
      " ": togglePlayback, k: togglePlayback,
      arrowleft: () => seek(playback.targetTime() - 5), arrowright: () => seek(playback.targetTime() + 5),
      j: () => seek(playback.targetTime() - 10), l: () => seek(playback.targetTime() + 10),
      n: () => { if (!nextButton.disabled) nextButton.click(); },
      f: () => $("fullscreen-btn").click(), t: () => $("theater-btn").click(),
      m: () => { if (room?.share) { if (!sharing?.hosting) $("shared-video").muted = !$("shared-video").muted; } else $("mute-btn").click(); },
      "?": () => $("help-btn").click(),
    };
    if (actions[key]) { event.preventDefault(); actions[key](); }
  });

  function createPlayer() {
    const player = new window.YT.Player("yt-player", {
      height: "100%", width: "100%",
      playerVars: { controls: youtubeControls ? 1 : 0, disablekb: 1, rel: 0, playsinline: 1, fs: 0, origin: location.origin },
      events: {
        onReady() {
          if (stopping || player !== youtubePlayer) return;
          sound.ready(player); playback.ready(player); updateMuteControl(); controls();
        },
        onStateChange(event) { if (player === youtubePlayer) playback.stateChanged(event.data); },
        onAutoplayBlocked() { if (player === youtubePlayer) playback.autoplayBlocked(); },
        onError() {
          if (player !== youtubePlayer) return;
          playback.failed();
          // A record that can't play moves on to one of its backups.
          if (music.unavailable()) return;
          toast("Video unavailable or embedding blocked. Try another video or use Next.");
        },
      },
    });
    youtubePlayer = player;
  }
  window.onYouTubeIframeAPIReady = createPlayer;
  youtubeButton.addEventListener("click", () => {
    if (youtubeButton.disabled || !youtubePlayer) return;
    youtubeControls = !youtubeControls;
    $("room-shell").dataset.youtubeControls = String(youtubeControls);
    youtubeButton.setAttribute("aria-pressed", String(youtubeControls));
    youtubeButton.title = youtubeControls ? "Hide YouTube controls" : "Show subtitles and quality controls";
    const previous = youtubePlayer;
    youtubePlayer = null;
    playback.detach();
    controls();
    previous.destroy();
    // YouTube restores its original mount when destroyed.
    if (!$("yt-player")) {
      const mount = document.createElement("div");
      mount.id = "yt-player";
      $("player-wrap").prepend(mount);
    }
    createPlayer();
    toast(youtubeControls ? "Use YouTube’s CC or settings for subtitles and quality." : "YouTube controls hidden.");
  });

  const sampleTimer = setInterval(() => { playback.tick(); updateProgress(); updateMuteControl(); updateFullscreenControls(); }, 250);
  const syncTimer = setInterval(() => {
    if (joined && performance.now() - lastMessage > 20000) socket?.close();
    else if (joined) requestState();
  }, 5000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) { playback.sample = null; requestState(); }
  });
  window.addEventListener("pagehide", () => {
    stopping = true;
    fullscreenControls.destroy();
    music.destroy();
    sharing?.stop();
    clearInterval(sampleTimer);
    clearInterval(syncTimer);
    clearTimeout(reconnectTimer);
    clearTimeout(joinTimer);
    clearTimeout(linkFeedbackTimer);
    clearTimeout(linkFeedbackHideTimer);
    if (pastedAddition) clearTimeout(pastedAddition.timer);
    clearTimeout(inviteTimer);
    clearTimeout(copiedTimer);
    socket?.close(1000, "Leaving room");
  });
  window.addEventListener("pageshow", event => { if (event.persisted) location.reload(); });
  connect();
  let playerRequested = false;
  function ensurePlayer() {
    if (playerRequested || !room?.queue[room.currentIndex]) return;
    playerRequested = true;
    // Empty rooms need no iframe. Keep YouTube setup out of the arrival fade.
    arrival.then(() => {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.addEventListener("error", () => {
        playerRequested = false;
        if (music.state().selected) music.fail("Could not load YouTube. Check your connection and reload.");
        toast("Could not load YouTube. Check your connection and reload.");
      });
      document.head.append(script);
    });
  }
}
