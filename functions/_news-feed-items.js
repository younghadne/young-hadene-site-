// Shared source list for /news-sitemap.xml and /news-rss.xml.
//
// News lives in two places: KV (`news:index`, binding YH_POSTS) and the repo
// (news/*.html, listed by the build in the static news-sitemap.xml and
// news-rss.xml). Both feeds must list BOTH, deduped by slug, sorted by real
// publish date, before any window or cap is applied. (The old Functions read
// KV first and only topped up from the static files, so 20 KV posts crowded
// every repo post out of the RSS, and the build's date-filtered static
// sitemap was often empty.)
//
// Read-only: this module only calls store.get(); it never writes KV.
import { NEWS_NOINDEX } from './_news-noindex.js';
import { kvPostMs, newsDateMs } from './_news-dates.js';

export const SITE_URL = 'https://younghadene.ca';

export function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function slugFromLoc(loc) {
  const m = String(loc || '').trim().match(/\/news\/([^/?#<\s]+?)(?:\.html)?\/?$/);
  return m ? m[1] : null;
}

function visible(p, now) {
  return p.status === 'published' || !p.status ||
    (p.status === 'scheduled' && p.scheduledFor && Number(p.scheduledFor) <= now);
}

// Slugs removed through the KV `deleted` tombstone (same key /news/<slug> reads).
async function readRemovedNews(store) {
  try {
    const t = await store.get('deleted');
    const tomb = t ? JSON.parse(t) : null;
    return new Set(tomb && Array.isArray(tomb.news) ? tomb.news.map(String) : []);
  } catch {
    return new Set();
  }
}

async function staticText(env, path) {
  try {
    if (!env || !env.ASSETS) return '';
    const r = await env.ASSETS.fetch(new Request(SITE_URL + path));
    return r.ok ? await r.text() : '';
  } catch {
    return '';
  }
}

// Visible KV news posts: [{ slug, ms, post, source: 'kv' }]. Posts without a
// usable date are dropped rather than given "now" (which would fake freshness).
async function kvItems(env, now, skip) {
  const store = env && env.YH_POSTS;
  if (!store) return [];
  let arr = [];
  try {
    const t = await store.get('news:index');
    const parsed = t ? JSON.parse(t) : [];
    if (Array.isArray(parsed)) arr = parsed;
  } catch { arr = []; }
  const out = [];
  for (const p of arr) {
    if (!p || !p.slug || skip(String(p.slug)) || !visible(p, now)) continue;
    const ms = kvPostMs(p, NaN);
    if (!Number.isFinite(ms)) continue;
    out.push({ slug: String(p.slug), ms, post: p, source: 'kv' });
  }
  return out;
}

// Repo posts from a static file the build writes: blocks matching `tag`
// (url|item), with the link tag and date tag named.
function staticItems(text, tag, linkTag, dateTag, skip) {
  const out = [];
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'g');
  let m;
  while ((m = re.exec(text)) !== null) {
    const linkM = m[1].match(new RegExp(`<${linkTag}>([^<]*)<\\/${linkTag}>`));
    const slug = slugFromLoc(linkM && linkM[1]);
    if (!slug || skip(slug)) continue;
    const dM = m[1].match(new RegExp(`<${dateTag}>([^<]*)<\\/${dateTag}>`));
    const ms = dM ? newsDateMs(dM[1]) : NaN;
    if (!Number.isFinite(ms)) continue;
    out.push({ slug, ms, body: m[1], source: 'repo' });
  }
  return out;
}

// Merged, deduped (KV wins on a shared slug, as /news/<slug> serves KV
// first), newest first. `kind` picks which static file supplies repo posts:
// 'sitemap' -> /news-sitemap.xml, 'rss' -> /news-rss.xml.
export async function collectNewsItems(env, kind, now = Date.now()) {
  const store = env && env.YH_POSTS;
  const removed = store ? await readRemovedNews(store) : new Set();
  const skip = (slug) => NEWS_NOINDEX.has(slug) || removed.has(slug);
  const bySlug = new Map();
  for (const it of await kvItems(env, now, skip)) if (!bySlug.has(it.slug)) bySlug.set(it.slug, it);
  const text = await staticText(env, kind === 'rss' ? '/news-rss.xml' : '/news-sitemap.xml');
  const repo = kind === 'rss'
    ? staticItems(text, 'item', 'link', 'pubDate', skip)
    : staticItems(text, 'url', 'loc', 'news:publication_date', skip);
  for (const it of repo) {
    if (it.ms > now) continue; // not published yet
    if (!bySlug.has(it.slug)) bySlug.set(it.slug, it);
  }
  return [...bySlug.values()].sort((a, b) => b.ms - a.ms);
}
