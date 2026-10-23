// POST /api/posts — create/update a blog post in KV. Live instantly,
// no GitHub commit, no redeploy. Reads via /api/posts-list + /blog/:slug.
// DELETE /api/posts?slug=<slug> — delete from KV (URL 404s instantly).
//
// Post status: draft | published | scheduled (scheduledFor ms timestamp).
// Public reads show published + past-due scheduled only. Drafts are hidden.
// Changing a slug records a redirect (old -> new) so links don't break.
// Concurrent-edit protection: send baseUpdatedAt; 409 on conflict.
//
// Required Pages bindings / env vars:
//   YH_POSTS        — KV namespace binding (post storage)
//   ADMIN_PASSWORD  — must match; no fallback (never hardcode secrets)
//
// Body (POST): { password, post: { id?, baseUpdatedAt?, title, slug?,
//   category, content, takeaways?, faq?, excerpt?, tags?, date?, featured?,
//   status?, scheduledFor?, author?, image?, imageAlt?, seoTitle?, seoDesc?,
//   ogTitle?, ogDesc?, ogImage?, canonical? } }
// Body (DELETE): { password }

import { checkAdminPassword } from '../_safe-equal.js';

const SITE_URL = 'https://younghadene.ca';
const GOOGLE_URL = 'https://share.google/HesREN5rtFGRek6bi';
const SPOTIFY_URL = 'https://open.spotify.com/artist/4MYeewqn16CCiuIgmpIaGA';
const YOUTUBE_URL = 'https://www.youtube.com/channel/UCSJd-7T-_K3MCve3GY4k8mg';

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

// ---- KV store ----
// blog:index (array of docs, newest first), blog:<slug> (doc),
// deleted ({ blog: [...], news: [...] } tombstones),
// redirects ({ blog: {old:new}, news: {old:new} }),
// stats ({ viewsTotal, lastPublish })
function kv(env) {
  return (env && env.YH_POSTS) || null;
}

async function readJson(store, key, fallback) {
  try {
    const t = await store.get(key);
    if (t == null) return fallback;
    const v = JSON.parse(t);
    return v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}

async function readIndex(store) {
  const arr = await readJson(store, 'blog:index', []);
  return Array.isArray(arr) ? arr : [];
}

async function readTomb(store) {
  const t = await readJson(store, 'deleted', {});
  return {
    blog: t && Array.isArray(t.blog) ? t.blog.map(String) : [],
    news: t && Array.isArray(t.news) ? t.news.map(String) : [],
  };
}

async function readRedirects(store) {
  const t = await readJson(store, 'redirects', {});
  const norm = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});
  return { blog: norm(t && t.blog), news: norm(t && t.news) };
}

function isVisible(doc, now) {
  if (!doc) return false;
  if (doc.status === 'published') return true;
  if (doc.status === 'scheduled' && doc.scheduledFor && Number(doc.scheduledFor) <= now) return true;
  return false;
}

function normStatus(s) {
  s = String(s || 'published').toLowerCase();
  return s === 'draft' || s === 'scheduled' ? s : 'published';
}

function cleanStr(v, max) {
  let s = String(v == null ? '' : v);
  if (max && s.length > max) s = s.substring(0, max);
  return s;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    const auth = await checkAdminPassword(env, body.password);
    if (!auth.ok) return json({ error: auth.error }, auth.status);
    const store = kv(env);
    if (!store) return json({ error: 'Post storage not configured (bind YH_POSTS KV)' }, 500);

    const p = body.post || {};
    const title = cleanStr(p.title, 200).trim();
    const content = cleanStr(p.content, 200000).trim();
    if (!title) return json({ error: 'Title is required' }, 400);
    if (!content) return json({ error: 'Content is required' }, 400);

    const incomingId = p.id != null ? String(p.id) : '';
    const index = await readIndex(store);
    const takenByOther = (s) => index.some((x) => x && x.slug === s && String(x.id) !== incomingId);
    let slug = slugify(p.slug || title);
    if (!slug) return json({ error: 'Could not make a URL slug from the title' }, 400);
    if (takenByOther(slug)) {
      const base = slug;
      let n = 2;
      while (takenByOther(base + '-' + n)) n++;
      slug = base + '-' + n;
    }

    // Overwrite protection: refuse when the stored copy is newer.
    const stored = index.find((x) => x && String(x.id) === incomingId) || null;
    if (stored && p.baseUpdatedAt != null && Number(stored.updatedAt || 0) > Number(p.baseUpdatedAt || 0)) {
      return json({ error: 'This post was changed elsewhere — reload before saving.', conflict: true, serverUpdatedAt: stored.updatedAt || 0 }, 409);
    }
    // Slug change on an existing post -> record a redirect, keep the id.
    const redirects = await readRedirects(store);
    if (stored && stored.slug && stored.slug !== slug) {
      redirects.blog[stored.slug] = slug;
      await store.put('redirects', JSON.stringify(redirects));
    }

    const now = Date.now();
    const status = normStatus(p.status);
    const scheduledFor = status === 'scheduled' ? Number(p.scheduledFor || 0) || now : 0;
    const prev = stored || {};
    const data = {
      id: p.id || Date.now(),
      title, slug,
      category: cleanStr(p.category, 60) || 'Music',
      content, takeaways: cleanStr(p.takeaways, 2000), faq: cleanStr(p.faq, 4000),
      excerpt: cleanStr(p.excerpt, 300), tags: cleanStr(p.tags, 500),
      date: cleanStr(p.date, 60) || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      dateNum: Number(p.dateNum) || now,
      featured: !!p.featured,
      status, scheduledFor,
      updatedAt: now,
      author: cleanStr(p.author, 100) || 'Young Hadene',
      image: cleanStr(p.image, 500), imageAlt: cleanStr(p.imageAlt, 200),
      seoTitle: cleanStr(p.seoTitle, 200), seoDesc: cleanStr(p.seoDesc, 300),
      ogTitle: cleanStr(p.ogTitle, 200), ogDesc: cleanStr(p.ogDesc, 300),
      ogImage: cleanStr(p.ogImage, 500), canonical: cleanStr(p.canonical, 500),
      views: Number(prev.views) || 0,
    };

    await store.put('blog:' + slug, JSON.stringify(data));
    // Drop the old slug key when the slug changed.
    if (stored && stored.slug && stored.slug !== slug) {
      await store.delete('blog:' + stored.slug);
    }
    const idx = index.findIndex((x) => x && String(x.id) === String(data.id));
    const entry = { ...data };
    if (idx >= 0) index[idx] = entry;
    else index.unshift(entry);
    // Remove any stale same-slug entry with a different id (belt & braces).
    for (let i = index.length - 1; i >= 0; i--) {
      if (index[i] && index[i].slug === slug && String(index[i].id) !== String(data.id)) index.splice(i, 1);
    }
    if (data.featured) index.forEach((x) => { if (x && x.slug !== slug) x.featured = false; });
    index.sort((a, b) => (b.dateNum || 0) - (a.dateNum || 0));
    await store.put('blog:index', JSON.stringify(index));

    const tomb = await readTomb(store);
    if (tomb.blog.includes(slug)) {
      tomb.blog = tomb.blog.filter((s) => s !== slug);
      await store.put('deleted', JSON.stringify(tomb));
    }
    if (isVisible(data, now)) {
      const stats = await readJson(store, 'stats', {});
      stats.lastPublish = now;
      await store.put('stats', JSON.stringify(stats));
    }

    return json({ ok: true, slug, url: `${SITE_URL}/blog/${slug}.html`, updatedAt: now });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  try {
    const url = new URL(request.url);
    // Slug arrives as /api/posts/<slug> (manager) or ?slug= (API clients).
    const pathSlug = url.pathname.split('/').filter(Boolean).pop();
    const slug = slugify(url.searchParams.get('slug') || (pathSlug && pathSlug !== 'posts' ? pathSlug : ''));
    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    const auth = await checkAdminPassword(env, body.password);
    if (!auth.ok) return json({ error: auth.error }, auth.status);
    const store = kv(env);
    if (!store) return json({ error: 'Post storage not configured (bind YH_POSTS KV)' }, 500);
    if (!slug) return json({ error: 'slug query param is required' }, 400);

    await store.delete('blog:' + slug);
    const index = await readIndex(store);
    const next = index.filter((x) => x && x.slug !== slug);
    if (next.length !== index.length) await store.put('blog:index', JSON.stringify(next));
    const tomb = await readTomb(store);
    if (!tomb.blog.includes(slug)) {
      tomb.blog.push(slug);
      await store.put('deleted', JSON.stringify(tomb));
    }
    return json({ ok: true, slug });
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
