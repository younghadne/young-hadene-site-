#!/usr/bin/env node
// Repo news dates must be full timestamps that land on the right Toronto day.
// A date-only "2026-10-23" read as midnight UTC is 8 PM ET on Oct 22, so:
//  - the Toronto date helpers in scripts/news-feeds.js get EST/EDT right;
//  - every news/*.html NewsArticle datePublished/dateModified and
//    article:published_time carries a time + offset, and its Toronto calendar
//    day matches the article's byline date;
//  - the news-sitemap.xml publication_date and news-rss.xml pubDate that
//    scripts/build-static.js generates (and the committed copies) carry a
//    time and fall on that same Toronto day;
//  - functions/_news-dates.js (used by the Functions) matches news-feeds.js;
//  - the served feeds — functions/news-rss.xml.js, functions/news-sitemap.xml.js
//    and the /news/<slug> KV page schema — emit Toronto-time dates for KV posts
//    (EDT, EST, a UTC ISO dateNum, a date-only date) against a mocked KV.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const F = require('./news-feeds.js');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEWS = path.join(ROOT, 'news');
const errors = [];
const fail = (m) => errors.push(m);

// 1. Helper: Intl-computed offsets, incl. 2026 DST change days.
const cases = [
  ['2026-10-23', '2026-10-23T00:00:00-04:00', 'Fri, 23 Oct 2026 00:00:00 -0400'],
  ['2026-01-15', '2026-01-15T00:00:00-05:00', 'Thu, 15 Jan 2026 00:00:00 -0500'],
  ['2026-03-08', '2026-03-08T00:00:00-05:00', 'Sun, 08 Mar 2026 00:00:00 -0500'], // EDT starts 2 AM
  ['2026-03-09', '2026-03-09T00:00:00-04:00', 'Mon, 09 Mar 2026 00:00:00 -0400'],
  ['2026-11-01', '2026-11-01T00:00:00-04:00', 'Sun, 01 Nov 2026 00:00:00 -0400'], // EST starts 2 AM
  ['2026-11-02', '2026-11-02T00:00:00-05:00', 'Mon, 02 Nov 2026 00:00:00 -0500'],
];
for (const [d, iso, rss] of cases) {
  if (F.toTorontoISO(d) !== iso) fail(`helper: toTorontoISO(${d}) = ${F.toTorontoISO(d)}, want ${iso}`);
  const ms = F.newsDateMs(d);
  if (F.rssDate(ms) !== rss) fail(`helper: rssDate(${d}) = ${F.rssDate(ms)}, want ${rss}`);
  if (Date.parse(iso) !== ms || Date.parse(rss) !== ms) fail(`helper: ${d} ISO/RSS forms are not the same instant`);
  if (F.torontoDay(ms) !== d) fail(`helper: ${d} lands on ${F.torontoDay(ms)} in Toronto`);
}
if (F.toTorontoISO('2026-10-10T11:00:00-04:00') !== '2026-10-10T11:00:00-04:00') fail('helper: a value with a time must pass through unchanged');

// 2. Article HTML.
const HAS_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n) => String(n).padStart(2, '0');
function bylineDay(html) {
  const t = html.match(/class="meta">\s*<time datetime="(\d{4}-\d{2}-\d{2})"/);
  if (t) return t[1];
  const m = html.match(/class="meta">\s*(?:<time[^>]*>)?\s*([A-Z][a-z]+) (\d{1,2}), (\d{4})/);
  if (m && MONTHS.includes(m[1])) return `${m[3]}-${pad(MONTHS.indexOf(m[1]) + 1)}-${pad(m[2])}`;
  return '';
}
function checkStamp(where, v, day) {
  if (!v) return;
  if (F.DATE_ONLY.test(v)) return fail(`${where}: "${v}" is date-only (reads as midnight UTC = previous evening in Toronto); use ${F.toTorontoISO(v)}`);
  if (!HAS_TIME.test(v)) return fail(`${where}: "${v}" is not a full ISO timestamp with offset`);
  const got = F.torontoDay(Date.parse(v));
  if (day && got !== day) fail(`${where}: "${v}" is ${got} in Toronto, article is dated ${day}`);
}
const entries = F.newsEntries(NEWS);
const expected = new Map();
for (const e of entries) {
  const where = `news/${e.f}`;
  const raw = (re) => (e.html.match(re) || [])[1] || '';
  const pub = raw(/"datePublished"\s*:\s*"([^"]+)"/);
  const mod = raw(/"dateModified"\s*:\s*"([^"]+)"/);
  const ogt = raw(/article:published_time"\s+content="([^"]+)"/);
  if (!pub) fail(`${where}: NewsArticle datePublished missing`);
  const day = bylineDay(e.html) || (F.DATE_ONLY.test(pub) ? pub : (pub ? F.torontoDay(Date.parse(pub)) : ''));
  if (!day) fail(`${where}: no byline date to compare against`);
  expected.set(e.slug, day);
  checkStamp(`${where} datePublished`, pub, day);
  checkStamp(`${where} article:published_time`, ogt, day);
  checkStamp(`${where} dateModified`, mod, '');
  if (mod && pub && Date.parse(mod) < Date.parse(pub)) fail(`${where}: dateModified is before datePublished`);
  if (F.torontoDay(e.ms) !== day) fail(`${where}: build reads its publish date as ${F.torontoISOFromMs(e.ms)} (${F.torontoDay(e.ms)}), want ${day}`);
}

// 3. Generated + committed feeds.
const RSS_TIME = /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} ([+-]\d{4}|GMT)$/;
function checkFeed(label, xml) {
  const slugOf = (block) => ((block.match(/<(?:loc|link)>[^<]*\/news\/([^<]+)<\/(?:loc|link)>/) || [])[1] || '');
  for (const u of xml.match(/<url>[\s\S]*?<\/url>/g) || []) {
    const slug = slugOf(u), v = ((u.match(/<news:publication_date>([^<]*)</) || [])[1] || '').trim();
    if (!expected.has(slug)) continue; // KV posts are added at request time, not here
    checkStamp(`${label} ${slug} publication_date`, v, expected.get(slug));
  }
  for (const it of xml.match(/<item>[\s\S]*?<\/item>/g) || []) {
    const slug = slugOf(it), v = ((it.match(/<pubDate>([^<]*)</) || [])[1] || '').trim();
    if (!expected.has(slug)) continue;
    if (!RSS_TIME.test(v)) { fail(`${label} ${slug} pubDate "${v}" is not an RFC 822 date-time`); continue; }
    const got = F.torontoDay(Date.parse(v));
    if (got !== expected.get(slug)) fail(`${label} ${slug} pubDate "${v}" is ${got} in Toronto, article is dated ${expected.get(slug)}`);
  }
}
const latest = Math.max(0, ...entries.map((e) => e.ms));
const gen = F.newsSitemapXml(entries, latest + 60000, Infinity); // every post "fresh"
if (gen.count !== entries.length) fail(`generated news sitemap has ${gen.count}/${entries.length} posts`);
checkFeed('generated news-sitemap.xml', gen.xml);
checkFeed('generated news-rss.xml', F.newsRssXml(entries, latest + 60000).xml);
for (const f of ['news-sitemap.xml', 'news-rss.xml']) {
  const p = path.join(ROOT, f);
  if (fs.existsSync(p)) checkFeed(`committed ${f}`, fs.readFileSync(p, 'utf8'));
}

// 4. Functions helper == build helper, every hour of 2026-2027 + every day.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yh-news-dates-'));
// functions/ are ESM .js in a non-module package; copy to .mjs to import them.
(function copyFns(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src, { withFileTypes: true })) {
    if (f.isDirectory()) { copyFns(path.join(src, f.name), path.join(dst, f.name)); continue; }
    if (!f.name.endsWith('.js')) continue;
    const code = fs.readFileSync(path.join(src, f.name), 'utf8').replace(/(from\s+['"])(\.{1,2}\/[^'"]+)\.js(['"])/g, '$1$2.mjs$3');
    fs.writeFileSync(path.join(dst, f.name.replace(/\.js$/, '.mjs')), code);
  }
})(path.join(ROOT, 'functions'), tmp);
const D = await import(path.join(tmp, '_news-dates.mjs'));
let parity = 0;
for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2028, 0, 1); t += 3600000) {
  if (D.torontoISOFromMs(t) !== F.torontoISOFromMs(t) || D.rssDate(t) !== F.rssDate(t)) { parity++; if (parity < 4) fail(`functions/_news-dates.js disagrees with news-feeds.js at ${new Date(t).toISOString()}`); }
}
for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2028, 0, 1); t += 86400000) {
  const d = new Date(t).toISOString().slice(0, 10);
  if (D.newsDateMs(d) !== F.newsDateMs(d)) { parity++; if (parity < 4) fail(`functions/_news-dates.js: newsDateMs(${d}) disagrees with news-feeds.js`); }
}

// 5. Served feeds from the Functions, mocked KV (in memory only) + ASSETS.
const KV_POSTS = [
  // EDT: 2:30 PM UTC = 10:30 AM Toronto (-04:00).
  { slug: 'kv-edt', title: 'KV EDT', status: 'published', dateNum: Date.parse('2026-10-22T14:30:00Z'),
    now: Date.parse('2026-10-23T12:00:00Z'), iso: '2026-10-22T10:30:00-04:00', rss: 'Thu, 22 Oct 2026 10:30:00 -0400' },
  // EST, near midnight: 3:15 AM UTC Dec 3 = 10:15 PM Dec 2 Toronto (-05:00).
  { slug: 'kv-est', title: 'KV EST', status: 'published', dateNum: Date.parse('2026-12-03T03:15:00Z'),
    now: Date.parse('2026-12-03T12:00:00Z'), iso: '2026-12-02T22:15:00-05:00', rss: 'Wed, 02 Dec 2026 22:15:00 -0500' },
  // UTC ISO string in dateNum, in the repeated 1 AM hour of the fall-back day (EST side).
  { slug: 'kv-utc-iso', title: 'KV UTC ISO', status: 'published', dateNum: '2026-11-01T06:30:00.000Z',
    now: Date.parse('2026-11-01T12:00:00Z'), iso: '2026-11-01T01:30:00-05:00', rss: 'Sun, 01 Nov 2026 01:30:00 -0500' },
  // No dateNum, date-only date: Toronto midnight, not UTC midnight.
  { slug: 'kv-date-only', title: 'KV date-only', status: 'published', date: '2026-10-23',
    now: Date.parse('2026-10-23T12:00:00Z'), iso: '2026-10-23T00:00:00-04:00', rss: 'Fri, 23 Oct 2026 00:00:00 -0400' },
];
function mockKV() {
  const m = new Map();
  const docs = KV_POSTS.map(({ now, iso, rss, ...p }) => p);
  m.set('news:index', JSON.stringify(docs));
  for (const p of docs) m.set('news:' + p.slug, JSON.stringify(p));
  return { get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, String(v)); }, delete: async (k) => { m.delete(k); },
    list: async () => ({ keys: [...m.keys()].map((name) => ({ name })), list_complete: true }) };
}
const ASSETS = { fetch: async (req) => {
  const u = new URL(typeof req === 'string' ? req : req.url);
  const f = path.join(ROOT, u.pathname.replace(/^\/+/, ''));
  return fs.existsSync(f) && fs.statSync(f).isFile() ? new Response(fs.readFileSync(f, 'utf8'), { status: 200 }) : new Response('nf', { status: 404 });
} };
const realNow = Date.now;
async function serve(mod, now, extra = {}) {
  Date.now = () => now;
  try {
    const res = await mod.onRequestGet({ request: new Request(extra.url || 'https://younghadene.ca/'), env: { YH_POSTS: mockKV(), ASSETS }, params: extra.params || {}, waitUntil: () => {} });
    return { status: res.status, text: await res.text() };
  } finally { Date.now = realNow; }
}
const rssFn = await import(path.join(tmp, 'news-rss.xml.mjs'));
const nsmFn = await import(path.join(tmp, 'news-sitemap.xml.mjs'));
const slugFn = await import(path.join(tmp, 'news', '[slug].mjs'));
const field = (xml, slug, open, tag) => {
  const b = (xml.match(new RegExp(`<${open}>(?:(?!</${open}>)[\\s\\S])*?/news/${slug}<(?:(?!</${open}>)[\\s\\S])*</${open}>`)) || [])[0] || '';
  return ((b.match(new RegExp(`<${tag}>([^<]*)</${tag}>`)) || [])[1] || '').trim();
};
for (const k of KV_POSTS) {
  const rss = await serve(rssFn, k.now);
  const got = field(rss.text, k.slug, 'item', 'pubDate');
  if (got !== k.rss) fail(`functions/news-rss.xml.js ${k.slug}: pubDate "${got}", want "${k.rss}"`);
  const nsm = await serve(nsmFn, k.now);
  const iso = field(nsm.text, k.slug, 'url', 'news:publication_date');
  if (iso !== k.iso) fail(`functions/news-sitemap.xml.js ${k.slug}: publication_date "${iso}", want "${k.iso}"`);
  if (iso && Date.parse(iso) !== Date.parse(k.rss)) fail(`functions: ${k.slug} sitemap and RSS dates are different instants`);
  const page = await serve(slugFn, k.now, { url: `https://younghadene.ca/news/${k.slug}`, params: { slug: k.slug } });
  const pub = ((page.text.match(/"datePublished":"([^"]+)"/) || [])[1] || '');
  if (page.status !== 200 || pub !== k.iso) fail(`functions/news/[slug].js ${k.slug}: datePublished "${pub}" (HTTP ${page.status}), want "${k.iso}"`);
  // Repo posts unioned in from the static files must also be Toronto time.
  for (const [label, text] of [['functions/news-rss.xml.js', rss.text], ['functions/news-sitemap.xml.js', nsm.text]]) {
    if (/<pubDate>[^<]*GMT<\/pubDate>/.test(text)) fail(`${label}: served feed still has a GMT pubDate`);
    if (/<news:publication_date>[^<]*Z<\/news:publication_date>/.test(text)) fail(`${label}: served sitemap still has a UTC (Z) publication_date`);
  }
}
const allRss = await serve(rssFn, Date.parse('2026-12-03T12:00:00Z'));
checkFeed('served news-rss.xml (functions)', allRss.text);
fs.rmSync(tmp, { recursive: true, force: true });

if (errors.length) {
  console.error(`check-news-dates: ${errors.length} problem(s)`);
  for (const e of errors) console.error('  ✗ ' + e);
  process.exit(1);
}
console.log(`check-news-dates: ${entries.length} news posts; schema, news-sitemap and RSS dates are full Toronto-day timestamps; Functions feeds + KV page schema use Toronto time (${KV_POSTS.length} mocked KV posts, EDT/EST/UTC-ISO/date-only) ✓`);
