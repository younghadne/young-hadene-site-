// Guard: bulk/auto KV write paths stay gated.
//  - POST /api/migrate refuses unless env ALLOW_MIGRATE=1 (default off).
//  - POST /api/news refuses unless NEWS_WRITES_ENABLED=1, and always needs ADMIN_PASSWORD.
//  - DELETE /api/news is behind the same switch (403 before auth, no KV delete)
//    and also needs ADMIN_PASSWORD; wrong/short/long password -> 401, unset -> 500.
//  - The password compare has no early return on a length mismatch.
// All KV access goes to an in-memory mock; no real KV is touched.
//  - No scheduled()/cron handler exists in functions/.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yh-gates-'));
const load = async (f) => { const d = path.join(tmp, path.basename(f) + '.mjs'); fs.writeFileSync(d, fs.readFileSync(path.join(ROOT, f), 'utf8')); return import(pathToFileURL(d)); };
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
// Static: the compare must not short-circuit on length.
const newsSrc = fs.readFileSync(path.join(ROOT, 'functions/api/news.js'), 'utf8');
assert.ok(!/\.length\s*!==?\s*[\w.]+\.length\)\s*return/.test(newsSrc), 'functions/api/news.js: password compare returns early on a length mismatch');
assert.ok(!/timingSafeEqual/.test(newsSrc), 'functions/api/news.js: old length-leaking timingSafeEqual still present');
assert.ok(/crypto\.subtle\.(sign|digest)/.test(newsSrc), 'functions/api/news.js: password compare must hash both values (crypto.subtle) before comparing');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const f of walk(path.join(ROOT, 'functions')).filter((f) => f.endsWith('.js'))) {
  assert.ok(!/export\s+(async\s+)?function\s+scheduled|onScheduled/.test(fs.readFileSync(f, 'utf8')), `${f}: scheduled handler found`);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log('WRITE-GATE-CHECK OK: migrate off by default, news POST and DELETE off unless NEWS_WRITES_ENABLED=1 (403 before auth) and need ADMIN_PASSWORD (constant-time, no length leak), no scheduled handlers.');
