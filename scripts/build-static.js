#!/usr/bin/env node
// Build step for GitHub Pages / static hosts.
// Regenerates sitemap.xml from the actual files on disk so new blog
// posts are always included. Also injects `var SERVER_POSTS` into
// blog.html so the live site can render the post catalog. Safe to run
// repeatedly (idempotent).
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
  return String(s).replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
}

const blogDir = path.join(ROOT, 'blog');
let htmlFiles = [];
if (fs.existsSync(blogDir)) {
  htmlFiles = fs.readdirSync(blogDir)
    .filter((f) => f.endsWith('.html'))
    .sort();
}

// ---- SERVER_POSTS helpers ----

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"');
}

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function readPostsJson() {
  const p = path.join(ROOT, 'blog', 'posts.json');
  try {
    const d = fs.readFileSync(p, 'utf8');
    return JSON.parse(d);
  } catch {
    return [];
  }
}

function upsertListingEntry(blogHtml, entry) {
  const re = /<script>var SERVER_POSTS = (\[.*?\]);?\s*\n?<\/script>/s;
  const m = blogHtml.match(re);
  if (!m) throw new Error('SERVER_POSTS block not found in blog.html');
  let arr;
  try { arr = JSON.parse(m[1]); } catch { throw new Error('Could not parse SERVER_POSTS JSON'); }
  const idx = arr.findIndex((p) => p && p.slug === entry.slug);
  if (idx >= 0) arr[idx] = { ...arr[idx], ...entry };
  else arr.unshift(entry);
  const replacement = '<script>var SERVER_POSTS = ' + JSON.stringify(arr) + ';\n</script>';
  return blogHtml.replace(re, () => replacement);
}

function removeListingEntry(blogHtml, slug) {
  const re = /<script>var SERVER_POSTS = (\[.*?\]);?\s*\n?<\/script>/s;
  const m = blogHtml.match(re);
  if (!m) throw new Error('SERVER_POSTS block not found in blog.html');
  const arr = JSON.parse(m[1]).filter((p) => p && p.slug !== slug);
  return blogHtml.replace(re, () => '<script>var SERVER_POSTS = ' + JSON.stringify(arr) + ';\n</script>');
}

// ---- Build ----

let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
for (const p of staticPages) {
  xml += `  <url><loc>${SITE_URL}${p.loc}</loc><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>\n`;
}

// Build SERVER_POSTS from posts.json + the existing baked listing in blog.html
// (the admin historically patched blog.html directly, so merge both and
// dedupe by slug — posts.json wins on conflict).
let posts = readPostsJson();

function readBakedListing() {
  try {
    const html = fs.readFileSync(path.join(ROOT, 'blog.html'), 'utf8');
    const m = html.match(/<script>var SERVER_POSTS = (\[.*?\]);?\s*\n?<\/script>/s);
    if (!m) return [];
    const arr = JSON.parse(m[1]);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

const bakedPosts = readBakedListing();

// Merge: posts.json takes priority, fill in from baked listing
const mergedPosts = [...posts];
for (const p of bakedPosts) {
  if (p && p.slug && !mergedPosts.some((q) => q && q.slug === p.slug)) {
    mergedPosts.push(p);
  }
}

// Self-heal: synthesize entries for article files on disk that are
// missing from the listing (e.g. committed by older admin versions).
function titleFromHtml(filePath) {
  try {
    const html = fs.readFileSync(filePath, 'utf8');
    const m = html.match(/<title>([^<]*)<\/title>/);
    if (!m) return null;
    return m[1].replace(/\s*—\s*Young Hadene\s*$/, '').trim() || null;
  } catch {
    return null;
  }
}
function descFromHtml(filePath) {
  try {
    const html = fs.readFileSync(filePath, 'utf8');
    const m = html.match(/<meta name="description" content="([^"]*)"/);
    return m ? m[1] : '';
  } catch {
    return '';
  }
}
for (const f of htmlFiles) {
  const slug = f.replace(/\.html$/, '');
  if (slug === 'index' || mergedPosts.some((q) => q && q.slug === slug)) continue;
  const full = path.join(blogDir, f);
  const title = titleFromHtml(full) || slug;
  let mtime = Date.now();
  try { mtime = fs.statSync(full).mtime.getTime(); } catch {}
  const dateStr = new Date(mtime).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  mergedPosts.push({
    id: mtime, title, slug, category: 'Music',
    content: descFromHtml(full), date: dateStr, dateNum: mtime, featured: false,
  });
}

// Build SERVER_POSTS block
let serverPostsBlock = '';
if (mergedPosts && mergedPosts.length > 0) {
  // Order by dateNum descending, same as the admin does
  const sorted = mergedPosts.sort((a, b) => (b.dateNum || 0) - (a.dateNum || 0));
  serverPostsBlock = '<script>var SERVER_POSTS = ' + JSON.stringify(sorted) + ';\n</script>\n';
}

// Inject SERVER_POSTS into blog.html
let blogHtml = '';
const blogHtmlPath = path.join(ROOT, 'blog.html');
try {
  blogHtml = fs.readFileSync(blogHtmlPath, 'utf8');
  // If SERVER_POSTS already exists, replace it; if not, inject after <meta name="viewport"
  const existingMatch = blogHtml.match(/<script>var SERVER_POSTS =/);
  if (existingMatch) {
    blogHtml = blogHtml.replace(/<script>var SERVER_POSTS =.*?<\/script>/s, () => serverPostsBlock);
  } else {
    // Find position after the closing > of the viewport meta tag
    const viewportMeta = blogHtml.indexOf('<meta name="viewport"');
    if (viewportMeta >= 0) {
      // Find the closing > after the viewport meta
      const viewportEnd = blogHtml.indexOf('>', viewportMeta) + 1;
      if (viewportEnd > viewportMeta) {
        blogHtml = blogHtml.slice(0, viewportEnd) + serverPostsBlock + blogHtml.slice(viewportEnd);
      }
    } else {
      // Fallback: inject before </head>
      const headClose = blogHtml.indexOf('</head>');
      if (headClose >= 0) {
        blogHtml = blogHtml.slice(0, headClose) + serverPostsBlock + blogHtml.slice(headClose);
      }
    }
  }
  // Write updated blog.html
  fs.writeFileSync(blogHtmlPath, blogHtml);
} catch (e) {
  console.error('Could not read/write blog.html:', e);
}

// Generate sitemap entries from merged posts + on-disk HTML files
for (const f of htmlFiles) {
  const full = path.join(blogDir, f);
  let lastmod = '';
  try {
    lastmod = fs.statSync(full).mtime.toISOString().substring(0, 10);
  } catch { /* ignore */ }
  const slug = f.replace('.html', '');
  // Only add if not already in sitemap (we'll add all merged posts below)
  xml += `  <url><loc>${SITE_URL}/blog/${esc(f)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>monthly</changefreq><priority>0.8</priority></url>\n`;
}

// Also add sitemap entries for all posts in posts.json (in case some were added via GitHub API without HTML files)
// Actually, sitemap should only include actual HTML files, so we skip posting.json-only entries

xml += '</urlset>\n';

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);

// Write merged posts.json back to disk (for future builds, though the repo copy is what matters)
const postsJsonPath = path.join(ROOT, 'blog', 'posts.json');
try {
  fs.writeFileSync(postsJsonPath, JSON.stringify(mergedPosts, null, 2));
} catch {}

console.log(`sitemap.xml regenerated: ${staticPages.length} pages + ${htmlFiles.length} posts`);
console.log(`SERVER_POSTS injected into blog.html: ${!!serverPostsBlock}`);
