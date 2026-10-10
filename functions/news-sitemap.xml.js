// GET /news-sitemap.xml — dynamic Google News sitemap from KV (fresh items
// from the last 2 days), unioned with the static file so nothing is lost.
// New items appear instantly, no rebuild.
const SITE_URL = 'https://younghadene.ca';
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function titleOf(p) {
  return String((p && p.title) || (p && p.slug) || '').split('—')[0].split('|')[0].trim();
}

function itemXml(p) {
  const loc = `${SITE_URL}/news/${p.slug}.html`;
  const pub = new Date(Number(p.dateNum) || Date.now()).toISOString();
  return '  <url>\n    <loc>' + esc(loc) + '</loc>\n    <news:news>\n      <news:publication>\n        <news:name>Young Hadene</news:name>\n        <news:language>en</news:language>\n      </news:publication>\n      <news:publication_date>' + pub + '</news:publication_date>\n      <news:title>' + esc(titleOf(p)) + '</news:title>\n    </news:news>\n  </url>\n';
}

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const now = Date.now();
    const seen = new Set();
    let items = '';
    const store = env && env.YH_POSTS;
    if (store) {
      let arr = [];
      try {
        const t = await store.get('news:index');
        const parsed = t ? JSON.parse(t) : [];
        if (Array.isArray(parsed)) arr = parsed;
      } catch { arr = []; }
      for (const p of arr) {
        if (!p || !p.slug) continue;
        const vis = p.status === 'published' || !p.status ||
          (p.status === 'scheduled' && p.scheduledFor && Number(p.scheduledFor) <= now);
        if (!vis) continue;
        if (now - Number(p.dateNum || 0) > TWO_DAYS_MS) continue;
        const loc = `${SITE_URL}/news/${p.slug}.html`;
        if (seen.has(loc)) continue;
        seen.add(loc);
        items += itemXml(p);
      }
    }
    try {
      if (env && env.ASSETS) {
        const r = await env.ASSETS.fetch(new Request(SITE_URL + '/news-sitemap.xml'));
        if (r.ok) {
          const text = await r.text();
          const re = /<url>([\s\S]*?)<\/url>/g;
          let m;
          while ((m = re.exec(text)) !== null) {
            const locM = m[1].match(/<loc>([^<]*)<\/loc>/);
            if (locM && !seen.has(locM[1])) {
              seen.add(locM[1]);
              items += `  <url>${m[1]}</url>\n`;
            }
          }
        }
      }
    } catch { /* static union is best-effort */ }
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n' +
      items + '</urlset>\n';
    return new Response(xml, {
      status: 200,
      headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=60' },
    });
  } catch (e) {
    try {
      if (env && env.ASSETS) return env.ASSETS.fetch(new Request(SITE_URL + '/news-sitemap.xml'));
    } catch { /* fall through */ }
    return new Response('sitemap unavailable', { status: 500 });
  }
}
