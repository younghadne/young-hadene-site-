// Verifies functions/news-rss.xml.js merges KV posts with the repo-file posts
// in news-rss.xml, sorts by date before taking the newest 20, and leaves out
// NEWS_NOINDEX, removed (tombstoned), draft and future-scheduled posts, and
// KV index entries whose news:<slug> doc is missing or not visible (the page
// would 404). Also checks news-sitemap.xml applies the same doc guard and
// that /news/<slug> answers HEAD like GET.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path';
// functions/ are ESM .js in a non-module package; copy to .mjs to import them.
const d = mkdtempSync(join(tmpdir(), 'yhrss-'));
const toMjs = src => readFileSync(src, 'utf8').replace(/(['"])(\.\.?\/[^'"]+)\.js\1/g, "'$2.mjs'");
writeFileSync(join(d, '_news-noindex.mjs'), readFileSync('functions/_news-noindex.js'));
writeFileSync(join(d, '_news-visibility.mjs'), readFileSync('functions/_news-visibility.js'));
writeFileSync(join(d, '_news-dates.mjs'), readFileSync('functions/_news-dates.js'));
writeFileSync(join(d, 'rss.mjs'), toMjs('functions/news-rss.xml.js'));
writeFileSync(join(d, 'nsm.mjs'), toMjs('functions/news-sitemap.xml.js'));
mkdirSync(join(d, 'news')); writeFileSync(join(d, 'news', 'slug.mjs'), toMjs('functions/news/[slug].js'));
const { onRequestGet, onRequestHead: rssHead } = await import(join(d, 'rss.mjs'));
const nsm = await import(join(d, 'nsm.mjs'));
const page = await import(join(d, 'news', 'slug.mjs'));
const { NEWS_NOINDEX } = await import(join(d, '_news-noindex.mjs'));

const staticXml = readFileSync('news-rss.xml', 'utf8');
const items = [...staticXml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => ({
  slug: m[1].match(/<link>[^<]*\/news\/([^<]+)<\/link>/)[1],
  date: Date.parse(m[1].match(/<pubDate>([^<]*)<\/pubDate>/)[1]),
}));
let bad = 0;
const fail = msg => { bad++; console.error('NEWS-RSS-CHECK:', msg); };
if (!items.length) fail('news-rss.xml has no items');
const newest = Math.max(...items.map(i => i.date)), oldest = Math.min(...items.map(i => i.date));
const H = 3600e3, D = 24 * H, now = Date.now();
const noindex = [...NEWS_NOINDEX][0];

// 25 older KV posts (would fill 20 slots on their own) plus 1 newer, and
// posts that must never appear.
const kv = [];
for (let i = 0; i < 25; i++) kv.push({ slug: 'kv-old-' + i, title: 'Old ' + i, status: 'published', dateNum: oldest - (i + 1) * D });
kv.push({ slug: 'kv-new', title: 'New', status: 'published', dateNum: newest + H });
kv.push({ slug: noindex, title: 'Off topic', status: 'published', dateNum: newest + 2 * H });
kv.push({ slug: 'kv-removed', title: 'Removed', status: 'published', dateNum: newest + 3 * H });
kv.push({ slug: 'kv-draft', title: 'Draft', status: 'draft', dateNum: newest + 4 * H });
kv.push({ slug: 'kv-future', title: 'Future', status: 'scheduled', scheduledFor: now + D, dateNum: newest + 5 * H });
// Index says published, but the page would 404: no doc / doc not visible.
kv.push({ slug: 'kv-nodoc', title: 'No doc', status: 'published', dateNum: newest + 6 * H });
kv.push({ slug: 'kv-hidden-doc', title: 'Hidden doc', status: 'published', dateNum: newest + 7 * H });
// A repo post that also has a stale KV index entry with no doc: the page
// serves the repo file, so the repo item must still be listed.
kv.push({ slug: items[0].slug, title: 'Stale index entry', status: 'published', dateNum: newest + 8 * H });
const removedStatic = items.length > 1 ? items[items.length - 1].slug : null;
const docs = {};
for (const p of kv) if (/^kv-(old|new)/.test(p.slug) || p.slug === noindex || p.slug === 'kv-removed') docs[p.slug] = { ...p };
docs['kv-hidden-doc'] = { slug: 'kv-hidden-doc', title: 'Hidden doc', status: 'draft', dateNum: newest + 7 * H };
const store = { get: async k => k === 'news:index' ? JSON.stringify(kv)
  : k === 'deleted' ? JSON.stringify({ news: ['kv-removed', removedStatic].filter(Boolean) })
  : k.startsWith('news:') && docs[k.slice(5)] ? JSON.stringify(docs[k.slice(5)]) : null };
const ASSETS = { fetch: async () => new Response(staticXml, { status: 200 }) };

const res = await onRequestGet({ env: { YH_POSTS: store, ASSETS } });
const out = await res.text();
const got = [...out.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => ({
  slug: m[1].match(/<link>[^<]*\/news\/([^<]+)<\/link>/)[1],
  date: Date.parse(m[1].match(/<pubDate>([^<]*)<\/pubDate>/)[1]),
}));
const slugs = got.map(g => g.slug);
if (res.status !== 200) fail('status ' + res.status);
if (got.length !== 20) fail(`expected 20 items, got ${got.length}`);
if (slugs[0] !== 'kv-new') fail('newest KV post is not first');
for (const it of items) {
  if (it.slug === removedStatic) continue;
  if (!slugs.includes(it.slug)) fail('repo post missing from feed: ' + it.slug);
}
if (got.find(g => g.slug === items[0].slug && g.date !== items[0].date)) fail('stale KV entry without a doc replaced the repo item');
for (const s of [noindex, 'kv-removed', 'kv-draft', 'kv-future', 'kv-nodoc', 'kv-hidden-doc', removedStatic].filter(Boolean)) {
  if (slugs.includes(s)) fail('must be excluded: ' + s);
}
for (let i = 1; i < got.length; i++) if (got[i].date > got[i - 1].date) fail('not sorted by date at ' + slugs[i]);
if (new Set(slugs).size !== slugs.length) fail('duplicate items');
// The 20 kept must be the newest 20 eligible posts.
const keptOld = slugs.filter(s => s.startsWith('kv-old-')).length;
const expectOld = 20 - 1 - items.filter(i => i.slug !== removedStatic).length;
if (keptOld !== expectOld) fail(`expected ${expectOld} older KV posts, got ${keptOld}`);
if (slugs.includes('kv-old-' + expectOld)) fail('kept an older post past the cutoff');

// news-sitemap.xml: fresh KV posts are only listed if the page would render them.
const fresh = [
  { slug: 'sm-ok', title: 'OK', status: 'published', dateNum: now - H },
  { slug: 'sm-nodoc', title: 'No doc', status: 'published', dateNum: now - H },
  { slug: 'sm-hidden', title: 'Hidden', status: 'published', dateNum: now - H },
  { slug: 'sm-removed', title: 'Removed', status: 'published', dateNum: now - H },
];
const smDocs = { 'sm-ok': fresh[0], 'sm-hidden': { ...fresh[2], status: 'draft' }, 'sm-removed': fresh[3] };
const smStore = { get: async k => k === 'news:index' ? JSON.stringify(fresh)
  : k === 'deleted' ? JSON.stringify({ news: ['sm-removed'] })
  : k.startsWith('news:') && smDocs[k.slice(5)] ? JSON.stringify(smDocs[k.slice(5)]) : null };
const smXml = await (await nsm.onRequestGet({ env: { YH_POSTS: smStore, ASSETS: { fetch: async () => new Response('<urlset></urlset>', { status: 200 }) } } })).text();
if (!smXml.includes('/news/sm-ok<')) fail('news-sitemap: renderable fresh post missing');
for (const s of ['sm-nodoc', 'sm-hidden', 'sm-removed']) if (smXml.includes('/news/' + s + '<')) fail('news-sitemap must exclude ' + s);

// /news/<slug>: HEAD answers like GET (KV-only posts used to 404 to HEAD).
const pageEnv = { YH_POSTS: smStore, ASSETS: { fetch: async req => new Response('nf', { status: String(req.url || req).endsWith('/404.html') ? 200 : 404 }) } };
for (const slug of ['sm-ok', 'sm-hidden', 'sm-nodoc']) {
  const c = () => ({ request: new Request('https://younghadene.ca/news/' + slug), env: pageEnv, params: { slug } });
  const g = await page.onRequestGet(c()), h = await page.onRequestHead(c());
  if (g.status !== h.status || (await h.text())) fail(`HEAD /news/${slug} ${h.status} vs GET ${g.status}`);
  for (const k of ['content-type', 'cache-control']) if (g.headers.get(k) !== h.headers.get(k)) fail(`HEAD /news/${slug} ${k} ${h.headers.get(k)} vs GET ${g.headers.get(k)}`);
  if (slug === 'sm-ok' && g.status !== 200) fail('visible KV post should render 200');
}

// /news-rss.xml: HEAD = GET status, Content-Type, Cache-Control; empty body.
{
  if (typeof rssHead !== 'function') fail('news-rss.xml.js must export onRequestHead');
  else {
    const c = () => ({ request: new Request('https://younghadene.ca/news-rss.xml'), env: pageEnv });
    const g = await onRequestGet(c()), h = await rssHead(c());
    if (g.headers.get('content-type') !== 'application/rss+xml; charset=utf-8') fail('RSS GET content-type ' + g.headers.get('content-type'));
    if (g.status !== h.status || (await h.text())) fail(`HEAD /news-rss.xml ${h.status} vs GET ${g.status} or non-empty body`);
    for (const k of ['content-type', 'cache-control']) if (g.headers.get(k) !== h.headers.get(k)) fail(`HEAD /news-rss.xml ${k} ${h.headers.get(k)} vs GET ${g.headers.get(k)}`);
  }
}

if (bad) { console.error(`NEWS-RSS-CHECK FAIL: ${bad}`); process.exit(1); }
console.log(`NEWS-RSS-CHECK OK: ${items.length} repo posts merged with KV, sorted by date, newest 20, noindex/removed/drafts/missing-or-hidden docs excluded; news-sitemap guarded; HEAD = GET.`);
