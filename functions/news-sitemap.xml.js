// GET /news-sitemap.xml — Google News sitemap built at request time from
// KV news posts plus the repo's news/*.html posts (the static
// news-sitemap.xml the build writes lists every repo post; the 2-day window
// is applied here, not at build time, so a deploy can never freeze a stale
// list). Off-topic (NEWS_NOINDEX) and removed posts are left out.
//
// Window (owner decision 2026-10-30): strictly the last 2 days, as Google
// News reads them. When nothing is that fresh the response is a valid,
// empty <urlset> (no padding with older posts). FALLBACK_COUNT > 0 would
// instead list that many newest articles with their real dates.
// X-News-Sitemap header: "fresh" (>= 1 article from the last 2 days),
// "empty" (none; valid empty urlset), "fallback" (only if FALLBACK_COUNT > 0).
// On an unexpected error the Function answers 503 + Retry-After rather than
// the static file, which lists every repo post and would break the window.
import { collectNewsItems, esc, SITE_URL } from './_news-feed-items.js';
import { torontoISOFromMs } from './_news-dates.js';

export const WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
export const FALLBACK_COUNT = 0;
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
  if (FALLBACK_COUNT > 0) return { mode: 'fallback', items: all.slice(0, FALLBACK_COUNT) };
  return { mode: 'empty', items: [] };
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
    return new Response('news sitemap temporarily unavailable\n', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '300', 'Cache-Control': 'no-store', 'X-News-Sitemap': 'error' },
    });
  }
}
