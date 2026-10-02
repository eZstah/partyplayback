import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readContact, contactEmail, sendContact, cleanPage, CONTACT_FROM } from '../src/lib/contact.ts';
const CONTACT_EMAIL = 'hello@example.com';

const origin = 'https://youple.tv';

test('contact forms need a reply address and a real message', () => {
  assert.equal(readContact({ kind: 'message', email: 'nope', message: 'Hello there' }, origin).ok, false);
  assert.equal(readContact({ kind: 'message', email: 'a@b.co', message: ' hi ' }, origin).ok, false);
  assert.equal(readContact({ kind: 'spam', email: 'a@b.co', message: 'Hello there' }, origin).ok, false);
  assert.equal(readContact(null, origin).ok, false);
  const form = readContact({ kind: 'message', name: ' Ada\n Lovelace ', email: 'ada@example.com', message: 'Hello there', page: '/room/x' }, origin);
  assert.deepEqual(form, { ok: true, value: { kind: 'message', name: 'Ada Lovelace', email: 'ada@example.com', message: 'Hello there', page: '' } });
});
test('a filled honeypot is treated as spam', () => {
  const form = readContact({ kind: 'message', email: 'a@b.co', message: 'Buy now!!', website: 'http://spam.example' }, origin);
  assert.equal(form.ok, false);
  assert.equal(form.spam, true);
});
test('bug reports only keep links to youple.tv', () => {
  assert.equal(cleanPage('https://youple.tv/room/g-123?x=1', origin), '/room/g-123?x=1');
  assert.equal(cleanPage('/profile', origin), '/profile');
  assert.equal(cleanPage('https://evil.example/room', origin), '');
  assert.equal(cleanPage('javascript:alert(1)', origin), '');
});
test('emails go to the operator with reply-to set to the sender', () => {
  const form = readContact({ kind: 'bug', email: 'ada@example.com', message: 'Video froze\nafter skipping', page: 'https://youple.tv/room/g-1' }, origin).value;
  const email = contactEmail(CONTACT_EMAIL, form, { userAgent: 'Firefox', screen: '390x844', user: { id: 'u1', email: 'ada@example.com', name: 'Ada' } }, origin);
  assert.equal(email.from, CONTACT_FROM);
  assert.deepEqual(email.to, [CONTACT_EMAIL]);
  assert.equal(email.reply_to, 'ada@example.com');
  assert.equal(email.subject, '[youple.tv] Bug: Video froze');
  for (const line of ['Page: https://youple.tv/room/g-1', 'Browser: Firefox', 'Screen: 390x844', 'Account: Ada (ada@example.com, u1)']) assert.ok(email.text.includes(line), line);
  const message = contactEmail(CONTACT_EMAIL, { ...form, kind: 'message', page: '' }, { userAgent: 'Firefox' }, origin);
  assert.ok(!message.text.includes('Browser'));
  assert.ok(message.text.includes('Account: not signed in'));
});
test('sending reports Resend failures instead of throwing', async () => {
  const calls = [];
  const email = { from: CONTACT_FROM, to: [CONTACT_EMAIL], reply_to: 'a@b.co', subject: 's', text: 't' };
  assert.equal(await sendContact('key', email, async (url, init) => { calls.push([url, init]); return new Response('{}'); }), true);
  assert.equal(calls[0][0], 'https://api.resend.com/emails');
  assert.equal(calls[0][1].headers.Authorization, 'Bearer key');
  const quiet = console.error; console.error = () => {};
  try {
    assert.equal(await sendContact('key', email, async () => new Response('bad', { status: 422 })), false);
    assert.equal(await sendContact('key', email, async () => { throw new Error('offline'); }), false);
  } finally { console.error = quiet; }
});
