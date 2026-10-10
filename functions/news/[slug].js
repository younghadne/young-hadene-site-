// GET /news/:slug — serve the article instantly from KV (no rebuild wait).
// Visibility: published + past-due scheduled only (drafts/future 404).
// Slug changes redirect (301) so existing links keep working.
// Tombstoned (deleted) slugs serve the site 404 so deletions take effect
// immediately even while older static builds still contain the file.
// Otherwise serves the KV copy, falling back to the deployed static file
// (pre-KV legacy posts), then the site 404.
//
// Allows both /news/<slug> and /news/<slug>.html
const SITE_URL = 'https://younghadene.ca';

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function ytId(url) {
  const m = String(url || '').match(/(?:youtube\.com\/(?:watch\?[^ ]*v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}

function ytEmbed(id) {
  return '<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:8px;margin:16px 0;"><iframe src="https://www.youtube.com/embed/' + id + '" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" title="Embedded video"></iframe></div>';
}

function fmtInline(s) {
  s = escHtml(s);
  const holders = [];
  const hold = (h) => { holders.push(h); return ' ' + (holders.length - 1) + ' '; };
  s = s.replace(/!\[([^\]]*)\]\((https?:[^)\s]+)\)/g, (m, alt, src) => hold('<img src="' + src + '" alt="' + alt + '" loading="lazy" style="max-width:100%;border-radius:8px;margin:12px 0;">'));
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (m, txt, url) => hold('<a href="' + url + '" target="_blank" rel="noopener">' + txt + '</a>'));
  s = s.replace(/\*\*([^*]+)\*\*/g, (m, txt) => hold('<strong>' + txt + '</strong>'));
  s = s.replace(/\*([^*]+)\*/g, (m, txt) => hold('<em>' + txt + '</em>'));
  s = s.replace(/(https?:\/\/[^\s<]+)/g, (url) => {
    url = url.replace(/[.,;:!?)]+$/, '');
    const id = ytId(url);
    return hold(id ? ytEmbed(id) : '<a href="' + url + '" target="_blank" rel="noopener">' + url + '</a>');
  });
  holders.forEach((h, i) => { s = s.split(' ' + i + ' ').join(h); });
  return s;
}

function renderArticleBody(d) {
  const lines = String(d.content || '').split('\n');
  let html = '', toc = [], listOpen = false, para = [];
  const flushPara = () => { if (para.length) { html += '<p>' + para.join('<br>') + '</p>'; para = []; } };
  const closeList = () => { if (listOpen) { html += '</ul>'; listOpen = false; } };
  lines.forEach((raw) => {
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
  const takes = String(d.takeaways || '').split('\n').map((s) => s.trim()).filter(Boolean);
  if (takes.length) { out += '<div class="takeaways"><h2>Key Takeaways</h2><ul>' + takes.map((x) => '<li>' + fmtInline(x) + '</li>').join('') + '</ul></div>'; }
  if (toc.length > 1) { out += '<div class="toc"><h2>Table of Contents</h2><ul>' + toc.map((x) => '<li><a href="#' + x.id + '">' + escHtml(x.h) + '</a></li>').join('') + '</ul></div>'; }
  out += html;
  const faqs = String(d.faq || '').split('\n').map((s) => s.trim()).filter(Boolean);
  if (faqs.length) {
    out += '<h2>Frequently Asked Questions</h2>';
    faqs.forEach((f) => { const idx = f.indexOf('|'); const q = (idx >= 0 ? f.substring(0, idx) : f).trim(); const a = (idx >= 0 ? f.substring(idx + 1) : '').trim(); out += '<h3>' + escHtml(q) + '</h3><p>' + fmtInline(a) + '</p>'; });
  }
  return out;
}

function isVisible(doc, now) {
  if (!doc) return false;
  if (doc.status === 'published') return true;
  if (doc.status === 'scheduled' && doc.scheduledFor && Number(doc.scheduledFor) <= now) return true;
  return false;
}

function relatedOf(doc, index) {
  try {
    const tags = String(doc.tags || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    const scored = [];
    for (const x of index) {
      if (!x || x.slug === doc.slug || !isVisible(x, Date.now())) continue;
      let score = 0;
      if (x.category && x.category === doc.category) score += 1;
      const xt = String(x.tags || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
      for (const t of tags) if (xt.includes(t)) score += 2;
      if (score > 0) scored.push({ x, score });
    }
    scored.sort((a, b) => (b.score - a.score) || ((b.x.dateNum || 0) - (a.x.dateNum || 0)));
    return scored.slice(0, 3).map((s) => s.x);
  } catch {
    return [];
  }
}

function buildNewsHtml(d, related) {
  const iso = new Date(d.dateNum || Date.now()).toISOString();
  const desc = escHtml(String(d.seoDesc || d.excerpt || d.content || d.title || '').replace(/[#*>\-\[\]()`]/g, '').trim().substring(0, 160) || d.title);
  const pageTitle = d.seoTitle || d.title;
  const ogTitle = d.ogTitle || d.title;
  const ogDesc = d.ogDesc || desc;
  const ogImage = d.ogImage || (SITE_URL + '/images/poster1.png');
  const canon = d.canonical || (SITE_URL + '/news/' + d.slug + '.html');
  const author = d.author || 'Young Hadene';
  const schema = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'NewsArticle',
    headline: d.title || '', description: desc, image: d.image || (SITE_URL + '/images/poster1.png'),
    datePublished: iso, dateModified: iso,
    author: { '@type': 'Person', name: author, jobTitle: 'Editor', url: SITE_URL + '/about.html' },
    publisher: { '@type': 'NewsMediaOrganization', name: 'Young Hadene News', logo: { '@type': 'ImageObject', url: SITE_URL + '/images/poster1.png' } },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canon },
  });
  const hero = d.image
    ? `<img src="${escHtml(d.image)}" alt="${escHtml(d.imageAlt || d.title)}" loading="lazy" style="max-width:100%;border-radius:12px;margin:0 0 24px;">`
    : '';
  const crumbs = `<nav aria-label="Breadcrumb" style="margin-bottom:24px;font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;"><a href="/" style="color:var(--text-muted)">Home</a> &rsaquo; <a href="/news.html" style="color:var(--text-muted)">News</a> &rsaquo; <span>${escHtml(d.category || 'News')}</span></nav>`;
  const relBox = related && related.length
    ? `<div class="toc"><h2>Related Articles</h2><ul>` + related.map((r) => `<li><a href="/news/${escHtml(r.slug)}.html">${escHtml(r.title)}</a></li>`).join('') + `</ul></div>`
    : '';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">` +
    `<title>${escHtml(pageTitle)} — Young Hadene News</title>` +
    `<meta name="description" content="${desc}">` +
    `<link rel="canonical" href="${escHtml(canon)}">` +
    `<meta property="og:title" content="${escHtml(ogTitle)}">` +
    `<meta property="og:description" content="${escHtml(ogDesc)}">` +
    `<meta property="og:image" content="${escHtml(ogImage)}">` +
    `<meta property="og:url" content="${escHtml(canon)}">` +
    `<meta property="og:type" content="article">` +
    `<meta property="article:published_time" content="${iso.substring(0, 10)}">` +
    `<meta name="twitter:card" content="summary_large_image">` +
    `<meta name="twitter:title" content="${escHtml(ogTitle)}">` +
    `<meta name="twitter:description" content="${escHtml(ogDesc)}">` +
    `<meta name="twitter:image" content="${escHtml(ogImage)}">` +
    `<link rel="stylesheet" href="../css/style.css">` +
    `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='28' font-size='28'>🎤</text></svg>">` +
    `<script type="application/ld+json">${schema}<\/script>` +
    `<style>.article-wrap{max-width:720px;margin:0 auto;padding:40px 0}.article-wrap h1{font-size:clamp(2rem,5vw,3rem);margin-bottom:16px;line-height:1.08}.article-wrap .meta{color:var(--text-muted);font-size:.8rem;margin-bottom:32px;text-transform:uppercase;letter-spacing:.08em}.article-wrap .meta a{color:var(--accent)}.article-wrap p{color:var(--text-secondary);line-height:1.8;margin-bottom:18px;font-size:.95rem}.article-wrap h2{font-size:1.5rem;margin-top:40px;margin-bottom:14px;font-family:var(--font-heading)}.article-wrap h3{font-size:1.15rem;margin-top:28px;margin-bottom:10px;color:var(--accent)}.article-wrap ul{color:var(--text-secondary);line-height:1.8;margin-bottom:18px;padding-left:24px}.article-wrap .takeaways,.article-wrap .toc{background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;padding:24px 28px;margin-bottom:32px}.article-wrap blockquote{border-left:3px solid var(--accent);padding:16px 20px;margin:24px 0;background:var(--bg-card);font-style:italic}</style>` +
    `</head><body>` +
    `<header class="header"><div class="header-inner"><a href="/" class="logo">YOUNG<span class="logo-accent">HADENE</span><span class="logo-sub">Toronto • Dark Trap</span></a><button class="hamburger" aria-label="Menu"><span></span><span></span><span></span></button><nav><ul class="nav-list"><li><a href="/" class="nav-link">Home</a></li><li><a href="/music.html" class="nav-link">Music</a></li><li><a href="/blog.html" class="nav-link">Blog</a></li><li><a href="/news.html" class="nav-link active">News</a></li><li><a href="/contact.html" class="nav-link">Contact</a></li></ul></nav></div></header>` +
    `<section class="section" style="padding-top:120px;"><div class="container"><a href="/news.html" class="back-link">&#8592; Back to News</a><div class="article-wrap">` +
    crumbs +
    `<div class="meta">${escHtml(d.date || '')} &middot; <span>${escHtml(d.category || 'News')}</span> &middot; By ${escHtml(author)}</div>` +
    `<h1>${escHtml(d.title)}</h1>` + hero + `<div>${renderArticleBody(d)}</div>${relBox}` +
    `</div></div></section>` +
    `<footer class="footer"><div class="container"><div class="footer-bottom"><p>&copy; Young Hadene. All rights reserved. Toronto. 6ix.</p></div></div></footer>` +
    `<script src="../js/main.js"></script></body></html>`;
}

async function readTomb(store) {
  try {
    const t = await store.get('deleted');
    const tomb = t ? JSON.parse(t) : null;
    return {
      blog: tomb && Array.isArray(tomb.blog) ? tomb.blog.map(String) : [],
      news: tomb && Array.isArray(tomb.news) ? tomb.news.map(String) : [],
    };
  } catch {
    return { blog: [], news: [] };
  }
}

async function readRedirects(store) {
  try {
    const t = await store.get('redirects');
    const r = t ? JSON.parse(t) : null;
    return r && r.news && typeof r.news === 'object' ? r.news : {};
  } catch {
    return {};
  }
}

async function notFound(env) {
  try {
    const r = await env.ASSETS.fetch(new Request('https://younghadene.ca/404.html'));
    const html = await r.text();
    return new Response(html, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
}

async function countView(store, slug) {
  try {
    const t = await store.get('news:' + slug);
    if (!t) return;
    const doc = JSON.parse(t);
    doc.views = (Number(doc.views) || 0) + 1;
    await store.put('news:' + slug, JSON.stringify(doc));
    const index = JSON.parse((await store.get('news:index')) || '[]');
    if (Array.isArray(index)) {
      const hit = index.find((x) => x && x.slug === slug);
      if (hit) {
        hit.views = doc.views;
        await store.put('news:index', JSON.stringify(index));
      }
    }
    try {
      const s = JSON.parse((await store.get('stats')) || '{}');
      s.viewsTotal = (Number(s.viewsTotal) || 0) + 1;
      await store.put('stats', JSON.stringify(s));
    } catch { /* aggregate only */ }
  } catch { /* best effort */ }
}

export async function onRequestGet(context) {
  const { request, env, params } = context;
  try {
    const raw = String((params && params.slug) || '').replace(/\.html$/i, '');
    const slug = slugify(raw);
    if (!slug || slug === 'index') return env.ASSETS.fetch(request);
    const store = env && env.YH_POSTS;
    if (store) {
      const tomb = await readTomb(store);
      if (tomb.news.includes(slug)) return notFound(env);
      let doc = null;
      try {
        const t = await store.get('news:' + slug);
        doc = t ? JSON.parse(t) : null;
      } catch {
        doc = null;
      }
      if (doc && doc.slug) {
        if (!isVisible(doc, Date.now())) return notFound(env);
        const job = countView(store, slug);
        if (context.waitUntil) context.waitUntil(job);
        else await job;
        let index = [];
        try {
          const t = await store.get('news:index');
          const arr = t ? JSON.parse(t) : [];
          if (Array.isArray(arr)) index = arr;
        } catch { index = []; }
        return new Response(buildNewsHtml(doc, relatedOf(doc, index)), {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        });
      }
      const redirs = await readRedirects(store);
      if (redirs[slug]) {
        return new Response(null, {
          status: 301,
          headers: { Location: '/news/' + redirs[slug] + '.html', 'Cache-Control': 'max-age=3600' },
        });
      }
    }
    return env.ASSETS.fetch(request);
  } catch (e) {
    try {
      return await env.ASSETS.fetch(request);
    } catch {
      return new Response('Not found', { status: 404 });
    }
  }
}
