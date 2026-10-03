import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMusicSelector, MUSIC_MIXES } from '../src/scripts/music-shelf.js';

const ambient = MUSIC_MIXES[0];
const item = (id, videoId = ambient.videos[0].id) => ({ id, videoId });
const room = (queue = [], currentIndex = -1, isPlaying = false) => ({ queue, currentIndex, isPlaying });
function setup(initial = room()) {
  const sent = [], changes = [];
  let timeout, enabled = 0, online = true;
  const selector = createMusicSelector({
    send: message => { if (!online) return false; sent.push(message); return true; },
    enablePlayback: () => enabled++, onChange: state => changes.push(state),
    schedule: fn => { timeout = fn; return 1; }, cancel: () => { timeout = null; },
  });
  selector.update(initial, true);
  return { selector, sent, changes, enabled: () => enabled, expire: () => timeout?.(), goOffline: () => { online = false; } };
}

test('record selection adds once, then selects the acknowledged identity after concurrent queue edits', () => {
  const s = setup(room([item('movie', 'movie-id')], 0, true));
  assert.equal(s.selector.select('ambient'), true);
  assert.equal(s.enabled(), 1);
  assert.equal(s.sent[0].type, 'add');
  assert.equal(s.selector.select('lofi'), false);
  s.selector.update(room([item('someone-else', 'another-video'), item('new-record'), item('movie', 'movie-id')], 2, true), true);
  assert.deepEqual(s.sent[1], { type: 'select', itemId: 'new-record' });
  s.selector.update(room([item('new-record')], 0, true), true);
  assert.equal(s.selector.state().pending, null);
  assert.equal(s.selector.state().selected, 'ambient');
  s.expire();
  assert.equal(s.selector.state().error, '');
});

test('a mix already in the playlist is reused and a paused mix resumes', () => {
  const s = setup(room([item('saved')], 0, false));
  s.selector.select('ambient');
  assert.deepEqual(s.sent, [{ type: 'select', itemId: 'saved' }]);
  s.selector.update(room([item('saved')], 0, true), true);
  assert.equal(s.selector.state().pending, null);
  assert.equal(s.selector.state().playing, true);
});

test('an empty room auto-playing its first addition needs no second select command', () => {
  const s = setup();
  s.selector.select('ambient');
  s.selector.update(room([item('first')], 0, true), true);
  assert.equal(s.sent.length, 1);
  assert.equal(s.selector.state().pending, null);
});

test('remote selection and pausing update the selected sleeve from shared state', () => {
  const s = setup();
  s.selector.update(room([item('lofi', MUSIC_MIXES[1].videos[0].id)], 0, true), true);
  assert.equal(s.selector.state().selected, 'lofi');
  s.selector.update(room([item('lofi', MUSIC_MIXES[1].videos[0].id)], 0, false), true);
  assert.equal(s.selector.state().playing, false);
  s.selector.update(room([item('film', 'different-video')], 0, true), true);
  assert.equal(s.selector.state().selected, null);
});

test('disconnect abandons a pending addition and cannot select it after reconnect', () => {
  const s = setup();
  s.selector.select('ambient');
  s.selector.update(room(), false);
  assert.match(s.selector.state().error, /Connection lost/);
  s.selector.update(room([item('late-record'), item('film', 'movie-id')], 1, true), true);
  assert.equal(s.sent.length, 1);
  s.selector.select('ambient');
  assert.deepEqual(s.sent[1], { type: 'select', itemId: 'late-record' });
});

test('timeout and server rejection release controls; delayed state cannot start playback', () => {
  const s = setup();
  s.selector.select('ambient');
  s.expire();
  assert.equal(s.selector.state().pending, null);
  s.selector.update(room([item('late-record')]), true);
  assert.equal(s.sent.length, 1);
  s.selector.select('ambient');
  s.selector.fail('Room unavailable');
  assert.equal(s.selector.state().error, 'Room unavailable');
  assert.equal(s.selector.state().pending, null);
});

test('full queue permits existing mixes but rejects new ones without an unlock or send', () => {
  const queue = Array.from({ length: 100 }, (_, i) => item(String(i), 'other-' + i));
  const s = setup(room(queue, 0, true));
  assert.equal(s.selector.select('ambient'), false);
  assert.equal(s.sent.length, 0);
  assert.equal(s.enabled(), 0);
  queue[99] = item('saved', ambient.videos[0].id);
  s.selector.update(room(queue, 0, true), true);
  assert.equal(s.selector.select('ambient'), true);
  assert.deepEqual(s.sent[0], { type: 'select', itemId: 'saved' });
});

test('unknown presets, disconnected rooms and failed sends do not leave a pending selection', () => {
  const s = setup();
  assert.equal(s.selector.select('untrusted-video'), false);
  s.selector.update(room(), false);
  assert.equal(s.selector.select('ambient'), false);
  s.selector.update(room(), true);
  s.goOffline();
  assert.equal(s.selector.select('ambient'), false);
  assert.equal(s.selector.state().pending, null);
  assert.equal(s.sent.length, 0);
});

test('an embed error clears when another guest selects a different recording', () => {
  const s = setup(room([item('ambient')], 0, true));
  s.selector.fail('This mix could not load');
  s.selector.update(room([item('ambient')], 0, true), true);
  assert.notEqual(s.selector.state().error, '');
  s.selector.update(room([item('lofi', MUSIC_MIXES[1].videos[0].id)], 0, true), true);
  assert.equal(s.selector.state().error, '');
});

test('every record has a mood, a label and recorded videos with unique ids', () => {
  const ids = MUSIC_MIXES.flatMap(mix => mix.videos.map(video => video.id));
  assert.equal(new Set(MUSIC_MIXES.map(mix => mix.key)).size, MUSIC_MIXES.length);
  assert.equal(new Set(ids).size, ids.length, 'a video belongs to one record');
  for (const mix of MUSIC_MIXES) {
    assert.ok(mix.label && mix.detail && mix.videos.length >= 1, mix.key);
    for (const video of mix.videos) assert.match(video.id, /^[\w-]{11}$/);
  }
});

test('a record whose video cannot play moves on to its backup, once', () => {
  const [first, backup] = ambient.videos;
  const s = setup();
  s.selector.select('ambient');
  assert.equal(s.sent[0].url, 'https://www.youtube.com/watch?v=' + first.id);
  s.selector.update(room([item('a', first.id)], 0, true), true);
  assert.equal(s.selector.unavailable(), true);
  assert.equal(s.sent[1].url, 'https://www.youtube.com/watch?v=' + backup.id, 'the backup is added');
  s.selector.update(room([item('a', first.id), item('b', backup.id)], 0, true), true);
  assert.deepEqual(s.sent[2], { type: 'select', itemId: 'b' });
  s.selector.update(room([item('a', first.id), item('b', backup.id)], 1, true), true);
  assert.equal(s.selector.state().selected, 'ambient');
  assert.equal(s.selector.state().error, '');
  assert.deepEqual(s.sent[3], { type: 'remove', itemId: 'a' }, 'the broken video leaves the playlist');
  // Picking the record again later skips the broken video, even if someone queued it again.
  s.selector.update(room([item('a2', first.id), item('b', backup.id), item('film', 'movie-id')], 2, true), true);
  s.selector.select('ambient');
  assert.deepEqual(s.sent.at(-1), { type: 'select', itemId: 'b' });
});

test('when every video of a record fails, the shelf says so and stops trying', () => {
  const s = setup();
  s.selector.select('piano');
  const videos = MUSIC_MIXES.find(mix => mix.key === 'piano').videos;
  let queue = [];
  for (const [i, video] of videos.entries()) {
    queue = [...queue, item('p' + i, video.id)];
    s.selector.update(room(queue, i, true), true);
    s.selector.unavailable();
  }
  assert.match(s.selector.state().error, /Piano can't play right now/);
  const sent = s.sent.length;
  assert.equal(s.selector.select('piano'), false);
  assert.equal(s.sent.length, sent);
});

test('only the viewer who picked a record adds its backup', () => {
  const s = setup(room([item('a', ambient.videos[0].id)], 0, true));
  assert.equal(s.selector.unavailable(), true, 'the error is handled quietly');
  assert.equal(s.sent.length, 0, 'someone else picked it, so they add the backup');
  assert.match(s.selector.state().error, /couldn't load/);
  assert.equal(setup(room([item('film', 'movie-id')], 0, true)).selector.unavailable(), false, 'not a record');
});
