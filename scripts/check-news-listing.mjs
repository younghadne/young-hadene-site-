#!/usr/bin/env node
// /news listing order + news-sitemap date format.
//  1. js/news-listing.js (browser), functions/_news-dates.js (Functions) and
//     scripts/news-feeds.js (build) agree on Toronto dates: every hour and day
//     of 2026-2027 plus mixed-format samples (date-only, Z, -04:00/-05:00,
//     epoch ms, ISO in dateNum).
//  2. news.html: repo cards and KV posts become ONE list, deduped by slug
//     (KV copy wins, as in functions/news-rss.xml.js), tombstoned slugs
//     stripped, newest first, no featured pinning. KV comes from the real
//     functions/api/news-list.js served from a MOCKED KV (no real KV). Repo
//     cards come from news.html plus fixtures shaped like #20's (date-only
//     dates, no data-published) and #27's (-04:00) cards. The browser wiring
//     (YHNewsListing.init) runs against a minimal fake DOM.
//  3. scripts/build-static.js writes news-sitemap.xml publication dates in
//     Toronto time (-04:00 EDT / -05:00 EST, DST-correct), never Z; it is
//     run in a temp copy with a pinned clock and fixture posts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const fail = (m) => errors.push(m);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yh-news-listing-'));
const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : String(ms));

let L = null;
try { L = require(path.join(ROOT, 'js', 'news-listing.js')); } catch (e) { fail(`js/news-listing.js missing or broken (${e.code || e.message}): /news has no merged, date-sorted listing`); }
let F = null;
try { F = require(path.join(ROOT, 'scripts', 'news-feeds.js')); } catch (e) { fail(`scripts/news-feeds.js missing (${e.code || e.message}): the build has no Toronto-time date helpers`); }
// functions/ are ESM .js in a CommonJS package; import a .mjs copy.
async function importFn(rel) {
  const src = path.join(ROOT, 'functions', rel);
  if (!fs.existsSync(src)) { fail(`functions/${rel} missing`); return null; }
  const dst = path.join(tmp, rel.replace(/[\/]/g, '__').replace(/\.js$/, '.mjs'));
  fs.writeFileSync(dst, fs.readFileSync(src, 'utf8').replace(/from '\.\/([^']+)\.js'/g, "from './$1.mjs'"));
  return import(dst);
}
const D = await importFn('_news-dates.js');

// ── 1. Helpers agree ──
if (L && D && F) {
  const H = 3600000;
  const start = Date.UTC(2026, 0, 1), end = Date.UTC(2028, 0, 1);
  let bad = 0;
  for (let t = start; t < end && bad < 5; t += H) {
    const a = L.torontoOffsetMin(t), b = D.torontoOffsetMin(t), c = F.torontoOffsetMin(t);
    if (a !== b || a !== c) { bad++; fail(`helpers disagree on Toronto offset at ${iso(t)}: listing ${a}, functions ${b}, build ${c}`); }
  }
  for (let t = start; t < end && bad < 10; t += 24 * H) {
    const ymd = new Date(t).toISOString().slice(0, 10);
    const a = L.torontoMidnightMs(ymd), b = D.torontoMidnightMs(ymd), c = F.torontoMidnightMs(ymd);
    if (a !== b || a !== c) { bad++; fail(`helpers disagree on Toronto midnight of ${ymd}: ${iso(a)} / ${iso(b)} / ${iso(c)}`); }
  }
  const samples = ['2026-10-23', '2026-01-15', '2026-03-08', '2026-11-01', '2026-11-02', '2026-10-24T12:00:00-04:00',
    '2026-01-15T09:00:00-05:00', '2026-10-11T02:30:00.000Z', '2026-10-10T15:00:00Z', '', 'October 23, 2026'];
  for (const v of samples) {
    const a = L.newsDateMs(v), b = D.newsDateMs(v), c = F.newsDateMs(v);
    if (!Object.is(a, b) || !Object.is(a, c)) fail(`helpers disagree on newsDateMs("${v}"): ${iso(a)} / ${iso(b)} / ${iso(c)}`);
  }
  const kvSamples = [{ dateNum: 1791675249000 }, { dateNum: '1791675249000' }, { dateNum: '2026-10-11T02:30:00.000Z' },
    { date: '2026-10-24' }, { dateNum: 0, date: '2026-01-15' }, { date: 'October 10, 2026' }, {}, null];
  for (const p of kvSamples) {
    const a = L.kvPostMs(p, 0), b = D.kvPostMs(p, 0);
    if (a !== b) fail(`helpers disagree on kvPostMs(${JSON.stringify(p)}): listing ${iso(a)}, functions ${iso(b)}`);
  }
  if (L.displayDateMs('October 24, 2026 · By Young Hadene') !== D.torontoMidnightMs('2026-10-24')) fail('listing: visible date "October 24, 2026" is not read as Toronto midnight');
  if (L.displayDateMs('January 15, 2026') !== Date.parse('2026-01-15T00:00:00-05:00')) fail('listing: visible January date is not read as midnight EST');
}

// ── 2. Listing ──
const newsHtml = fs.readFileSync(path.join(ROOT, 'news.html'), 'utf8');
if (!/<script src="js\/news-listing\.js"><\/script>/.test(newsHtml) || !/YHNewsListing\.init\(/.test(newsHtml)) {
  fail('news.html does not load js/news-listing.js / call YHNewsListing.init (KV posts are prepended above repo cards)');
}
if (/insertAdjacentHTML\('afterbegin'/.test(newsHtml)) fail("news.html still prepends KV cards with insertAdjacentHTML('afterbegin')");
const gridHtml = (newsHtml.match(/<div class="news-grid">([\s\S]*?)\n      <\/div>\n      <p/) || [])[1] || '';
function cardsFrom(html) {
  const out = [];
  const re = /<a class="news-card"([^>]*)>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attr = (n) => ((m[1].match(new RegExp(`\\s${n}="([^"]*)"`)) || [])[1] || '');
    out.push({ href: attr('href'), published: attr('data-published'), dateText: ((m[2].match(/<span class="date">([^<]*)</) || [])[1] || '') });
  }
  return out;
}
const repoCards = cardsFrom(gridHtml);
if (!repoCards.length) fail('news.html: no repo news cards found in .news-grid');
const articlePub = (slug) => {
  const f = path.join(ROOT, 'news', slug + '.html');
  if (!fs.existsSync(f)) return '';
  return ((fs.readFileSync(f, 'utf8').match(/"datePublished"\s*:\s*"([^"]+)"/) || [])[1] || '').trim();
};
const torontoDay = (ms) => (F ? F.torontoDay(ms) : iso(ms).slice(0, 10));
if (L) {
  for (const c of repoCards) {
    const slug = L.slugFromHref(c.href);
    const ms = L.staticCardMs(c.published, c.dateText);
    if (!slug) fail(`news.html card ${c.href}: no /news/<slug> href`);
    if (!ms) { fail(`news.html card ${c.href}: no data-published and no readable visible date`); continue; }
    const pub = articlePub(slug);
    if (!pub) continue;
    // Same instant, any notation (date-only = Toronto midnight, Z, offsets).
    const pms = L.newsDateMs(pub);
    if (!pms) { fail(`news/${slug}.html: datePublished "${pub}" is not a readable date`); continue; }
    if (c.published) {
      const cms = L.newsDateMs(c.published);
      if (!cms) fail(`news.html card ${slug}: data-published "${c.published}" is not a readable date`);
      else if (cms !== pms) fail(`news.html card ${slug}: data-published "${c.published}" (${iso(cms)}) != article datePublished "${pub}" (${iso(pms)})`);
    }
    if (torontoDay(ms) !== torontoDay(pms)) fail(`news.html card ${slug}: listed on ${torontoDay(ms)}, article is dated ${torontoDay(pms)} in Toronto`);
  }
}

// Fixture repo cards, shaped like the cards #20 and #27 add above the
// existing ones (no data-published; #20's articles use date-only dates).
const pr20 = [
  { fixture: true, href: '/news/k-os-blackneck-album-oct-30', published: '', dateText: 'October 23, 2026 · By Young Hadene Team' },
  { fixture: true, href: '/news/saukrates-fades-away-2026-remix-toronto-hip-hop-lineage', published: '', dateText: 'October 23, 2026 · By Young Hadene Team' },
];
const pr27 = [
  { fixture: true, href: '/news/kardinal-offishall-firestarter-vol-2-independent-release-toronto', published: '', dateText: 'October 24, 2026 · By Young Hadene Team' },
  { fixture: true, href: '/news/waahli-soap-club-vol-1-independent-rap-business', published: '', dateText: 'October 24, 2026 · By Young Hadene Team' },
];

// Mocked KV (read-only, in memory): ~106 published posts Oct 9-10 like
// production, plus mixed date formats, hidden and tombstoned items.
const T = (s) => Date.parse(s);
const kvIndex = [];
for (let i = 0; i < 100; i++) {
  kvIndex.push({ slug: `kv-oct-${i}`, title: `KV ${i}`, date: i < 50 ? 'October 10, 2026' : 'October 9, 2026', status: 'published',
    dateNum: T('2026-10-10T23:59:00-04:00') - i * 29 * 60000, category: 'News', excerpt: 'x' });
}
kvIndex.push(
  { slug: 'kv-featured-old', title: 'Featured', date: 'October 10, 2026', status: 'published', featured: true, dateNum: T('2026-10-10T06:00:00-04:00') },
  { slug: 'kv-iso-z', title: 'ISO Z dateNum', date: 'October 10, 2026', status: 'published', dateNum: '2026-10-11T02:30:00.000Z' },
  { slug: 'kv-date-only-1024', title: 'Date-only', status: 'published', date: '2026-10-24' },
  { slug: 'kv-offset-1023', title: 'Offset', status: 'published', dateNum: '2026-10-23T23:30:00-04:00' },
  { slug: 'kv-est-jan', title: 'EST', status: 'published', date: '2026-01-15' },
  { slug: 'they-took-me-down-album-spotlight', title: 'KV copy of a repo post', date: 'October 10, 2026', status: 'published', dateNum: T('2026-10-10T10:00:00-04:00') },
  { slug: 'kv-draft', title: 'Draft', status: 'draft', dateNum: T('2026-10-25T09:00:00-04:00') },
  { slug: 'kv-future', title: 'Future', status: 'scheduled', scheduledFor: T('2030-01-01T00:00:00Z'), dateNum: T('2026-10-25T09:00:00-04:00') },
  { slug: 'kv-tombstoned', title: 'Gone', status: 'published', dateNum: T('2026-10-24T20:00:00-04:00') },
);
const kvStore = { 'news:index': JSON.stringify(kvIndex), deleted: JSON.stringify({ news: ['kv-tombstoned', 'young-hadene-launches-official-newsroom'] }), stats: '{}' };
const mockKV = {
  get: async (k) => (Object.prototype.hasOwnProperty.call(kvStore, k) ? kvStore[k] : null),
  put: async () => { throw new Error('KV write attempted in check'); },
  delete: async () => { throw new Error('KV write attempted in check'); },
  list: async () => ({ keys: [], list_complete: true }),
};
const listFn = await importFn('api/news-list.js');
let api = null;
if (listFn) {
  const res = await listFn.onRequestGet({ request: new Request('https://younghadene.ca/api/news-list'), env: { YH_POSTS: mockKV } });
  api = await res.json();
  if (!api || !Array.isArray(api.posts)) fail('functions/api/news-list.js (mock KV) returned no posts');
}

// Expected instants for the interesting slugs. The #20/#27 entries are
// for the FIXTURE cards above (visible date only -> Toronto midnight); a
// real news.html card is always held to its own article's datePublished.
const EXPECT = {
  'kardinal-offishall-firestarter-vol-2-independent-release-toronto': '2026-10-24T00:00:00-04:00',
  'waahli-soap-club-vol-1-independent-rap-business': '2026-10-24T00:00:00-04:00',
  'kv-date-only-1024': '2026-10-24T00:00:00-04:00',
  'kv-offset-1023': '2026-10-23T23:30:00-04:00',
  'k-os-blackneck-album-oct-30': '2026-10-23T00:00:00-04:00',
  'saukrates-fades-away-2026-remix-toronto-hip-hop-lineage': '2026-10-23T00:00:00-04:00',
  'kv-iso-z': '2026-10-10T22:30:00-04:00',
  'exposed-vocals-feature-they-took-me-down': '2026-10-10T09:00:00-04:00',
  'they-took-me-down-album-spotlight': '2026-10-10T10:00:00-04:00',
  'kv-featured-old': '2026-10-10T06:00:00-04:00',
  'kv-est-jan': '2026-01-15T00:00:00-05:00',
};
function checkOrder(label, statics, opts = {}) {
  if (!L || !api) return null;
  const items = statics.map((c) => ({ slug: L.slugFromHref(c.href), ms: L.staticCardMs(c.published, c.dateText), card: c }));
  const merged = L.mergeItems(items, api.posts, api.removed);
  const slugs = merged.map((i) => i.slug);
  const pos = (s) => slugs.indexOf(s) + 1;
  if (new Set(slugs).size !== slugs.length) fail(`${label}: duplicate slugs in the listing`);
  for (let i = 1; i < merged.length; i++) {
    if (merged[i].ms > merged[i - 1].ms) { fail(`${label}: not newest-first at #${i + 1} (${merged[i].slug} ${iso(merged[i].ms)} after ${merged[i - 1].slug} ${iso(merged[i - 1].ms)})`); break; }
  }
  for (const s of ['kv-tombstoned', 'young-hadene-launches-official-newsroom', 'kv-draft', 'kv-future']) if (pos(s)) fail(`${label}: ${s} (removed/hidden) is listed at #${pos(s)}`);
  for (const s of new Set([...Object.keys(EXPECT), ...items.map((i) => i.slug)])) {
    const it = merged.find((i) => i.slug === s);
    if (!it) { if (!(api.removed || []).includes(s) && (items.some((i) => i.slug === s) || api.posts.some((p) => p.slug === s))) fail(`${label}: ${s} missing`); continue; }
    let want = null, why = 'fixture';
    if (it.kv) want = EXPECT[s] || null;
    else if (it.ref.card.fixture) want = (opts.exact && opts.exact[s]) || EXPECT[s] || null;
    else {
      // Real repo card: the instant of its article's datePublished.
      const pub = articlePub(s);
      if (pub) { want = pub; why = `news/${s}.html datePublished`; } else want = EXPECT[s] || null;
    }
    if (want == null) continue;
    const wantMs = L.newsDateMs(want);
    if (!wantMs || it.ms !== wantMs) fail(`${label}: ${s} dated ${iso(it.ms)}, want ${want} (${why})`);
  }
  const dup = merged.find((i) => i.slug === 'they-took-me-down-album-spotlight');
  if (dup && !dup.kv) fail(`${label}: slug in both KV and repo should use the KV entry (as news-rss.xml does)`);
  const feat = pos('kv-featured-old');
  if (feat && feat < pos('exposed-vocals-feature-they-took-me-down')) fail(`${label}: featured KV post from 06:00 Oct 10 is pinned above newer posts (#${feat})`);
  if (opts.top) {
    const got = slugs.slice(0, opts.top.length);
    if (got.join() !== opts.top.join()) fail(`${label}: top of listing is\n      ${got.join('\n      ')}\n    want\n      ${opts.top.join('\n      ')}`);
  }
  const expectedLen = new Set([...items.map((i) => i.slug), ...api.posts.map((p) => p.slug)].filter((s) => !(api.removed || []).includes(s))).size;
  if (merged.length !== expectedLen) fail(`${label}: ${merged.length} items, want ${expectedLen}`);
  return merged;
}
const TOP = ['kardinal-offishall-firestarter-vol-2-independent-release-toronto', 'waahli-soap-club-vol-1-independent-rap-business',
  'kv-date-only-1024', 'kv-offset-1023', 'k-os-blackneck-album-oct-30', 'saukrates-fades-away-2026-remix-toronto-hip-hop-lineage'];
checkOrder('listing (news.html as committed)', repoCards);
const both = checkOrder('listing (+#27 and #20 cards)', [...pr27, ...pr20, ...repoCards], { top: TOP });
checkOrder('listing (#20 cards above #27 cards)', [...pr20, ...pr27, ...repoCards], { top: TOP });
// #27 cards carrying data-published (if added later) still sort correctly.
const pr27Timed = pr27.map((c) => ({ ...c, published: '2026-10-24T12:00:00-04:00' }));
checkOrder('listing (#27 with data-published)', [...pr20, ...pr27Timed, ...repoCards], {
  top: ['kardinal-offishall-firestarter-vol-2-independent-release-toronto', 'waahli-soap-club-vol-1-independent-rap-business', 'kv-date-only-1024'],
  exact: { 'kardinal-offishall-firestarter-vol-2-independent-release-toronto': '2026-10-24T12:00:00-04:00', 'waahli-soap-club-vol-1-independent-rap-business': '2026-10-24T12:00:00-04:00' },
});
if (both) {
  const p = (s) => both.findIndex((i) => i.slug === s) + 1;
  // Repo posts from Oct 10 sit among the KV posts of that day by time.
  const ex = p('exposed-vocals-feature-they-took-me-down'), tt = p('they-took-me-down-album-spotlight');
  if (!(tt < ex)) fail(`listing: 10:00 post (#${tt}) should be above the 09:00 post (#${ex})`);
  if (ex >= both.length - 5) fail(`listing: the Oct 10 09:00 repo post sinks to #${ex} of ${both.length}`);
}

// Browser wiring against a tiny fake DOM (cards are moved, KV cards built,
// stale cards removed), fed the same mocked /api/news-list response.
if (L && api) {
  class El {
    constructor(attrs = {}, dateText = '') { this.attrs = attrs; this.dateText = dateText; this.parentNode = null; this.children = []; }
    getAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attrs, n) ? this.attrs[n] : null; }
    querySelector(sel) { return sel === '.date' ? { textContent: this.dateText } : null; }
    querySelectorAll(sel) { return sel === 'a.news-card' ? this.children.filter((c) => c.attrs.class === 'news-card') : []; }
    removeChild(c) { this.children.splice(this.children.indexOf(c), 1); c.parentNode = null; return c; }
    appendChild(c) {
      const kids = c.isFrag ? c.children.splice(0) : [c];
      for (const k of kids) { if (k.parentNode) k.parentNode.removeChild(k); k.parentNode = this; this.children.push(k); }
      return c;
    }
    set innerHTML(h) {
      const m = h.match(/^<a class="news-card" href="([^"]*)">[\s\S]*<span class="date">([^<]*)<\/span>/);
      const a = new El({ class: 'news-card', href: m ? m[1] : '' }, m ? m[2] : '');
      a.parentNode = this; this.children = [a];
    }
    get firstChild() { return this.children[0]; }
  }
  const grid = new El({ class: 'news-grid' });
  for (const c of [...pr27, ...pr20, ...repoCards]) grid.appendChild(new El({ class: 'news-card', href: c.href, ...(c.published ? { 'data-published': c.published } : {}) }, c.dateText));
  const doc = {
    querySelector: (s) => (s === '.news-grid' ? grid : null),
    createElement: () => new El(),
    createDocumentFragment: () => Object.assign(new El(), { isFrag: true }),
  };
  const fetchFn = async () => ({ ok: true, json: async () => api });
  // Baked NEWS_POSTS holding a stale copy of one KV post: the live copy wins.
  L.init(doc, [{ ...api.posts.find((p) => p.slug === 'kv-oct-0'), title: 'stale' }], fetchFn);
  await new Promise((r) => setTimeout(r, 20));
  const domSlugs = grid.children.map((c) => L.slugFromHref(c.getAttribute('href')));
  const want = (both || []).map((i) => i.slug);
  if (domSlugs.join() !== want.join()) {
    const i = domSlugs.findIndex((s, k) => s !== want[k]);
    fail(`fake DOM: rendered order differs from mergeItems at #${i + 1} (${domSlugs[i]} vs ${want[i]}); ${domSlugs.length} vs ${want.length} cards`);
  }
}

// ── 3. news-sitemap.xml dates from scripts/build-static.js ──
const OFFSET_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;
function checkSitemapDates(label, xml, wantCount) {
  const dates = [...xml.matchAll(/<news:publication_date>([^<]*)<\/news:publication_date>/g)].map((m) => m[1].trim());
  if (wantCount != null && dates.length !== wantCount) fail(`${label}: ${dates.length} publication dates, want ${wantCount}`);
  for (const v of dates) {
    if (!OFFSET_ISO.test(v)) { fail(`${label}: publication_date "${v}" is not Toronto time with an offset (e.g. 2026-10-24T12:00:00-04:00)`); continue; }
    if (F || D) {
      const off = (F || D).torontoOffsetMin(Date.parse(v));
      const s = off < 0 ? '-' : '+', a = Math.abs(off);
      const want = `${s}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
      if (!v.endsWith(want)) fail(`${label}: publication_date "${v}" should carry Toronto's offset ${want} on that date`);
    }
  }
  return dates;
}
const committed = path.join(ROOT, 'news-sitemap.xml');
if (fs.existsSync(committed)) checkSitemapDates('committed news-sitemap.xml', fs.readFileSync(committed, 'utf8'));
const bs = fs.readFileSync(path.join(ROOT, 'scripts', 'build-static.js'), 'utf8');
if (/publication_date[\s\S]{0,200}toISOString|toISOString\(\)[\s\S]{0,400}publication_date/.test(bs)) fail('scripts/build-static.js: news-sitemap publication_date still comes from toISOString() (UTC, Z)');
// Run the real build in a temp copy (text files only) with fixture posts.
{
  const site = path.join(tmp, 'site');
  const files = execFileSync('git', ['ls-files'], { cwd: ROOT }).toString().split('\n')
    .filter((f) => f && /\.(html|js|mjs|cjs|json|xml|txt|md)$/i.test(f) || f === '_redirects' || f === '_headers');
  for (const f of files) {
    const src = path.join(ROOT, f);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(path.join(site, f)), { recursive: true });
    fs.copyFileSync(src, path.join(site, f));
  }
  for (const f of ['scripts/news-feeds.js', 'scripts/build-static.js', 'js/news-listing.js', 'functions/_news-dates.js']) {
    if (fs.existsSync(path.join(ROOT, f))) { fs.mkdirSync(path.dirname(path.join(site, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(site, f)); }
  }
  const FIX = {
    'zz-fixture-date-only-edt': ['2026-10-23', '2026-10-23T00:00:00-04:00'],
    'zz-fixture-date-only-est': ['2026-11-02', '2026-11-02T00:00:00-05:00'],
    'zz-fixture-dst-end-day': ['2026-11-01', '2026-11-01T00:00:00-04:00'],
    'zz-fixture-dst-start-day': ['2026-03-08', '2026-03-08T00:00:00-05:00'],
    'zz-fixture-offset': ['2026-10-24T12:00:00-04:00', '2026-10-24T12:00:00-04:00'],
    'zz-fixture-est-time': ['2026-01-15T09:30:00-05:00', '2026-01-15T09:30:00-05:00'],
  };
  for (const [slug, [pub]] of Object.entries(FIX)) {
    fs.writeFileSync(path.join(site, 'news', slug + '.html'), `<!DOCTYPE html><html><head><title>${slug} — Young Hadene</title><script type="application/ld+json">{"@type":"NewsArticle","datePublished":"${pub}"}</script></head><body></body></html>\n`);
  }
  // Pin "now" just after the newest post, with a window wide enough for all.
  const latest = Math.max(...Object.values(FIX).map(([p]) => Date.parse(p.length === 10 ? p + 'T00:00:00-05:00' : p)));
  const pre = path.join(tmp, 'clock.cjs');
  fs.writeFileSync(pre, `const n=${latest + 3600000};Date.now=()=>n;`);
  let out = '';
  try {
    out = execFileSync(process.execPath, ['-r', pre, path.join(site, 'scripts', 'build-static.js')], { cwd: site, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  } catch (e) { fail(`scripts/build-static.js failed in a temp copy: ${String(e.stderr || e.message).split('\n')[0]}`); }
  if (out || fs.existsSync(path.join(site, 'news-sitemap.xml'))) {
    const xml = fs.readFileSync(path.join(site, 'news-sitemap.xml'), 'utf8');
    for (const [slug, [, want]] of Object.entries(FIX)) {
      const b = (xml.match(new RegExp(`<loc>[^<]*/news/${slug}</loc>[\\s\\S]*?</url>`)) || [])[0];
      if (!b) continue; // outside the 7-day window for the pinned clock
      const got = ((b.match(/<news:publication_date>([^<]*)</) || [])[1] || '').trim();
      if (got !== want) fail(`build-static.js news-sitemap ${slug}: publication_date "${got}", want "${want}"`);
    }
    const inWindow = Object.keys(FIX).filter((s) => xml.includes(`/news/${s}</loc>`));
    if (!inWindow.includes('zz-fixture-date-only-est') || !inWindow.includes('zz-fixture-dst-end-day')) fail(`build-static.js news-sitemap: fixtures in the 7-day window missing (got ${inWindow.join(', ') || 'none'})`);
    checkSitemapDates('build-static.js news-sitemap.xml', xml);
  }
  // Every fixture through the shared generator with an unlimited window.
  if (F) {
    const entries = F.newsEntries(path.join(site, 'news'));
    const xml = F.newsSitemapXml(entries, Math.max(...entries.map((e) => e.ms)) + 60000, Infinity).xml;
    checkSitemapDates('news-feeds.js newsSitemapXml (all posts + fixtures)', xml, entries.length);
    for (const [slug, [, want]] of Object.entries(FIX)) {
      if (!xml.includes(`/news/${slug}</loc>`)) fail(`newsSitemapXml: ${slug} missing`);
      else if (!xml.includes(`<loc>https://younghadene.ca/news/${slug}</loc>\n    <news:news>\n      <news:publication>\n        <news:name>Young Hadene</news:name>\n        <news:language>en</news:language>\n      </news:publication>\n      <news:publication_date>${want}</news:publication_date>`)) fail(`newsSitemapXml: ${slug} publication_date is not ${want}`);
    }
  }
  // Repo articles must not carry UTC "Z" publish dates (the sitemap passes
  // an article's own timestamp through).
  for (const f of fs.readdirSync(path.join(ROOT, 'news')).filter((x) => x.endsWith('.html'))) {
    const pub = articlePub(f.replace(/\.html$/, ''));
    if (pub && /Z$/i.test(pub)) fail(`news/${f}: datePublished "${pub}" is UTC; write it in Toronto time with an offset`);
  }
}
fs.rmSync(tmp, { recursive: true, force: true });

if (errors.length) {
  console.error(`NEWS-LISTING-CHECK: ${errors.length} problem(s)`);
  for (const e of errors) console.error('  ✗ ' + e);
  process.exit(1);
}
console.log(`NEWS-LISTING-CHECK OK: ${repoCards.length} repo cards + ${api.posts.length} mocked KV posts merge into one newest-first list (deduped, tombstones stripped, #20/#27-style cards on top); helpers agree hourly 2026-2027; news-sitemap dates are Toronto time (-04:00/-05:00).`);
