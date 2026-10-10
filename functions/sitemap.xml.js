// GET /sitemap.xml — dynamic sitemap: static base pages + every visible
// KV post (published + past-due scheduled only). New posts are included
// instantly, no rebuild. Static entries are kept as fallback and KV wins
// on duplicate URLs, so nothing is ever lost (including pre-migration).
// If this route does not take precedence over the static file, the static
// sitemap.xml keeps serving and this file is inert.
const SITE_URL = 'https://younghadene.ca';

const STATIC_PAGES = [
  { loc: '/', changefreq: 'monthly', priority: '1.0' },
  { loc: '/music.html', changefreq: 'monthly', priority: '0.9' },
  { loc: '/blog.html', changefreq: 'weekly', priority: '0.9' },
  { loc: '/news.html', changefreq: 'daily', priority: '0.9' },
  { loc: '/about.html', changefreq: 'monthly', priority: '0.8' },
  { loc: '/contact.html', changefreq: 'monthly', priority: '0.7' },
  { loc: '/services.html', changefreq: 'monthly', priority: '0.7' },
  { loc: '/editorial-policy.html', changefreq: 'yearly', priority: '0.5' },
  { loc: '/corrections-policy.html', changefreq: 'yearly', priority: '0.5' },
];

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isVisible(doc, now) {
  if (!doc) return false;
  if (doc.status === 'published' || !doc.status) return true;
  if (doc.status === 'scheduled' && doc.scheduledFor && Number(doc.scheduledFor) <= now) return true;
  return false;
}

function lastmodOf(p) {
  try {
    const t = p.updatedAt || p.dateNum || 0;
    if (!t) return '';
    return new Date(Number(t)).toISOString().substring(0, 10);
  } catch {
    return '';
  }
}

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const now = Date.now();
    const seen = new Set();
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    for (const p of STATIC_PAGES) {
      xml += `  <url><loc>${SITE_URL}${p.loc}</loc><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>\n`;
      seen.add(SITE_URL + p.loc);
    }
    const store = env && env.YH_POSTS;
    if (store) {
      for (const key of ['blog:index', 'news:index']) {
        let arr = [];
        try {
          const t = await store.get(key);
          const parsed = t ? JSON.parse(t) : [];
          if (Array.isArray(parsed)) arr = parsed;
        } catch { arr = []; }
        const section = key.startsWith('blog') ? 'blog' : 'news';
        const cf = section === 'blog' ? 'monthly' : 'weekly';
        const pr = section === 'blog' ? '0.8' : '0.9';
        for (const p of arr) {
          if (!p || !p.slug || !isVisible(p, now)) continue;
          const loc = `${SITE_URL}/${section}/${p.slug}.html`;
          if (seen.has(loc)) continue;
          seen.add(loc);
          const lm = lastmodOf(p);
          xml += `  <url><loc>${esc(loc)}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ''}<changefreq>${cf}</changefreq><priority>${pr}</priority></url>\n`;
        }
      }
    }
    // Union with the static sitemap (pre-migration entries, if any).
    try {
      if (env && env.ASSETS) {
        const r = await env.ASSETS.fetch(new Request(SITE_URL + '/sitemap.xml'));
        if (r.ok) {
          const text = await r.text();
          const re = /<url>([\s\S]*?)<\/url>/g;
          let m;
          while ((m = re.exec(text)) !== null) {
            const locM = m[1].match(/<loc>([^<]*)<\/loc>/);
            if (locM && !seen.has(locM[1])) {
              seen.add(locM[1]);
              xml += `  <url>${m[1]}</url>\n`;
            }
          }
        }
      }
    } catch { /* static union is best-effort */ }
    xml += '</urlset>\n';
    return new Response(xml, {
      status: 200,
      headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=60' },
    });
  } catch (e) {
    try {
      if (env && env.ASSETS) return env.ASSETS.fetch(new Request(SITE_URL + '/sitemap.xml'));
    } catch { /* fall through */ }
    return new Response('sitemap unavailable', { status: 500 });
  }
}
