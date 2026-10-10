// POST /api/news — create/update a news post in KV. Live instantly,
// no GitHub commit, no redeploy. Reads via /api/news-list + /news/:slug.
// DELETE /api/news?slug=<slug> — delete from KV (URL 404s instantly).
//
// Same semantics as /api/posts (status, scheduling, redirects, conflicts).
// Required Pages bindings / env vars:
//   YH_POSTS        — KV namespace binding (post storage)
//   ADMIN_PASSWORD  — must match; no fallback (never hardcode secrets)
//
// Body (POST): { password, post: { id?, baseUpdatedAt?, title, slug?,
//   category, content, takeaways?, faq?, excerpt?, tags?, date?, featured?,
//   status?, scheduledFor?, author?, image?, imageAlt?, seoTitle?, seoDesc?,
//   ogTitle?, ogDesc?, ogImage?, canonical? } }
// Body (DELETE): { password }

const SITE_URL = 'https://younghadene.ca';

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

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

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
  const arr = await readJson(store, 'news:index', []);
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

function sortIndex(index) {
  index.sort((a, b) => {
    if (!!b.featured !== !!a.featured) return b.featured ? 1 : -1;
    return (b.dateNum || 0) - (a.dateNum || 0);
  });
}

function checkAuth(env, password) {
  const expected = env && env.ADMIN_PASSWORD;
  if (!expected) return { ok: false, status: 500, error: 'ADMIN_PASSWORD not configured on the server' };
  if (!password || !timingSafeEqual(String(password), String(expected))) {
    return { ok: false, status: 401, error: 'Incorrect password' };
  }
  return { ok: true };
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
    const auth = checkAuth(env, body.password);
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

    const stored = index.find((x) => x && String(x.id) === incomingId) || null;
    if (stored && p.baseUpdatedAt != null && Number(stored.updatedAt || 0) > Number(p.baseUpdatedAt || 0)) {
      return json({ error: 'This post was changed elsewhere — reload before saving.', conflict: true, serverUpdatedAt: stored.updatedAt || 0 }, 409);
    }
    const redirects = await readRedirects(store);
    if (stored && stored.slug && stored.slug !== slug) {
      redirects.news[stored.slug] = slug;
      await store.put('redirects', JSON.stringify(redirects));
    }

    const now = Date.now();
    const status = normStatus(p.status);
    const scheduledFor = status === 'scheduled' ? Number(p.scheduledFor || 0) || now : 0;
    const prev = stored || {};
    const data = {
      id: p.id || Date.now(),
      title, slug,
      category: cleanStr(p.category, 60) || 'News',
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

    await store.put('news:' + slug, JSON.stringify(data));
    if (stored && stored.slug && stored.slug !== slug) {
      await store.delete('news:' + stored.slug);
    }
    const idx = index.findIndex((x) => x && String(x.id) === String(data.id));
    if (idx >= 0) index[idx] = { ...data };
    else index.unshift({ ...data });
    for (let i = index.length - 1; i >= 0; i--) {
      if (index[i] && index[i].slug === slug && String(index[i].id) !== String(data.id)) index.splice(i, 1);
    }
    if (data.featured) index.forEach((x) => { if (x && x.slug !== slug) x.featured = false; });
    sortIndex(index);
    await store.put('news:index', JSON.stringify(index));

    const tomb = await readTomb(store);
    if (tomb.news.includes(slug)) {
      tomb.news = tomb.news.filter((s) => s !== slug);
      await store.put('deleted', JSON.stringify(tomb));
    }
    if (isVisible(data, now)) {
      const stats = await readJson(store, 'stats', {});
      stats.lastPublish = now;
      await store.put('stats', JSON.stringify(stats));
    }

    return json({ ok: true, slug, url: `${SITE_URL}/news/${slug}.html`, updatedAt: now });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  try {
    const url = new URL(request.url);
    // Slug arrives as /api/news/<slug> (manager) or ?slug= (API clients).
    const pathSlug = url.pathname.split('/').filter(Boolean).pop();
    const slug = slugify(url.searchParams.get('slug') || (pathSlug && pathSlug !== 'news' ? pathSlug : ''));
    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    const auth = checkAuth(env, body.password);
    if (!auth.ok) return json({ error: auth.error }, auth.status);
    const store = kv(env);
    if (!store) return json({ error: 'Post storage not configured (bind YH_POSTS KV)' }, 500);
    if (!slug) return json({ error: 'slug query param is required' }, 400);

    await store.delete('news:' + slug);
    const index = await readIndex(store);
    const next = index.filter((x) => x && x.slug !== slug);
    if (next.length !== index.length) await store.put('news:index', JSON.stringify(next));
    const tomb = await readTomb(store);
    if (!tomb.news.includes(slug)) {
      tomb.news.push(slug);
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
