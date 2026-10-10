#!/usr/bin/env node
// Build step for GitHub Pages / static hosts.
// Regenerates sitemap.xml from the actual files on disk so new blog
// posts are always included. Also generates:
//   - news-sitemap.xml (Google News: only /news/ articles from last 2 days)
//   - news-rss.xml (static RSS for the /news/ section, for Publisher Center)
// Safe to run repeatedly (idempotent).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE_URL = process.env.SITE_URL || 'https://younghadene.ca';

const staticPages = [
  { loc: '/', priority: '1.0', changefreq: 'monthly' },
  { loc: '/music.html', priority: '0.9', changefreq: 'monthly' },
  { loc: '/blog.html', priority: '0.9', changefreq: 'weekly' },
  { loc: '/news.html', priority: '0.9', changefreq: 'daily' },
  { loc: '/about.html', priority: '0.8', changefreq: 'monthly' },
  { loc: '/contact.html', priority: '0.7', changefreq: 'monthly' },
  { loc: '/services.html', priority: '0.7', changefreq: 'monthly' },
  { loc: '/editorial-policy.html', priority: '0.5', changefreq: 'yearly' },
  { loc: '/corrections-policy.html', priority: '0.5', changefreq: 'yearly' },
];

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

function extractMeta(html, name) {
  const m = html.match(new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`, 'i')) ||
            html.match(new RegExp(`<meta\\s+content="([^"]*)"\\s+name="${name}"`, 'i'));
  return m ? m[1] : '';
}

function extractTitle(html) {
  const m = html.match(/<title>([^<]*)<\/title>/i);
  return m ? m[1].trim() : '';
}

// ── 1. Main sitemap.xml ──
const blogDir = path.join(ROOT, 'blog');
const posts = listHtml(blogDir);
const newsDir = path.join(ROOT, 'news');
const newsFiles = listHtml(newsDir);

let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
for (const p of staticPages) {
  const file = p.loc === '/' ? 'index.html' : p.loc.replace(/^\//, '');
  if (!fs.existsSync(path.join(ROOT, file))) continue; // only list pages that exist
  xml += `  <url><loc>${SITE_URL}${p.loc}</loc><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>\n`;
}
for (const f of posts) {
  const lastmod = mtimeISODate(path.join(blogDir, f));
  xml += `  <url><loc>${SITE_URL}/blog/${esc(f)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>monthly</changefreq><priority>0.8</priority></url>\n`;
}
for (const f of newsFiles) {
  const lastmod = mtimeISODate(path.join(newsDir, f));
  xml += `  <url><loc>${SITE_URL}/news/${esc(f)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>weekly</changefreq><priority>0.9</priority></url>\n`;
}
xml += '</urlset>\n';
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
console.log(`sitemap.xml regenerated: blog ${posts.length} posts + news ${newsFiles.length} items`);

// ── 2. Google News sitemap (only /news/ articles from the last 2 days) ──
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
const now = Date.now();
const fresh = newsFiles.filter((f) => {
  try {
    return now - fs.statSync(path.join(newsDir, f)).mtimeMs < TWO_DAYS_MS;
  } catch { return false; }
});

let news = '<?xml version="1.0" encoding="UTF-8"?>\n';
news += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n';
news += '        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n';
for (const f of fresh) {
  const full = path.join(newsDir, f);
  const html = fs.readFileSync(full, 'utf8');
  const title = extractTitle(html).split('—')[0].split('|')[0].trim() || f;
  const pubDate = new Date(fs.statSync(full).mtime).toISOString();
  news += '  <url>\n';
  news += `    <loc>${SITE_URL}/news/${esc(f)}</loc>\n`;
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
  .map((f) => ({ f, mtime: fs.statSync(path.join(newsDir, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime)
  .slice(0, 20);

let rss = '<?xml version="1.0" encoding="UTF-8"?>\n';
rss += '<rss version="2.0">\n<channel>\n';
rss += '<title>Young Hadene — News</title>\n';
rss += `<link>${SITE_URL}/news.html</link>\n`;
rss += '<description>Latest news from Young Hadene: releases, shows, videos and Toronto drill &amp; dark trap scene updates.</description>\n';
rss += '<language>en-ca</language>\n';
for (const { f, mtime } of items) {
  const html = fs.readFileSync(path.join(newsDir, f), 'utf8');
  const title = extractTitle(html) || f;
  const desc = extractMeta(html, 'description') || title;
  rss += '  <item>\n';
  rss += `    <title>${esc(title)}</title>\n`;
  rss += `    <link>${SITE_URL}/news/${esc(f)}</link>\n`;
  rss += `    <guid isPermaLink="true">${SITE_URL}/news/${esc(f)}</guid>\n`;
  rss += `    <pubDate>${new Date(mtime).toUTCString()}</pubDate>\n`;
  rss += `    <description>${esc(desc)}</description>\n`;
  rss += '  </item>\n';
}
rss += '</channel>\n</rss>\n';
fs.writeFileSync(path.join(ROOT, 'news-rss.xml'), rss);
console.log(`news-rss.xml regenerated: ${items.length} items`);
