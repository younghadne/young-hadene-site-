// Guard: (1) every slug marked off-topic in seo/off-topic-news-posts.csv is in
// NEWS_NOINDEX; (2) the KV-driven /news-rss.xml, /news-sitemap.xml, the
// public /api/news-list GET and the static build-static feeds all drop
// NEWS_NOINDEX slugs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const fn = (f) => path.join(ROOT, 'functions', f);
// functions/ is ESM without "type":"module"; copy into a temp dir as .mjs.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yh-noindex-'));
fs.mkdirSync(path.join(tmp, 'api'));
const asMjs = (src, dst) => fs.writeFileSync(path.join(tmp, dst), fs.readFileSync(fn(src), 'utf8').replace(/(from '\.{1,2}\/[^']+)\.js'/g, "$1.mjs'"));
asMjs('_news-noindex.js', '_news-noindex.mjs');
asMjs('news-rss.xml.js', 'news-rss.xml.mjs');
asMjs('news-sitemap.xml.js', 'news-sitemap.xml.mjs');
asMjs('api/news-list.js', 'api/news-list.mjs');
const { NEWS_NOINDEX } = await import(pathToFileURL(path.join(tmp, '_news-noindex.mjs')));

// (1) CSV verdicts
const csv = fs.readFileSync(path.join(ROOT, 'seo/off-topic-news-posts.csv'), 'utf8').trim().split(/\r?\n/).slice(1);
const off = csv.map((l) => l.split(',')).filter((c) => /off-topic/.test(c[c.length - 1])).map((c) => c[0]);
const missing = off.filter((s) => !NEWS_NOINDEX.has(s));
assert.equal(missing.length, 0, 'off-topic slugs missing from NEWS_NOINDEX: ' + missing.join(', '));
assert.ok(!NEWS_NOINDEX.has('young-hadene-the-haitian-toronto-artist-redefining-the-6ix-underground'), '6ix Underground post must stay indexable');

// (2) feeds with a mock KV + static assets
const now = Date.now();
const bad = [...NEWS_NOINDEX][0];
const good = 'young-hadene-the-haitian-toronto-artist-redefining-the-6ix-underground';
const index = [
  { slug: good, title: 'Good', status: 'published', dateNum: now - 3600e3 },
  { slug: bad, title: 'Bad', status: 'published', dateNum: now - 3600e3 },
];
const staticRss = `<rss><channel><item><title>S</title><link>https://younghadene.ca/news/${bad}</link></item></channel></rss>`;
const staticMap = `<urlset><url><loc>https://younghadene.ca/news/${bad}</loc><news:news><news:publication_date>${new Date(now).toISOString()}</news:publication_date><news:title>S</news:title></news:news></url></urlset>`;
const env = {
  YH_POSTS: { get: async (k) => (k === 'news:index' ? JSON.stringify(index) : null) },
  ASSETS: { fetch: async (r) => new Response(String(r.url).includes('rss') ? staticRss : staticMap) },
};
for (const f of ['news-rss.xml.mjs', 'news-sitemap.xml.mjs']) {
  const m = await import(pathToFileURL(path.join(tmp, f)));
  const txt = await (await m.onRequestGet({ env, request: new Request('https://younghadene.ca/x') })).text();
  assert.ok(txt.includes(good), `${f}: indexable post missing`);
  assert.ok(!txt.includes(bad), `${f}: NEWS_NOINDEX post leaked`);
}
const list = await import(pathToFileURL(path.join(tmp, 'api/news-list.mjs')));
const pub = await (await list.onRequestGet({ env, request: new Request('https://younghadene.ca/api/news-list') })).json();
assert.deepEqual(pub.posts.map((p) => p.slug), [good], 'public /api/news-list must hide NEWS_NOINDEX');
const adm = await (await list.onRequestGet({ env, request: new Request('https://younghadene.ca/api/news-list?includeNoindex=1') })).json();
assert.equal(adm.posts.length, 2, 'admin ?includeNoindex=1 keeps everything');

// static build feeds
const bs = fs.readFileSync(path.join(ROOT, 'scripts/build-static.js'), 'utf8');
assert.match(bs, /const fresh = newsFiles\.filter\(newsIndexable\)/, 'build-static news sitemap must filter NEWS_NOINDEX');
assert.match(bs, /const items = newsFiles\.filter\(newsIndexable\)/, 'build-static RSS must filter NEWS_NOINDEX');
for (const f of ['news-rss.xml', 'news-sitemap.xml']) {
  const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const s of NEWS_NOINDEX) assert.ok(!t.includes('/news/' + s), `${f} contains NEWS_NOINDEX slug ${s}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`NEWS-NOINDEX-CHECK OK: ${off.length} off-topic slugs in NEWS_NOINDEX (${NEWS_NOINDEX.size} total); feeds + public list exclude them.`);
