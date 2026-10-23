// Shared by scripts/build-static.js (news-sitemap.xml + news-rss.xml),
// scripts/new-news.js and scripts/check-news-dates.mjs.
//
// Repo news dates are Toronto dates. A date-only value ("2026-10-23") means
// midnight in Toronto, NOT midnight UTC (which is 8 PM ET the evening
// before). Values that already carry a time are passed through unchanged.
const fs = require('fs');
const path = require('path');

const TZ = 'America/Toronto';
const SITE_URL = process.env.SITE_URL || 'https://younghadene.ca';
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23', weekday: 'short',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});
function torontoParts(ms) {
  const o = {};
  for (const p of partsFmt.formatToParts(new Date(ms))) o[p.type] = p.value;
  return o;
}
// Toronto's UTC offset in minutes at instant ms (-240 EDT, -300 EST).
function torontoOffsetMin(ms) {
  const p = torontoParts(ms);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}
const pad = (n) => String(n).padStart(2, '0');
function fmtOffset(min, colon = true) {
  const s = min < 0 ? '-' : '+', a = Math.abs(min);
  return s + pad(Math.floor(a / 60)) + (colon ? ':' : '') + pad(a % 60);
}
// Midnight Toronto time on a YYYY-MM-DD date, as epoch ms (EST/EDT-aware).
function torontoMidnightMs(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const utcMid = Date.UTC(y, m - 1, d);
  let t = utcMid - torontoOffsetMin(utcMid) * 60000;
  t = utcMid - torontoOffsetMin(t) * 60000;
  return t;
}
// Epoch ms -> "2026-10-23T00:00:00-04:00" in Toronto time.
function torontoISOFromMs(ms) {
  const p = torontoParts(ms);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${fmtOffset(torontoOffsetMin(ms))}`;
}
// Date-only -> Toronto-midnight ISO; anything with a time is unchanged.
function toTorontoISO(value) {
  const v = String(value || '').trim();
  return DATE_ONLY.test(v) ? torontoISOFromMs(torontoMidnightMs(v)) : v;
}
// Parse a news date: date-only as Toronto midnight, else as written.
function newsDateMs(value) {
  const v = String(value || '').trim();
  if (!v) return NaN;
  return DATE_ONLY.test(v) ? torontoMidnightMs(v) : Date.parse(v);
}
// Calendar day in Toronto, YYYY-MM-DD.
function torontoDay(ms) {
  const p = torontoParts(ms);
  return `${p.year}-${p.month}-${p.day}`;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// RFC 822 RSS date in Toronto time: "Fri, 23 Oct 2026 00:00:00 -0400".
function rssDate(ms) {
  const p = torontoParts(ms);
  return `${p.weekday}, ${p.day} ${MONTHS[+p.month - 1]} ${p.year} ${p.hour}:${p.minute}:${p.second} ${fmtOffset(torontoOffsetMin(ms), false)}`;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function decodeEntities(s) {
  return String(s).replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function extractMeta(html, name) {
  const m = html.match(new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`, 'i')) ||
            html.match(new RegExp(`<meta\\s+content="([^"]*)"\\s+name="${name}"`, 'i'));
  return m ? decodeEntities(m[1]) : '';
}
function extractTitle(html) {
  const m = html.match(/<title>([^<]*)<\/title>/i);
  return m ? m[1].trim() : '';
}
// The article's own publish date as written (JSON-LD datePublished, then
// article:published_time), or '' if it has none.
function publishedRaw(html) {
  const m = html.match(/"datePublished"\s*:\s*"([^"]+)"/i) ||
            html.match(/article:published_time"\s+content="([^"]+)"/i);
  return m ? m[1].trim() : '';
}

// One entry per news/*.html: { f, slug, html, raw, ms }. Falls back to
// mtime (never used for real posts, which all carry datePublished).
function newsEntries(newsDir, exclude = new Set()) {
  if (!fs.existsSync(newsDir)) return [];
  return fs.readdirSync(newsDir).filter((f) => f.endsWith('.html') && !exclude.has(f)).sort().map((f) => {
    const full = path.join(newsDir, f);
    const html = fs.readFileSync(full, 'utf8');
    const raw = publishedRaw(html);
    let ms = newsDateMs(raw);
    if (!Number.isFinite(ms)) { try { ms = fs.statSync(full).mtimeMs; } catch { ms = 0; } }
    return { f, slug: f.replace(/\.html$/, ''), html, raw, ms };
  });
}
// news:publication_date: the article's own value if it has a time, else
// the Toronto-time ISO form.
function sitemapDate(e) {
  return e.raw && !DATE_ONLY.test(e.raw) ? e.raw : (e.raw ? toTorontoISO(e.raw) : torontoISOFromMs(e.ms));
}

function newsSitemapXml(entries, now, windowMs) {
  const fresh = entries.filter((x) => x.ms && now - x.ms < windowMs).sort((a, b) => b.ms - a.ms);
  let news = '<?xml version="1.0" encoding="UTF-8"?>\n';
  news += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n';
  news += '        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n';
  for (const e of fresh) {
    const title = extractTitle(e.html).split('—')[0].split('|')[0].trim() || e.f;
    news += '  <url>\n';
    news += `    <loc>${SITE_URL}/news/${esc(e.slug)}</loc>\n`;
    news += '    <news:news>\n';
    news += '      <news:publication>\n';
    news += '        <news:name>Young Hadene</news:name>\n';
    news += '        <news:language>en</news:language>\n';
    news += '      </news:publication>\n';
    news += `      <news:publication_date>${esc(sitemapDate(e))}</news:publication_date>\n`;
    news += `      <news:title>${esc(title)}</news:title>\n`;
    news += '    </news:news>\n';
    news += '  </url>\n';
  }
  news += '</urlset>\n';
  return { xml: news, count: fresh.length };
}

function newsRssXml(entries, now) {
  const items = entries.slice().sort((a, b) => b.ms - a.ms).slice(0, 20);
  let rss = '<?xml version="1.0" encoding="UTF-8"?>\n';
  rss += '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n<channel>\n';
  rss += '<title>Young Hadene — News</title>\n';
  rss += `<link>${SITE_URL}/news</link>\n`;
  rss += `<atom:link href="${SITE_URL}/news-rss.xml" rel="self" type="application/rss+xml"/>\n`;
  rss += '<description>Latest news from Young Hadene: releases, shows, videos and Toronto drill &amp; dark trap scene updates.</description>\n';
  rss += '<language>en-ca</language>\n';
  rss += `<lastBuildDate>${new Date(now).toUTCString()}</lastBuildDate>\n`;
  for (const e of items) {
    const title = extractTitle(e.html) || e.f;
    const desc = extractMeta(e.html, 'description') || title;
    rss += '  <item>\n';
    rss += `    <title>${esc(title)}</title>\n`;
    rss += `    <link>${SITE_URL}/news/${esc(e.slug)}</link>\n`;
    rss += `    <guid isPermaLink="true">${SITE_URL}/news/${esc(e.slug)}</guid>\n`;
    rss += `    <pubDate>${rssDate(e.ms)}</pubDate>\n`;
    rss += `    <description>${esc(desc)}</description>\n`;
    rss += '  </item>\n';
  }
  rss += '</channel>\n</rss>\n';
  return { xml: rss, count: items.length };
}

module.exports = {
  TZ, DATE_ONLY, torontoOffsetMin, torontoMidnightMs, torontoISOFromMs, toTorontoISO, newsDateMs,
  torontoDay, rssDate, publishedRaw, newsEntries, sitemapDate, newsSitemapXml, newsRssXml,
};
