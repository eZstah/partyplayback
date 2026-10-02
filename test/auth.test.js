import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeReturnTo, sameOrigin, displayName, cleanDisplayName, avatarUrl, authClient, verifiedUser, privateJson } from '../src/lib/auth.ts';

test('OAuth return paths reject external redirects and control characters', () => {
  for (const path of ['https://evil.example', '//evil.example', '/\\evil.example', '/\nevil', null, 7]) assert.equal(safeReturnTo(path), '/');
  assert.equal(safeReturnTo('/room/m-123?hello=1'), '/room/m-123?hello=1');
});
test('room and sign-in mutations require the exact request origin', () => {
  for (const origin of [null, 'https://evil.example', 'https://party.example.evil']) {
    assert.equal(sameOrigin(new Request('https://party.example/api/rooms', { headers: origin ? { Origin: origin } : {} })), false);
  }
  assert.equal(sameOrigin(new Request('https://party.example/api/rooms', { headers: { Origin: 'https://party.example' } })), true);
});
test('missing configuration cannot manufacture an authenticated user', async () => {
  const context = { locals: { runtime: { env: {} } } };
  assert.equal(authClient(context), null);
  assert.equal(await verifiedUser(context), null);
  assert.equal(privateJson({ rooms: [] }).headers.get('Cache-Control'), 'private, no-store');
});
test('verified display names are bounded and use provider metadata', () => {
  assert.equal(displayName({ user_metadata: { full_name: 'Ada Lovelace' } }), 'Ada Lovelace');
  assert.equal(displayName({ user_metadata: { name: 'x'.repeat(100) } }).length, 32);
  assert.equal(displayName({ user_metadata: {} }), 'Member');
});
test('a name chosen on the profile wins and is cleaned', () => {
  assert.equal(displayName({ user_metadata: { display_name: '  Kos\n  tya ', full_name: 'Konstantin B' } }), 'Kos tya');
  assert.equal(displayName({ user_metadata: { display_name: '   ', full_name: 'Konstantin B' } }), 'Konstantin B');
  assert.equal(cleanDisplayName('x'.repeat(33)), null);
  assert.equal(cleanDisplayName(42), null);
});
test('avatars only come from https provider URLs', () => {
  assert.equal(avatarUrl({ user_metadata: { avatar_url: 'https://cdn.discordapp.com/a.png' } }), 'https://cdn.discordapp.com/a.png');
  assert.equal(avatarUrl({ user_metadata: { picture: 'https://lh3.googleusercontent.com/a' } }), 'https://lh3.googleusercontent.com/a');
  for (const value of ['javascript:alert(1)', 'http://x.example/a.png', 'not a url', 7]) assert.equal(avatarUrl({ user_metadata: { avatar_url: value } }), null);
});
