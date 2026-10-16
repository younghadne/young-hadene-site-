// Unit checks for the Google News sitemap (48h window, noindex, drafts) and
// that static news pages carry byline, <time> dates and NewsArticle schema.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildNewsSitemap } from '../functions/_news-sitemap-lib.js';
import { NEWS_NOINDEX } from '../functions/_news-noindex.js';
import { NEWS_AUTHOR } from '../functions/_news-config.js';

const H = 3600 * 1000;
const now = Date.parse('2026-10-15T12:00:00Z');
const noindexSlug = [...NEWS_NOINDEX][0];
const kv = [
  { slug: 'fresh-1h', title: 'Fresh & New — Young Hadene', status: 'published', dateNum: now - 1 * H },
  { slug: 'edge-47h', title: 'Edge', status: 'published', dateNum: now - 47 * H },
  { slug: 'old-49h', title: 'Old', status: 'published', dateNum: now - 49 * H },
  { slug: 'draft', title: 'Draft', status: 'draft', dateNum: now - H },
  { slug: 'future', title: 'Future', status: 'scheduled', scheduledFor: now + H, dateNum: now - H },
  { slug: 'sched-done', title: 'Sched', status: 'scheduled', scheduledFor: now - 2 * H, dateNum: now - 100 * H },
  { slug: noindexSlug, title: 'Offtopic', status: 'published', dateNum: now - H },
];
const staticXml = `<urlset><url><loc>https://younghadene.ca/news/static-fresh</loc><news:news><news:publication_date>${new Date(now - 3 * H).toISOString()}</news:publication_date><news:title>Static Fresh</news:title></news:news></url>
<url><loc>https://younghadene.ca/news/static-old</loc><news:news><news:publication_date>2026-10-10T13:41:02.581Z</news:publication_date><news:title>Static Old</news:title></news:news></url></urlset>`;
const xml = buildNewsSitemap(kv, staticXml, now);
const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace('https://younghadene.ca/news/', ''));
assert.deepEqual(locs.sort(), ['edge-47h', 'fresh-1h', 'sched-done', 'static-fresh'].sort(), 'news sitemap must keep only visible, indexable posts from the last 48h');
assert.match(xml, /xmlns:news="http:\/\/www\.google\.com\/schemas\/sitemap-news\/0\.9"/);
assert.match(xml, /<news:name>Young Hadene<\/news:name>/);
assert.match(xml, /<news:language>en<\/news:language>/);
assert.match(xml, /<news:title>Fresh &amp; New<\/news:title>/);
assert.equal((xml.match(/<news:publication_date>/g) || []).length, 4);
assert.ok(!/<url>/.test(buildNewsSitemap([], '', now)), 'empty input -> empty urlset');

for (const f of fs.readdirSync('news').filter((x) => x.endsWith('.html'))) {
  const s = fs.readFileSync('news/' + f, 'utf8');
  const ld = JSON.parse(s.match(/<script type="application\/ld\+json">(\{[^<]*"NewsArticle"[^<]*\})<\/script>/)[1]);
  for (const k of ['headline', 'author', 'datePublished', 'dateModified', 'publisher', 'mainEntityOfPage']) assert.ok(ld[k], `${f}: NewsArticle missing ${k}`);
  assert.equal(ld.author.name, NEWS_AUTHOR, `${f}: author must match NEWS_AUTHOR`);
  assert.equal(ld.publisher['@id'], 'https://younghadene.ca/#artist', `${f}: publisher @id`);
  assert.match(s, /class="byline"/, `${f}: visible byline`);
  assert.match(s, /<time class="published" datetime="[^"]+">/, `${f}: published <time>`);
  assert.match(s, /<time class="updated" datetime="[^"]+">/, `${f}: updated <time>`);
}
assert.match(fs.readFileSync('robots.txt', 'utf8'), /^Sitemap: https:\/\/younghadene\.ca\/news-sitemap\.xml$/m);
if (/TODO/.test(NEWS_AUTHOR)) console.warn('check-news: WARNING NEWS_AUTHOR is still a placeholder (' + NEWS_AUTHOR + ')');
console.log('check-news: OK');
