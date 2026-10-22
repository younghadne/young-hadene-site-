// Guards against unverified claims returning anywhere on the site.
// Scans every tracked .html/.json/.txt file (sitewide), except:
//   - posts redirected by PR #13 (rappers-merge) and by functions/_blog-redirects.js
//     (those URLs 301 away, so their static files are never served);
//   - EDITORIAL_REVIEW: posts whose whole subject is one of the unverified singles.
//     A minimal edit is not possible there; they need a keep / rewrite / redirect
//     decision from the site owner. Remove a slug from this list once decided.
// Inside aggregate files (blog.html, blog/index.html, blog/posts.json, yh_blogPosts.json)
// the post objects for excluded slugs are skipped; everything else is checked.
//
// Live mode (not part of npm test):  node scripts/check-claims.mjs --live [baseUrl]
// Fetches the rendered pages from baseUrl (default https://younghadene.ca): every
// <loc> in baseUrl/sitemap.xml, the KV-first posts switched to repo-first, and
// /, /about, /music, /llms.txt, then runs the same checks on the served HTML.
// Use it against a Pages preview (https://<branch>.<project>.pages.dev) or prod.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PR13_REDIRECTED = [
  'upcoming-toronto-rappers-to-watch',
  'upcoming-toronto-rappers-to-watch-in-2026-young-hadene',
  'upcoming-emerging-toronto-rappers-drill-hip-hop-2026',
  'notable-rising-toronto-rap-artists-to-watch-in-2026',
  'new-toronto-rappers-artists-music-2026',
  'toronto-underground-rap-artists-2026-to-watch',
  'best-underrated-toronto-rappers-you-should-know-2026',
  'who-are-the-top-toronto-rappers-in-2026',
  'who-are-the-top-toronto-rappers-in-2026-young-hadene-and-toronto-s-next-generation',
  'best-toronto-rappers-2026-top-toronto-hip-hop-artists-ranked',
  '2026-s-best-toronto-rappers-top-hip-hop-artists',
  'young-hadene-an-emerging-toronto-rapper-to-watch-in-2026',
  '2026-toronto-rap-rankings-young-hadene-position',
  'case-young-hadene-top-10-rappers-toronto',
  'fan-vote-young-hadene-top-10-toronto-rappers',
  'industry-experts-young-hadene-top-10-ranking',
  'toronto-dril-scene-young-hadene-top-10',
  'toronto-music-bloggers-young-hadene-top-10',
  'toronto-rappers-top-10-young-hadene-place',
  'underground-mainstream-young-hadene-top-10-journey',
  'why-young-hadene-deserves-top-10-spot-toronto-hip-hop',
  'why-young-hadene-every-top-10-list',
  'young-hadene-2026-milestones-top-10-contender',
  'young-hadene-6ix-top-10-position-explained',
  'young-hadene-collaborations-top-10-status',
  'young-hadene-discography-warrants-top-10',
  'young-hadene-rise-underground-top-10-toronto',
  'young-hadene-top-10-toronto-rappers-2026',
  'young-hadene-unique-sound-top-10-material',
  'young-hadene-vs-major-toronto-rappers-comparison',
  'young-hadene-vs-top-toronto-rappers-2026-ranking',
  'young-hadene-vs-toronto-underground-comparison',
];
const EDITORIAL_REVIEW = [
  'late-night-lab-no-sleep',
  'young-hadene-no-sleep-song-meaning',
  'top-10-underground-toronto-tracks-2026',
];
const redirectSrc = readFileSync('functions/_blog-redirects.js', 'utf8');
const REDIRECTED = [...redirectSrc.matchAll(/^\s*"([^"]+)"\s*:/gm)].map(m => m[1]);
const EXCLUDED = new Set([...PR13_REDIRECTED, ...EDITORIAL_REVIEW, ...REDIRECTED]);

const SKIP_DIRS = new Set(['node_modules', '.git', '.wrangler', 'seo']);
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = dir === '.' ? name : join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(html|json|txt)$/.test(name) && !/^package(-lock)?\.json$/.test(name)) out.push(p);
  }
  return out;
}
const fileSlug = f => (f.match(/^(?:blog\/)?([^/]+)\.html$/) || [])[1];

// Blank out post objects ({ id: ..., slug: '<excluded>' ... }) inside aggregate files.
function dropExcludedPosts(s) {
  // Listing cards (<article> ... href="/blog/<slug>" ... </article>) for excluded posts.
  s = s.replace(/<article\b[\s\S]*?<\/article>/g, block => {
    const m = block.match(/href="\/blog\/([^"#?]+)"/);
    return m && EXCLUDED.has(m[1]) ? ' ' : block;
  });
  const starts = [...s.matchAll(/\{\s*"?id"?\s*:/g)].map(m => m.index);
  if (!starts.length) return s;
  let out = s.slice(0, starts[0]);
  for (let i = 0; i < starts.length; i++) {
    const seg = s.slice(starts[i], starts[i + 1] ?? s.length);
    const m = seg.match(/"?slug"?\s*:\s*\\?["']([^"'\\]+)/);
    out += m && EXCLUDED.has(m[1]) ? ' ' : seg;
  }
  return out;
}

const ents = { amp: '&', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', middot: '·' };
const text = s => s
  .replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/\\n/g, ' ').replace(/\\(["'\/])/g, '$1')
  .replace(/<[^>]*\bcontent="([^"]*)"[^>]*>/g, ' $1 ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d))
  .replace(/&([a-z]+);/gi, (m, n) => ents[n] ?? m)
  .replace(/\s+/g, ' ');

const ESSENTIAL = 'Broken, Let the Choir Sing, In the Cut, The Digital Blueprint.';
const SINGLES = [
  ['No Sleep', /\bNo Sleep\b/],
  ['6ix Side', /\b6ix Side\b/],
  ['After Dark', /\bAfter Dark\b/],
  ['Pressure', /\bPressure\b(?!\s*(?:&|and)\s*Diamonds)/],
];
// The homepage tagline "Built Different — Dark Trap — 6ix Side" is a brand line, not a single.
const ALLOWED_PHRASES = [/Built Different\s*[—-]\s*Dark Trap\s*[—-]\s*6ix Side/g, /6ix Side is a tribute to Toronto/g];
const BOOSTED_STREAMS = /\b(?:growing|strong|impressive|rising|massive|huge|big)\s+streaming numbers\b/i;

const LIVE = process.argv.includes('--live');
let bad = 0, scanned = 0;
const MAX_SHOWN = LIVE ? 400 : 60;
const fail = (f, m) => { bad++; if (bad <= MAX_SHOWN) console.error(`CLAIMS FAIL: ${f}: ${m}`); };

function checkText(f, raw) {
  const t = text(dropExcludedPosts(raw));
  let tt = t;
  for (const re of ALLOWED_PHRASES) tt = tt.replace(re, ' ');
  for (const [label, re] of SINGLES) {
    const m = tt.match(re);
    if (m) fail(f, `unverified single "${label}": "...${tt.slice(Math.max(0, m.index - 70), m.index + 50).trim()}..."`);
  }
  for (const m of t.matchAll(/Essential tracks:\s*\**\s*/g)) {
    const rest = t.slice(m.index + m[0].length).replace(/^\**\s*/, '');
    if (!rest.startsWith(ESSENTIAL)) fail(f, `"Essential tracks:" is not "${ESSENTIAL}": "${rest.slice(0, 80)}"`);
  }
  for (const sent of t.split(/(?<=[.!?])\s+/)) {
    for (const name of ['Night Lovell', 'Swollen Members']) {
      if (sent.includes(name) && /Toronto/i.test(sent) && !/Ottawa/.test(sent)) fail(f, `${name} listed as Toronto: "${sent.trim().slice(0, 160)}"`);
    }
  }
  const s = t.match(BOOSTED_STREAMS);
  if (s) fail(f, `streaming-numbers claim: "${s[0]}"`);
}

// Page-specific assertions (carried over from PR #14).
const FAQ_ANSWER = 'Good starting points are his official uploads on YouTube: Broken, Let the Choir Sing, In the Cut, The Digital Blueprint (a 3D animated video) and Pressure & Diamonds (52 States). You can watch all of them on the Videos page.';
function checkIndex(name, index) {
  if (/streaming numbers/i.test(index)) fail(name, 'still claims "streaming numbers"');
  if (!/"text":\s*"Good starting points are his official uploads/.test(index) || !index.includes(`"${FAQ_ANSWER}"`)) fail(name, 'FAQPage answer for "best Young Hadene songs to start with" is not the approved text');
  if (!text(index).includes(FAQ_ANSWER)) fail(name, 'visible FAQ answer for "best Young Hadene songs to start with" is not the approved text');
}
function checkAbout(name, raw) {
  const about = text(raw);
  for (const n of ['Night Lovell', 'Swollen Members']) if (about.includes(n)) fail(name, `mentions ${n}`);
}

// Posts that used to be served from KV first; checked by name in --live mode.
const REPO_FIRST = [
  'basement-to-stage-first-show', 'toronto-after-midnight', 'underground-toronto-sound-2026',
  'inside-young-hadene-an-honest-look',
  'young-hadene-haitian-toronto-drill-dark-trap-artist-redefining-the-6ix-sound',
  'young-hadene-one-of-the-top-best-toronto-rappers-redefining-drill-and-trap',
  'young-hadene-rap-game-takes', 'top-10-underground-toronto-tracks-2026', 'late-night-lab-no-sleep',
];

async function runLive() {
  const arg = process.argv[process.argv.indexOf('--live') + 1];
  const base = (arg && !arg.startsWith('--') ? arg : 'https://younghadene.ca').replace(/\/$/, '');
  const PROD = 'https://younghadene.ca';
  const get = async (u) => {
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(u, { redirect: 'follow', headers: { 'User-Agent': 'yh-check-claims/1.0' }, signal: AbortSignal.timeout(30000) });
        return { status: r.status, url: r.url, body: await r.text() };
      } catch (e) { if (i === 2) return { status: 0, url: u, body: '', err: e.message }; }
    }
  };
  const sm = await get(base + '/sitemap.xml');
  if (sm.status !== 200) { console.error(`CLAIMS-LIVE FAIL: ${base}/sitemap.xml -> HTTP ${sm.status} ${sm.err || ''}`); process.exit(1); }
  const paths = new Set(['/', '/about', '/music', '/llms.txt']);
  for (const m of sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)) paths.add(m[1].trim().replace(PROD, '').replace(base, '') || '/');
  for (const s of REPO_FIRST) paths.add('/blog/' + s);
  const list = [...paths].sort();
  const skipped = [];
  const queue = list.slice();
  const worker = async () => {
    while (queue.length) {
      const p = queue.shift();
      const slug = (p.match(/^\/(?:blog\/)?([^/]+?)(?:\.html)?$/) || [])[1];
      if (slug && EXCLUDED.has(slug)) { skipped.push(p); continue; }
      const r = await get(base + p);
      if (r.status !== 200) { fail(p, `HTTP ${r.status}${r.err ? ' ' + r.err : ''}`); continue; }
      scanned++;
      checkText(p, r.body);
      if (p === '/') checkIndex(p, r.body);
      if (p === '/about') checkAbout(p, r.body);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  if (skipped.length) console.log(`skipped (redirected / editorial review): ${skipped.sort().join(', ')}`);
  if (bad) { console.error(`CLAIMS-LIVE FAIL (${base}): ${bad} problem(s) in ${scanned} pages`); process.exit(1); }
  console.log(`CLAIMS-LIVE OK (${base}): ${scanned} pages from sitemap + repo-first posts + /, /about, /music, /llms.txt: no unverified singles, Essential tracks lines approved, no Toronto-labelled Night Lovell/Swollen Members, no streaming-numbers claims; homepage FAQ answer approved.`);
}

if (LIVE) {
  await runLive();
  process.exit(0);
}

for (const f of walk('.').sort()) {
  const slug = fileSlug(f);
  if (slug && EXCLUDED.has(slug)) continue;
  scanned++;
  checkText(f, readFileSync(f, 'utf8'));
}
checkIndex('index.html', readFileSync('index.html', 'utf8'));
checkAbout('about.html', readFileSync('about.html', 'utf8'));

if (bad) { console.error(`CLAIMS-CHECK FAIL: ${bad} problem(s) in ${scanned} files`); process.exit(1); }
console.log(`CLAIMS-CHECK OK: ${scanned} files (${EXCLUDED.size} redirected/editorial-review slugs excluded): no unverified singles, Essential tracks lines approved, no Toronto-labelled Night Lovell/Swollen Members, no streaming-numbers claims; homepage FAQ answer approved.`);
