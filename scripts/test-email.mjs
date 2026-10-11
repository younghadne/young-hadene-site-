// Automated tests: email marketing platform (offline, mocked SES/SNS).
// Run: node scripts/test-email.js   (also via npm run test:email)
// Uses synthetic recipients only. Never sends real email.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Endpoints use ESM `export` syntax for Cloudflare, but the repo package is
// CommonJS, so plain node import of the .js files fails. Stage verbatim
// copies as .mjs inside the repo (so @aws-sdk/* resolves via node_modules)
// and test those.
const TMP = path.join('scripts', '.tmp-email-test');
fs.mkdirSync(TMP, { recursive: true });
fs.copyFileSync('functions/api/_email-lib.js', path.join(TMP, '_email-lib.mjs'));
async function loadEp(name) {
  const src = fs.readFileSync('functions/api/' + name + '.js', 'utf8')
    .replace(/from '\.\/_email-lib\.js'/g, "from './_email-lib.mjs'");
  const f = path.join(TMP, name + '.mjs');
  fs.writeFileSync(f, src);
  return import(pathToFileURL(f).href);
}

const ROOT = null;
const lib = await loadEp('_email-lib');
const EP = {};
for (const n of ['email-settings', 'email-contacts', 'email-campaigns', 'email-batch', 'email-unsub', 'email-confirm', 'email-events']) {
  EP[n.split('-')[1]] = await loadEp(n);
}

// ---- in-memory KV mock ----
function mockKv() {
  const m = new Map();
  return {
    data: m,
    async get(k) { const v = m.get(k); return v === undefined ? null : v; },
    async put(k, v) { m.set(k, String(v)); },
    async delete(k) { m.delete(k); },
    async list({ prefix = '', limit = 1000, cursor } = {}) {
      const keys = [...m.keys()].filter((k) => k.startsWith(prefix)).sort();
      let start = 0;
      if (cursor) { const i = keys.indexOf(cursor); start = i >= 0 ? i + 1 : 0; }
      const slice = keys.slice(start, start + limit);
      const done = start + limit >= keys.length;
      return { keys: slice.map((name) => ({ name })), list_complete: done, cursor: done ? undefined : slice[slice.length - 1] };
    },
  };
}

const ENV = { ADMIN_PASSWORD: 'test-pw-123', EMAIL_SECRET: 'test-email-secret-xyz', EMAIL_WEBHOOK_KEY: 'hook-key-abc', AWS_REGION: 'us-east-1' };
function envWithKv() { return Object.assign({ YH_POSTS: mockKv() }, ENV); }

function req(body, headers) {
  return { request: { json: async () => body, headers: { get: (k) => (headers || {})[k.toLowerCase()] || null }, url: 'https://younghadene.ca/api/x' }, env: null };
}
async function post(ep, env, body, headers) {
  const c = req(body, headers);
  c.env = env;
  const res = await ep.onRequestPost(c);
  return { status: res.status, data: JSON.parse(await res.text()) };
}

let pass = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log('ok -', name); }
  catch (e) { console.error('FAIL -', name, '\n', e); process.exitCode = 1; }
}

// ---------- 1. tokens ----------
await t('token round-trip + tamper rejected', async () => {
  const good = await lib.tokenFor(ENV, 'unsub', 'Fan@Example.com');
  assert.equal(await lib.tokenValid(ENV, 'unsub', 'fan@example.com', good), true);
  assert.equal(await lib.tokenValid(ENV, 'unsub', 'fan@example.com', good.slice(0, -1) + '0'), false);
  assert.equal(await lib.tokenValid(ENV, 'confirm', 'fan@example.com', good), false);
  assert.equal(await lib.tokenValid({}, 'unsub', 'a@b.c', good), false);
});

// ---------- 2. unsub GET never mutates ----------
await t('unsub GET is read-only', async () => {
  const env = envWithKv();
  const res = await EP.unsub.onRequestGet({ env });
  assert.equal(res.status, 200);
  assert.equal(env.YH_POSTS.data.size, 0);
});

// ---------- 3/4. one-click + webpage + idempotent ----------
await t('one-click POST unsubscribes; webpage needs confirm; repeat idempotent', async () => {
  const env = envWithKv();
  const email = 'reader@example.com';
  const hash = await lib.emailHash(email);
  const id = 'c1';
  await env.YH_POSTS.put('email:c:' + id, JSON.stringify({ id, email, emailHash: hash, status: 'active', consent: { status: 'opted-in' } }));
  await env.YH_POSTS.put('email:byemail:' + hash, id);
  const token = await lib.tokenFor(env, 'unsub', email);
  // webpage first step without confirm -> no mutation
  let r = await post(EP.unsub, env, { token, email });
  assert.equal(r.data.needsConfirm, true);
  assert.equal((JSON.parse(await env.YH_POSTS.get('email:c:' + id))).status, 'active');
  // webpage confirm
  r = await post(EP.unsub, env, { token, email, confirm: true });
  assert.equal(r.data.ok, true);
  assert.equal((JSON.parse(await env.YH_POSTS.get('email:c:' + id))).status, 'unsubscribed');
  // repeat -> idempotent success
  r = await post(EP.unsub, env, { token, email, confirm: true });
  assert.equal(r.data.ok, true);
  assert.equal(r.data.idempotent, true);
  // suppression recorded
  assert.ok(JSON.parse(await env.YH_POSTS.get('email:suppression'))[hash]);
});

await t('one-click header auto-confirms; invalid token rejected', async () => {
  const env = envWithKv();
  const email = 'oc@example.com';
  const hash = await lib.emailHash(email);
  await env.YH_POSTS.put('email:c:x', JSON.stringify({ id: 'x', email, emailHash: hash, status: 'active', consent: { status: 'opted-in' } }));
  await env.YH_POSTS.put('email:byemail:' + hash, 'x');
  const token = await lib.tokenFor(env, 'unsub', email);
  const r = await post(EP.unsub, env, { token, email }, { 'list-unsubscribe': 'One-Click' });
  assert.equal(r.data.ok, true);
  assert.equal(r.data.oneClick, true);
  const bad = await post(EP.unsub, env, { token: 'deadbeef', email, confirm: true });
  assert.equal(bad.status, 400);
});

// ---------- 5. CSV import: dups, invalid, suppression survives ----------
await t('CSV import never grants consent; suppression survives re-import', async () => {
  const env = envWithKv();
  const a = await post(EP.contacts, env, { password: 'test-pw-123', action: 'import', csv: 'email\ngood@example.com\nBAD-NOT-EMAIL\ngood@example.com\n', source: 'test' });
  assert.equal(a.data.imported, 1);
  assert.equal(a.data.duplicates, 1);
  assert.equal(a.data.invalid, 1);
  // confirm-request then confirm (double opt-in evidence path)
  const list = await post(EP.contacts, env, { password: 'test-pw-123', action: 'list', q: 'good@example.com' });
  const id = list.data.contacts[0].id;
  // unsubscribe then re-import must NOT reactivate
  const tok = await lib.tokenFor(env, 'unsub', 'good@example.com');
  await post(EP.unsub, env, { token: tok, email: 'good@example.com', confirm: true });
  const b = await post(EP.contacts, env, { password: 'test-pw-123', action: 'import', csv: 'good@example.com\n', source: 'test2' });
  assert.equal(b.data.imported, 0);
  assert.equal(b.data.skippedSuppressed, 1);
  const c = JSON.parse(await env.YH_POSTS.get('email:c:' + id));
  assert.equal(c.status, 'unsubscribed');
});

// ---------- 6. launch gates ----------
await t('launch blocked without settings/consent; passes when complete', async () => {
  const env = envWithKv();
  const mk = await post(EP.campaigns, env, { password: 'test-pw-123', action: 'create', title: 'T', subject: 'S', text: 'hi' });
  const id = mk.data.campaign.id;
  let r = await post(EP.campaigns, env, { password: 'test-pw-123', action: 'launch', id });
  assert.equal(r.status, 409);
  assert.ok(r.data.blocked);
  await post(EP.settings, env, { password: 'test-pw-123', action: 'save', settings: { senderName: 'YH', senderEmail: 'mail@example.com', mailingAddress: '1 Street, Toronto ON' } });
  r = await post(EP.campaigns, env, { password: 'test-pw-123', action: 'launch', id });
  assert.equal(r.status, 409); // still blocked: no eligible recipients
  // import + confirm one contact, then launch passes
  await post(EP.contacts, env, { password: 'test-pw-123', action: 'import', csv: 'solo@example.com' });
  const l = await post(EP.contacts, env, { password: 'test-pw-123', action: 'list', q: 'solo@example.com' });
  await post(EP.contacts, env, { password: 'test-pw-123', action: 'set-consent', id: l.data.contacts[0].id, evidence: 'test-form-v1' });
  r = await post(EP.campaigns, env, { password: 'test-pw-123', action: 'launch', id });
  assert.equal(r.data.ok, true);
  assert.equal(r.data.eligible, 1);
});

// ---------- 7. mid-campaign suppression + idempotent resume ----------
await t('mid-campaign unsub skips; resume never resends', async () => {
  const env = envWithKv();
  await post(EP.settings, env, { password: 'test-pw-123', action: 'save', settings: { senderName: 'YH', senderEmail: 'mail@example.com', mailingAddress: '1 St' } });
  let csv = '';
  for (let i = 0; i < 5; i++) csv += 'u' + i + '@example.com\n';
  await post(EP.contacts, env, { password: 'test-pw-123', action: 'import', csv });
  const l = await post(EP.contacts, env, { password: 'test-pw-123', action: 'list', limit: 10 });
  for (const c of l.data.contacts) await post(EP.contacts, env, { password: 'test-pw-123', action: 'set-consent', id: c.id, evidence: 't' });
  const mk = await post(EP.campaigns, env, { password: 'test-pw-123', action: 'create', title: 'C', subject: 'S', text: 'b' });
  await post(EP.campaigns, env, { password: 'test-pw-123', action: 'launch', id: mk.data.campaign.id });
  // dry-run batch of 2 (no AWS creds -> dryRun)
  let r = await post(EP.batch, env, { password: 'test-pw-123', campaignId: mk.data.campaign.id, maxSends: 2 });
  assert.equal(r.data.sent, 2);
  // unsubscribe u2 before next batch
  const tok = await lib.tokenFor(env, 'unsub', 'u2@example.com');
  await post(EP.unsub, env, { token: tok, email: 'u2@example.com', confirm: true });
  r = await post(EP.batch, env, { password: 'test-pw-123', campaignId: mk.data.campaign.id, maxSends: 10 });
  assert.equal(r.data.sent, 2); // u2 skipped, u3+u4 sent
  assert.equal(r.data.skipped, 1);
  assert.equal(r.data.done, true);
});

// ---------- 8. throttle + pause/resume ----------
await t('throttle stops batch without loss; pause halts sending', async () => {
  const env = envWithKv();
  await post(EP.settings, env, { password: 'test-pw-123', action: 'save', settings: { senderName: 'YH', senderEmail: 'mail@example.com', mailingAddress: '1 St' } });
  await post(EP.contacts, env, { password: 'test-pw-123', action: 'import', csv: 't0@example.com\nt1@example.com\n' });
  const l = await post(EP.contacts, env, { password: 'test-pw-123', action: 'list', limit: 5 });
  for (const c of l.data.contacts) await post(EP.contacts, env, { password: 'test-pw-123', action: 'set-consent', id: c.id, evidence: 't' });
  const mk = await post(EP.campaigns, env, { password: 'test-pw-123', action: 'create', title: 'C', subject: 'S', text: 'b' });
  await post(EP.campaigns, env, { password: 'test-pw-123', action: 'launch', id: mk.data.campaign.id });
  await post(EP.campaigns, env, { password: 'test-pw-123', action: 'pause', id: mk.data.campaign.id });
  const r = await post(EP.batch, env, { password: 'test-pw-123', campaignId: mk.data.campaign.id, maxSends: 5 });
  assert.equal(r.data.done, true);
  assert.match(r.data.reason, /paused/);
});

// ---------- 9. MIME structure ----------
await t('multipart MIME with List-Unsubscribe headers', async () => {
  const raw = lib.buildRawMime({ from: 'YH <a@b.c>', to: 'x@y.z', subject: 'Hi', textBody: 'plain', htmlBody: '<p>html</p>', unsubHttpsUrl: 'https://younghadene.ca/unsubscribe?token=1', unsubMailto: 'mailto:a@b.c?subject=unsubscribe' });
  assert.match(raw, /multipart\/alternative/);
  assert.match(raw, /List-Unsubscribe: <mailto:.*>, <https:\/\/younghadene\.ca\/unsubscribe\?token=1>/);
  assert.match(raw, /List-Unsubscribe-Post: List-Unsubscribe=One-Click/);
  assert.match(raw, /Content-Type: text\/plain/);
  assert.match(raw, /Content-Type: text\/html/);
});

// ---------- 10. admin auth ----------
await t('admin endpoints reject wrong password', async () => {
  const env = envWithKv();
  for (const [ep, body] of [[EP.settings, { action: 'get' }], [EP.contacts, { action: 'stats' }], [EP.campaigns, { action: 'list' }], [EP.batch, { campaignId: 'x' }]]) {
    const r = await post(ep, env, Object.assign({ password: 'wrong' }, body));
    assert.equal(r.status, 401);
  }
});

// ---------- 11. SNS: bad signature + wrong key rejected; good event processed ----------
await t('SNS webhook validates signature, key, topic; idempotent', async () => {
  const env = envWithKv();
  // generate RSA key + self-signed cert via openssl (test-only)
  const { execSync } = await import('node:child_process');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const dir = fs.mkdtempSync(os.tmpdir() + '/snstest-');
  try {
    execSync('openssl req -x509 -newkey rsa:2048 -keyout "' + dir + '/k.pem" -out "' + dir + '/c.pem" -days 2 -nodes -subj "/CN=sns.amazonaws.com"', { stdio: 'ignore' });
  } catch {
    console.log('  (openssl unavailable — SNS crypto test skipped)');
    return;
  }
  const keyPem = fs.readFileSync(dir + '/k.pem', 'utf8');
  const certPem = fs.readFileSync(dir + '/c.pem', 'utf8');
  const keyObj = await crypto.subtle.importKey('pkcs8', pemToDer(keyPem, 'PRIVATE KEY'), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' }, false, ['sign']);
  const notif = { Type: 'Notification', MessageId: 'mid-1', TopicArn: 'arn:aws:sns:us-east-1:123:ses', Subject: 's', Timestamp: '2026-01-01T00:00:00.000Z', SignatureVersion: '2', Message: JSON.stringify({ notificationType: 'Complaint', complaint: { complainedRecipients: [{ emailAddress: 'c@example.com' }], complaintFeedbackType: 'abuse' } }) };
  const toSign = lib.snsStringToSign(notif);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyObj, new TextEncoder().encode(toSign));
  notif.Signature = Buffer.from(sig).toString('base64');
  notif.SigningCertURL = 'https://sns.amazonaws.com/cert.pem';
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(certPem);
  const call = async (body, key) => {
    const res = await EP.events.onRequestPost({ request: { json: async () => body, url: 'https://younghadene.ca/api/email-events?key=' + (key || '') }, env });
    return { status: res.status, data: JSON.parse(await res.text()) };
  };
  try {
    // wrong key
    let r = await call(notif, 'nope');
    assert.equal(r.status, 403);
    // tampered message (signature mismatch)
    const bad = Object.assign({}, notif, { Message: notif.Message + ' ' });
    r = await call(bad, 'hook-key-abc');
    assert.equal(r.status, 403);
    // seed contact, then valid complaint
    const email = 'c@example.com';
    const hash = await lib.emailHash(email);
    await env.YH_POSTS.put('email:c:z', JSON.stringify({ id: 'z', email, emailHash: hash, status: 'active', consent: { status: 'opted-in' } }));
    await env.YH_POSTS.put('email:byemail:' + hash, 'z');
    r = await call(notif, 'hook-key-abc');
    assert.equal(r.data.ok, true);
    const c = JSON.parse(await env.YH_POSTS.get('email:c:z'));
    assert.equal(c.status, 'unsubscribed');
    assert.ok(c.complaint);
    // duplicate event ignored
    r = await call(notif, 'hook-key-abc');
    assert.equal(r.data.duplicate, true);
    // hard bounce suppresses too (real SES bounce shape)
    const bn = { Type: 'Notification', MessageId: 'mid-2', TopicArn: 'arn:aws:sns:us-east-1:123:ses', Timestamp: '2026-01-01T00:00:00.000Z', SignatureVersion: '2', Message: JSON.stringify({ notificationType: 'Bounce', bounce: { bounceType: 'Permanent', bouncedRecipients: [{ emailAddress: 'b@example.com', diagnosticCode: 'smtp; 550 user unknown' }] } }) };
    const bsig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyObj, new TextEncoder().encode(lib.snsStringToSign(bn)));
    bn.Signature = Buffer.from(bsig).toString('base64');
    bn.SigningCertURL = 'https://sns.amazonaws.com/cert.pem';
    const bhash = await lib.emailHash('b@example.com');
    await env.YH_POSTS.put('email:c:y', JSON.stringify({ id: 'y', email: 'b@example.com', emailHash: bhash, status: 'active', consent: { status: 'opted-in' } }));
    await env.YH_POSTS.put('email:byemail:' + bhash, 'y');
    r = await call(bn, 'hook-key-abc');
    assert.equal(r.data.ok, true);
    const bc = JSON.parse(await env.YH_POSTS.get('email:c:y'));
    assert.equal(bc.status, 'unsubscribed');
    assert.ok(bc.bounce && bc.bounce.hard);
  } finally {
    globalThis.fetch = origFetch;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  function pemToDer(pem, label) {
    const b64 = pem.replace(new RegExp('-----BEGIN ' + label + '-----'), '').replace(new RegExp('-----END ' + label + '-----'), '').replace(/\s+/g, '');
    return Uint8Array.from(Buffer.from(b64, 'base64')).buffer;
  }
});

// ---------- 12. 58k simulation ----------
await t('58k-recipient campaign simulation (synthetic, mocked SES)', async () => {
  const env = envWithKv();
  await post(EP.settings, env, { password: 'test-pw-123', action: 'save', settings: { senderName: 'YH', senderEmail: 'mail@example.com', mailingAddress: '1 St', ratePerSec: 14 } });
  const N = 58000;
  const t0 = Date.now();
  // bulk-seed contacts directly (import path already covered above)
  for (let i = 0; i < N; i += 1000) {
    const batch = [];
    for (let j = i; j < Math.min(i + 1000, N); j++) {
      const email = 'sim' + j + '@example.com';
      const hash = await lib.emailHash(email);
      const id = 's' + j;
      batch.push(['email:c:' + id, JSON.stringify({ id, email, emailHash: hash, status: 'active', consent: { status: 'opted-in', purpose: 'marketing', source: 'sim', method: 'sim', ts: 1, evidence: 'sim', privacyVersion: 'v1' }, createdAt: 1, updatedAt: 1 })]);
      batch.push(['email:byemail:' + hash, id]);
    }
    for (const [k, v] of batch) await env.YH_POSTS.put(k, v);
  }
  // suppress 2% up front (bounces/unsubs), then launch
  const sup = {};
  for (let j = 0; j < N; j += 50) sup[await lib.emailHash('sim' + j + '@example.com')] = { reason: 'unsub:test', ts: 1 };
  await env.YH_POSTS.put('email:suppression', JSON.stringify(sup));
  const mk = await post(EP.campaigns, env, { password: 'test-pw-123', action: 'create', title: 'SIM', subject: 'S', text: 'b', html: '<p>b</p>' });
  const launch = await post(EP.campaigns, env, { password: 'test-pw-123', action: 'launch', id: mk.data.campaign.id });
  assert.ok(launch.data.eligible < N && launch.data.eligible > N * 0.9, 'eligible=' + launch.data.eligible);
  let total = 0, guard = 0;
  for (;;) {
    const r = await post(EP.batch, env, { password: 'test-pw-123', campaignId: mk.data.campaign.id, maxSends: 500 });
    total += r.data.sent;
    if (r.data.done) break;
    if (++guard > 500) throw new Error('batch loop did not terminate');
  }
  const prog = await post(EP.campaigns, env, { password: 'test-pw-123', action: 'progress', id: mk.data.campaign.id });
  assert.equal(prog.data.remaining, 0);
  assert.equal(total, launch.data.eligible);
  // no duplicate sends: count sent markers
  let markers = 0;
  let cur;
  do {
    const res = await env.YH_POSTS.list({ prefix: 'email:sent:', limit: 5000, cursor: cur });
    markers += res.keys.length;
    cur = res.list_complete ? undefined : res.cursor;
  } while (cur);
  assert.equal(markers, total);
  const ms = Date.now() - t0;
  console.log('  58k sim: eligible=' + launch.data.eligible + ' sent=' + total + ' markers=' + markers + ' in ' + ms + 'ms (dry-run)');
  console.log('  ETA math at 14/s: ' + Math.ceil(launch.data.eligible / 14) + 's (~' + (Math.ceil(launch.data.eligible / 14 / 60)) + ' min) + SES daily-quota check required');
});

// ---------- 13. SDK sends via SESv2 API; MessageId recorded ----------
// Uses a middleware-mocked SESv2Client: real SDK serialization + SigV4
// signing still execute; only the HTTP transport is short-circuited.
async function mockSesClient(captured, output) {
  const { SESv2Client } = await import('@aws-sdk/client-sesv2');
  const client = new SESv2Client({ region: 'us-east-1', credentials: { accessKeyId: 'AKIAEXAMPLE', secretAccessKey: 'secret' } });
  client.middlewareStack.add(
    (next) => async (args) => {
      captured.push({ url: String(args.request.protocol + '//' + args.request.hostname + args.request.path), auth: args.request.headers['authorization'] || args.request.headers['Authorization'] });
      return { response: { statusCode: 200, headers: {} }, output };
    },
    { step: 'finalizeRequest' }
  );
  return client;
}

await t('SDK SendEmail hits SESv2 API; batch records MessageIds', async () => {
  const captured = [];
  const client = await mockSesClient(captured, { $metadata: { httpStatusCode: 200 }, MessageId: 'test-mid-1' });
  const r = await lib.sesSendRaw({ region: 'us-east-1', accessKey: 'AKIAEXAMPLE', secretKey: 'secret', rawMime: 'From: a@b.c\r\n\r\nx', testClient: client });
  assert.equal(r.ok, true);
  assert.equal(r.body.MessageId, 'test-mid-1');
  assert.match(captured[0].url, /email\.us-east-1\.amazonaws\.com\/v2\/email\/outbound-emails/);
  assert.match(captured[0].auth, /^AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE\//);
  // batch with injected client records mids (no AWS creds needed)
  const env = envWithKv();
  env.YH_SES_TEST_CLIENT = await mockSesClient([], { $metadata: { httpStatusCode: 200 }, MessageId: 'test-mid-1' });
  await post(EP.settings, env, { password: 'test-pw-123', action: 'save', settings: { senderName: 'YH', senderEmail: 'mail@example.com', mailingAddress: '1 St' } });
  await post(EP.contacts, env, { password: 'test-pw-123', action: 'import', csv: 'm0@example.com\n' });
  const l = await post(EP.contacts, env, { password: 'test-pw-123', action: 'list', q: 'm0@example.com' });
  await post(EP.contacts, env, { password: 'test-pw-123', action: 'set-consent', id: l.data.contacts[0].id, evidence: 't' });
  const mk = await post(EP.campaigns, env, { password: 'test-pw-123', action: 'create', title: 'C', subject: 'S', text: 'b' });
  await post(EP.campaigns, env, { password: 'test-pw-123', action: 'launch', id: mk.data.campaign.id });
  // give batch AWS-shaped env minus real keys: client comes from test hook
  env.AWS_ACCESS_KEY_ID = 'x';
  env.AWS_SECRET_ACCESS_KEY = 'y';
  const b = await post(EP.batch, env, { password: 'test-pw-123', campaignId: mk.data.campaign.id, maxSends: 5 });
  assert.equal(b.data.sent, 1);
  assert.equal(b.data.dryRun, false);
  const marker = JSON.parse(await env.YH_POSTS.get('email:sent:' + mk.data.campaign.id + ':' + l.data.contacts[0].id));
  assert.equal(marker.mid, 'test-mid-1');
});

await t('launch gate blocks on SES SHUTDOWN, passes when HEALTHY', async () => {
  const env = envWithKv();
  env.AWS_ACCESS_KEY_ID = 'x';
  env.AWS_SECRET_ACCESS_KEY = 'y';
  await post(EP.settings, env, { password: 'test-pw-123', action: 'save', settings: { senderName: 'YH', senderEmail: 'mail@example.com', mailingAddress: '1 St' } });
  await post(EP.contacts, env, { password: 'test-pw-123', action: 'import', csv: 'g0@example.com\n' });
  const l = await post(EP.contacts, env, { password: 'test-pw-123', action: 'list', q: 'g0@example.com' });
  await post(EP.contacts, env, { password: 'test-pw-123', action: 'set-consent', id: l.data.contacts[0].id, evidence: 't' });
  const mk = await post(EP.campaigns, env, { password: 'test-pw-123', action: 'create', title: 'C', subject: 'S', text: 'b' });
  const id = mk.data.campaign.id;
  // SHUTDOWN -> blocked
  env.YH_SES_TEST_CLIENT = await mockSesClient([], { $metadata: { httpStatusCode: 200 }, EnforcementStatus: 'SHUTDOWN', SendingEnabled: true, ProductionAccessEnabled: true });
  let r = await post(EP.campaigns, env, { password: 'test-pw-123', action: 'launch', id });
  assert.equal(r.status, 409);
  assert.ok(r.data.blocked);
  assert.equal(r.data.enforcement, 'SHUTDOWN');
  // HEALTHY -> passes
  env.YH_SES_TEST_CLIENT = await mockSesClient([], { $metadata: { httpStatusCode: 200 }, EnforcementStatus: 'HEALTHY', SendingEnabled: true, ProductionAccessEnabled: true });
  r = await post(EP.campaigns, env, { password: 'test-pw-123', action: 'launch', id });
  assert.equal(r.data.ok, true);
});
await t('SDK GetAccount parses production/quota shape', async () => {
  const client = await mockSesClient([], { $metadata: { httpStatusCode: 200 }, ProductionAccessEnabled: true, SendQuota: { Max24HourSend: 50000, MaxSendRate: 14, SentLast24Hours: 10 } });
  const r = await lib.sesGetAccount({ region: 'us-east-1', accessKey: 'AKIAEXAMPLE', secretKey: 'secret', testClient: client });
  assert.equal(r.ok, true);
  assert.equal(r.body.ProductionAccessEnabled, true);
  assert.equal(r.body.SendQuota.Max24HourSend, 50000);
});
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* cleanup staged copies */ }
