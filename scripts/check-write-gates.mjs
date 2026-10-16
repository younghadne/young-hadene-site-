// Guard: bulk/auto KV write paths stay gated.
//  - POST /api/migrate refuses unless env ALLOW_MIGRATE=1 (default off).
//  - POST /api/news refuses when NEWS_WRITES_DISABLED=1 and always needs ADMIN_PASSWORD.
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
r = await news.onRequestPost({ request: req({ password: 'pw', post: { title: 'x', content: 'y', category: 'News' } }), env: { ADMIN_PASSWORD: 'pw', YH_POSTS: store, NEWS_WRITES_DISABLED: '1' } });
assert.equal(r.status, 403, 'news kill switch must block writes');
r = await news.onRequestPost({ request: req({ password: 'nope', post: { title: 'x' } }), env: { ADMIN_PASSWORD: 'pw', YH_POSTS: store } });
assert.equal(r.status, 401, 'news POST requires ADMIN_PASSWORD');
assert.equal(puts, 0, 'no KV writes happened');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const f of walk(path.join(ROOT, 'functions')).filter((f) => f.endsWith('.js'))) {
  assert.ok(!/export\s+(async\s+)?function\s+scheduled|onScheduled/.test(fs.readFileSync(f, 'utf8')), `${f}: scheduled handler found`);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log('WRITE-GATE-CHECK OK: migrate off by default, news kill switch + auth enforced, no scheduled handlers.');
