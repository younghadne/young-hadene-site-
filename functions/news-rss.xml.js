// GET /news-rss.xml — dynamic news RSS from KV (latest 20), unioned with
// the static file so nothing is lost. New items appear instantly, no rebuild.
const SITE_URL = 'https://younghadene.ca';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function itemXml(p) {
  const link = `${SITE_URL}/news/${p.slug}.html`;
  const desc = String(p.excerpt || p.content || p.title || '').replace(/[#*>\-\[\]()`]/g, '').trim().substring(0, 300);
  return '  <item>\n    <title>' + esc(p.title) + '</title>\n    <link>' + esc(link) + '</link>\n    <guid isPermaLink="true">' + esc(link) + '</guid>\n    <description>' + esc(desc) + '</description>\n    <pubDate>' + new Date(Number(p.dateNum) || Date.now()).toUTCString() + '</pubDate>\n    <category>' + esc(p.category || 'News') + '</category>\n  </item>\n';
}

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const now = Date.now();
    const seen = new Set();
    let items = '';
    let count = 0;
    const store = env && env.YH_POSTS;
    if (store) {
      let arr = [];
      try {
        const t = await store.get('news:index');
        const parsed = t ? JSON.parse(t) : [];
        if (Array.isArray(parsed)) arr = parsed;
      } catch { arr = []; }
      arr.sort((a, b) => (Number(b.dateNum) || 0) - (Number(a.dateNum) || 0));
      for (const p of arr) {
        if (count >= 20 || !p || !p.slug) continue;
        const vis = p.status === 'published' || !p.status ||
          (p.status === 'scheduled' && p.scheduledFor && Number(p.scheduledFor) <= now);
        if (!vis) continue;
        const link = `${SITE_URL}/news/${p.slug}.html`;
        if (seen.has(link)) continue;
        seen.add(link);
        items += itemXml(p);
        count++;
      }
    }
    try {
      if (env && env.ASSETS && count < 20) {
        const r = await env.ASSETS.fetch(new Request(SITE_URL + '/news-rss.xml'));
        if (r.ok) {
          const text = await r.text();
          const re = /<item>([\s\S]*?)<\/item>/g;
          let m;
          while ((m = re.exec(text)) !== null && count < 20) {
            const linkM = m[1].match(/<link>([^<]*)<\/link>/);
            if (linkM && !seen.has(linkM[1])) {
              seen.add(linkM[1]);
              items += `  <item>${m[1]}</item>\n`;
              count++;
            }
          }
        }
      }
    } catch { /* static union is best-effort */ }
    const rss = '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n<channel>\n<title>Young Hadene — News</title>\n<link>' + SITE_URL + '/news.html</link>\n<description>Latest news from Young Hadene: releases, shows, videos and Toronto drill &amp; dark trap scene updates.</description>\n<language>en-ca</language>\n' +
      items + '</channel>\n</rss>\n';
    return new Response(rss, {
      status: 200,
      headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=60' },
    });
  } catch (e) {
    try {
      if (env && env.ASSETS) return env.ASSETS.fetch(new Request(SITE_URL + '/news-rss.xml'));
    } catch { /* fall through */ }
    return new Response('feed unavailable', { status: 500 });
  }
}
