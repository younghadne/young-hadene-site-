#!/usr/bin/env node
// Repo news dates must be full timestamps that land on the right Toronto day.
// A date-only "2026-10-23" read as midnight UTC is 8 PM ET on Oct 22, so:
//  - the Toronto date helpers in scripts/news-feeds.js get EST/EDT right;
//  - every news/*.html NewsArticle datePublished/dateModified and
//    article:published_time carries a time + offset, and its Toronto calendar
//    day matches the article's byline date;
//  - the news-sitemap.xml publication_date and news-rss.xml pubDate that
//    scripts/build-static.js generates (and the committed copies) carry a
//    time and fall on that same Toronto day.
import fs from 'node:fs';
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

if (errors.length) {
  console.error(`check-news-dates: ${errors.length} problem(s)`);
  for (const e of errors) console.error('  ✗ ' + e);
  process.exit(1);
}
console.log(`check-news-dates: ${entries.length} news posts; schema, news-sitemap and RSS dates are full Toronto-day timestamps ✓`);
