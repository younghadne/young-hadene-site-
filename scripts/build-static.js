#!/usr/bin/env node
// Build step for GitHub Pages / static hosts.
// Regenerates sitemap.xml (via scripts/sitemap.js) so new blog
// posts are always included. Also generates:
//   - news-sitemap.xml (Google News: /news/ articles from the last 48h, = NEWS_WINDOW_MS)
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

function mtimeISODate(full) {
  try {
    return fs.statSync(full).mtime.toISOString().substring(0, 10);
  } catch { return ''; }
}

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
function publishedMs(html, fallbackMs) {
  const m = html.match(/"datePublished"\s*:\s*"([^"]+)"/i) ||
            html.match(/article:published_time"\s+content="([^"]+)"/i);
  const t = m ? Date.parse(m[1]) : NaN;
  return Number.isFinite(t) ? t : fallbackMs;
}

// ── 1. Main sitemap.xml ──
// Delegated to scripts/sitemap.js (single source of truth): clean URLs that
// match each page's canonical, no redirect sources, no admin/noindex pages.
// The old generator here wrote /page.html URLs that 308-redirect.
require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'sitemap.js')], { stdio: 'inherit' });
const newsDir = path.join(ROOT, 'news');
const newsFiles = listHtml(newsDir);

// ── 2. Google News sitemap ──
// 48h window, same as functions/_news-config.js NEWS_WINDOW_MS (the function
// that serves /news-sitemap.xml re-filters this file with that window anyway).
// Google News only wants articles from the last 2 days. Dates come from each
// article's real publish time, never mtime.
const FRESH_WINDOW_HOURS = 48;
const FRESH_WINDOW_MS = FRESH_WINDOW_HOURS * 60 * 60 * 1000;
const now = Date.now();
// Publication time comes ONLY from the article's NewsArticle datePublished
// (no file-mtime fallback: a fresh checkout on the build server makes every
// file "new"). Future-dated or undated articles are skipped.
function newsPubMs(full) {
  try {
    const html = fs.readFileSync(full, 'utf8');
    const m = html.match(/"datePublished"\s*:\s*"([^"]+)"/);
    const ms = m ? Date.parse(m[1]) : NaN;
    return Number.isFinite(ms) ? ms : NaN;
  } catch { return NaN; }
}
const fresh = newsFiles
  .map((f) => ({ f, ms: newsPubMs(path.join(newsDir, f)) }))
  .filter((x) => Number.isFinite(x.ms) && x.ms <= now && now - x.ms <= FRESH_WINDOW_MS)
  .sort((a, b) => b.ms - a.ms);

let news = '<?xml version="1.0" encoding="UTF-8"?>\n';
news += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n';
news += '        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n';
for (const { f, ms } of fresh) {
  const full = path.join(newsDir, f);
  const html = fs.readFileSync(full, 'utf8');
  const title = extractTitle(html).split('—')[0].split('|')[0].trim() || f;
  const pubDate = new Date(ms).toISOString();
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
console.log(`news-sitemap.xml regenerated: ${fresh.length} fresh articles`);

// ── 3. Static RSS for /news/ (latest 20) ──
const items = newsFiles
  .map((f) => {
    const full = path.join(newsDir, f);
    let ms = 0;
    try { ms = publishedMs(fs.readFileSync(full, 'utf8'), fs.statSync(full).mtimeMs); } catch { ms = 0; }
    return { f, ms };
  })
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
  rss += `    <pubDate>${new Date(ms).toUTCString()}</pubDate>\n`;
  rss += `    <description>${esc(desc)}</description>\n`;
  rss += '  </item>\n';
}
rss += '</channel>\n</rss>\n';
fs.writeFileSync(path.join(ROOT, 'news-rss.xml'), rss);
console.log(`news-rss.xml regenerated: ${items.length} items`);
