// Approved bio wording: Young Hadene is described "with Haitian roots" (never
// "born in Haiti" / "Haitian-born"), and no label is named. Where a credit is
// needed, the only allowed form is exactly:
//   credited to ℗ str8hitsrecords on Apple Music
//
// QA follow-ups also guarded here: the broken "He releases and works in..."
// sentence, "independent imprint" / "his independent label" / "independent label
// launch" (he releases independently; no imprint or label), any album count on the
// Haitian hub (/blog/haitian-rappers-in-toronto-young-hadene-and-the-new-generation),
// and "Haitian roots" said twice in one sentence.
//
// Repo mode (npm test): scans every tracked .html/.json/.txt/.xml file that the
// site serves (visible text, meta content and JSON-LD). Skips seo/, scripts/,
// node_modules, and static blog files whose slug 301s via functions/_blog-redirects.js
// (those files are never served). URLs are ignored (link targets are not copy).
//
// Live mode (not part of npm test):  node scripts/check-bio-wording.mjs --live [baseUrl]
// Fetches every <loc> in baseUrl/sitemap.xml plus the core pages, and lists each
// page that still uses a banned phrase. Pages whose /blog or /news slug is in the
// public KV index (/api/posts-list, /api/news-list) are listed separately as
// KV-served: their copy lives in Cloudflare KV, not in this repo.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CREDIT = 'credited to ℗ str8hitsrecords on Apple Music';
// Third-party headline quoted verbatim on /press (IssueWire release title). It is a
// cited title, not site copy, so it is allowed as an exact string only.
const ALLOWED_QUOTES = ['Young Hadene Launches Str8hitsRecords, A New Era in Independent Trap Music'];
const BANNED = [
  ['born in Haiti', /born\s+in\s+Haiti/i],
  ['Haitian-born', /Haitian[\s-]+born/i],
  ['label name Str8hitsRecords', /str8\s*hits\s*records/i],
  ['broken "releases and works" (say "releases independently and works")', /\breleases\s+and\s+works\b/i],
  ['imprint (say he releases independently)', /\b(?:his|independent)\s+(?:own\s+)?imprint\b/i],
  ['independent label (say he releases independently)', /\bhis\s+(?:own\s+)?independent\s+label\b|\bindependent\s+label\s+launch\b/i],
];
// Album count on the Haitian hub: /music and /press list more albums than the hub
// does, so the hub names its albums without a number.
const HUB = 'haitian-rappers-in-toronto-young-hadene-and-the-new-generation';
const HUB_BANNED = [
  ['album count on the Haitian hub', /\b(?:one|two|three|four|five|six|\d+)\s+(?:full[\s-]+length\s+|studio\s+)?albums\b/i],
];

const redirectSrc = readFileSync('functions/_blog-redirects.js', 'utf8');
const [redirectPart, staticPart = ''] = redirectSrc.split('BLOG_STATIC_FIRST');
const REDIRECTED = new Set([...redirectPart.matchAll(/^\s*["']([^"']+)["']\s*:/gm)].map(m => m[1]));
const STATIC_FIRST = new Set([...staticPart.matchAll(/["']([a-z0-9-]+)["']/g)].map(m => m[1]));

const ents = { amp: '&', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', middot: '·' };
const text = s => s
  .replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/\\n/g, ' ').replace(/\\(["'\/])/g, '$1')
  .replace(/<[^>]*\b(?:content|alt|title|aria-label)="([^"]*)"[^>]*>/g, ' $1 ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d))
  .replace(/&([a-z]+);/gi, (m, n) => ents[n] ?? m)
  .replace(/https?:\/\/[^\s"'<>)\]]+/g, ' ')
  .replace(/\s+/g, ' ');

// Sentences for the doubled-"Haitian roots" rule: block tags, line breaks (real or
// JSON-escaped), JSON/JS field boundaries and FAQ "|" separators also end a sentence.
const sentences = raw => text(raw
  .replace(/\\n|\r?\n|<\/(?:p|li|h[1-6]|div|td|th|dt|dd|ul|ol|title|figcaption|blockquote)>|<br\s*\/?>/gi, ' \u00b6 ')
  .replace(/<[^>]*\b(?:content|alt|title|aria-label)="([^"]*)"[^>]*>/g, ' \u00b6 $1 \u00b6 ')
  .replace(/["']\s*[,:]\s*["']/g, ' \u00b6 '))
  .split(/[.!?]["”’']?(?=\s|$)|\u00b6|\|/);

function problems(raw, where = '') {
  let t = text(raw).split(CREDIT).join(' ');
  for (const q of ALLOWED_QUOTES) t = t.split(q).join(' ');
  const out = [];
  const rules = where.includes(HUB) ? [...BANNED, ...HUB_BANNED] : BANNED;
  for (const [label, re] of rules) {
    const g = new RegExp(re.source, 'gi');
    for (const m of t.matchAll(g)) out.push(`${label}: "...${t.slice(Math.max(0, m.index - 60), m.index + m[0].length + 40).trim()}..."`);
  }
  for (const s of sentences(raw)) {
    if ((s.match(/Haitian\s+roots/gi) || []).length > 1) out.push(`"Haitian roots" twice in one sentence: "${s.trim().slice(0, 220)}"`);
  }
  return out;
}

const LIVE = process.argv.includes('--live');

async function runLive() {
  const arg = process.argv[process.argv.indexOf('--live') + 1];
  const base = (arg && !arg.startsWith('--') ? arg : 'https://younghadene.ca').replace(/\/$/, '');
  const PROD = 'https://younghadene.ca';
  const get = async (u) => {
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(u, { redirect: 'follow', headers: { 'User-Agent': 'yh-check-bio-wording/1.0' }, signal: AbortSignal.timeout(30000) });
        return { status: r.status, url: r.url, body: await r.text() };
      } catch (e) { if (i === 2) return { status: 0, url: u, body: '', err: e.message }; }
    }
  };
  const sm = await get(base + '/sitemap.xml');
  if (sm.status !== 200) { console.error(`BIO-LIVE FAIL: ${base}/sitemap.xml -> HTTP ${sm.status}`); process.exit(1); }
  const kv = { blog: new Set(), news: new Set() };
  for (const [sec, api] of [['blog', '/api/posts-list'], ['news', '/api/news-list']]) {
    const r = await get(base + api);
    try { for (const p of JSON.parse(r.body).posts || []) if (p && p.slug) kv[sec].add(p.slug); } catch {}
  }
  const paths = new Set(['/', '/about', '/music', '/press', '/videos', '/videos/shorts', '/llms.txt', '/who-is-young-hadene', '/haitian-canadian-drill']);
  for (const m of sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)) paths.add(m[1].trim().replace(PROD, '').replace(base, '') || '/');
  const queue = [...paths].sort();
  const seen = new Set();
  const repoHits = [], kvHits = [];
  let scanned = 0;
  const worker = async () => {
    while (queue.length) {
      const p = queue.shift();
      const r = await get(base + p);
      if (r.status !== 200) { console.log(`skip ${p}: HTTP ${r.status}`); continue; }
      const final = new URL(r.url).pathname;
      if (seen.has(final)) continue;
      seen.add(final);
      scanned++;
      const found = problems(r.body, final);
      if (!found.length) continue;
      const m = final.match(/^\/(blog|news)\/([^/]+?)(?:\.html)?$/);
      const isKv = m && kv[m[1]].has(m[2]) && !(m[1] === 'blog' && STATIC_FIRST.has(m[2]));
      (isKv ? kvHits : repoHits).push([final, found]);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  const show = (title, list) => {
    console.log(`\n${title}: ${list.length} page(s), ${list.reduce((n, [, f]) => n + f.length, 0)} occurrence(s)`);
    for (const [p, f] of list.sort()) { console.log(`  ${p} (${f.length})`); for (const x of f) console.log(`    - ${x}`); }
  };
  show('Repo-served pages with banned wording', repoHits);
  show('KV-served pages with banned wording (fix in KV, not in the repo)', kvHits);
  console.log(`\nBIO-LIVE (${base}): scanned ${scanned} pages.`);
  process.exit(repoHits.length || kvHits.length ? 1 : 0);
}

if (LIVE) await runLive();

const SKIP_DIRS = new Set(['node_modules', '.git', '.wrangler', 'seo', 'scripts']);
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = dir === '.' ? name : join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(html|json|txt|xml)$/.test(name) && !/^package(-lock)?\.json$/.test(name)) out.push(p);
  }
  return out;
}
let bad = 0, scanned = 0;
for (const f of walk('.').sort()) {
  const m = f.match(/^blog\/([^/]+)\.html$/);
  if (m && REDIRECTED.has(m[1])) continue;
  scanned++;
  for (const p of problems(readFileSync(f, 'utf8'), f)) { bad++; if (bad <= 60) console.error(`BIO-WORDING FAIL: ${f}: ${p}`); }
}
if (bad) { console.error(`BIO-WORDING FAIL: ${bad} banned phrase(s) in ${scanned} files`); process.exit(1); }
console.log(`BIO-WORDING OK: ${scanned} served files: no "born in Haiti", "Haitian-born" or label name (only "${CREDIT}" allowed); no "releases and works", imprint/independent-label wording, hub album count, or doubled "Haitian roots".`);
