// GET /news-sitemap.xml — Google News sitemap: only news posts published in
// the last 48 hours (KV news:index + static legacy pages), excluding
// NEWS_NOINDEX. Logic lives in _news-sitemap-lib.js (unit-tested by
// scripts/check-news.mjs).
import { buildNewsSitemap } from './_news-sitemap-lib.js';

const SITE_URL = 'https://younghadene.ca';

export async function onRequestGet(context) {
  const { env } = context;
  let arr = [];
  let staticXml = '';
  try {
    const store = env && env.YH_POSTS;
    if (store) {
      const t = await store.get('news:index');
      const parsed = t ? JSON.parse(t) : [];
      if (Array.isArray(parsed)) arr = parsed;
    }
  } catch { arr = []; }
  try {
    if (env && env.ASSETS) {
      const r = await env.ASSETS.fetch(new Request(SITE_URL + '/news-sitemap.xml'));
      if (r.ok) staticXml = await r.text();
    }
  } catch { staticXml = ''; }
  try {
    return new Response(buildNewsSitemap(arr, staticXml, Date.now()), {
      status: 200,
      headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
    });
  } catch {
    return new Response('sitemap unavailable', { status: 500 });
  }
}
