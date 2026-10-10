// POST /api/migrate — one-time seed of KV from the deployed static files.
// Reads the baked SERVER_POSTS (blog.html) and NEWS_POSTS (news.html) arrays
// served by this same deployment and stores them as KV docs + indexes.
// Existing KV slugs are NEVER overwritten (safe to re-run).
// Static news cards without structured data are skipped (their .html files
// keep serving via the static fallback until republished from the manager).
//
// Body: { password }
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function extractArr(html, varName) {
  const m = String(html || '').match(new RegExp('<script>var ' + varName + ' = (\\[.*?\\]);?\\s*\\n?</script>', 's'));
  if (!m) return [];
  try {
    const arr = JSON.parse(m[1]);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function normDoc(p, section, fallbackCat) {
  const slug = String((p && p.slug) || '').trim();
  if (!slug) return null;
  const now = Date.now();
  return {
    id: (p && p.id) || now + Math.floor(Math.random() * 100000),
    title: String((p && p.title) || slug),
    slug, section,
    category: String((p && p.category) || fallbackCat),
    content: String((p && p.content) || ''),
    takeaways: String((p && p.takeaways) || ''),
    faq: String((p && p.faq) || ''),
    excerpt: String((p && p.excerpt) || ''),
    tags: String((p && p.tags) || ''),
    date: String((p && p.date) || ''),
    dateNum: Number((p && p.dateNum) || 0) || now,
    featured: !!(p && p.featured),
    status: 'published',
    scheduledFor: 0,
    updatedAt: now,
    author: 'Young Hadene',
    image: '', imageAlt: '',
    seoTitle: '', seoDesc: '',
    ogTitle: '', ogDesc: '', ogImage: '', canonical: '',
    views: 0,
  };
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
    if (!env.ASSETS) return json({ error: 'Static assets unavailable' }, 500);

    const read = async (path) => {
      try {
        const r = await env.ASSETS.fetch(new Request('https://younghadene.ca' + path));
        if (!r.ok) return '';
        return await r.text();
      } catch {
        return '';
      }
    };
    const getJson = async (k, fb) => {
      try {
        const t = await store.get(k);
        return t == null ? fb : JSON.parse(t);
      } catch {
        return fb;
      }
    };

    const report = { blog: { added: 0, skipped: 0 }, news: { added: 0, skipped: 0 } };

    const blogHtml = await read('/blog.html');
    const blogDocs = extractArr(blogHtml, 'SERVER_POSTS').map((p) => normDoc(p, 'blog', 'Music')).filter(Boolean);
    let blogIndex = await getJson('blog:index', []);
    if (!Array.isArray(blogIndex)) blogIndex = [];
    const blogSlugs = new Set(blogIndex.filter((x) => x && x.slug).map((x) => x.slug));
    for (const d of blogDocs) {
      if (blogSlugs.has(d.slug)) { report.blog.skipped++; continue; }
      await store.put('blog:' + d.slug, JSON.stringify(d));
      blogIndex.unshift(d);
      blogSlugs.add(d.slug);
      report.blog.added++;
    }
    blogIndex.sort((a, b) => (b.dateNum || 0) - (a.dateNum || 0));
    await store.put('blog:index', JSON.stringify(blogIndex));

    const newsHtml = await read('/news.html');
    const newsDocs = extractArr(newsHtml, 'NEWS_POSTS').map((p) => normDoc(p, 'news', 'News')).filter(Boolean);
    let newsIndex = await getJson('news:index', []);
    if (!Array.isArray(newsIndex)) newsIndex = [];
    const newsSlugs = new Set(newsIndex.filter((x) => x && x.slug).map((x) => x.slug));
    for (const d of newsDocs) {
      if (newsSlugs.has(d.slug)) { report.news.skipped++; continue; }
      await store.put('news:' + d.slug, JSON.stringify(d));
      newsIndex.unshift(d);
      newsSlugs.add(d.slug);
      report.news.added++;
    }
    newsIndex.sort((a, b) => (b.dateNum || 0) - (a.dateNum || 0));
    await store.put('news:index', JSON.stringify(newsIndex));

    return json({ ok: true, report });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, authorization',
    },
  });
}
