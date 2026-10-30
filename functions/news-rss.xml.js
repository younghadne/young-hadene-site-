// GET /news-rss.xml — news RSS built at request time: visible KV news posts
// and the repo's news/*.html posts (from the static news-rss.xml the build
// writes) are merged, deduped by slug (KV wins, as /news/<slug> serves KV
// first), sorted by publish date and THEN capped at 20. Off-topic
// (NEWS_NOINDEX) and removed posts are left out. Dates are Toronto time.
import { collectNewsItems, esc, SITE_URL } from './_news-feed-items.js';
import { rssDate } from './_news-dates.js';

export const LIMIT = 20;

function kvItemXml(it) {
  const p = it.post;
  const link = `${SITE_URL}/news/${it.slug}`;
  const desc = String(p.excerpt || p.content || p.title || '').replace(/[#*>\-\[\]()`]/g, '').trim().substring(0, 300);
  return '  <item>\n    <title>' + esc(p.title) + '</title>\n    <link>' + esc(link) + '</link>\n    <guid isPermaLink="true">' + esc(link) + '</guid>\n    <description>' + esc(desc) + '</description>\n    <pubDate>' + rssDate(it.ms) + '</pubDate>\n    <category>' + esc(p.category || 'News') + '</category>\n  </item>\n';
}

// Repo items keep the build's title/description; the date is re-written in
// Toronto time so both sources read the same way.
function repoItemXml(it) {
  return '  <item>' + it.body.replace(/<pubDate>[^<]*<\/pubDate>/, `<pubDate>${rssDate(it.ms)}</pubDate>`) + '</item>\n';
}

// Exported for scripts/check-news-feeds.mjs.
export async function selectRssItems(env, now = Date.now()) {
  return (await collectNewsItems(env, 'rss', now)).slice(0, LIMIT);
}

export function rssXml(items) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n<channel>\n<title>Young Hadene — News</title>\n<link>' + SITE_URL + '/news</link>\n<description>Latest news from Young Hadene: releases, shows, videos and Toronto drill &amp; dark trap scene updates.</description>\n<language>en-ca</language>\n' +
    items.map((it) => (it.source === 'kv' ? kvItemXml(it) : repoItemXml(it))).join('') + '</channel>\n</rss>\n';
}

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const items = await selectRssItems(env);
    return new Response(rssXml(items), {
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
