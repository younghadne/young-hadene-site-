// Guard: news-sitemap.xml and news-rss.xml must use clean canonical
// /news/<slug> URLs (no .html), as written by scripts/build-static.js.
import fs from 'node:fs';
let bad = [];
for (const file of ['news-sitemap.xml', 'news-rss.xml']) {
  if (!fs.existsSync(file)) continue;
  const txt = fs.readFileSync(file, 'utf8');
  for (const m of txt.matchAll(/https?:\/\/[^\s<"]*\/news(?:\/[^\s<"]*)?\.html\b/g)) bad.push(`${file}: ${m[0]}`);
}
if (bad.length) { console.error('NEWS-URL-CHECK FAIL (.html news URLs):\n  ' + bad.join('\n  ')); process.exit(1); }
console.log('NEWS-URL-CHECK OK: news-sitemap.xml + news-rss.xml use clean /news/<slug> URLs.');
