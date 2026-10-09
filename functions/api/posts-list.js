// GET /api/posts-list — live blog index, read straight from GitHub.
// This is what makes new posts appear instantly: no rebuild, no wait.
// Falls back gracefully (blog.html uses baked SERVER_POSTS when this 404s/500s).
const DEFAULT_BRANCH = 'main';

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

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const repo = env && env.GITHUB_REPO;
    const token = env && env.GITHUB_TOKEN;
    const branch = (env && env.GITHUB_BRANCH) || DEFAULT_BRANCH;
    if (!repo || !token) return json({ error: 'GitHub not configured on the server' }, 500);
    const r = await fetch(
      `https://api.github.com/repos/${repo}/contents/blog/posts.json?ref=${encodeURIComponent(branch)}`,
      { headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'younghadene-site' } }
    );
    if (!r.ok) return json({ error: 'Could not load posts (' + r.status + ')' }, 502);
    const j = await r.json();
    const bin = atob(String(j.content || '').replace(/\n/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const text = new TextDecoder().decode(bytes);
    let arr = [];
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) arr = parsed;
    } catch { arr = []; }
    arr.sort((a, b) => (b.dateNum || 0) - (a.dateNum || 0));
    return json({ ok: true, posts: arr });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, authorization',
    },
  });
}
