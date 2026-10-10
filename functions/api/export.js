// POST /api/export — full KV backup download (password-protected).
// Returns every stored key needed to restore the blog/news catalog.
// Keep the downloaded file safe: it contains all published AND draft posts.
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
    const get = async (k, fb) => {
      try {
        const t = await store.get(k);
        return t == null ? fb : JSON.parse(t);
      } catch {
        return fb;
      }
    };
    const dump = {
      exportedAt: new Date().toISOString(),
      'blog:index': await get('blog:index', []),
      'news:index': await get('news:index', []),
      deleted: await get('deleted', { blog: [], news: [] }),
      redirects: await get('redirects', { blog: {}, news: {} }),
      stats: await get('stats', {}),
    };
    // Include per-slug docs (source of truth for restores).
    dump.blogDocs = {};
    for (const p of dump['blog:index']) {
      if (p && p.slug) dump.blogDocs[p.slug] = (await get('blog:' + p.slug, null)) || p;
    }
    dump.newsDocs = {};
    for (const p of dump['news:index']) {
      if (p && p.slug) dump.newsDocs[p.slug] = (await get('news:' + p.slug, null)) || p;
    }
    return new Response(JSON.stringify(dump, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Content-Disposition': 'attachment; filename="younghadene-kv-backup.json"',
      },
    });
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
