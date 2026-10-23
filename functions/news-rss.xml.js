// GET /news-rss.xml — dynamic news RSS. Visible KV news posts and the
// repo-file posts listed in the static news-rss.xml are merged, sorted by
// date (newest first) and capped at 20. Off-topic slugs (NEWS_NOINDEX) and
// removed (tombstoned) posts are left out. New KV items appear instantly.
import { NEWS_NOINDEX } from './_news-noindex.js';

const SITE_URL = 'https://younghadene.ca';
const LIMIT = 20;

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function itemXml(p) {
  const link = `${SITE_URL}/news/${p.slug}`;
  const desc = String(p.excerpt || p.content || p.title || '').replace(/[#*>\-\[\]()`]/g, '').trim().substring(0, 300);
  return '  <item>\n    <title>' + esc(p.title) + '</title>\n    <link>' + esc(link) + '</link>\n    <guid isPermaLink="true">' + esc(link) + '</guid>\n    <description>' + esc(desc) + '</description>\n    <pubDate>' + new Date(Number(p.dateNum) || Date.now()).toUTCString() + '</pubDate>\n    <category>' + esc(p.category || 'News') + '</category>\n  </item>\n';
}

function slugFromLink(link) {
  const m = String(link || '').trim().match(/\/news\/([^/?#<\s]+)\/?$/);
  return m ? m[1].replace(/\.html$/, '') : null;
}

async function readRemoved(store) {
  try {
    const t = await store.get('deleted');
    const tomb = t ? JSON.parse(t) : null;
    return new Set(tomb && Array.isArray(tomb.news) ? tomb.news.map(String) : []);
  } catch {
    return new Set();
  }
}

// Exported for scripts/check-news-rss.mjs.
export async function collectItems(env, now = Date.now()) {
  const store = env && env.YH_POSTS;
  const removed = store ? await readRemoved(store) : new Set();
  const skip = slug => !slug || NEWS_NOINDEX.has(slug) || removed.has(slug);
  const bySlug = new Map();
  if (store) {
    let arr = [];
    try {
      const t = await store.get('news:index');
      const parsed = t ? JSON.parse(t) : [];
      if (Array.isArray(parsed)) arr = parsed;
    } catch { arr = []; }
    for (const p of arr) {
      if (!p || !p.slug || skip(p.slug) || bySlug.has(p.slug)) continue;
      const vis = p.status === 'published' || !p.status ||
        (p.status === 'scheduled' && p.scheduledFor && Number(p.scheduledFor) <= now);
      if (!vis) continue;
      bySlug.set(p.slug, { slug: p.slug, date: Number(p.dateNum) || 0, xml: itemXml(p) });
    }
  }
  try {
    if (env && env.ASSETS) {
      const r = await env.ASSETS.fetch(new Request(SITE_URL + '/news-rss.xml'));
      if (r.ok) {
        const text = await r.text();
        const re = /<item>([\s\S]*?)<\/item>/g;
        let m;
        while ((m = re.exec(text)) !== null) {
          const linkM = m[1].match(/<link>([^<]*)<\/link>/);
          const slug = slugFromLink(linkM && linkM[1]);
          // KV wins when a slug exists in both.
          if (skip(slug) || bySlug.has(slug)) continue;
          const dM = m[1].match(/<pubDate>([^<]*)<\/pubDate>/);
          const date = (dM && Date.parse(dM[1])) || 0;
          bySlug.set(slug, { slug, date, xml: `  <item>${m[1]}</item>\n` });
        }
      }
    }
  } catch { /* static merge is best-effort */ }
  return [...bySlug.values()].sort((a, b) => b.date - a.date).slice(0, LIMIT);
}

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const items = (await collectItems(env)).map(i => i.xml).join('');
    const rss = '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n<channel>\n<title>Young Hadene — News</title>\n<link>' + SITE_URL + '/news</link>\n<description>Latest news from Young Hadene: releases, shows, videos and Toronto drill &amp; dark trap scene updates.</description>\n<language>en-ca</language>\n' +
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
