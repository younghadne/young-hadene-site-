// Guard: bulk/auto KV write paths stay gated.
//  - POST /api/migrate refuses unless env ALLOW_MIGRATE=1 (default off).
//  - POST /api/news refuses unless NEWS_WRITES_ENABLED=1, and always needs ADMIN_PASSWORD.
//  - DELETE /api/news works with ADMIN_PASSWORD alone (no env flag).
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
// DELETE works with the password alone (no flag).
const del = (password) => news.onRequestDelete({ request: new Request('https://younghadene.ca/api/news?slug=' + created.slug, { method: 'DELETE', body: JSON.stringify({ password }) }), env: { ADMIN_PASSWORD: 'pw', YH_POSTS: mock } });
r = await del('nope');
assert.equal(r.status, 401, 'DELETE requires ADMIN_PASSWORD');
r = await del('pw');
assert.equal(r.status, 200, 'DELETE with ADMIN_PASSWORD must work without NEWS_WRITES_ENABLED');
assert.ok(!mem.has('news:' + created.slug), 'post removed from the mock KV');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const f of walk(path.join(ROOT, 'functions')).filter((f) => f.endsWith('.js'))) {
  assert.ok(!/export\s+(async\s+)?function\s+scheduled|onScheduled/.test(fs.readFileSync(f, 'utf8')), `${f}: scheduled handler found`);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log('WRITE-GATE-CHECK OK: migrate off by default, news POST off unless NEWS_WRITES_ENABLED=1 (+auth), DELETE works with auth, no scheduled handlers.');
