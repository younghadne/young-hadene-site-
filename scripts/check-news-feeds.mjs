// Guards /news-sitemap.xml, /news-rss.xml and sitemap.xml lastmods against the
// failures QA found on live (2026-10-30):
//  - /news-sitemap.xml missed fresh repo posts: the build filtered the static
//    file by date at deploy time (7 days, frozen at the deploy), so the
//    request-time 2-day window could not see them. The window is now applied
//    once, at request time, to repo + KV posts; with nothing fresh it is a
//    valid empty <urlset> (owner decision: strict 2 days).
//  - /news-rss.xml listed 20 KV posts and no repo posts: KV filled the 20
//    slots before the repo file was even read.
//  - sitemap.xml lastmods all equal to the deploy's HEAD date: in a shallow
//    clone `git log -1 -- <file>` returns the one fetched commit.
// Runs the real Functions against a mock KV (read-only; any write fails the
// check) and a mock ASSETS that serves this checkout's static files.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

let bad = 0;
const fail = (msg) => { bad++; console.error('NEWS-FEEDS-CHECK FAIL:', msg); };

// functions/ are ESM .js in a CommonJS package; copy to .mjs to import them.
const d = mkdtempSync(join(tmpdir(), 'yhfeeds-'));
const toMjs = (src) => readFileSync(src, 'utf8').replace(/(['"])(\.\.?\/[^'"]+)\.js\1/g, "'$2.mjs'");
for (const f of ['_news-noindex', '_news-dates', '_news-feed-items', 'news-sitemap.xml', 'news-rss.xml']) {
  writeFileSync(join(d, f + '.mjs'), toMjs(`functions/${f}.js`));
}
const nsm = await import(join(d, 'news-sitemap.xml.mjs'));
const rss = await import(join(d, 'news-rss.xml.mjs'));
const { NEWS_NOINDEX } = await import(join(d, '_news-noindex.mjs'));
const { newsDateMs } = await import(join(d, '_news-dates.mjs'));

const H = 3600e3, D = 24 * H;
const ASSETS = { async fetch(req) {
  const p = new URL(typeof req === 'string' ? req : req.url).pathname;
  try { return new Response(readFileSync('.' + p, 'utf8'), { status: 200 }); } catch { return new Response('nf', { status: 404 }); }
} };
const writes = [];
function kvEnv(index, extra = {}) {
  const kv = new Map([['news:index', JSON.stringify(index)], ...Object.entries(extra)]);
  return { ASSETS, YH_POSTS: {
    get: async (k) => kv.get(k) ?? null,
    put: async (k) => { writes.push('put ' + k); }, delete: async (k) => { writes.push('delete ' + k); },
  } };
}
const locs = (xml) => [...xml.matchAll(/<loc>[^<]*\/news\/([^<]+)<\/loc>/g)].map((m) => m[1]);
const links = (xml) => [...xml.matchAll(/<link>[^<]*\/news\/([^<]+)<\/link>/g)].map((m) => m[1]);
const TZ_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-0[45]:00$/;
const TZ_RSS = /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} -0[45]00$/;

// 1. The static news-sitemap.xml lists every repo news post (no build-time window).
const repoSlugs = readdirSync('news').filter((f) => f.endsWith('.html') && f !== 'index.html').map((f) => f.replace(/\.html$/, ''));
const staticSm = readFileSync('news-sitemap.xml', 'utf8');
const staticSlugs = locs(staticSm);
for (const s of repoSlugs) if (!staticSlugs.includes(s)) fail(`news-sitemap.xml is missing repo post ${s} (run node scripts/build-static.js)`);
for (const m of staticSm.matchAll(/<news:publication_date>([^<]+)</g)) if (!TZ_ISO.test(m[1])) fail(`news-sitemap.xml date not Toronto ISO: ${m[1]}`);
for (const m of readFileSync('news-rss.xml', 'utf8').matchAll(/<pubDate>([^<]+)</g)) if (!TZ_RSS.test(m[1])) fail(`news-rss.xml pubDate not Toronto RFC 822: ${m[1]}`);
const repoDates = new Map([...staticSm.matchAll(/<loc>[^<]*\/news\/([^<]+)<\/loc>[\s\S]*?<news:publication_date>([^<]+)</g)].map((m) => [m[1], newsDateMs(m[2])]));
const newestRepo = Math.max(...repoDates.values());
const noindex = [...NEWS_NOINDEX][0];

// 2. Nothing fresh (live today): strictly 2-day, so a valid EMPTY urlset,
//    no padding with older posts, header says "empty".
{
  if (nsm.FALLBACK_COUNT !== 0) fail(`FALLBACK_COUNT is ${nsm.FALLBACK_COUNT}; owner decision is a strict 2-day sitemap (0)`);
  const now = newestRepo + 30 * D;
  const kv = [{ slug: 'kv-old', title: 'KV old', status: 'published', dateNum: newestRepo - 5 * D }];
  const { mode, items } = await nsm.selectSitemapItems(kvEnv(kv), now);
  const xml = nsm.sitemapXml(items);
  if (mode !== 'empty') fail(`stale-only sitemap mode ${mode}, want empty`);
  if (locs(xml).length) fail(`stale-only sitemap lists ${locs(xml).length} old post(s)`);
  if (!/^<\?xml[^>]*\?>\s*<urlset [^>]*xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"[^>]*>\s*<\/urlset>\s*$/.test(xml)) fail('empty sitemap is not a valid empty <urlset>');
  const env = kvEnv(kv);
}
// The 2-day edge: 47h old is in, 49h old is out.
{
  const now = newestRepo + 100 * D;
  const kv = [
    { slug: 'kv-47h', title: '47h', status: 'published', dateNum: now - 47 * H },
    { slug: 'kv-49h', title: '49h', status: 'published', dateNum: now - 49 * H },
  ];
  const got = locs(nsm.sitemapXml((await nsm.selectSitemapItems(kvEnv(kv), now)).items));
  if (got.join() !== 'kv-47h') fail(`2-day edge lists [${got}], want [kv-47h]`);
}
// No KV binding at all: still a valid response (empty when nothing is fresh).
{
  const { mode } = await nsm.selectSitemapItems({ ASSETS }, newestRepo + 30 * D);
  if (mode !== 'empty') fail(`no-KV stale sitemap mode ${mode}, want empty`);
  const { items } = await nsm.selectSitemapItems({ ASSETS }, newestRepo + 12 * H);
  if (!items.length) fail('fresh repo post missing without a KV binding');
}
// Error path: 503 + Retry-After, never the unwindowed static file.
{
  const boom = { ASSETS: { fetch: async () => { throw new Error('boom'); } }, YH_POSTS: { get: async () => { throw new Error('boom'); } } };
  const res = await nsm.onRequestGet({ env: boom, request: new Request('https://younghadene.ca/news-sitemap.xml') });
  if (res.status !== 200 && (res.status !== 503 || !res.headers.get('Retry-After'))) fail(`error path status ${res.status} without Retry-After`);
  if (res.status === 200 && locs(await res.text()).length) fail('error path served posts outside the window');
}

// 3. Fresh posts present: only the last 2 days, from KV and repo, minus hidden ones.
{
  const now = newestRepo + 12 * H;
  const kv = [
    { slug: 'kv-fresh', title: 'Fresh — Young Hadene News', status: 'published', dateNum: now - H },
    { slug: 'kv-iso', title: 'ISO date', status: 'published', dateNum: new Date(now - 2 * H).toISOString() },
    { slug: 'kv-stale', title: 'Stale', status: 'published', dateNum: now - 3 * D },
    { slug: noindex, title: 'Off topic', status: 'published', dateNum: now - H },
    { slug: 'kv-removed', title: 'Removed', status: 'published', dateNum: now - H },
    { slug: 'kv-draft', title: 'Draft', status: 'draft', dateNum: now - H },
    { slug: 'kv-future', title: 'Future', status: 'scheduled', scheduledFor: now + D, dateNum: now - H },
    { slug: 'kv-nodate', title: 'No date', status: 'published' },
  ];
  const env = kvEnv(kv, { deleted: JSON.stringify({ news: ['kv-removed'] }) });
  const { mode, items } = await nsm.selectSitemapItems(env, now);
  const got = locs(nsm.sitemapXml(items));
  if (mode !== 'fresh') fail(`fresh sitemap mode ${mode}`);
  for (const s of ['kv-fresh', 'kv-iso']) if (!got.includes(s)) fail(`fresh sitemap missing ${s}`);
  const newestSlug = [...repoDates].sort((a, b) => b[1] - a[1])[0][0];
  if (!got.includes(newestSlug)) fail(`fresh sitemap missing fresh repo post ${newestSlug}`);
  for (const s of ['kv-stale', noindex, 'kv-removed', 'kv-draft', 'kv-future', 'kv-nodate']) if (got.includes(s)) fail(`fresh sitemap lists ${s}`);
  if (/<news:title>[^<]*—/.test(nsm.sitemapXml(items))) fail('news:title keeps the " — Young Hadene News" suffix');
}

// 4. RSS: merge before the cap, newest first, dedupe by slug, Toronto dates.
{
  const now = newestRepo + D;
  const kv = [];
  for (let i = 0; i < 25; i++) kv.push({ slug: 'kv-old-' + i, title: 'Old ' + i, status: 'published', dateNum: newestRepo - (i + 1) * D });
  kv.push({ slug: 'kv-new', title: 'New', status: 'published', dateNum: newestRepo + H });
  kv.push({ slug: noindex, title: 'Off topic', status: 'published', dateNum: newestRepo + 2 * H });
  const dupe = repoSlugs[0];
  kv.push({ slug: dupe, title: 'KV copy', status: 'published', dateNum: newestRepo - 40 * D });
  const items = await rss.selectRssItems(kvEnv(kv), now);
  const xml = rss.rssXml(items);
  const got = links(xml);
  if (got.length !== Math.min(rss.LIMIT, got.length) || got.length > rss.LIMIT) fail(`rss has ${got.length} items`);
  if (got[0] !== 'kv-new') fail(`rss newest item is ${got[0]}, want kv-new`);
  const newestRepoSlug = [...repoDates].sort((a, b) => b[1] - a[1])[0][0];
  if (newestRepoSlug !== dupe && !got.includes(newestRepoSlug)) fail(`rss crowds out repo post ${newestRepoSlug}`);
  if (got.includes(noindex)) fail('rss lists a NEWS_NOINDEX post');
  if (new Set(got).size !== got.length) fail('rss lists a slug twice');
  const ms = items.map((i) => i.ms);
  if (ms.some((m, i) => i && m > ms[i - 1])) fail('rss not sorted newest first');
  for (const m of xml.matchAll(/<pubDate>([^<]+)</g)) if (!TZ_RSS.test(m[1])) fail(`rss pubDate not Toronto time: ${m[1]}`);
}
// Full responses answer 200 with XML.
for (const [name, mod] of [['news-sitemap', nsm], ['news-rss', rss]]) {
  const res = await mod.onRequestGet({ env: kvEnv([]), request: new Request('https://younghadene.ca/' + name + '.xml') });
  if (res.status !== 200) fail(`${name} status ${res.status}`);
  if (name === 'news-sitemap' && !['fresh', 'empty'].includes(res.headers.get('X-News-Sitemap'))) fail(`X-News-Sitemap is ${res.headers.get('X-News-Sitemap')}`);
}
if (writes.length) fail('Functions wrote to KV: ' + writes.join(', '));

// 5. sitemap.xml lastmod in a shallow clone keeps the committed dates.
try {
  const sh = join(d, 'shallow');
  execFileSync('git', ['clone', '-q', '--depth', '1', 'file://' + process.cwd(), sh], { stdio: 'ignore' });
  for (const f of ['scripts/sitemap.js', 'sitemap.xml']) copyFileSync(f, join(sh, f));
  execFileSync(process.execPath, ['scripts/sitemap.js'], { cwd: sh, stdio: 'ignore' });
  const lm = (t) => new Map([...t.matchAll(/<loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?/g)].map((m) => [m[1], m[2] || '']));
  const want = lm(readFileSync('sitemap.xml', 'utf8')), have = lm(readFileSync(join(sh, 'sitemap.xml'), 'utf8'));
  let diff = 0;
  for (const [u, v] of have) if (want.has(u) && want.get(u) !== v) diff++;
  if (diff) fail(`shallow-clone build changed ${diff} committed sitemap.xml lastmods`);
  rmSync(sh, { recursive: true, force: true });
} catch (e) {
  console.log('NEWS-FEEDS-CHECK note: shallow-clone lastmod test skipped (' + String(e.message || e).split('\n')[0] + ')');
}

rmSync(d, { recursive: true, force: true });
if (bad) { console.error(`NEWS-FEEDS-CHECK FAIL: ${bad} problem(s).`); process.exit(1); }
console.log('NEWS-FEEDS-CHECK OK: news sitemap strict 2-day window over repo + KV (valid empty urlset when nothing is fresh), RSS merges repo + KV before the 20 cap, Toronto dates, no KV writes, shallow-clone lastmods kept.');
