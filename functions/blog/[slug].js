// GET /blog/:slug — serve the article straight from GitHub (instant).
// New posts are readable seconds after publishing, no rebuild wait.
// Falls back to the statically deployed file when GitHub has no copy.
const DEFAULT_BRANCH = 'main';

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function onRequestGet(context) {
  const { request, env, params } = context;
  try {
    // Allow both /blog/<slug> and /blog/<slug>.html
    const raw = String((params && params.slug) || '').replace(/\.html$/i, '');
    const slug = slugify(raw);
    if (!slug || slug === 'index') return env.ASSETS.fetch(request);
    const repo = env && env.GITHUB_REPO;
    const token = env && env.GITHUB_TOKEN;
    const branch = (env && env.GITHUB_BRANCH) || DEFAULT_BRANCH;
    if (repo && token) {
      const r = await fetch(
        `https://api.github.com/repos/${repo}/contents/blog/${slug}.html?ref=${encodeURIComponent(branch)}`,
        { headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'younghadene-site' } }
      );
      if (r.ok) {
        const j = await r.json();
        const bin = atob(String(j.content || '').replace(/\n/g, ''));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const html = new TextDecoder().decode(bytes);
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
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
