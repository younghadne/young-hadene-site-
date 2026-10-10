// GET /api/posts-list — live blog index from KV. New posts appear instantly:
// no rebuild, no wait. Requires the YH_POSTS KV binding.
// Public listing data (same as the blog page itself) — no auth required.
// Drafts and future-scheduled posts are hidden unless requested via the
// authenticated POST variant below.
// Query: ?limit=&offset=&withViews=1
// POST { password, includeDrafts?, withViews?, limit?, offset?, summary? }
//   summary=1 -> { ok, summary: { total, published, drafts, scheduled,
//   totalViews, lastPublish, popular[], recent[] } } (for the manager).
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
    const t = await store.get('blog:index');
    const arr = t ? JSON.parse(t) : [];
    if (Array.isArray(arr)) index = arr.filter((p) => p && p.slug);
  } catch {
    index = [];
  }
  index.sort((a, b) => (b.dateNum || 0) - (a.dateNum || 0));
  let stats = {};
  try {
    const t = await store.get('stats');
    stats = t ? JSON.parse(t) : {};
  } catch {
    stats = {};
  }
  return { index, stats: stats && typeof stats === 'object' ? stats : {} };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  try {
    const store = env && env.YH_POSTS;
    if (!store) return json({ error: 'Post storage not configured (bind YH_POSTS KV)' }, 500);
    const url = new URL(request.url);
    const now = Date.now();
    const { index } = await loadAll(store);
    let posts = index.filter((p) => isVisible(p, now));
    const withViews = url.searchParams.get('withViews') === '1';
    posts = paginate(posts, url.searchParams.get('limit'), url.searchParams.get('offset'));
    if (!withViews) posts = stripViews(posts);
    return json({ ok: true, posts });
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
    const { index, stats } = await loadAll(store);
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
        ok: true,
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
    let posts = body.includeDrafts ? [...index] : index.filter((p) => isVisible(p, now));
    posts = paginate(posts, body.limit, body.offset);
    if (!body.withViews) posts = stripViews(posts);
    return json({ ok: true, posts });
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
