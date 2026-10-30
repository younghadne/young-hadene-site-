// Guard for repo-first news posts (scripts/news/<slug>.md -> news/<slug>.html).
// Fails on: missing author / datePublished / source link, leftover
// [CONFIRM] / [VERIFY] / [HELD] markers, a built page that is stale or lacks
// title, description, canonical, NewsArticle schema (Organization author,
// datePublished, source URL), a slug in BLOG_REDIRECTS / NEWS_NOINDEX /
// _redirects, an internal link to a redirected URL, literal markdown markers
// (* or _x_) in FAQ text or FAQPage JSON-LD, or a post missing from
// the news.html listing, news-sitemap.xml or news-rss.xml, or a listing card /
// news-sitemap / RSS entry that differs from what the build writes for it.
// Dates: datePublished and optional dateModified are YYYY-MM-DD or a full ISO
// timestamp with an offset (normalised to Toronto time); dateModified must not
// be before datePublished, and must reach the NewsArticle schema, the
// article:modified_time meta and the news-sitemap <lastmod>.
import fs from 'node:fs';
import { listSources, parse, buildPage, renderBody, olStart, card, sitemapItem, rssItem, modified, normNewsDate, SITE } from './news-posts-lib.mjs';

const load = (f, name) => new Function(fs.readFileSync('functions/' + f, 'utf8').replace(/export const /g, 'const ') + `; return ${name};`)();
const BLOG_REDIRECTS = load('_blog-redirects.js', 'BLOG_REDIRECTS');
const NEWS_NOINDEX = load('_news-noindex.js', 'NEWS_NOINDEX');
const redirSources = new Set();
for (const l of (fs.existsSync('_redirects') ? fs.readFileSync('_redirects', 'utf8') : '').split('\n')) {
  const t = l.trim(); if (t && !t.startsWith('#')) redirSources.add(t.split(/\s+/)[0].replace(/\.html$/, '').replace(/\/$/, ''));
}
const isRedirected = (u) => {
  const p = u.replace(/[#?].*$/, '').replace(/\.html$/, '').replace(/\/$/, '');
  const b = p.match(/^\/blog\/([^/]+)$/);
  return redirSources.has(p) || (b && BLOG_REDIRECTS[b[1]]) || false;
};
const pageExists = (u) => {
  const p = u.replace(/[#?].*$/, '').replace(/\/$/, '').replace(/^\//, '');
  return [p + '.html', p + '/index.html'].some((f) => fs.existsSync(f));
};

const bad = [];
// Date normalisation self-test (Toronto time, EDT and EST).
for (const [inp, want] of [
  ['2026-10-23', '2026-10-23'], ['2026-10-30T12:00:00-04:00', '2026-10-30T12:00:00-04:00'],
  ['2026-10-30T16:00:00Z', '2026-10-30T12:00:00-04:00'], ['2026-10-30T12:00-0400', '2026-10-30T12:00:00-04:00'],
  ['2026-12-01T17:30:00.000Z', '2026-12-01T12:30:00-05:00'], ['2026-10-30T12:00:00', null], ['Oct 30, 2026', null], ['2026-13-01', null],
]) if (normNewsDate(inp) !== want) bad.push(`normNewsDate(${inp}) gave ${normNewsDate(inp)}, expected ${want}`);
// Ordered-list self-test: real lists only, and <ol start> when not from 1.
for (const [md, want] of [
  ['1. A\n2. B', '<ol><li>A</li><li>B</li></ol>'],
  ['3. C\n4. D\n5. E', '<ol start="3"><li>C</li><li>D</li><li>E</li></ol>'],
  ['2026. That year changed things.', '<p>2026. That year changed things.</p>'],
  ['2026. That year\n2027. The next', '<p>2026. That year<br>2027. The next</p>'],
  ['1. Only one item', '<p>1. Only one item</p>'],
  ['1. A\n3. B', '<p>1. A<br>3. B</p>'],
  ['0. A\n1. B', '<p>0. A<br>1. B</p>'],
]) { const got = renderBody(md).html; if (got !== want) bad.push(`renderBody(${JSON.stringify(md)}) gave ${got}, expected ${want}`); }
if (olStart(['3. a', '4. b']) !== 3 || olStart(['2026. a', '2027. b']) !== 0) bad.push('olStart self-test failed');
const block = (doc, re) => (doc.match(re) || [])[0] || '';
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const files = listSources();
const listing = fs.readFileSync('news.html', 'utf8');
const sm = fs.readFileSync('news-sitemap.xml', 'utf8');
const rss = fs.readFileSync('news-rss.xml', 'utf8');
for (const file of files) {
  let p;
  try { p = parse(file); } catch (e) { bad.push(e.message); continue; }
  const { fm, slug, sources, raw } = p;
  const err = (m) => bad.push(`${file}: ${m}`);
  for (const mk of raw.match(/\[(CONFIRM|VERIFY|HELD)[^\]]*\]/gi) || []) err(`leftover marker ${mk}`);
  if (!fm.title) err('missing title');
  if (fm.slug !== '/news/' + slug) err(`front matter slug must be /news/${slug} (got ${fm.slug || 'nothing'})`);
  if (!fm.meta_description) err('missing meta_description');
  if (!fm.author || !fm.author.name) err('missing author name');
  if (!fm.author || fm.author['@type'] !== 'Organization') err('author @type must be Organization');
  if (!fm.datePublished) err('missing datePublished (YYYY-MM-DD or full ISO with offset)');
  if (fm.dateModified && !(p.modMs >= p.pubMs)) err(`dateModified ${fm.dateModified} is before datePublished ${fm.datePublished}`);
  if (!sources.length || sources.some((s) => !/^https:\/\/\S+$/.test(s.url))) err('missing source link in front matter `sources`');
  if (sources.some((s) => s.url && !p.body.includes(`](${s.url})`))) err('source URL is not linked in the post body');
  if (BLOG_REDIRECTS[slug]) err('slug is in BLOG_REDIRECTS');
  if (NEWS_NOINDEX.has(slug)) err('slug is in NEWS_NOINDEX');
  if (isRedirected('/news/' + slug)) err('/news/' + slug + ' is a redirect source in _redirects');
  for (const m of p.body.matchAll(/\]\((\/[^)\s]*)\)/g)) {
    if (isRedirected(m[1])) err(`internal link ${m[1]} is a redirected URL`);
    else if (!pageExists(m[1])) err(`internal link ${m[1]} has no page file`);
  }
  const out = `news/${slug}.html`;
  if (!fs.existsSync(out)) { err(`${out} not built (run node scripts/build-news-posts.mjs)`); continue; }
  const html = fs.readFileSync(out, 'utf8');
  if (html !== buildPage(p)) err(`${out} is stale (run node scripts/build-news-posts.mjs)`);
  if (!/<title>[^<]+<\/title>/.test(html)) err('page has no <title>');
  if (!html.includes(`<link rel="canonical" href="${SITE}/news/${slug}">`)) err('page canonical is not the clean /news URL');
  const j = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])).find((o) => o['@type'] === 'NewsArticle');
  if (!j) err('page has no NewsArticle schema');
  else {
    if (!j.author || j.author['@type'] !== 'Organization' || !j.author.name) err('schema author is not a named Organization');
    if (j.datePublished !== fm.datePublished) err('schema datePublished does not match front matter');
    if (j.dateModified !== modified(p)) err(`schema dateModified ${j.dateModified} should be ${modified(p)} (front-matter dateModified, else datePublished)`);
    if (!sources.every((s) => (j.isBasedOn || []).includes(s.url))) err('schema isBasedOn is missing the source URL');
  }
  for (const s of sources) if (!html.includes(`href="${s.url}"`)) err(`page does not link the source ${s.url}`);
  // FAQ text must not show markdown markers (e.g. nested *italic* inside
  // **bold** that the converter left as literal asterisks).
  const faq = (html.match(/<h2>(?:FAQ|Frequently Asked Questions)<\/h2>([\s\S]*?)(?=<h2>|<div class="correction-note">|<\/article>)/i) || [])[1];
  if (faq) {
    for (const blk of faq.split(/<\/p>|<\/li>|<br>/)) {
      const t = blk.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (/\*|(^|[\s(])_\S|\S_($|[\s.,;:!?)])/.test(t)) err(`FAQ text has a literal markdown marker: "${t}"`);
    }
  }
  const walkFaq = (o) => {
    if (!o || typeof o !== 'object') return;
    if (o['@type'] === 'Question') for (const t of [o.name, o.acceptedAnswer && o.acceptedAnswer.text]) if (typeof t === 'string' && t.includes('*')) err(`FAQPage JSON-LD has a literal asterisk: "${t}"`);
    Object.values(o).forEach(walkFaq);
  };
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) walkFaq(JSON.parse(m[1]));
  const mod = (html.match(/<meta property="article:modified_time" content="([^"]*)">/) || [])[1];
  if ((mod || null) !== (fm.dateModified || null)) err(`article:modified_time is ${mod || 'missing'}, front-matter dateModified is ${fm.dateModified || 'unset'}`);
  const u = reEsc(`/news/${slug}`);
  const cardBlk = block(listing, new RegExp(`        <a class="news-card" href="${u}"[^>]*>\\n[\\s\\S]*?</a>\\n`));
  const smBlk = block(sm, new RegExp(`  <url>\\n    <loc>${reEsc(SITE)}${u}</loc>\\n[\\s\\S]*?</url>\\n`));
  const rssBlk = block(rss, new RegExp(`  <item>\\n    <title>[^<]*</title>\\n    <link>${reEsc(SITE)}${u}</link>\\n[\\s\\S]*?</item>\\n`));
  if (cardBlk && cardBlk !== card(p)) err('news.html card is stale (title, description, date or data-published; run node scripts/build-news-posts.mjs)');
  if (smBlk && smBlk !== sitemapItem(p)) err('news-sitemap.xml entry is stale (title, publication_date or lastmod; run node scripts/build-news-posts.mjs)');
  if (rssBlk && rssBlk !== rssItem(p)) err('news-rss.xml item is stale (title, description or pubDate; run node scripts/build-news-posts.mjs)');
  if (smBlk && /<lastmod>/.test(smBlk) !== !!fm.dateModified) err('news-sitemap.xml <lastmod> must be present exactly when dateModified is set');
  if (!listing.includes(`href="/news/${slug}"`)) err('missing from news.html listing');
  if (!sm.includes(`<loc>${SITE}/news/${slug}</loc>`)) err('missing from news-sitemap.xml');
  if (!rss.includes(`<link>${SITE}/news/${slug}</link>`)) err('missing from news-rss.xml');
}
if (bad.length) { console.error('NEWS-POSTS-CHECK FAIL:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`NEWS-POSTS-CHECK OK: ${files.length} repo news posts have author, date, linked source, no markers, schema, and listing/sitemap/RSS entries.`);
