// Redirect hygiene: every /blog redirect is ONE hop to a live page.
// Sources: BLOG_REDIRECTS (what the /blog function actually serves) and the
// _redirects mirror (incl. .html variants). Fails on:
//  - a target that is itself a redirect source (chain), or a loop
//  - a merged top-Toronto-rappers slug (or old rappers-to-watch guide) that
//    does not go straight to the anchor, in either source, .html included
//  - the anchor or the deliberately excluded posts being redirected
// Also exercises the function: merged slugs (+ .html) answer 301 -> anchor.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path';
const d = mkdtempSync(join(tmpdir(), 'yhchain-')); mkdirSync(join(d, 'blog'));
writeFileSync(join(d, '_blog-redirects.mjs'), readFileSync('functions/_blog-redirects.js'));
writeFileSync(join(d, 'blog', 'slug.mjs'), readFileSync('functions/blog/[slug].js', 'utf8').replace(/(['"])\.\.\/([^'"]+)\.js\1/g, "'../$2.mjs'"));
const { BLOG_REDIRECTS } = await import(join(d, '_blog-redirects.mjs'));
const { onRequestGet } = await import(join(d, 'blog', 'slug.mjs'));

const ANCHOR = '/blog/top-toronto-rappers';
const MERGED = `upcoming-toronto-rappers-to-watch upcoming-toronto-rappers-to-watch-in-2026-young-hadene
upcoming-emerging-toronto-rappers-drill-hip-hop-2026 notable-rising-toronto-rap-artists-to-watch-in-2026
new-toronto-rappers-artists-music-2026 toronto-underground-rap-artists-2026-to-watch
best-underrated-toronto-rappers-you-should-know-2026 who-are-the-top-toronto-rappers-in-2026
who-are-the-top-toronto-rappers-in-2026-young-hadene-and-toronto-s-next-generation
best-toronto-rappers-2026-top-toronto-hip-hop-artists-ranked 2026-s-best-toronto-rappers-top-hip-hop-artists
young-hadene-an-emerging-toronto-rapper-to-watch-in-2026
2026-toronto-rap-rankings-young-hadene-position case-young-hadene-top-10-rappers-toronto
fan-vote-young-hadene-top-10-toronto-rappers industry-experts-young-hadene-top-10-ranking
toronto-dril-scene-young-hadene-top-10 toronto-music-bloggers-young-hadene-top-10
toronto-rappers-top-10-young-hadene-place underground-mainstream-young-hadene-top-10-journey
why-young-hadene-deserves-top-10-spot-toronto-hip-hop why-young-hadene-every-top-10-list
young-hadene-2026-milestones-top-10-contender young-hadene-6ix-top-10-position-explained
young-hadene-collaborations-top-10-status young-hadene-discography-warrants-top-10
young-hadene-rise-underground-top-10-toronto young-hadene-top-10-toronto-rappers-2026
young-hadene-unique-sound-top-10-material young-hadene-vs-major-toronto-rappers-comparison
young-hadene-vs-top-toronto-rappers-2026-ranking young-hadene-vs-toronto-underground-comparison`.split(/\s+/);
// Old rappers-to-watch guide cluster (seo/guide-clusters.csv) + the vs-underground guide.
const GUIDES = `emerging-canadian-hip-hop-artists-2026-guide rising-underground-rappers-toronto-2026-2026-guide
brampton-hip-hop-artists-rising-2026-guide best-canadian-rappers-2026-beyond-drake-2026-guide
new-toronto-rap-artists-breaking-out-2026-guide next-wave-toronto-hip-hop-talent-2026-guide
toronto-hip-hop-artists-to-watch-2026-guide underrated-toronto-rappers-you-should-know-2026-guide
best-hip-hop-in-toronto-right-now-2026-guide upcoming-toronto-rappers-to-watch-in-2026-2026-guide
who-is-the-best-toronto-rapper-right-now-2026-guide young-hadene-vs-toronto-underground-comparison-2026-guide`.split(/\s+/);
const NOT_REDIRECTED = ['top-toronto-rappers', 'dark-trap-vs-drill-differences', 'top-10-underground-toronto-tracks-2026',
  ...readdirSync('blog').filter((f) => /^toronto-drill-artists-2026-.*\.html$/.test(f)).map((f) => f.slice(0, -5))];

const norm = (p) => { let s = String(p).replace(/^https?:\/\/[^/]+/, '').split(/[?#]/)[0]; s = s.replace(/\.html$/, '').replace(/\/+$/, ''); return s || '/'; };
const map = new Map(); // normalized source -> normalized target
const errs = [];
const add = (src, dst, where) => {
  const s = norm(src), t = norm(dst);
  if (map.has(s) && map.get(s) !== t) errs.push(`conflict: ${s} -> ${map.get(s)} vs ${t} (${where})`);
  map.set(s, t);
};
for (const [k, v] of Object.entries(BLOG_REDIRECTS)) add('/blog/' + k, v, 'BLOG_REDIRECTS');
let mirror = 0;
for (const line of readFileSync('_redirects', 'utf8').split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue;
  const [src, dst, code] = t.split(/\s+/);
  if (!/^30[1278]$/.test(code || '301') || src.includes('*') || src.includes(':')) continue;
  add(src, dst, '_redirects'); mirror++;
}
for (const [s, t] of map) {
  if (s === t) { errs.push(`loop: ${s} -> itself`); continue; }
  if (map.has(t)) {
    const seen = new Set([s]); let c = t;
    while (map.has(c) && !seen.has(c)) { seen.add(c); c = map.get(c); }
    errs.push(seen.has(c) && map.has(c) ? `loop: ${s} -> ... -> ${c}` : `chain: ${s} -> ${t} -> ${map.get(t)}`);
  }
}
for (const slug of [...MERGED, ...GUIDES]) {
  const src = '/blog/' + slug;
  if (BLOG_REDIRECTS[slug] !== ANCHOR) errs.push(`BLOG_REDIRECTS[${slug}] = ${BLOG_REDIRECTS[slug]} (want ${ANCHOR})`);
  if (map.get(src) !== ANCHOR) errs.push(`${src} -> ${map.get(src)} (want ${ANCHOR})`);
  for (const p of [slug, slug + '.html']) {
    const r = await onRequestGet({ request: new Request('https://younghadene.ca/blog/' + p), env: {}, params: { slug: p } });
    if (r.status !== 301 || r.headers.get('Location') !== ANCHOR) errs.push(`function GET /blog/${p}: ${r.status} ${r.headers.get('Location')}`);
  }
}
for (const slug of NOT_REDIRECTED) {
  if (BLOG_REDIRECTS[slug] || map.has('/blog/' + slug)) errs.push(`must NOT redirect: /blog/${slug}`);
}
if (MERGED.length !== 32) errs.push(`merge list has ${MERGED.length} slugs (want 32)`);
if (errs.length) { console.error(errs.join('\n')); console.error(`REDIRECT-CHAINS FAIL: ${errs.length}`); process.exit(1); }
console.log(`REDIRECT-CHAINS OK: ${map.size} sources (${Object.keys(BLOG_REDIRECTS).length} BLOG_REDIRECTS + ${mirror} _redirects lines), no chains/loops; ${MERGED.length} merged + ${GUIDES.length} guides -> ${ANCHOR} in one hop; ${NOT_REDIRECTED.length} kept live.`);
