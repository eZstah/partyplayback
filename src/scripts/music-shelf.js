// Curated recorded mixes, checked against the creators' oEmbed metadata
// on 2026-10-03. Keep the actual video in the room's existing shared player.
export const MUSIC_MIXES = [
  { key: 'ambient', label: 'Ambient', detail: 'Slow down', videoId: 'fQ35eh6k0RI', title: 'Lofi Girl · deep sleep music with purring sounds — 8 hours of ambient mix' },
  { key: 'lofi', label: 'Lo-fi', detail: 'Settle in', videoId: '8gJ716dhStg', title: 'Lofi Girl · A Book, a Blanket, and the Autumn Breeze — lofi hip hop' },
  { key: 'piano', label: 'Piano', detail: 'Drift away', videoId: 'cYPJaHT5f3E', title: 'Lofi Girl · Peaceful Day — calm piano' },
];

// Wait for the server's item identity before selecting an addition. Queue
// indices can change while another guest adds, removes or selects a video.
export function createMusicSelector({ send, enablePlayback, onChange = () => {},
  schedule = (fn, ms) => setTimeout(fn, ms), cancel = id => clearTimeout(id) }) {
  let room = null, connected = false, pending = null, timer = null, error = '';
  function state() {
    const current = room?.queue[room.currentIndex];
    const selected = MUSIC_MIXES.find(mix => mix.videoId === current?.videoId);
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
    const existing = room.queue.find(item => item.videoId === mix.videoId);
    if (!existing && room.queue.length >= 100) { fail('Playlist full. Remove a video in the room, then try again.'); return false; }
    error = '';
    enablePlayback(); // Keep the autoplay unlock inside the click gesture.
    pending = { mix, itemId: existing?.id, before: new Set(room.queue.map(item => item.id)) };
    timer = schedule(() => fail('The room took too long. Try the record again.'), 8000);
    const sent = send(existing ? { type: 'select', itemId: existing.id }
      : { type: 'add', url: 'https://www.youtube.com/watch?v=' + mix.videoId, title: mix.title });
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
        const added = room.queue.find(item => item.videoId === pending.mix.videoId && !pending.before.has(item.id));
        if (added) {
          pending.itemId = added.id;
          if (room.queue[room.currentIndex]?.id !== added.id || !room.isPlaying) {
            if (!send({ type: 'select', itemId: added.id })) { fail('Connection lost. Try again after reconnecting.'); return; }
          }
        }
      }
      if (pending.itemId && room.queue[room.currentIndex]?.id === pending.itemId && room.isPlaying) clearPending();
    }
    publish();
  }
  return { select, update, state, fail, destroy: clearPending };
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
