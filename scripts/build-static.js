#!/usr/bin/env node
// Build step for GitHub Pages / static hosts.
// Regenerates sitemap.xml (via scripts/sitemap.js) so new blog
// posts are always included. Also generates:
//   - news-sitemap.xml (Google News: /news/ articles from the last FRESH_WINDOW_DAYS days)
//   - news-rss.xml (static RSS for the /news/ section, for Publisher Center)
// Safe to run repeatedly (idempotent).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Files that exist on disk but must never appear in sitemaps
// (listing duplicates, stubs, tests).
const EXCLUDE = new Set([
  'index.html', // /blog/index.html duplicates /blog.html
]);

// News dates, titles and the news-sitemap/RSS markup live in
// scripts/news-feeds.js (shared with scripts/check-news-dates.mjs). A
// date-only datePublished means midnight Toronto time, never midnight UTC.
const { newsEntries, newsSitemapXml, newsRssXml } = require('./news-feeds.js');

// ── 1. Main sitemap.xml ──
// Delegated to scripts/sitemap.js (single source of truth): clean URLs that
// match each page's canonical, no redirect sources, no admin/noindex pages.
// The old generator here wrote /page.html URLs that 308-redirect.
require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'sitemap.js')], { stdio: 'inherit' });
const entries = newsEntries(path.join(ROOT, 'news'), EXCLUDE);

// ── 2. Google News sitemap ──
// Window widened (owner decision) from Google's recommended 2 days to
// FRESH_WINDOW_DAYS so recent articles stay listed. Dates come from each
// article's real publish time, never mtime.
const FRESH_WINDOW_DAYS = 7;
const FRESH_WINDOW_MS = FRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const now = Date.now();
const news = newsSitemapXml(entries, now, FRESH_WINDOW_MS);
fs.writeFileSync(path.join(ROOT, 'news-sitemap.xml'), news.xml);
console.log(`news-sitemap.xml regenerated: ${news.count} fresh articles`);

// ── 3. Static RSS for /news/ (latest 20) ──
const rss = newsRssXml(entries, now);
fs.writeFileSync(path.join(ROOT, 'news-rss.xml'), rss.xml);
console.log(`news-rss.xml regenerated: ${rss.count} items`);
