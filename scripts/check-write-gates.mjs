// Guard: bulk/auto KV write paths stay gated.
//  - POST /api/migrate refuses unless env ALLOW_MIGRATE=1 (default off).
//  - POST /api/news refuses unless NEWS_WRITES_ENABLED=1, and always needs ADMIN_PASSWORD.
//  - DELETE /api/news is behind the same switch (403 before auth, no KV delete)
//    and also needs ADMIN_PASSWORD; wrong/short/long password -> 401, unset -> 500.
//  - Every admin endpoint uses functions/_safe-equal.js (constant-time, no length leak):
//    wrong/short/long/empty/missing password -> 401, ADMIN_PASSWORD unset/empty -> 500.
//  - Static: no file in functions/ keeps an early return on length mismatch / old compare.
// All KV access goes to an in-memory mock; no real KV is touched.
//  - No scheduled()/cron handler exists in functions/.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yh-gates-'));
// Copy the whole functions/ tree to tmp as .mjs (package.json is commonjs) and
// rewrite relative './x.js' imports, so shared helpers like _safe-equal.js load.
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const FN_FILES = walk(path.join(ROOT, 'functions')).filter((f) => f.endsWith('.js'));
for (const f of FN_FILES) {
  const d = path.join(tmp, path.relative(ROOT, f)).replace(/\.js$/, '.mjs');
  fs.mkdirSync(path.dirname(d), { recursive: true });
  fs.writeFileSync(d, fs.readFileSync(f, 'utf8')
    .replace(/(from\s+['"]\.{1,2}\/[^'"]*?)\.js(['"])/g, '$1.mjs$2')
    // npm deps (e.g. @aws-sdk/client-sesv2) aren't installed for this check: point them
    // at a stub whose every export throws, so no network/SES call can happen here.
    .replace(/from\s+['"](@aws-sdk\/[^'"]+)['"]/g, () => `from ${JSON.stringify(pathToFileURL(path.join(tmp, '_npm-stub.mjs')).href)}`));
}
fs.writeFileSync(path.join(tmp, '_npm-stub.mjs'), "const no = class { constructor() { throw new Error('npm dependency stubbed in check-write-gates'); } };\nexport const SESv2Client = no, SendEmailCommand = no, GetAccountCommand = no;\n");
const load = async (f) => import(pathToFileURL(path.join(tmp, f.replace(/\.js$/, '.mjs'))));
let puts = 0;
const store = { get: async () => null, put: async () => { puts++; } };
const req = (body) => new Request('https://younghadene.ca/api/x', { method: 'POST', body: JSON.stringify(body) });
const mig = await load('functions/api/migrate.js');
let r = await mig.onRequestPost({ request: req({ password: 'pw' }), env: { ADMIN_PASSWORD: 'pw', YH_POSTS: store } });
assert.equal(r.status, 403, 'migrate must be off by default');
const news = await load('functions/api/news.js');
const post = (password, env) => news.onRequestPost({ request: req({ password, post: { title: 'Gate test', content: 'body', category: 'News' } }), env });
r = await post('pw', { ADMIN_PASSWORD: 'pw', YH_POSTS: store });
assert.equal(r.status, 403, 'news POST must be refused by default (no NEWS_WRITES_ENABLED)');
r = await post('pw', { ADMIN_PASSWORD: 'pw', YH_POSTS: store, NEWS_WRITES_ENABLED: '0' });
assert.equal(r.status, 403, 'NEWS_WRITES_ENABLED other than "1" must refuse');
r = await post('nope', { ADMIN_PASSWORD: 'pw', YH_POSTS: store, NEWS_WRITES_ENABLED: '1' });
assert.equal(r.status, 401, 'news POST requires ADMIN_PASSWORD even when enabled');
assert.equal(puts, 0, 'refused requests wrote nothing');
// Enabled + auth: allowed (writes go to a separate in-memory mock).
const mem = new Map();
const mock = { get: async (k) => (mem.has(k) ? mem.get(k) : null), put: async (k, v) => { mem.set(k, v); }, delete: async (k) => { mem.delete(k); } };
r = await post('pw', { ADMIN_PASSWORD: 'pw', YH_POSTS: mock, NEWS_WRITES_ENABLED: '1' });
assert.equal(r.status, 200, 'enabled + ADMIN_PASSWORD must allow publishing: ' + r.status);
const created = await r.json();
assert.ok(created.slug && mem.has('news:' + created.slug), 'post stored in the mock KV');
// DELETE: same switch as POST, checked before auth.
let kvDeletes = 0;
const delUrl = 'https://younghadene.ca/api/news?slug=' + created.slug;
const delReq = (password) => new Request(delUrl, { method: 'DELETE', body: JSON.stringify({ password }) });
const counting = { ...mock, delete: async (k) => { kvDeletes++; return mock.delete(k); } };
for (const flag of [undefined, '0', 'true']) {
  const env = { ADMIN_PASSWORD: 'pw', YH_POSTS: counting };
  if (flag !== undefined) env.NEWS_WRITES_ENABLED = flag;
  r = await news.onRequestDelete({ request: delReq('pw'), env });
  assert.equal(r.status, 403, `DELETE with the correct password must be refused when NEWS_WRITES_ENABLED=${flag}`);
  assert.deepEqual(await r.json(), { error: 'News publishing is disabled (set NEWS_WRITES_ENABLED=1 in Cloudflare Pages env)' }, 'DELETE 403 has the same shape as POST');
}
r = await news.onRequestDelete({ request: delReq('nope'), env: { YH_POSTS: counting } });
assert.equal(r.status, 403, 'switch off is checked before auth (even with ADMIN_PASSWORD unset)');
assert.equal(kvDeletes, 0, 'refused DELETEs touched no KV key');
assert.ok(mem.has('news:' + created.slug), 'post still in the mock KV after refused DELETEs');
// Switch on: wrong passwords (shorter, equal length, longer, missing) -> 401, for POST and DELETE.
const ON = { ADMIN_PASSWORD: 's3cret-pass', YH_POSTS: counting, NEWS_WRITES_ENABLED: '1' };
for (const bad of ['s3cret', 's3cret-pasX', 's3cret-pass-and-more', '', undefined, ['nope']]) {
  r = await news.onRequestDelete({ request: delReq(bad), env: ON });
  assert.equal(r.status, 401, `DELETE with password ${JSON.stringify(bad)} must be 401`);
  r = await post(bad, ON);
  assert.equal(r.status, 401, `POST with password ${JSON.stringify(bad)} must be 401`);
}
assert.equal(kvDeletes, 0, 'unauthorised DELETEs touched no KV key');
// ADMIN_PASSWORD unset or empty -> 500 (never fails open), even with an empty password.
for (const pw of [undefined, '']) {
  const env = { YH_POSTS: counting, NEWS_WRITES_ENABLED: '1' };
  if (pw !== undefined) env.ADMIN_PASSWORD = pw;
  r = await news.onRequestDelete({ request: delReq(''), env });
  assert.equal(r.status, 500, `DELETE with ADMIN_PASSWORD=${JSON.stringify(pw)} must be 500`);
  r = await post('', env);
  assert.equal(r.status, 500, `POST with ADMIN_PASSWORD=${JSON.stringify(pw)} must be 500`);
}
// Switch on + correct password -> 200, post removed.
r = await news.onRequestDelete({ request: delReq('pw'), env: { ADMIN_PASSWORD: 'pw', YH_POSTS: counting, NEWS_WRITES_ENABLED: '1' } });
assert.equal(r.status, 200, 'DELETE with switch on + ADMIN_PASSWORD must work: ' + r.status);
assert.ok(!mem.has('news:' + created.slug), 'post removed from the mock KV');
// ---- Every admin endpoint: shared constant-time compare, same 401/500 behaviour ----
// Each case: a request builder + the env flags it needs to reach the password check.
// All KV is the in-memory mock; counters prove rejected requests write/delete nothing.
let gPuts = 0, gDels = 0;
const gStore = { get: async () => null, list: async () => ({ keys: [], list_complete: true }), put: async () => { gPuts++; }, delete: async () => { gDels++; } };
const ASSETS = { fetch: async () => new Response('[]', { status: 200 }) };
const jreq = (method, url, body) => new Request(url, { method, body: JSON.stringify(body) });
const ENDPOINTS = [
  ['functions/api/auth.js', 'onRequestPost', (pw) => jreq('POST', 'https://younghadene.ca/api/auth', { password: pw }), {}],
  ['functions/api/posts.js', 'onRequestPost', (pw) => jreq('POST', 'https://younghadene.ca/api/posts', { password: pw, post: { title: 'Gate test', content: 'body', category: 'Blog' } }), {}],
  ['functions/api/posts.js', 'onRequestDelete', (pw) => jreq('DELETE', 'https://younghadene.ca/api/posts?slug=gate-test', { password: pw }), {}],
  ['functions/api/news.js', 'onRequestPost', (pw) => jreq('POST', 'https://younghadene.ca/api/news', { password: pw, post: { title: 'Gate test', content: 'body', category: 'News' } }), { NEWS_WRITES_ENABLED: '1' }],
  ['functions/api/news.js', 'onRequestDelete', (pw) => jreq('DELETE', 'https://younghadene.ca/api/news?slug=gate-test', { password: pw }), { NEWS_WRITES_ENABLED: '1' }],
  ['functions/api/news-list.js', 'onRequestPost', (pw) => jreq('POST', 'https://younghadene.ca/api/news-list', { password: pw }), {}],
  ['functions/api/posts-list.js', 'onRequestPost', (pw) => jreq('POST', 'https://younghadene.ca/api/posts-list', { password: pw }), {}],
  ['functions/api/export.js', 'onRequestPost', (pw) => jreq('POST', 'https://younghadene.ca/api/export', { password: pw }), {}],
  ['functions/api/migrate.js', 'onRequestPost', (pw) => jreq('POST', 'https://younghadene.ca/api/migrate', { password: pw }), { ALLOW_MIGRATE: '1' }],
  // Email admin endpoints share the same helper via _email-lib.js checkAuth.
  ['functions/api/email-settings.js', 'onRequestPost', (pw) => jreq('POST', 'https://younghadene.ca/api/email-settings', { password: pw }), {}],
  ['functions/api/email-contacts.js', 'onRequestPost', (pw) => jreq('POST', 'https://younghadene.ca/api/email-contacts', { password: pw, action: 'list' }), {}],
  ['functions/api/email-campaigns.js', 'onRequestPost', (pw) => jreq('POST', 'https://younghadene.ca/api/email-campaigns', { password: pw, action: 'list' }), {}],
  ['functions/api/email-batch.js', 'onRequestPost', (pw) => jreq('POST', 'https://younghadene.ca/api/email-batch', { password: pw, campaignId: 'x', maxSends: 1 }), {}],
];
const PW = 's3cret-pass';
const WRONG = ['s3cret', 's3cret-pasX', 's3cret-pass-and-more', '', undefined]; // shorter, equal length, longer, empty, missing
for (const [file, method, mk, flags] of ENDPOINTS) {
  const mod = await load(file);
  assert.equal(typeof mod[method], 'function', `${file}: ${method} missing`);
  const base = { YH_POSTS: gStore, ASSETS, ...flags };
  for (const bad of WRONG) {
    r = await mod[method]({ request: mk(bad), env: { ...base, ADMIN_PASSWORD: PW }, params: {} });
    assert.equal(r.status, 401, `${file} ${method}: wrong password ${JSON.stringify(bad)} must be 401, got ${r.status}`);
  }
  for (const unset of [undefined, '']) {
    const env = { ...base };
    if (unset !== undefined) env.ADMIN_PASSWORD = unset;
    for (const pw of ['', PW]) {
      r = await mod[method]({ request: mk(pw), env, params: {} });
      assert.equal(r.status, 500, `${file} ${method}: ADMIN_PASSWORD=${JSON.stringify(unset)} must be 500 (password ${JSON.stringify(pw)}), got ${r.status}`);
    }
  }
}
assert.equal(gPuts, 0, 'rejected admin requests wrote nothing to KV');
assert.equal(gDels, 0, 'rejected admin requests deleted nothing from KV');
// auth.js: correct password still 200 {ok:true}.
r = await (await load('functions/api/auth.js')).onRequestPost({ request: jreq('POST', 'https://younghadene.ca/api/auth', { password: PW }), env: { ADMIN_PASSWORD: PW } });
assert.equal(r.status, 200, 'auth.js: correct password must be 200');
assert.deepEqual(await r.json(), { ok: true });
// Shared helper itself.
const se = await load('functions/_safe-equal.js');
assert.equal(await se.safeEqual(PW, PW), true);
for (const bad of WRONG) assert.equal(await se.safeEqual(bad, PW), false, `safeEqual(${JSON.stringify(bad)}) must be false`);
// email-events webhook key uses the same compare (403 on wrong key).
const ev = await load('functions/api/email-events.js');
for (const key of ['k', 'webhook-kex', 'webhook-key-longer', '']) {
  r = await ev.onRequestPost({ request: jreq('POST', 'https://younghadene.ca/api/email-events?key=' + key, {}), env: { EMAIL_WEBHOOK_KEY: 'webhook-key', YH_POSTS: gStore } });
  assert.equal(r.status, 403, `email-events: wrong key ${JSON.stringify(key)} must be 403`);
}
// ---- Static: no file in functions/ keeps the old length-leaking compare ----
const helperSrc = fs.readFileSync(path.join(ROOT, 'functions/_safe-equal.js'), 'utf8');
assert.ok(/crypto\.subtle\.sign\(\s*'HMAC'/.test(helperSrc), 'functions/_safe-equal.js: must HMAC both values (crypto.subtle) before comparing');
for (const f of FN_FILES) {
  const src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f);
  assert.ok(!/\.length\s*!==?\s*[\w.]+\.length\s*\)\s*return/.test(src), `${rel}: early return on a length mismatch`);
  assert.ok(!/timingSafeEqual/.test(src), `${rel}: old length-leaking timingSafeEqual still present`);
  assert.ok(!/charCodeAt\([^)]*\)\s*\^/.test(src), `${rel}: char-by-char XOR compare (old style) still present`);
  if (rel !== 'functions/_safe-equal.js') {
    assert.ok(!/env\.ADMIN_PASSWORD/.test(src), `${rel}: reads env.ADMIN_PASSWORD directly; use checkAdminPassword() from functions/_safe-equal.js`);
  }
  assert.ok(!/export\s+(async\s+)?function\s+scheduled|onScheduled/.test(src), `${rel}: scheduled handler found`);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`WRITE-GATE-CHECK OK: migrate off by default, news POST and DELETE off unless NEWS_WRITES_ENABLED=1 (403 before auth); ${ENDPOINTS.length} admin handlers use the shared constant-time compare (401 wrong/short/long/empty/missing, 500 unset); no length-leaking compare or scheduled handler in functions/.`);
