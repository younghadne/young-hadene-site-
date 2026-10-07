#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const zlib = require('zlib');

// Load .env file if present (no dotenv dependency required)
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eq = trimmed.indexOf('=');
      if (eq > 0) {
        const key = trimmed.substring(0, eq).trim();
        let val = trimmed.substring(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
    });
  }
} catch {}

const PORT = process.env.PORT || 3456;
const SITE_URL = process.env.SITE_URL || 'https://younghadene.ca';
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const ANALYTICS_FILE = path.join(__dirname, 'analytics.json');
const STORAGE_KEY_FILE = path.join(__dirname, 'yh_blogPosts.json');
const LOG_DIR = path.join(__dirname, 'logs');

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const DEFAULTS = { enabled: false, time: '09:00', quantity: 1, lastRun: null, lastRunPosts: 0, lastRunStatus: null, nextRun: null, totalGenerated: 0 };

function load() { try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) }; } catch { return { ...DEFAULTS }; } }
function save(s) { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2)); }
function log(msg) { const ts = new Date().toISOString().replace('T', ' ').substring(0, 19); const line = `[${ts}] ${msg}`; console.log(line); fs.appendFileSync(path.join(LOG_DIR, 'server.log'), line + '\n'); }

function getBlogPosts() {
  try { return JSON.parse(fs.readFileSync(STORAGE_KEY_FILE, 'utf8')) || []; } catch { return []; }
}

function generatePosts(quantity) {
  const results = []; let success = 0, fail = 0;
  return (async function run() {
    for (let i = 0; i < quantity; i++) {
      try {
        const out = await new Promise((resolve, reject) => {
          const child = spawn('node', ['scripts/generate-post.js'], { cwd: __dirname, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] });
          let stdout = '', stderr = '';
          child.stdout.on('data', d => stdout += d);
          child.stderr.on('data', d => stderr += d);
          child.on('close', code => { if (code === 0) resolve(stdout); else reject(new Error(stderr || stdout)); });
        });
        results.push({ ok: true, output: out.split('\n').filter(Boolean).pop() }); success++;
      } catch (e) { results.push({ ok: false, error: e.message }); fail++; }
    }
    return { results, success, fail };
  })();
}

let schedulerTimer = null;
function parseTime(str) { const [h, m] = str.split(':').map(Number); return { h, m }; }
function calcNextRun(settings) { if (!settings.enabled) return null; const { h, m } = parseTime(settings.time); const now = new Date(); const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0); if (next <= now) next.setDate(next.getDate() + 1); return next.toISOString(); }
function tick() {
  const settings = load(); if (!settings.enabled) return;
  const now = new Date(); const { h, m } = parseTime(settings.time);
  if (now.getHours() === h && now.getMinutes() === m && settings.nextRun) {
    const nextTime = new Date(settings.nextRun).getTime();
    if (Math.abs(now.getTime() - nextTime) < 120000) {
      log(`⏰ Scheduled run triggered (${settings.quantity} post(s))`);
      generatePosts(settings.quantity).then(result => {
        const updated = load(); updated.lastRun = now.toISOString(); updated.lastRunPosts = result.success;
        updated.lastRunStatus = result.fail === 0 ? 'success' : result.fail > 0 && result.success > 0 ? 'partial' : 'failed';
        updated.totalGenerated = (updated.totalGenerated || 0) + result.success; updated.nextRun = calcNextRun(updated); save(updated);
        log(`✅ Scheduled run complete: ${result.success} ok, ${result.fail} failed`);
      }).catch(e => log(`❌ Scheduled run error: ${e.message}`));
    }
  }
}
function startScheduler() { if (schedulerTimer) clearInterval(schedulerTimer); schedulerTimer = setInterval(tick, 30000); log('⏰ Scheduler started'); }

// ── Gzip + Cache helper ──
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.xml': 'application/xml',
  '.txt': 'text/plain', '.woff2': 'font/woff2', '.pdf': 'application/pdf',
};

function send(res, code, body, contentType, extraHeaders) {
  const headers = { 'Content-Type': contentType, ...extraHeaders };
  const acceptEncoding = res.req ? res.req.headers['accept-encoding'] || '' : '';
  const buf = Buffer.from(body);
  if (acceptEncoding.includes('gzip') && buf.length > 1024) {
    zlib.gzip(buf, (err, zipped) => {
      if (err) { res.writeHead(code, headers); res.end(body); return; }
      res.writeHead(code, { ...headers, 'Content-Encoding': 'gzip', 'Vary': 'Accept-Encoding' });
      res.end(zipped);
    });
  } else {
    res.writeHead(code, headers);
    res.end(body);
  }
}

function sendJson(res, data, code) { send(res, code || 200, JSON.stringify(data), 'application/json'); }

// SEO data injection for blog posts
function injectSeoMeta(html, post, urlPath) {
  const title = post.title ? post.title + ' — Young Hadene' : 'Young Hadene | Haitian-Toronto Drill Artist';
  const desc = (post.content || '').replace(/[#*>\-\[\]()`]/g, '').trim().substring(0, 160) || 'Young Hadene is a Haitian-Toronto drill and dark trap artist.';
  const slug = post.slug || '';
  const canonical = SITE_URL + urlPath;
  const ogImage = post.ogImage || SITE_URL + '/images/poster1.png';
  const tags = (post.tags || '').split(',').map(t => t.trim()).filter(Boolean);
  const date = post.date || '';
  const schema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title || '',
    description: desc,
    image: ogImage,
    datePublished: date,
    author: { '@type': 'Person', 'name': 'Young Hadene', 'jobTitle': 'Recording Artist', 'url': SITE_URL + '/about.html', 'sameAs': ['https://www.instagram.com/YOUNGHADENE', 'https://www.youtube.com/channel/UCSJd-7T-_K3MCve3GY4k8mg', 'https://open.spotify.com/artist/4MYeewqn16CCiuIgmpIaGA'] },
    publisher: { '@type': 'Organization', 'name': 'Young Hadene', 'logo': { '@type': 'ImageObject', 'url': SITE_URL + '/images/poster1.png' } },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
  });

  let meta = '';
  meta += `<title>${escHtml(title)}</title>\n`;
  meta += `<meta name="description" content="${escHtml(desc)}">\n`;
  meta += `<link rel="canonical" href="${canonical}">\n`;
  meta += `<meta property="og:title" content="${escHtml(title)}">\n`;
  meta += `<meta property="og:description" content="${escHtml(desc)}">\n`;
  meta += `<meta property="og:image" content="${ogImage}">\n`;
  meta += `<meta property="og:url" content="${canonical}">\n`;
  meta += `<meta property="og:type" content="article">\n`;
  meta += `<meta name="twitter:card" content="summary_large_image">\n`;
  meta += `<meta name="twitter:title" content="${escHtml(title)}">\n`;
  meta += `<meta name="twitter:description" content="${escHtml(desc)}">\n`;
  meta += `<meta name="twitter:image" content="${ogImage}">\n`;
  if (date) { meta += `<meta property="article:published_time" content="${date}">\n`; }
  tags.forEach(t => { meta += `<meta property="article:tag" content="${escHtml(t)}">\n`; });
  meta += `<meta property="article:author" content="Young Hadene">\n`;
  meta += `<script type="application/ld+json">${schema}<\/script>\n`;
  meta += `<link rel="alternate" type="application/rss+xml" title="Young Hadene Blog RSS" href="${SITE_URL}/api/rss.xml">\n`;

  // Inject into <head>
  html = html.replace('</head>', meta + '\n</head>');
  return html;
}

function escHtml(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function slugify(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

// Renders post content with article formatting:
//   ## Heading  -> h2 with anchor (auto Table of Contents)
//   > quote     -> blockquote
//   - item      -> bullet list
//   [text](url) -> hyperlink, ![alt](url) -> image, bare URLs auto-link
//   YouTube link alone on a line -> embedded video
//   blank lines -> paragraph breaks
// Plus Key Takeaways box (takeaways, one per line) and FAQ section (faq lines as "Question? | Answer").
function ytId(url) {
  const m = (url || '').match(/(?:youtube\.com\/(?:watch\?[^ ]*v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}
function ytEmbed(id) {
  return '<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:8px;margin:16px 0;"><iframe src="https://www.youtube.com/embed/' + id + '" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" title="Embedded video"></iframe></div>';
}
function fmtInline(s) {
  s = escHtml(s);
  const holders = [];
  const hold = (html) => { holders.push(html); return ' ' + (holders.length - 1) + ' '; };
  s = s.replace(/!\[([^\]]*)\]\((https?:[^)\s]+)\)/g, (m, alt, src) => hold('<img src="' + src + '" alt="' + alt + '" loading="lazy" style="max-width:100%;border-radius:8px;margin:12px 0;">'));
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (m, txt, url) => hold('<a href="' + url + '" target="_blank" rel="noopener">' + txt + '</a>'));
  s = s.replace(/\*\*([^*]+)\*\*/g, (m, txt) => hold('<strong>' + txt + '</strong>'));
  s = s.replace(/\*([^*]+)\*/g, (m, txt) => hold('<em>' + txt + '</em>'));
  s = s.replace(/(https?:\/\/[^\s<]+)/g, (url) => {
    url = url.replace(/[.,;:!?)]+$/, '');
    const id = ytId(url);
    return hold(id ? ytEmbed(id) : '<a href="' + url + '" target="_blank" rel="noopener">' + url + '</a>');
  });
  holders.forEach((h, i) => { s = s.split(' ' + i + ' ').join(h); });
  return s;
}
function renderArticleBody(d) {
  const lines = (d.content || '').split('\n');
  let html = '', toc = [], listOpen = false, para = [];
  const flushPara = () => { if (para.length) { html += '<p>' + para.join('<br>') + '</p>'; para = []; } };
  const closeList = () => { if (listOpen) { html += '</ul>'; listOpen = false; } };
  lines.forEach(raw => {
    const line = raw.trim();
    if (line.startsWith('## ')) { flushPara(); closeList(); const h = line.substring(3).trim(); const id = 'sec-' + slugify(h); toc.push({ id, h }); html += '<h2 id="' + id + '">' + escHtml(h) + '</h2>'; }
    else if (line.startsWith('> ')) { flushPara(); closeList(); html += '<blockquote>' + fmtInline(line.substring(2).trim()) + '</blockquote>'; }
    else if (line.startsWith('- ')) { flushPara(); if (!listOpen) { html += '<ul>'; listOpen = true; } html += '<li>' + fmtInline(line.substring(2).trim()) + '</li>'; }
    else if (line === '') { flushPara(); closeList(); }
    else if (/^https?:\/\/\S+$/.test(line) && ytId(line)) { flushPara(); closeList(); html += ytEmbed(ytId(line)); }
    else { closeList(); para.push(fmtInline(raw.trim())); }
  });
  flushPara(); closeList();
  let out = '';
  const takes = (d.takeaways || '').split('\n').map(s => s.trim()).filter(Boolean);
  if (takes.length) { out += '<div class="takeaways"><h2>Key Takeaways</h2><ul>' + takes.map(x => '<li>' + fmtInline(x) + '</li>').join('') + '</ul></div>'; }
  if (toc.length > 1) { out += '<div class="toc"><h2>Table of Contents</h2><ul>' + toc.map(x => '<li><a href="#' + x.id + '">' + escHtml(x.h) + '</a></li>').join('') + '</ul></div>'; }
  out += html;
  const faqs = (d.faq || '').split('\n').map(s => s.trim()).filter(Boolean);
  if (faqs.length) {
    out += '<h2>Frequently Asked Questions</h2>';
    faqs.forEach(f => { const idx = f.indexOf('|'); const q = (idx >= 0 ? f.substring(0, idx) : f).trim(); const a = (idx >= 0 ? f.substring(idx + 1) : '').trim(); out += '<h3>' + escHtml(q) + '</h3><p>' + fmtInline(a) + '</p>'; });
  }
  return out;
}

// ── Server ──
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', SITE_URL);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const json = (data, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };

  // ── GET /api/sitemap.xml ──
  if (url.pathname === '/api/sitemap.xml' && req.method === 'GET') {
    const posts = getBlogPosts();
    const staticPages = ['/', '/music.html', '/blog.html', '/contact.html'];
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    staticPages.forEach(p => {
      const loc = SITE_URL + (p === '/index.html' ? '/' : p);
      xml += `  <url><loc>${loc}</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>\n`;
    });
    posts.forEach(p => {
      const slug = p.slug || '';
      if (slug) {
        xml += `  <url><loc>${SITE_URL}/blog/${escHtml(slug)}.html</loc><lastmod>${p.date || ''}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>\n`;
      }
    });
    xml += '</urlset>';
    return send(res, 200, xml, 'application/xml', { 'X-Robots-Tag': 'index,follow' });
  }

  // ── GET /api/rss.xml ──
  if (url.pathname === '/api/rss.xml' && req.method === 'GET') {
    const posts = getBlogPosts().sort((a, b) => b.dateNum - a.dateNum).slice(0, 20);
    const pubDate = posts.length > 0 ? new Date(posts[0].dateNum).toUTCString() : new Date().toUTCString();
    let rss = '<?xml version="1.0" encoding="UTF-8"?>\n';
    rss += '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">\n';
    rss += '<channel>\n';
    rss += `<title>Young Hadene Blog</title>\n`;
    rss += `<link>${SITE_URL}</link>\n`;
    rss += `<description>Young Hadene — Haitian-Toronto Drill & Dark Trap Artist — Blog, Music News, and Toronto Culture</description>\n`;
    rss += `<language>en-ca</language>\n`;
    rss += `<lastBuildDate>${pubDate}</lastBuildDate>\n`;
    rss += `<atom:link href="${SITE_URL}/api/rss.xml" rel="self" type="application/rss+xml"/>\n`;
    rss += `<image><url>${SITE_URL}/images/poster1.png</url><title>Young Hadene</title><link>${SITE_URL}</link></image>\n`;
    posts.forEach(p => {
      const slug = p.slug || '';
      const desc = (p.content || '').replace(/[#*>\-\[\]()`]/g, '').trim().substring(0, 300);
      rss += `  <item>\n`;
      rss += `    <title>${escHtml(p.title)}</title>\n`;
      rss += `    <link>${SITE_URL}/blog/${escHtml(slug)}.html</link>\n`;
      rss += `    <guid isPermaLink="true">${SITE_URL}/blog/${escHtml(slug)}.html</guid>\n`;
      rss += `    <description>${escHtml(desc)}</description>\n`;
      rss += `    <content:encoded><![CDATA[${p.content || ''}]]></content:encoded>\n`;
      if (p.date) rss += `    <pubDate>${new Date(p.date).toUTCString()}</pubDate>\n`;
      if (p.category) rss += `    <category>${escHtml(p.category)}</category>\n`;
      rss += `  </item>\n`;
    });
    rss += '</channel>\n</rss>';
    return send(res, 200, rss, 'application/rss+xml', { 'X-Robots-Tag': 'index,follow' });
  }

  // ── GET /robots.txt ──
  if (url.pathname === '/robots.txt' && req.method === 'GET') {
    const robots = `User-agent: *\nAllow: /\nDisallow: /admin.html\nDisallow: /api/\n\nSitemap: ${SITE_URL}/api/sitemap.xml\n`;
    return send(res, 200, robots, 'text/plain');
  }

  // ── API endpoints ──
  if (url.pathname === '/api/settings' && req.method === 'GET') { const s = load(); s.nextRun = calcNextRun(s); return json(s); }
  if (url.pathname === '/api/settings' && req.method === 'POST') {
    let body = ''; req.on('data', c => { body += c; if (body.length > 1048576) { res.writeHead(413); res.end('Payload too large'); req.destroy(); } });
    req.on('end', () => { try { const data = JSON.parse(body); const current = load(); const updated = { ...current, ...data }; updated.nextRun = calcNextRun(updated); save(updated); log(`⚙️ Settings updated`); startScheduler(); return json(updated); } catch (e) { return json({ error: e.message }, 400); } });
    return;
  }
  if (url.pathname === '/api/generate' && req.method === 'POST') {
    const q = Math.min(Math.max(parseInt(url.searchParams.get('q') || '1', 10) || 1, 1), 20);
    log(`🚀 Manual generate: ${q} post(s)`);
    generatePosts(q).then(result => { const updated = load(); updated.lastRun = new Date().toISOString(); updated.lastRunPosts = result.success; updated.lastRunStatus = result.fail === 0 ? 'success' : 'partial'; updated.totalGenerated = (updated.totalGenerated || 0) + result.success; updated.nextRun = calcNextRun(updated); save(updated); return json({ success: true, count: result.success, fails: result.fail }); }).catch(e => json({ error: e.message }, 500));
    return;
  }

  // ── POST /api/auth — admin login ──
  if (url.pathname === '/api/auth' && req.method === 'POST') {
    let body = ''; req.on('data', c => { body += c; if (body.length > 1048576) { res.writeHead(413); res.end('Payload too large'); req.destroy(); } });
    req.on('end', () => {
      try {
        const { password } = JSON.parse(body);
        const adminPassword = process.env.ADMIN_PASSWORD;
        if (!adminPassword) { return json({ error: 'Admin password not configured' }, 500); }
        if (password === adminPassword) { return json({ ok: true }); }
        return json({ error: 'Invalid password' }, 401);
      } catch (e) { return json({ error: e.message }, 400); }
    });
    return;
  }

  // ── POST /api/posts — save a blog post ──
  if (url.pathname === '/api/posts' && req.method === 'POST') {
    let body = ''; req.on('data', c => { body += c; if (body.length > 1048576) { res.writeHead(413); res.end('Payload too large'); req.destroy(); } });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (!data.slug) data.slug = (data.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        let posts = getBlogPosts();
        const existing = posts.findIndex(p => p.slug === data.slug);
        if (existing >= 0) { posts[existing] = { ...posts[existing], ...data }; }
        else { data.id = Date.now(); data.dateNum = Date.now(); posts.push(data); }
        fs.writeFileSync(STORAGE_KEY_FILE, JSON.stringify(posts, null, 2));
        // Generate static HTML file
        const blogDir = path.join(__dirname, 'blog');
        if (!fs.existsSync(blogDir)) fs.mkdirSync(blogDir, { recursive: true });
        const tmpl = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${escHtml(data.title)} — Young Hadene</title><meta name="description" content="${escHtml((data.excerpt || data.content || '').substring(0, 160))}"><link rel="canonical" href="${SITE_URL}/blog/${escHtml(data.slug)}"><meta property="og:title" content="${escHtml(data.title)}"><meta property="og:description" content="${escHtml((data.excerpt || data.content || '').substring(0, 160))}"><meta property="og:image" content="${SITE_URL}/images/poster1.png"><meta property="og:url" content="${SITE_URL}/blog/${escHtml(data.slug)}"><meta property="og:type" content="article"><meta name="twitter:card" content="summary_large_image"><link rel="stylesheet" href="/css/style.css"><link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='28' font-size='28'>🎤</text></svg>"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"${escHtml(data.title)}","description":"${escHtml((data.excerpt || data.content || '').substring(0, 160))}","author":{"@type":"Person","name":"Young Hadene","jobTitle":"Recording Artist","url":"${SITE_URL}/about.html","sameAs":["https://www.instagram.com/YOUNGHADENE","https://www.youtube.com/channel/UCSJd-7T-_K3MCve3GY4k8mg","https://open.spotify.com/artist/4MYeewqn16CCiuIgmpIaGA"]},"datePublished":"${data.date || new Date().toISOString().split('T')[0]}","image":"${SITE_URL}/images/poster1.png"}</script>  <style>
    .article-wrap { max-width: 720px; margin: 0 auto; padding: 40px 0; }
    .article-wrap h1 { font-size: clamp(2.2rem, 5vw, 3.2rem); margin-bottom: 16px; line-height: 1.05; }
    .article-wrap .meta { color: var(--text-muted); font-size: 0.8rem; margin-bottom: 32px; text-transform: uppercase; letter-spacing: 0.08em; }
    .article-wrap .meta span { color: var(--accent); }
    .article-wrap h2 { font-size: 1.6rem; margin-top: 48px; margin-bottom: 16px; font-family: var(--font-heading); letter-spacing: 0.04em; }
    .article-wrap h3 { font-size: 1.15rem; margin-top: 28px; margin-bottom: 10px; font-family: var(--font-heading); letter-spacing: 0.03em; color: var(--accent); }
    .article-wrap p { color: var(--text-secondary); line-height: 1.8; margin-bottom: 18px; font-size: 0.95rem; }
    .article-wrap p strong { color: var(--text-primary); }
    .article-wrap ul, .article-wrap ol { color: var(--text-secondary); line-height: 1.8; margin-bottom: 18px; padding-left: 24px; font-size: 0.95rem; }
    .article-wrap li { margin-bottom: 8px; }
    .article-wrap .takeaways { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius); padding: 28px 32px; margin-bottom: 32px; }
    .article-wrap .takeaways h2 { margin-top: 0; font-size: 1.3rem; }
    .article-wrap .takeaways li { list-style: none; padding-left: 24px; position: relative; }
    .article-wrap .takeaways li::before { content: '✓'; position: absolute; left: 0; color: var(--accent); font-weight: 700; }
    .article-wrap .toc { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius); padding: 24px 28px; margin-bottom: 32px; }
    .article-wrap .toc h2 { margin-top: 0; font-size: 1.1rem; }
    .article-wrap .toc a { color: var(--text-secondary); display: block; padding: 6px 0; font-size: 0.85rem; transition: color var(--transition); }
    .article-wrap .toc a:hover { color: var(--accent); }
    .article-wrap .toc ul { list-style: none; padding: 0; margin: 0; }
    .article-wrap .toc ul ul { padding-left: 20px; }
    .article-wrap blockquote { border-left: 3px solid var(--accent); padding: 16px 20px; margin: 24px 0; background: var(--bg-card); border-radius: 0 var(--radius-sm) var(--radius-sm) 0; color: var(--text-secondary); font-style: italic; }
    .article-wrap .highlight-box { background: rgba(220,38,38,0.05); border: 1px solid rgba(220,38,38,0.15); border-radius: var(--radius); padding: 24px; margin: 24px 0; }
    .article-wrap .highlight-box p { margin-bottom: 0; }
    .article-wrap .cta-box { text-align: center; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius); padding: 32px; margin: 40px 0; }
    .article-wrap .cta-box h3 { margin-top: 0; color: var(--text-primary); }
    .article-wrap .cta-box p { margin-bottom: 20px; }
    .back-link { display: inline-flex; align-items: center; gap: 8px; color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 32px; transition: color var(--transition); }
    .back-link:hover { color: var(--accent); }
    .artist-card { display: flex; gap: 20px; align-items: flex-start; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius); padding: 24px; margin: 20px 0; }
    .artist-card .num { font-family: var(--font-heading); font-size: 2rem; color: var(--accent); line-height: 1; flex-shrink: 0; width: 40px; }
    .artist-card .info { flex: 1; }
    .artist-card .info h4 { font-family: var(--font-heading); font-size: 1.2rem; margin-bottom: 4px; }
    .artist-card .info .tag { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; display: block; }
    .artist-card .info p { font-size: 0.85rem; margin-bottom: 0; color: var(--text-secondary); }
    .artist-card.featured { border-color: rgba(220,38,38,0.3); background: rgba(220,38,38,0.05); }
    .artist-card.featured .num { color: #fff; }
    @media (max-width: 600px) { .artist-card { flex-direction: column; gap: 12px; } .article-wrap { padding: 24px 0; } }
  </style></head><body><header class="header"><div class="header-inner"><a href="/" class="logo">YOUNG<span class="logo-accent">HADENE</span><span class="logo-sub">Toronto • Dark Trap</span></a><button class="hamburger" aria-label="Menu"><span></span><span></span><span></span></button><nav><ul class="nav-list"><li><a href="/" class="nav-link">Home</a></li><li><a href="/music.html" class="nav-link">Music</a></li><li><a href="/blog.html" class="nav-link active">Blog</a></li><li><a href="/contact.html" class="nav-link">Contact</a></li></ul></nav></div></header><section class="<section class="section" style="padding-top:120px;"><div class="container"><a href="/blog.html" class="back-link">&#8592; Back to Blog</a><div class="article-wrap"><div class="meta">${data.date} &middot; <span>${escHtml(data.category)}</span> &middot; By <a href="/about.html" rel="author" style="color:var(--accent)">Young Hadene</a></div><h1>${escHtml(data.title)}</h1><div>${renderArticleBody(data)}</div></div></section><footer class="footer"><div class="container"><div class="footer-bottom"><p>&copy; ${new Date().getFullYear()} Young Hadene. All rights reserved. Toronto. 6ix.</p></div></div></footer><script src="/js/main.js"></script></body></html>`;
        fs.writeFileSync(path.join(blogDir, data.slug + '.html'), tmpl);
        log(`📝 Saved post: "${data.title}" (${data.slug})`);
        return json({ ok: true, slug: data.slug });
      } catch (e) { return json({ error: e.message }, 400); }
    });
    return;
  }

  // ── Analytics ──
  function loadAnalytics() { try { return JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf8')); } catch { return { hits: [], pages: {}, referrers: {}, daily: {}, devices: {}, totalViews: 0, uniqueIps: [] }; } }
  function saveAnalytics(a) { fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(a, null, 2)); }

  if (url.pathname === '/api/track' && req.method === 'POST') {
    let body = ''; req.on('data', c => { body += c; if (body.length > 1048576) { res.writeHead(413); res.end('Payload too large'); req.destroy(); } });
    req.on('end', () => {
      try {
        const data = JSON.parse(body); const ip = req.socket.remoteAddress || req.headers['x-forwarded-for'] || 'unknown'; const ts = Date.now();
        const hit = { ts, path: data.path || '/', referrer: data.referrer || '', ua: data.ua || '', ip, pageTitle: data.pageTitle || '' };
        const a = loadAnalytics(); a.hits.push(hit); a.totalViews = (a.totalViews || 0) + 1;
        const page = hit.path; a.pages[page] = (a.pages[page] || 0) + 1;
        if (hit.referrer) {
          const refKey = hit.referrer.includes('google') ? 'Google' : hit.referrer.includes('facebook') || hit.referrer.includes('instagram') ? 'Social Media' : hit.referrer.includes('twitter') || hit.referrer.includes('x.com') ? 'Social Media' : hit.referrer.includes('youtube') ? 'Social Media' : hit.referrer.includes('localhost') || hit.referrer.includes('younghadene') ? 'Direct' : 'Referral';
          a.referrers[refKey] = (a.referrers[refKey] || 0) + 1;
        } else { a.referrers['Direct'] = (a.referrers['Direct'] || 0) + 1; }
        const day = new Date(ts).toISOString().substring(0, 10); a.daily[day] = (a.daily[day] || 0) + 1;
        const ua = (hit.ua || '').toLowerCase(); let device = 'Desktop';
        if (ua.includes('mobile') || ua.includes('iphone') || ua.includes('android')) device = 'Mobile';
        else if (ua.includes('tablet') || ua.includes('ipad')) device = 'Tablet';
        a.devices[device] = (a.devices[device] || 0) + 1;
        if (!a.uniqueIps.includes(ip)) { a.uniqueIps.push(ip); if (a.uniqueIps.length > 500) a.uniqueIps.shift(); }
        if (a.hits.length > 10000) a.hits = a.hits.slice(-10000);
        saveAnalytics(a); return json({ ok: true });
      } catch (e) { return json({ error: e.message }, 400); }
    });
    return;
  }

  if (url.pathname === '/api/analytics' && req.method === 'GET') {
    const a = loadAnalytics();
    const topPages = Object.entries(a.pages || {}).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([path, count]) => ({ path, count }));
    const topReferrers = Object.entries(a.referrers || {}).sort((a, b) => b[1] - a[1]).map(([source, count]) => ({ source, count }));
    const totalRef = topReferrers.reduce((s, r) => s + r.count, 0);
    const now = new Date(); const last30 = [];
    for (let i = 29; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); const key = d.toISOString().substring(0, 10); last30.push({ date: key, count: a.daily[key] || 0 }); }
    const monthAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;
    const monthHits = a.hits.filter(h => h.ts > monthAgo);
    const monthUnique = new Set(monthHits.map(h => h.ip)).size;
    const ipPageMap = {}; a.hits.forEach(h => { if (!ipPageMap[h.ip]) ipPageMap[h.ip] = new Set(); ipPageMap[h.ip].add(h.path); });
    const singlePageVisits = Object.values(ipPageMap).filter(s => s.size <= 1).length;
    const totalVisits = Object.keys(ipPageMap).length || 1;
    const deviceTotal = Object.values(a.devices || {}).reduce((s, c) => s + c, 0) || 1;
    const recent = a.hits.slice(-20).reverse().map(h => ({ path: h.path, time: h.ts, pageTitle: h.pageTitle || '', referrer: h.referrer || '' }));
    return json({ totalViews: a.totalViews || 0, uniqueVisitors: a.uniqueIps.length, monthViews: monthHits.length, monthUnique, bounceRate: parseFloat(((singlePageVisits / totalVisits) * 100).toFixed(1)), topPages, topReferrers, totalRef, daily: last30, devices: a.devices || {}, deviceTotal, recent, lastUpdated: new Date().toISOString() });
  }

  if (url.pathname === '/api/status' && req.method === 'GET') {
    return json({ ok: true, uptime: process.uptime(), pid: process.pid, postCount: getBlogPosts().length });
  }

  // ── DELETE /api/posts/:slug — delete a blog post ──
  const deleteMatch = url.pathname.match(/^\/api\/posts\/(.+)$/);
  if (deleteMatch && req.method === 'DELETE') {
    const slug = deleteMatch[1];
    let posts = getBlogPosts();
    posts = posts.filter(p => p.slug !== slug);
    fs.writeFileSync(STORAGE_KEY_FILE, JSON.stringify(posts, null, 2));
    const staticFile = path.join(__dirname, 'blog', slug + '.html');
    if (fs.existsSync(staticFile)) fs.unlinkSync(staticFile);
    log(`🗑️ Deleted post: ${slug}`);
    return json({ ok: true });
  }

  // ── Cloudflare API Proxy ──
  if (url.pathname === '/api/cf-proxy' && req.method === 'POST') {
    let body = ''; req.on('data', c => { body += c; if (body.length > 1048576) { res.writeHead(413); res.end('Payload too large'); req.destroy(); } });
    req.on('end', () => {
      try {
        const { method, path, headers: reqHeaders, data } = JSON.parse(body);
        const cfUrl = 'https://api.cloudflare.com/client/v4' + path;
        const reqBody = data ? JSON.stringify(data) : undefined;
        const options = {
          method: method || 'GET',
          headers: {
            'Authorization': reqHeaders?.Authorization || '',
            'Content-Type': 'application/json',
          },
        };
        if (reqBody) options.body = reqBody;
        fetch(cfUrl, options)
          .then(r => r.text().then(text => ({ status: r.status, text })))
          .then(({ status, text }) => {
            try { return json(JSON.parse(text), status); } catch { return send(res, status, text, 'application/json'); }
          })
          .catch(e => json({ error: e.message }, 500));
      } catch (e) { return json({ error: e.message }, 400); }
    });
    return;
  }

  // ── AI Chat Proxy (uses opencode.json API key) ──
  if (url.pathname === '/api/ai-chat' && (req.method === 'POST' || req.method === 'OPTIONS')) {
    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
    let body = ''; req.on('data', c => { body += c; if (body.length > 1048576) { res.writeHead(413); res.end('Payload too large'); req.destroy(); } });
    req.on('end', () => {
      try {
        let key;
        try {
          const opencodeCfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'opencode.json'), 'utf8'));
          key = opencodeCfg.provider?.deepseek?.options?.apiKey || process.env.DEEPSEEK_API_KEY;
        } catch (e) {
          key = process.env.DEEPSEEK_API_KEY;
        }
        if (!key) { return json({ error: 'No API key found. Check opencode.json or set DEEPSEEK_API_KEY env.' }, 500); }
        const data = JSON.parse(body);
        if (!data.messages || !data.messages.length) { return json({ error: 'messages required' }, 400); }
        fetch('https://opencode.ai/zen/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + key,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'deepseek-v4-flash-free',
            messages: data.messages,
            temperature: data.temperature ?? 0.7,
            max_tokens: data.max_tokens ?? 3000,
          }),
        })
          .then(r => r.text().then(text => ({ status: r.status, text })))
          .then(({ status, text }) => {
            if (!text || !text.trim()) { return json({ error: 'AI returned empty response. Try again.' }, 502); }
            try {
              const parsed = JSON.parse(text);
              if (parsed.error) { return json(parsed, status); }
              if (parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
                const msg = parsed.choices[0].message;
                if (!msg.content) msg.content = msg.reasoning_content || msg.reasoning || '';
                // Strip reasoning prefixes from content
                msg.content = msg.content.replace(/^(Thinking\..*?\n)/, '').replace(/^(The user says?:.*?\n)/i, '').replace(/^(First,.*?\n)/i, '').replace(/^(We need to.*?\n)/i, '').trim();
              }
              return json(parsed, status);
            } catch { return json({ error: 'Invalid JSON from AI', raw: text.substring(0, 200) }, 502); }
          })
          .catch(e => json({ error: 'AI API call failed: ' + e.message }, 500));
      } catch (e) { return json({ error: 'Request error: ' + e.message }, 400); }
    });
    return;
  }

  // ── Blog post pages (SEO-injected) ──
  const blogMatch = url.pathname.match(/^\/blog\/(.+)\.html$/) || (url.pathname !== '/blog' && url.pathname !== '/blog.html' && url.pathname.match(/^\/blog\/(.+)$/));
  if (blogMatch) {
    const slug = blogMatch[1];
    const staticFile = path.join(__dirname, 'blog', slug + '.html');
    if (fs.existsSync(staticFile)) {
      const html = fs.readFileSync(staticFile, 'utf8');
      return send(res, 200, html, 'text/html', { 'X-Robots-Tag': 'index,follow' });
    }
    const posts = getBlogPosts();
    const post = posts.find(p => p.slug === slug);
    if (!post) { res.writeHead(404, { 'Content-Type': 'text/html' }); return res.end('<!DOCTYPE html><html><head><title>Post Not Found</title><meta name="robots" content="noindex"></head><body><h1>Not Found</h1></body></html>'); }

    const date = post.date || '';
    const content = (post.content || '').replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
    const pageHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="robots" content="index,follow">
  <link rel="stylesheet" href="/css/style.css">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='28' font-size='28'>🎧</text></svg>">
</head>
<body>
  <header class="header"><div class="header-inner"><a href="/" class="logo">YOUNG<span class="logo-accent">HADENE</span><span class="logo-sub">Toronto • Dark Trap</span></a>
    <button class="hamburger" aria-label="Menu"><span></span><span></span><span></span></button>
    <nav><ul class="nav-list"><li><a href="/" class="nav-link">Home</a></li><li><a href="/music.html" class="nav-link">Music</a></li><li><a href="/blog.html" class="nav-link active">Blog</a></li><li><a href="/contact.html" class="nav-link">Contact</a></li></ul></nav></div></header>
  <section class="section" style="padding-top:120px;"><div class="container"><a href="/blog.html" class="back-link" style="display:inline-flex;align-items:center;gap:8px;color:var(--text-muted);font-size:0.8rem;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:32px;">&#8592; Back to Blog</a><div class="article-wrap" style="max-width:720px;margin:0 auto;padding:40px 0;"><div class="meta" style="color:var(--text-muted);font-size:0.8rem;margin-bottom:32px;text-transform:uppercase;letter-spacing:0.08em;">${date} &middot; ${escHtml(post.category || 'Blog')} &middot; By <a href="/about.html" rel="author" style="color:var(--accent)">Young Hadene</a></div><h1 style="font-size:clamp(2.2rem,5vw,3.2rem);margin-bottom:16px;line-height:1.05;">${escHtml(post.title)}</h1><div style="color:var(--text-secondary);line-height:1.8;font-size:0.95rem;">${renderArticleBody(post)}</div>
  
    
  </div></div></section>
  <footer class="footer"><div class="container"><div class="footer-bottom"><p>&copy; ${new Date().getFullYear()} Young Hadene. All rights reserved. Toronto. 6ix.</p></div></div></footer>
  <script src="/js/main.js"></script>
  <script>(function(){var d={path:location.pathname,referrer:document.referrer||'',ua:navigator.userAgent,pageTitle:document.title};if(navigator.sendBeacon){navigator.sendBeacon('/api/track',JSON.stringify(d))}else{var x=new XMLHttpRequest();x.open('POST','/api/track',true);x.setRequestHeader('Content-Type','application/json');x.send(JSON.stringify(d))}})();</script>
</body></html>`;

    return send(res, 200, injectSeoMeta(pageHtml, post, url.pathname), 'text/html', { 'X-Robots-Tag': 'index,follow', 'Link': `<${SITE_URL}/api/sitemap.xml>; rel="alternate"; type="application/xml"` });
  }

  // ── Canonical blog URL: /blog.html and /blog/ permanently redirect to /blog ──
  if ((url.pathname === '/blog.html' || url.pathname === '/blog/') && req.method === 'GET') {
    res.writeHead(301, { 'Location': '/blog' });
    res.end();
    return;
  }

  // ── Clean URL support (like Cloudflare Pages auto-redirect) ──
  const cleanPages = { '/blog': '/blog.html', '/blog/index.html': '/blog.html', '/admin': '/admin.html', '/contact': '/contact.html', '/music': '/music.html', '/about': '/about.html', '/services': '/services.html', '/privacy': '/privacy.html', '/terms': '/terms.html' };
  if (cleanPages[url.pathname]) {
    url.pathname = cleanPages[url.pathname];
  }

  // ── Static files with SEO injection for main pages ──
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  filePath = path.join(__dirname, filePath);
  const ext = path.extname(filePath);

  if (ext === '.html' && !url.pathname.includes('admin.html')) {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/html' }); return res.end('Not found');
    }
    try {
      let html = fs.readFileSync(filePath, 'utf8');
      // Inject blog posts data into blog listing page
      if (url.pathname === '/blog.html' || url.pathname === '/blog/') {
        const posts = getBlogPosts();
        if (posts.length > 0) {
          const postsJson = JSON.stringify(posts);
          html = html.replace('</head>', '<script>var SERVER_POSTS = ' + postsJson + ';\n</script>\n</head>');
        }
      }
      // Add RSS alternate link + additional meta to all HTML pages
      const rssLink = `<link rel="alternate" type="application/rss+xml" title="Young Hadene Blog RSS" href="${SITE_URL}/api/rss.xml">\n`;
      const webSiteSchema = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Young Hadene","url":"${SITE_URL}","potentialAction":{"@type":"SearchAction","target":{"@type":"EntryPoint","urlTemplate":"${SITE_URL}/blog.html?search={search_term_string}"},"query-input":"required name=search_term_string"}}</script>\n`;
      const breadcrumbSchema = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"${SITE_URL}/"},{"@type":"ListItem","position":2,"name":"${url.pathname === '/' ? 'Home' : url.pathname.replace(/\.html$/,'').replace(/^\//,'')}","item":"${SITE_URL}${url.pathname}"}]}</script>\n`;
      html = html.replace('</head>', rssLink + webSiteSchema + breadcrumbSchema + '\n</head>');

      const cacheMaxAge = url.pathname.includes('.html') ? 600 : 86400;
      const h = { 'Cache-Control': `public, max-age=${cacheMaxAge}`, 'X-Robots-Tag': 'index,follow', 'Link': `<${SITE_URL}/api/sitemap.xml>; rel="alternate"; type="application/xml"` };
      return send(res, 200, html, MIME[ext] || 'text/html', h);
    } catch (e) {
      res.writeHead(500); return res.end('Server error');
    }
  }

  // ── Static assets (non-HTML) with caching ──
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const notFound = fs.existsSync(path.join(__dirname, '404.html')) ? fs.readFileSync(path.join(__dirname, '404.html'), 'utf8') : '<!DOCTYPE html><html><head><title>Not Found</title></head><body><h1>Not Found</h1></body></html>';
    // Serve SPA fallback for blog/ paths
    if (url.pathname.startsWith('/blog/')) {
      return send(res, 404, notFound, 'text/html');
    }
    return send(res, 404, notFound, 'text/html');
  }

  const cacheMaxAge = ext === '.html' ? 600 : ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp' || ext === '.svg' || ext === '.ico' ? 86400 : 3600;
  const h = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': `public, max-age=${cacheMaxAge}` };
  if (ext === '.html') h['X-Robots-Tag'] = 'index,follow';

  try {
    const buf = fs.readFileSync(filePath);
    const acceptEncoding = req.headers['accept-encoding'] || '';
    if (acceptEncoding.includes('gzip') && buf.length > 1024 && ext !== '.png' && ext !== '.jpg' && ext !== '.jpeg' && ext !== '.gif' && ext !== '.webp' && ext !== '.ico' && ext !== '.woff2') {
      zlib.gzip(buf, (err, zipped) => {
        if (err) { res.writeHead(200, h); res.end(buf); return; }
        res.writeHead(200, { ...h, 'Content-Encoding': 'gzip', 'Vary': 'Accept-Encoding' });
        res.end(zipped);
      });
    } else {
      res.writeHead(200, h);
      res.end(buf);
    }
  } catch { res.writeHead(500); res.end('Error'); }
});

server.listen(PORT, () => {
  log(`🎤 Young Hadene Server running on http://localhost:${PORT}`);
  log(`📄 Sitemap: ${SITE_URL}/api/sitemap.xml`);
  log(`📡 RSS: ${SITE_URL}/api/rss.xml`);
  log(`🤖 Robots: ${SITE_URL}/robots.txt`);
  const s = load();
  log(s.enabled ? `⏰ Next scheduled run: ${calcNextRun(s)}` : '⏸️ Scheduled generation disabled');
  startScheduler();
});
