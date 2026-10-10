// POST /api/posts — publish (upsert) a blog post by committing to GitHub.
// DELETE /api/posts?slug=<slug> — delete a post by committing to GitHub.
// Cloudflare Pages auto-redeploys on push, so the post goes live in ~2 min.
//
// Required Pages env vars:
//   ADMIN_PASSWORD  — must match (falls back to built-in default when unset)
//   GITHUB_TOKEN    — PAT / fine-grained token with contents:write on the repo
//   GITHUB_REPO     — e.g. "younghadne/young-hadene-site-"
//   GITHUB_BRANCH   — e.g. "main" (default: main)
//
// Body (POST): { password, post: { title, slug?, category, content,
//   takeaways?, faq?, excerpt?, tags?, date?, featured? } }
// Body (DELETE): { password }

const SITE_URL = 'https://younghadene.ca';
const GOOGLE_URL = 'https://share.google/HesREN5rtFGRek6bi';
const SPOTIFY_URL = 'https://open.spotify.com/artist/4MYeewqn16CCiuIgmpIaGA';
const YOUTUBE_URL = 'https://www.youtube.com/channel/UCSJd-7T-_K3MCve3GY4k8mg';
const DEFAULT_BRANCH = 'main';
const FALLBACK_PASSWORD = 'HadeneCalixte1998';

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

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
  const hold = (html) => { holders.push(html); return ' ' + (holders.length - 1) + ' '; };
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

function buildArticleHtml(d, tagList) {
  const desc = String(d.excerpt || d.content || '').replace(/[#*>\-\[\]()`]/g, '').trim().substring(0, 160);
  const tagsMeta = tagList.map((t) => `<meta property="article:tag" content="${escHtml(t)}">`).join('');
  const tagsBox = tagList.length
    ? `<div class="tags-box" style="margin:32px 0;display:flex;flex-wrap:wrap;gap:8px;">` +
      tagList.map((t) => `<span style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.06em;background:var(--bg-card);border:1px solid var(--border-color);border-radius:20px;padding:6px 14px;color:var(--text-secondary);">#${escHtml(t)}</span>`).join('') +
      `</div>`
    : '';
  const schema = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Article',
    headline: d.title || '', description: desc,
    author: { '@type': 'Person', name: 'Young Hadene', jobTitle: 'Recording Artist', url: SITE_URL + '/about.html', sameAs: ['https://www.instagram.com/YOUNGHADENE', YOUTUBE_URL, SPOTIFY_URL, GOOGLE_URL] },
    datePublished: d.date || '', image: SITE_URL + '/images/poster1.png',
  });
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">` +
    `<title>${escHtml(d.title)} — Young Hadene</title>` +
    `<meta name="description" content="${escHtml(desc)}">` +
    `<link rel="canonical" href="${SITE_URL}/blog/${escHtml(d.slug)}">` +
    `<meta property="og:title" content="${escHtml(d.title)}">` +
    `<meta property="og:description" content="${escHtml(desc)}">` +
    `<meta property="og:image" content="${SITE_URL}/images/poster1.png">` +
    `<meta property="og:url" content="${SITE_URL}/blog/${escHtml(d.slug)}">` +
    `<meta property="og:type" content="article">${tagsMeta}` +
    `<meta name="twitter:card" content="summary_large_image">` +
    `<link rel="stylesheet" href="/css/style.css">` +
    `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='28' font-size='28'>🎤</text></svg>">` +
    `<script type="application/ld+json">${schema}<\/script>` +
    `<style>.article-wrap{max-width:720px;margin:0 auto;padding:40px 0}.article-wrap h1{font-size:clamp(2.2rem,5vw,3.2rem);margin-bottom:16px;line-height:1.05}.article-wrap .meta{color:var(--text-muted);font-size:.8rem;margin-bottom:32px;text-transform:uppercase;letter-spacing:.08em}.article-wrap .meta span{color:var(--accent)}.article-wrap h2{font-size:1.6rem;margin-top:48px;margin-bottom:16px;font-family:var(--font-heading);letter-spacing:.04em}.article-wrap h3{font-size:1.15rem;margin-top:28px;margin-bottom:10px;color:var(--accent)}.article-wrap p{color:var(--text-secondary);line-height:1.8;margin-bottom:18px;font-size:.95rem}.article-wrap ul{color:var(--text-secondary);line-height:1.8;margin-bottom:18px;padding-left:24px;font-size:.95rem}.article-wrap li{margin-bottom:8px}.article-wrap .takeaways,.article-wrap .toc{background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;padding:24px 28px;margin-bottom:32px}.article-wrap blockquote{border-left:3px solid var(--accent);padding:16px 20px;margin:24px 0;background:var(--bg-card);font-style:italic;color:var(--text-secondary)}.article-wrap .cta-box{text-align:center;background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;padding:32px;margin:40px 0}.back-link{display:inline-flex;align-items:center;gap:8px;color:var(--text-muted);font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;margin-bottom:32px}</style>` +
    `</head><body>` +
    `<header class="header"><div class="header-inner"><a href="/" class="logo">YOUNG<span class="logo-accent">HADENE</span><span class="logo-sub">Toronto • Dark Trap</span></a><button class="hamburger" aria-label="Menu"><span></span><span></span><span></span></button><nav><ul class="nav-list"><li><a href="/" class="nav-link">Home</a></li><li><a href="/music.html" class="nav-link">Music</a></li><li><a href="/blog.html" class="nav-link active">Blog</a></li><li><a href="/contact.html" class="nav-link">Contact</a></li></ul></nav></div></header>` +
    `<section class="section" style="padding-top:120px;"><div class="container"><a href="/blog.html" class="back-link">&#8592; Back to Blog</a><div class="article-wrap">` +
    `<div class="meta">${escHtml(d.date || '')} &middot; <span>${escHtml(d.category || 'Music')}</span> &middot; By <a href="/about.html" rel="author" style="color:var(--accent)">Young Hadene</a></div>` +
    `<h1>${escHtml(d.title)}</h1><div>${renderArticleBody(d)}</div>${tagsBox}` +
    `<div class="cta-box"><h3>Find Young Hadene on Google</h3><p>Follow, get updates & leave a review.</p><p><a href="${GOOGLE_URL}" target="_blank" rel="noopener" class="btn btn-primary">★ View Google Profile</a></p></div>` +
    `</div></div></section>` +
    `<footer class="footer"><div class="container"><div class="footer-bottom"><p>&copy; Young Hadene. All rights reserved. Toronto. 6ix.</p></div></div></footer>` +
    `<script src="/js/main.js"></script></body></html>`;
}

// ---- GitHub Contents API helpers ----
function ghHeaders(token) {
  return { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'younghadene-admin' };
}

async function ghGetFile(repo, branch, filePath, token) {
  const r = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(filePath).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`, { headers: ghHeaders(token) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub GET ${filePath}: HTTP ${r.status}`);
  const j = await r.json();
  const content = (j.content || '').replace(/\n/g, '');
  // base64 → utf8 (chunk-safe for large files like blog.html)
  const bin = atob(content);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const text = new TextDecoder().decode(bytes);
  return { sha: j.sha, text };
}

function b64encode(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function ghPutFile(repo, branch, filePath, text, message, token, sha) {
  const body = { message, content: b64encode(text), branch };
  if (sha) body.sha = sha;
  const r = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(filePath).replace(/%2F/g, '/')}`, {
    method: 'PUT', headers: ghHeaders(token), body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`GitHub PUT ${filePath}: HTTP ${r.status} ${t.substring(0, 200)}`);
  }
  return r.json();
}

async function ghDeleteFile(repo, branch, filePath, message, token, sha) {
  const r = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(filePath).replace(/%2F/g, '/')}`, {
    method: 'DELETE', headers: ghHeaders(token),
    body: JSON.stringify({ message, sha, branch }),
  });
  if (!r.ok && r.status !== 404) {
    const t = await r.text();
    throw new Error(`GitHub DELETE ${filePath}: HTTP ${r.status} ${t.substring(0, 200)}`);
  }
  return true;
}

// Patch the baked `var SERVER_POSTS = [...]` array inside blog.html.
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

function upsertPostsJsonEntry(postsJsonText, entry) {
  let arr = [];
  try {
    const parsed = JSON.parse(postsJsonText || '[]');
    if (Array.isArray(parsed)) arr = parsed;
  } catch { arr = []; }
  const idx = arr.findIndex((p) => p && p.slug === entry.slug);
  if (idx >= 0) arr[idx] = { ...arr[idx], ...entry };
  else arr.push(entry);
  arr.sort((a, b) => (b.dateNum || 0) - (a.dateNum || 0));
  return JSON.stringify(arr, null, 2);
}

function removePostsJsonEntry(postsJsonText, slug) {
  let arr = [];
  try {
    const parsed = JSON.parse(postsJsonText || '[]');
    if (Array.isArray(parsed)) arr = parsed;
  } catch { arr = []; }
  return JSON.stringify(arr.filter((p) => p && p.slug !== slug), null, 2);
}

function upsertSitemapEntry(sitemap, slug, dateStr) {
  const url = `${SITE_URL}/blog/${slug}.html`;
  if (sitemap.includes(url)) return sitemap;
  const entry = `  <url><loc>${url}</loc><lastmod>${dateStr}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>\n`;
  return sitemap.replace('</urlset>', entry + '</urlset>');
}

function removeSitemapEntry(sitemap, slug) {
  const url = `${SITE_URL}/blog/${slug}.html`;
  return sitemap.replace(new RegExp(`\\s*<url><loc>${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>.*?</url>\\n?`, 's'), '\n');
}

function checkAuth(env, password) {
  const expected = (env && env.ADMIN_PASSWORD) || FALLBACK_PASSWORD;
  if (!password || !timingSafeEqual(String(password), String(expected))) {
    return { ok: false, status: 401, error: 'Incorrect password' };
  }
  return { ok: true };
}

function ghConfig(env) {
  const repo = env && env.GITHUB_REPO;
  const token = env && env.GITHUB_TOKEN;
  const branch = (env && env.GITHUB_BRANCH) || DEFAULT_BRANCH;
  if (!repo || !token) return { ok: false, error: 'GITHUB_REPO / GITHUB_TOKEN not configured on the server' };
  return { ok: true, repo, token, branch };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    const auth = checkAuth(env, body.password);
    if (!auth.ok) return json({ error: auth.error }, auth.status);
    const cfg = ghConfig(env);
    if (!cfg.ok) return json({ error: cfg.error }, 500);

    const p = body.post || {};
    const title = String(p.title || '').trim();
    const content = String(p.content || '').trim();
    if (!title) return json({ error: 'Title is required' }, 400);
    if (!content) return json({ error: 'Content is required' }, 400);

    const slug = slugify(p.slug || title);
    const now = new Date();
    const dateStr = p.date || now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const tagList = String(p.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
    const data = {
      id: p.id || Date.now(),
      title, slug,
      category: String(p.category || 'Music'),
      content, takeaways: String(p.takeaways || ''), faq: String(p.faq || ''),
      excerpt: String(p.excerpt || ''), tags: tagList.join(', '),
      date: dateStr, dateNum: p.dateNum || Date.now(),
      featured: !!p.featured,
    };

    // Commit order matters for instant publishing (no rebuild wait):
    //   1. blog/posts.json FIRST — /api/posts-list reads this live from GitHub,
    //      so the post appears in the blog listing within seconds.
    //   2. Article file — functions/blog/[slug].js serves it straight from
    //      GitHub, so the URL works within seconds.
    //   3. blog.html baked listing + sitemap are best-effort (SEO/fallback);
    //      their failure must never block a publish.
    const warnings = [];

    // 1. Maintain blog/posts.json (live listing source) — critical
    const entry = { id: data.id, title: data.title, slug: data.slug, category: data.category, content: data.content, date: data.date, dateNum: data.dateNum, featured: data.featured, excerpt: data.excerpt, tags: data.tags, takeaways: data.takeaways, faq: data.faq };
    try {
      const pj = await ghGetFile(cfg.repo, cfg.branch, 'blog/posts.json', cfg.token);
      const updatedPj = upsertPostsJsonEntry(pj ? pj.text : '[]', entry);
      if (!pj || updatedPj !== pj.text) {
        await ghPutFile(cfg.repo, cfg.branch, 'blog/posts.json', updatedPj,
          `Update posts: ${slug} via admin`, cfg.token, pj ? pj.sha : undefined);
      }
    } catch (e) {
      return json({ error: 'Could not update listing: ' + e.message }, 500);
    }

    // 2. Upsert the article file — critical
    try {
      const html = buildArticleHtml(data, tagList);
      const existing = await ghGetFile(cfg.repo, cfg.branch, `blog/${slug}.html`, cfg.token);
      await ghPutFile(cfg.repo, cfg.branch, `blog/${slug}.html`, html,
        `Publish post: ${slug} via admin`, cfg.token, existing ? existing.sha : undefined);
    } catch (e) {
      return json({ error: 'Listed but article save failed: ' + e.message, slug }, 500);
    }

    // 3. Patch the baked listing in blog.html — best effort
    try {
      const blogPage = await ghGetFile(cfg.repo, cfg.branch, 'blog.html', cfg.token);
      if (blogPage) {
        const patchedBlog = upsertListingEntry(blogPage.text, entry);
        if (patchedBlog !== blogPage.text) {
          await ghPutFile(cfg.repo, cfg.branch, 'blog.html', patchedBlog,
            `Update listing for post: ${slug}`, cfg.token, blogPage.sha);
        }
      }
    } catch (e) {
      warnings.push('baked listing: ' + e.message);
    }

    // 4. Patch sitemap.xml — best effort
    try {
      const sm = await ghGetFile(cfg.repo, cfg.branch, 'sitemap.xml', cfg.token);
      if (sm) {
        const patchedSm = upsertSitemapEntry(sm.text, slug, now.toISOString().substring(0, 10));
        if (patchedSm !== sm.text) {
          await ghPutFile(cfg.repo, cfg.branch, 'sitemap.xml', patchedSm,
            `Update sitemap for post: ${slug}`, cfg.token, sm.sha);
        }
      }
    } catch (e) {
      warnings.push('sitemap: ' + e.message);
    }

    return json({ ok: true, slug, url: `${SITE_URL}/blog/${slug}.html`, warnings });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  try {
    const url = new URL(request.url);
    let slug = slugify(url.searchParams.get('slug') || '');
    if (!slug) {
      // Also accept /api/posts/<slug> style paths
      const parts = url.pathname.split('/').filter(Boolean);
      slug = slugify(parts[parts.length - 1] || '');
      if (slug === 'posts') slug = '';
    }
    // Some proxies strip DELETE bodies — also accept ?password= as fallback.
    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    const password = (body && body.password) || url.searchParams.get('password') || '';
    const auth = checkAuth(env, password);
    if (!auth.ok) return json({ error: auth.error }, auth.status);
    const cfg = ghConfig(env);
    if (!cfg.ok) return json({ error: cfg.error }, 500);
    if (!slug) return json({ error: 'slug query param is required' }, 400);

    // Delete order mirrors publish (listing first = instant removal):
    //   1. blog/posts.json FIRST — post vanishes from Blogs within seconds.
    //   2. Article file — URL stops working within seconds.
    //   3. blog.html baked listing + sitemap are best-effort cleanup.
    const warnings = [];

    // 1. Remove from blog/posts.json (live listing source) — critical
    try {
      const pj = await ghGetFile(cfg.repo, cfg.branch, 'blog/posts.json', cfg.token);
      if (pj) {
        const updatedPj = removePostsJsonEntry(pj.text, slug);
        if (updatedPj !== pj.text) {
          await ghPutFile(cfg.repo, cfg.branch, 'blog/posts.json', updatedPj,
            `Remove post: ${slug} via admin`, cfg.token, pj.sha);
        }
      }
    } catch (e) {
      return json({ error: 'Could not remove from listing: ' + e.message }, 500);
    }

    // 2. Delete the article file — critical (404-tolerant)
    try {
      const existing = await ghGetFile(cfg.repo, cfg.branch, `blog/${slug}.html`, cfg.token);
      if (existing) {
        await ghDeleteFile(cfg.repo, cfg.branch, `blog/${slug}.html`, `Delete post: ${slug} via admin`, cfg.token, existing.sha);
      }
    } catch (e) {
      return json({ error: 'Delisted but file delete failed: ' + e.message, slug }, 500);
    }

    // 3. Remove baked listing in blog.html — best effort
    try {
      const blogPage = await ghGetFile(cfg.repo, cfg.branch, 'blog.html', cfg.token);
      if (blogPage) {
        const patchedBlog = removeListingEntry(blogPage.text, slug);
        if (patchedBlog !== blogPage.text) {
          await ghPutFile(cfg.repo, cfg.branch, 'blog.html', patchedBlog,
            `Remove listing for post: ${slug}`, cfg.token, blogPage.sha);
        }
      }
    } catch (e) {
      warnings.push('baked listing: ' + e.message);
    }

    // 4. Remove sitemap entry — best effort
    try {
      const sm = await ghGetFile(cfg.repo, cfg.branch, 'sitemap.xml', cfg.token);
      if (sm) {
        const patchedSm = removeSitemapEntry(sm.text, slug);
        if (patchedSm !== sm.text) {
          await ghPutFile(cfg.repo, cfg.branch, 'sitemap.xml', patchedSm,
            `Remove sitemap entry for post: ${slug}`, cfg.token, sm.sha);
        }
      }
    } catch (e) {
      warnings.push('sitemap: ' + e.message);
    }

    return json({ ok: true, slug, warnings });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestGet() {
  return json({ ok: false, error: 'Method not allowed' }, 405);
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, authorization',
    },
  });
}
