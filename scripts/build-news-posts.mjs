// Builds repo-first news posts: scripts/news/<slug>.md -> news/<slug>.html,
// and adds each post (once) to the news.html listing, news-sitemap.xml and
// news-rss.xml. Idempotent. Run: node scripts/build-news-posts.mjs
// Afterwards run `npm run sitemap` so sitemap.xml picks up the new pages.
import fs from 'node:fs';
import { listSources, parse, buildPage, card, sitemapItem, rssItem } from './news-posts-lib.mjs';

const posts = listSources().map(parse).sort((a, b) => a.fm.datePublished.localeCompare(b.fm.datePublished) || b.slug.localeCompare(a.slug));
let listing = fs.readFileSync('news.html', 'utf8');
let sm = fs.readFileSync('news-sitemap.xml', 'utf8');
let rss = fs.readFileSync('news-rss.xml', 'utf8');
for (const p of posts) { // oldest first; each insert goes on top, so newest ends up first
  fs.writeFileSync(`news/${p.slug}.html`, buildPage(p));
  if (!listing.includes(`href="/news/${p.slug}"`)) listing = listing.replace('<div class="news-grid">\n', (m) => m + card(p));
  if (!sm.includes(`/news/${p.slug}</loc>`)) sm = sm.replace(/(<urlset[^>]*>\n)/, (m) => m + sitemapItem(p));
  if (!rss.includes(`/news/${p.slug}</link>`)) rss = rss.replace(/(<lastBuildDate>[^<]*<\/lastBuildDate>\n)/, (m) => m + rssItem(p));
  console.log(`built news/${p.slug}.html`);
}
fs.writeFileSync('news.html', listing);
fs.writeFileSync('news-sitemap.xml', sm);
fs.writeFileSync('news-rss.xml', rss);
