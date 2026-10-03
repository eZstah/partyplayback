// Records on the music shelf. Each mood has a few recorded (seekable) mixes:
// the first that plays is used, and the rest are backups for when YouTube
// removes one or blocks embedding. Adding a record is one line. Avoid live
// radios: they don't share the room's bounded timeline.
// checked: the date a video was confirmed to embed and play. Run
// `node scripts/check-records.mjs` to recheck them all.
export const MUSIC_MIXES = [
  { key: 'ambient', label: 'Ambient', detail: 'Slow down', videos: [
    { id: 'fQ35eh6k0RI', title: 'Lofi Girl · deep sleep music with purring sounds — 8 hours of ambient mix', checked: '2026-10-03' },
    { id: 'ctFv6PyRsk8', title: 'Lofi Girl · Late Night Essentials — lofi beats / ambient sleep' },
  ] },
  { key: 'lofi', label: 'Lo-fi', detail: 'Settle in', videos: [
    { id: '8gJ716dhStg', title: 'Lofi Girl · A Book, a Blanket, and the Autumn Breeze — lofi hip hop', checked: '2026-10-03' },
    { id: 'CFGLoQIhmow', title: 'Lofi Girl · lofi hip hop mix — beats to relax/study to (Part 1)', checked: '2026-10-03' },
    { id: '8b3fqIBrNW0', title: 'Lofi Girl · lofi hip hop mix — beats to relax/study to (Part 2)' },
  ] },
  { key: 'piano', label: 'Piano', detail: 'Drift away', videos: [
    { id: 'cYPJaHT5f3E', title: 'Lofi Girl · Peaceful Day — calm piano', checked: '2026-10-03' },
    { id: '3G3vzexbf64', title: 'peaceful piano — 3 hours of relaxing music to read to' },
  ] },
  { key: 'jazz', label: 'Jazz', detail: 'Rainy day', videos: [
    { id: 'CBSlu_VMS9U', title: 'jazz lofi mix [3 hours] — relaxing music to chill/study to' },
    { id: '2tniF7JrQ50', title: '8 Hours Smooth Lofi Jazz — chill beats' },
  ] },
  { key: 'sleep', label: 'Sleep', detail: 'Lights out', videos: [
    { id: 'UJs6__K7gSY', title: 'Bedtime Lofi — 8 hours of relaxing beats to sleep to' },
    { id: '2DExiF0thhk', title: 'Sleep with Lofi Cat' },
  ] },
];

const mixOf = videoId => MUSIC_MIXES.find(mix => mix.videos.some(video => video.id === videoId));

// Wait for the server's item identity before selecting an addition. Queue
// indices can change while another guest adds, removes or selects a video.
export function createMusicSelector({ send, enablePlayback, onChange = () => {},
  schedule = (fn, ms) => setTimeout(fn, ms), cancel = id => clearTimeout(id) }) {
  let room = null, connected = false, pending = null, timer = null, error = '';
  const broken = new Set(); // videos that failed to load in this visit
  let requested = null; // the last record video this viewer asked for
  let leftovers = []; // queue items of failed videos, removed once a backup plays
  function state() {
    const current = room?.queue[room.currentIndex];
    const selected = current && mixOf(current.videoId);
    return { connected, pending: pending?.mix.key || null, selected: selected?.key || null,
      playing: !!room?.isPlaying, error };
  }
  const publish = () => onChange(state());
  function clearPending() { cancel(timer); timer = null; pending = null; }
  function fail(message) { clearPending(); error = message; publish(); }
  function select(key) {
    const mix = MUSIC_MIXES.find(item => item.key === key);
    if (!mix || pending) return false;
    if (!connected || !room) { fail('Reconnecting. Try a record when the room is back.'); return false; }
    const healthy = mix.videos.filter(video => !broken.has(video.id));
    if (!healthy.length) { fail(mix.label + " can't play right now. Try another record."); return false; }
    const existing = room.queue.find(item => healthy.some(video => video.id === item.videoId));
    const video = healthy[0];
    if (!existing && room.queue.length >= 100) { fail('Playlist full. Remove a video in the room, then try again.'); return false; }
    error = '';
    enablePlayback(); // Keep the autoplay unlock inside the click gesture.
    pending = { mix, videoId: existing?.videoId || video.id, itemId: existing?.id, before: new Set(room.queue.map(item => item.id)) };
    requested = pending.videoId;
    timer = schedule(() => fail('The room took too long. Try the record again.'), 8000);
    const sent = send(existing ? { type: 'select', itemId: existing.id }
      : { type: 'add', url: 'https://www.youtube.com/watch?v=' + video.id, title: video.title });
    if (!sent) { fail('Connection lost. Try again after reconnecting.'); return false; }
    publish();
    return true;
  }
  function update(nextRoom, isConnected) {
    if (nextRoom?.queue[nextRoom.currentIndex]?.id !== room?.queue[room.currentIndex]?.id) error = '';
    room = nextRoom;
    connected = isConnected;
    if (!connected && pending) { fail('Connection lost. Try again after reconnecting.'); return; }
    if (pending && room) {
      if (!pending.itemId) {
        const added = room.queue.find(item => item.videoId === pending.videoId && !pending.before.has(item.id));
        if (added) {
          pending.itemId = added.id;
          if (room.queue[room.currentIndex]?.id !== added.id || !room.isPlaying) {
            if (!send({ type: 'select', itemId: added.id })) { fail('Connection lost. Try again after reconnecting.'); return; }
          }
        }
      }
      if (pending.itemId && room.queue[room.currentIndex]?.id === pending.itemId && room.isPlaying) {
        clearPending();
        for (const itemId of leftovers.splice(0)) if (room.queue.some(item => item.id === itemId)) send({ type: 'remove', itemId });
      }
    }
    publish();
  }
  // The player couldn't load the current video. If it was a record, remember it
  // and move on to the next backup of the same mood. Only the viewer who picked
  // the record does that, so a room full of viewers adds one backup, not one each.
  function unavailable() {
    const current = room?.queue[room.currentIndex], mix = current && mixOf(current.videoId);
    if (!mix) return false;
    broken.add(current.videoId);
    clearPending();
    if (current.videoId === requested) {
      leftovers.push(current.id);
      if (select(mix.key)) return true;
      leftovers = [];
    }
    if (!error) fail("This mix couldn't load. Try another record.");
    return true;
  }
  return { select, update, state, fail, unavailable, destroy: clearPending };
}

export function paintMusicShelf(root, state) {
  if (!root) return;
  const selected = MUSIC_MIXES.find(mix => mix.key === state.selected);
  const pending = MUSIC_MIXES.find(mix => mix.key === state.pending);
  for (const button of root.querySelectorAll('[data-music-mix]')) {
    const key = button.dataset.musicMix;
    button.disabled = !state.connected || !!pending;
    button.setAttribute('aria-pressed', String(key === state.selected));
    button.setAttribute('aria-busy', String(key === state.pending));
    button.dataset.playing = String(key === state.selected && state.playing && !state.error);
  }
  const message = state.error || (pending ? 'Loading ' + pending.label + '…'
    : !state.connected ? 'Connecting…' : selected ? (state.playing ? 'On the TV · ' : 'Paused · ') + selected.label : 'Pick a record');
  const status = root.querySelector('[data-music-status]');
  if (status.textContent !== message) status.textContent = message;
  root.dataset.error = String(!!state.error);
}

// Aquarium also exists on the landing page. Picking a record there opens a
// guest room and carries the choice through, without a separate hidden player.
export function mountHomeMusicShelf(root) {
  if (!root) return;
  let creating = false;
  paintMusicShelf(root, { connected: true });
  root.querySelector('[data-music-hint]').textContent = 'Start a music room';
  for (const button of root.querySelectorAll('[data-music-mix]')) {
    const mix = MUSIC_MIXES.find(item => item.key === button.dataset.musicMix);
    button.setAttribute('aria-label', 'Start a shared ' + mix.label + ' music room');
    button.addEventListener('click', async () => {
      if (creating) return;
      creating = true;
      paintMusicShelf(root, { connected: true, pending: button.dataset.musicMix });
      try {
        const response = await fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'guest' }), signal: AbortSignal.timeout(10000) });
        const data = await response.json();
        if (!response.ok || !/^\/room\/[a-zA-Z0-9_-]{1,64}$/.test(data.url)) throw new Error('create');
        location.assign(data.url + '?wallpaper=1&mix=' + encodeURIComponent(button.dataset.musicMix));
      } catch {
        creating = false;
        paintMusicShelf(root, { connected: true, error: 'Could not open a room. Try your record again.' });
      }
    });
  }
  window.addEventListener('pageshow', () => { creating = false; paintMusicShelf(root, { connected: true }); });
}
