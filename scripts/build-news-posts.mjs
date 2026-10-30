// Builds repo-first news posts: scripts/news/<slug>.md -> news/<slug>.html,
// and adds each post to the news.html listing, news-sitemap.xml and
// news-rss.xml, or rewrites its existing entry in place (so an updated title,
// description or dateModified reaches all three). Idempotent.
// Run: node scripts/build-news-posts.mjs
// Afterwards run `npm run sitemap` so sitemap.xml picks up the new pages.
import fs from 'node:fs';
import { listSources, parse, buildPage, card, sitemapItem, rssItem, SITE } from './news-posts-lib.mjs';

const posts = listSources().map(parse).sort((a, b) => a.pubMs - b.pubMs || b.slug.localeCompare(a.slug));
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Replace the post's existing block if there is one, else insert at the top.
const upsert = (doc, re, fresh, insert) => re.test(doc) ? doc.replace(re, () => fresh) : insert(doc);
let listing = fs.readFileSync('news.html', 'utf8');
let sm = fs.readFileSync('news-sitemap.xml', 'utf8');
let rss = fs.readFileSync('news-rss.xml', 'utf8');
for (const p of posts) { // oldest first; each insert goes on top, so newest ends up first
  fs.writeFileSync(`news/${p.slug}.html`, buildPage(p));
  const u = reEsc(`/news/${p.slug}`);
  listing = upsert(listing, new RegExp(`        <a class="news-card" href="${u}"[^>]*>\\n[\\s\\S]*?</a>\\n`), card(p),
    (d) => d.replace('<div class="news-grid">\n', (m) => m + card(p)));
  sm = upsert(sm, new RegExp(`  <url>\\n    <loc>${reEsc(SITE)}${u}</loc>\\n[\\s\\S]*?</url>\\n`), sitemapItem(p),
    (d) => d.replace(/(<urlset[^>]*>\n)/, (m) => m + sitemapItem(p)));
  rss = upsert(rss, new RegExp(`  <item>\\n    <title>[^<]*</title>\\n    <link>${reEsc(SITE)}${u}</link>\\n[\\s\\S]*?</item>\\n`), rssItem(p),
    (d) => d.replace(/(<lastBuildDate>[^<]*<\/lastBuildDate>\n)/, (m) => m + rssItem(p)));
  console.log(`built news/${p.slug}.html`);
}
fs.writeFileSync('news.html', listing);
fs.writeFileSync('news-sitemap.xml', sm);
fs.writeFileSync('news-rss.xml', rss);
