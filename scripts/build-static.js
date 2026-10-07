#!/usr/bin/env node
// Build step for GitHub Pages / static hosts.
// Regenerates sitemap.xml from the actual files on disk so new blog
// posts are always included. Safe to run repeatedly (idempotent).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE_URL = process.env.SITE_URL || 'https://younghadene.ca';

const staticPages = [
  { loc: '/', priority: '1.0', changefreq: 'monthly' },
  { loc: '/music.html', priority: '0.9', changefreq: 'monthly' },
  { loc: '/blog.html', priority: '0.9', changefreq: 'weekly' },
  { loc: '/about.html', priority: '0.8', changefreq: 'monthly' },
  { loc: '/contact.html', priority: '0.7', changefreq: 'monthly' },
  { loc: '/services.html', priority: '0.7', changefreq: 'monthly' },
];

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const blogDir = path.join(ROOT, 'blog');
let posts = [];
if (fs.existsSync(blogDir)) {
  posts = fs.readdirSync(blogDir)
    .filter((f) => f.endsWith('.html'))
    .sort();
}

let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
for (const p of staticPages) {
  xml += `  <url><loc>${SITE_URL}${p.loc}</loc><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>\n`;
}
for (const f of posts) {
  const full = path.join(blogDir, f);
  let lastmod = '';
  try {
    lastmod = fs.statSync(full).mtime.toISOString().substring(0, 10);
  } catch { /* ignore */ }
  xml += `  <url><loc>${SITE_URL}/blog/${esc(f)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>monthly</changefreq><priority>0.8</priority></url>\n`;
}
xml += '</urlset>\n';

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
console.log(`sitemap.xml regenerated: ${staticPages.length} pages + ${posts.length} posts`);
