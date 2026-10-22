// Pure Google News sitemap builder (shared by functions/news-sitemap.xml.js
// and scripts/check-news.mjs). Only posts published in the last 48 hours,
// never NEWS_NOINDEX slugs, never drafts / future-scheduled posts.
import { NEWS_NOINDEX } from './_news-noindex.js';
import { SITE_URL, NEWS_PUBLICATION_NAME, NEWS_LANGUAGE, NEWS_WINDOW_MS } from './_news-config.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function unesc(s) {
  return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
function titleOf(p) {
  return String((p && p.title) || (p && p.slug) || '').split('—')[0].split('|')[0].trim();
}
function fresh(ms, now) {
  return Number.isFinite(ms) && ms > 0 && ms <= now && now - ms <= NEWS_WINDOW_MS;
}
function urlXml(loc, pubIso, title) {
  return '  <url>\n    <loc>' + esc(loc) + '</loc>\n    <news:news>\n      <news:publication>\n        <news:name>' + NEWS_PUBLICATION_NAME + '</news:name>\n        <news:language>' + NEWS_LANGUAGE + '</news:language>\n      </news:publication>\n      <news:publication_date>' + pubIso + '</news:publication_date>\n      <news:title>' + esc(title) + '</news:title>\n    </news:news>\n  </url>\n';
}
function slugOfLoc(loc) {
  const m = String(loc).match(/\/news\/([^/?#]+?)(?:\.html)?$/);
  return m ? m[1] : '';
}

// kvIndex: array of KV news docs; staticXml: text of the static news-sitemap.xml (or '').
export function buildNewsSitemap(kvIndex, staticXml, now) {
  now = Number(now) || Date.now();
  const seen = new Set();
  let items = '';
  for (const p of Array.isArray(kvIndex) ? kvIndex : []) {
    if (!p || !p.slug || NEWS_NOINDEX.has(p.slug)) continue;
    const vis = p.status === 'published' || !p.status ||
      (p.status === 'scheduled' && p.scheduledFor && Number(p.scheduledFor) <= now);
    if (!vis) continue;
    // Publication time: scheduled posts go live at scheduledFor.
    const pubMs = p.status === 'scheduled' ? Number(p.scheduledFor) : Number(p.dateNum);
    if (!fresh(pubMs, now)) continue;
    const loc = `${SITE_URL}/news/${p.slug}`;
    if (seen.has(loc)) continue;
    seen.add(loc);
    items += urlXml(loc, new Date(pubMs).toISOString(), titleOf(p));
  }
  // Static (pre-KV) news pages: same 48h + noindex rules.
  const re = /<url>([\s\S]*?)<\/url>/g;
  let m;
  while ((m = re.exec(String(staticXml || ''))) !== null) {
    const locM = m[1].match(/<loc>([^<]*)<\/loc>/);
    const dateM = m[1].match(/<news:publication_date>([^<]*)<\/news:publication_date>/);
    const titleM = m[1].match(/<news:title>([^<]*)<\/news:title>/);
    if (!locM || !dateM || !titleM) continue;
    const loc = unesc(locM[1].trim());
    if (seen.has(loc) || NEWS_NOINDEX.has(slugOfLoc(loc))) continue;
    const pubMs = Date.parse(dateM[1].trim());
    if (!fresh(pubMs, now)) continue;
    seen.add(loc);
    items += urlXml(loc, new Date(pubMs).toISOString(), unesc(titleM[1].trim()));
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n' +
    items + '</urlset>\n';
}
