// Verifies functions/news-rss.xml.js merges KV posts with the repo-file posts
// in news-rss.xml, sorts by date before taking the newest 20, and leaves out
// NEWS_NOINDEX, removed (tombstoned), draft and future-scheduled posts.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path';
// functions/ are ESM .js in a non-module package; copy to .mjs to import them.
const d = mkdtempSync(join(tmpdir(), 'yhrss-'));
writeFileSync(join(d, '_news-noindex.mjs'), readFileSync('functions/_news-noindex.js'));
writeFileSync(join(d, 'rss.mjs'), readFileSync('functions/news-rss.xml.js', 'utf8').replace(/(['"])\.\/([^'"]+)\.js\1/g, "'./$2.mjs'"));
const { onRequestGet } = await import(join(d, 'rss.mjs'));
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
const removedStatic = items.length > 1 ? items[items.length - 1].slug : null;
const store = { get: async k => k === 'news:index' ? JSON.stringify(kv)
  : k === 'deleted' ? JSON.stringify({ news: ['kv-removed', removedStatic].filter(Boolean) }) : null };
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
for (const s of [noindex, 'kv-removed', 'kv-draft', 'kv-future', removedStatic].filter(Boolean)) {
  if (slugs.includes(s)) fail('must be excluded: ' + s);
}
for (let i = 1; i < got.length; i++) if (got[i].date > got[i - 1].date) fail('not sorted by date at ' + slugs[i]);
if (new Set(slugs).size !== slugs.length) fail('duplicate items');
// The 20 kept must be the newest 20 eligible posts.
const keptOld = slugs.filter(s => s.startsWith('kv-old-')).length;
const expectOld = 20 - 1 - items.filter(i => i.slug !== removedStatic).length;
if (keptOld !== expectOld) fail(`expected ${expectOld} older KV posts, got ${keptOld}`);
if (slugs.includes('kv-old-' + expectOld)) fail('kept an older post past the cutoff');

if (bad) { console.error(`NEWS-RSS-CHECK FAIL: ${bad}`); process.exit(1); }
console.log(`NEWS-RSS-CHECK OK: ${items.length} repo posts merged with KV, sorted by date, newest 20, noindex/removed/drafts excluded.`);
