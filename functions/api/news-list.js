// GET /api/news-list — live news index from KV. New items appear instantly:
// no rebuild, no wait. `removed` carries tombstoned slugs so the page can
// strip their static cards immediately. Requires the YH_POSTS KV binding.
// Public listing data (same as the news page itself) — no auth required.
// Drafts and future-scheduled items are hidden unless requested via the
// authenticated POST variant below.
// Query: ?limit=&offset=&withViews=1
// POST { password, includeDrafts?, withViews?, limit?, offset?, summary? }
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isVisible(doc, now) {
  if (!doc) return false;
  if (doc.status === 'published') return true;
  if (doc.status === 'scheduled' && doc.scheduledFor && Number(doc.scheduledFor) <= now) return true;
  return false;
}

function sortNews(posts) {
  posts.sort((a, b) => {
    if (!!b.featured !== !!a.featured) return b.featured ? 1 : -1;
    return (b.dateNum || 0) - (a.dateNum || 0);
  });
  return posts;
}

function stripViews(posts) {
  return posts.map((p) => {
    if (!p || typeof p !== 'object') return p;
    const { views, ...rest } = p;
    return rest;
  });
}

function paginate(posts, limit, offset) {
  const off = Math.max(0, parseInt(offset, 10) || 0);
  const lim = Math.max(0, parseInt(limit, 10) || 0);
  if (!lim) return posts.slice(off);
  return posts.slice(off, off + lim);
}

async function loadAll(store) {
  let index = [];
  try {
    const t = await store.get('news:index');
    const arr = t ? JSON.parse(t) : [];
    if (Array.isArray(arr)) index = arr.filter((p) => p && p.slug);
  } catch {
    index = [];
  }
  let removed = [];
  try {
    const t = await store.get('deleted');
    const tomb = t ? JSON.parse(t) : null;
    if (tomb && Array.isArray(tomb.news)) removed = tomb.news.map(String);
  } catch {
    removed = [];
  }
  let stats = {};
  try {
    const t = await store.get('stats');
    stats = t ? JSON.parse(t) : {};
  } catch {
    stats = {};
  }
  return { index, removed, stats: stats && typeof stats === 'object' ? stats : {} };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  try {
    const store = env && env.YH_POSTS;
    if (!store) return json({ error: 'Post storage not configured (bind YH_POSTS KV)' }, 500);
    const url = new URL(request.url);
    const now = Date.now();
    const { index, removed } = await loadAll(store);
    let posts = sortNews(index.filter((p) => isVisible(p, now)));
    const withViews = url.searchParams.get('withViews') === '1';
    posts = paginate(posts, url.searchParams.get('limit'), url.searchParams.get('offset'));
    if (!withViews) posts = stripViews(posts);
    return json({ ok: true, posts, removed });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    const expected = env && env.ADMIN_PASSWORD;
    if (!expected) return json({ error: 'ADMIN_PASSWORD not configured on the server' }, 500);
    if (!body.password || !timingSafeEqual(String(body.password), String(expected))) {
      return json({ error: 'Incorrect password' }, 401);
    }
    const store = env.YH_POSTS;
    if (!store) return json({ error: 'Post storage not configured (bind YH_POSTS KV)' }, 500);
    const now = Date.now();
    const { index, removed, stats } = await loadAll(store);
    if (body.summary) {
      const published = index.filter((p) => isVisible(p, now));
      const drafts = index.filter((p) => p && p.status === 'draft');
      const scheduled = index.filter((p) => p && p.status === 'scheduled' && !(p.scheduledFor && Number(p.scheduledFor) <= now));
      const totalViews = index.reduce((n, p) => n + (Number(p.views) || 0), 0);
      const popular = [...published].sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0)).slice(0, 10)
        .map((p) => ({ slug: p.slug, title: p.title, views: Number(p.views) || 0 }));
      const recent = [...index].sort((a, b) => (Number(b.updatedAt || b.dateNum) || 0) - (Number(a.updatedAt || a.dateNum) || 0)).slice(0, 10)
        .map((p) => ({ slug: p.slug, title: p.title, status: p.status || 'published', updatedAt: p.updatedAt || p.dateNum || 0, date: p.date || '' }));
      return json({
        ok: true, removed,
        summary: {
          total: index.length,
          published: published.length,
          drafts: drafts.length,
          scheduled: scheduled.length,
          totalViews,
          lastPublish: Number(stats.lastPublish) || 0,
          popular, recent,
        },
      });
    }
    let posts = body.includeDrafts ? sortNews([...index]) : sortNews(index.filter((p) => isVisible(p, now)));
    posts = paginate(posts, body.limit, body.offset);
    if (!body.withViews) posts = stripViews(posts);
    return json({ ok: true, posts, removed });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, authorization',
    },
  });
}
