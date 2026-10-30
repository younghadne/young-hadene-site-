#!/usr/bin/env node
// Build step for GitHub Pages / static hosts.
// Regenerates sitemap.xml (via scripts/sitemap.js) so new blog
// posts are always included. Also generates:
//   - news-sitemap.xml (every repo /news/ article; the Function applies the 2-day window)
//   - news-rss.xml (static RSS for the /news/ section, for Publisher Center)
// Safe to run repeatedly (idempotent).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE_URL = process.env.SITE_URL || 'https://younghadene.ca';

// Files that exist on disk but must never appear in sitemaps
// (listing duplicates, stubs, tests).
const EXCLUDE = new Set([
  'index.html', // /blog/index.html duplicates /blog.html
]);

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function listHtml(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.html') && !EXCLUDE.has(f))
    .sort();
}

// Toronto date helpers: functions/_news-dates.js is the single source (an ES
// module); load it the same way scripts/sitemap.js loads _blog-redirects.js.
const { newsDateMs, torontoISOFromMs, rssDate } = new Function(
  fs.readFileSync(path.join(ROOT, 'functions', '_news-dates.js'), 'utf8').replace(/^export /gm, '') +
  '; return { newsDateMs, torontoISOFromMs, rssDate };')();

function decodeEntities(s) {
  return String(s)
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function extractMeta(html, name) {
  const m = html.match(new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`, 'i')) ||
            html.match(new RegExp(`<meta\\s+content="([^"]*)"\\s+name="${name}"`, 'i'));
  return m ? decodeEntities(m[1]) : '';
}

function extractTitle(html) {
  const m = html.match(/<title>([^<]*)<\/title>/i);
  return m ? m[1].trim() : '';
}

// Prefer the article's real publish date (JSON-LD datePublished, then
// article:published_time) over filesystem mtime. mtime is reset by git
// checkout, which otherwise collapses every article onto one meaningless
// timestamp and breaks the Google News 2-day freshness window.
// A date-only value ("2026-10-23") is midnight in Toronto, not UTC.
function publishedMs(html, fallbackMs) {
  const m = html.match(/"datePublished"\s*:\s*"([^"]+)"/i) ||
            html.match(/article:published_time"\s+content="([^"]+)"/i);
  const t = m ? newsDateMs(m[1]) : NaN;
  return Number.isFinite(t) ? t : fallbackMs;
}

// ── 1. Main sitemap.xml ──
// Delegated to scripts/sitemap.js (single source of truth): clean URLs that
// match each page's canonical, no redirect sources, no admin/noindex pages.
// The old generator here wrote /page.html URLs that 308-redirect.
require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'sitemap.js')], { stdio: 'inherit' });
const newsDir = path.join(ROOT, 'news');
const newsFiles = listHtml(newsDir);

// ── 2. Repo news list for the Google News sitemap ──
// Lists EVERY repo news post (newest first). This file is the source list
// that functions/news-sitemap.xml.js merges with KV; the 2-day Google News
// window is applied there at request time (strict: an empty urlset when
// nothing is that fresh). Filtering here froze the window at deploy time, so
// a build a few days after a post shipped without it and the Function could
// no longer list it while it was still fresh.
const now = Date.now();
const repoNews = newsFiles
  .map((f) => {
    const full = path.join(newsDir, f);
    let ms = 0;
    try { ms = publishedMs(fs.readFileSync(full, 'utf8'), NaN); } catch { ms = NaN; }
    return { f, ms };
  })
  .filter((x) => Number.isFinite(x.ms))
  .sort((a, b) => b.ms - a.ms);

let news = '<?xml version="1.0" encoding="UTF-8"?>\n';
news += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n';
news += '        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n';
for (const { f, ms } of repoNews) {
  const full = path.join(newsDir, f);
  const html = fs.readFileSync(full, 'utf8');
  const title = extractTitle(html).split('—')[0].split('|')[0].trim() || f;
  const pubDate = torontoISOFromMs(ms);
  news += '  <url>\n';
  news += `    <loc>${SITE_URL}/news/${esc(f.replace(/\.html$/, ''))}</loc>\n`;
  news += '    <news:news>\n';
  news += '      <news:publication>\n';
  news += '        <news:name>Young Hadene</news:name>\n';
  news += '        <news:language>en</news:language>\n';
  news += '      </news:publication>\n';
  news += `      <news:publication_date>${pubDate}</news:publication_date>\n`;
  news += `      <news:title>${esc(title)}</news:title>\n`;
  news += '    </news:news>\n';
  news += '  </url>\n';
}
news += '</urlset>\n';
fs.writeFileSync(path.join(ROOT, 'news-sitemap.xml'), news);
console.log(`news-sitemap.xml regenerated: ${repoNews.length} repo articles`);

// ── 3. Static RSS for /news/ (latest 20) ──
const items = newsFiles
  .map((f) => {
    const full = path.join(newsDir, f);
    let ms = 0;
    try { ms = publishedMs(fs.readFileSync(full, 'utf8'), NaN); } catch { ms = NaN; }
    return { f, ms };
  })
  .filter((x) => Number.isFinite(x.ms))
  .sort((a, b) => b.ms - a.ms)
  .slice(0, 20);

let rss = '<?xml version="1.0" encoding="UTF-8"?>\n';
rss += '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n<channel>\n';
rss += '<title>Young Hadene — News</title>\n';
rss += `<link>${SITE_URL}/news</link>\n`;
rss += `<atom:link href="${SITE_URL}/news-rss.xml" rel="self" type="application/rss+xml"/>\n`;
rss += '<description>Latest news from Young Hadene: releases, shows, videos and Toronto drill &amp; dark trap scene updates.</description>\n';
rss += '<language>en-ca</language>\n';
rss += `<lastBuildDate>${new Date(now).toUTCString()}</lastBuildDate>\n`;
for (const { f, ms } of items) {
  const html = fs.readFileSync(path.join(newsDir, f), 'utf8');
  const title = extractTitle(html) || f;
  const desc = extractMeta(html, 'description') || title;
  rss += '  <item>\n';
  rss += `    <title>${esc(title)}</title>\n`;
  rss += `    <link>${SITE_URL}/news/${esc(f.replace(/\.html$/, ''))}</link>\n`;
  rss += `    <guid isPermaLink="true">${SITE_URL}/news/${esc(f.replace(/\.html$/, ''))}</guid>\n`;
  rss += `    <pubDate>${rssDate(ms)}</pubDate>\n`;
  rss += `    <description>${esc(desc)}</description>\n`;
  rss += '  </item>\n';
}
rss += '</channel>\n</rss>\n';
fs.writeFileSync(path.join(ROOT, 'news-rss.xml'), rss);
console.log(`news-rss.xml regenerated: ${items.length} items`);
