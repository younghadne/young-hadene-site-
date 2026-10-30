// GET /news-sitemap.xml — Google News sitemap built at request time from
// KV news posts plus the repo's news/*.html posts (the static
// news-sitemap.xml the build writes lists every repo post; the 2-day window
// is applied here, not at build time, so a deploy can never freeze an empty
// list). Off-topic (NEWS_NOINDEX) and removed posts are left out.
//
// Window: Google News reads articles published in the last 2 days. When
// nothing is that fresh, the sitemap falls back to the newest
// FALLBACK_COUNT articles with their REAL publication dates instead of
// serving an empty <urlset>. Google simply skips the stale entries for News
// purposes (no penalty) and still sees the URLs; set FALLBACK_COUNT to 0 to
// serve a strictly 2-day sitemap. The X-News-Sitemap header says which mode
// answered ("fresh" or "fallback").
import { collectNewsItems, esc, SITE_URL } from './_news-feed-items.js';
import { torontoISOFromMs } from './_news-dates.js';

export const WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
export const FALLBACK_COUNT = 10;
const MAX_URLS = 1000; // Google News sitemap limit

function cleanTitle(s) {
  return String(s || '').split('—')[0].split('|')[0].trim();
}

function decode(s) {
  return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&');
}

function titleOf(it) {
  if (it.source === 'kv') return cleanTitle(it.post.title || it.slug);
  const m = it.body.match(/<news:title>([^<]*)<\/news:title>/);
  return cleanTitle(m ? decode(m[1]) : it.slug);
}

function urlXml(it) {
  const loc = `${SITE_URL}/news/${it.slug}`;
  return '  <url>\n    <loc>' + esc(loc) + '</loc>\n    <news:news>\n      <news:publication>\n        <news:name>Young Hadene</news:name>\n        <news:language>en</news:language>\n      </news:publication>\n      <news:publication_date>' + torontoISOFromMs(it.ms) + '</news:publication_date>\n      <news:title>' + esc(titleOf(it)) + '</news:title>\n    </news:news>\n  </url>\n';
}

// Exported for scripts/check-news-feeds.mjs.
export async function selectSitemapItems(env, now = Date.now()) {
  const all = await collectNewsItems(env, 'sitemap', now);
  const fresh = all.filter((it) => now - it.ms <= WINDOW_MS);
  if (fresh.length) return { mode: 'fresh', items: fresh.slice(0, MAX_URLS) };
  return { mode: 'fallback', items: all.slice(0, FALLBACK_COUNT) };
}

export function sitemapXml(items) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n' +
    items.map(urlXml).join('') + '</urlset>\n';
}

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const { mode, items } = await selectSitemapItems(env);
    return new Response(sitemapXml(items), {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=60',
        'X-News-Sitemap': mode,
      },
    });
  } catch (e) {
    try {
      if (env && env.ASSETS) return env.ASSETS.fetch(new Request(SITE_URL + '/news-sitemap.xml'));
    } catch { /* fall through */ }
    return new Response('sitemap unavailable', { status: 500 });
  }
}
