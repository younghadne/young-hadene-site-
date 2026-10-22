// Guard for /blog/top-toronto-rappers (anchor page) plus a sitewide
// placeholder check. Fails on:
//  - page out of date with scripts/build-anchor.mjs sources (blog + root twin)
//  - title / og:title / twitter:title / Article headline != TITLE, h1 != H1
//  - disclosure line missing, duplicated, or not right after the intro
//  - "Ranked", rank-number cards, "best"/"ranked" in schema, ordered ItemList
//  - removed names/claims: Swollen Members, Night Lovell, SHAD, most-streamed,
//    the 4 unverified singles (No Sleep, 6ix Side, Pressure, After Dark;
//    "Pressure & Diamonds" is allowed)
//  - FAQPage schema not matching the visible FAQ
//  - SITEWIDE: any [HELD] / [VERIFY] / [CONFIRM] in shipped .html/.json/.txt/.xml
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { TITLE, H1, DISCLOSURE, OUTPUTS, ARTISTS } from './build-anchor.mjs';

const bad = [];
try { execFileSync(process.execPath, ['scripts/build-anchor.mjs', '--check'], { stdio: 'pipe' }); }
catch (e) { bad.push(String(e.stderr || e.message).trim()); }

const ents = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', mdash: '—', ndash: '–', rsquo: '’' };
const dec = (s) => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&([a-z]+);/gi, (m, n) => ents[n] ?? m);
const text = (s) => dec(s.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const one = (s, re) => (s.match(re) || [])[1];

const BANNED = [
  [/\branked\b/i, '"Ranked"'],
  [/\[(HELD|VERIFY|CONFIRM)\b/i, 'placeholder marker'],
  [/NEAqzPCtt0c/, 'private video NEAqzPCtt0c (Street Lights)'],
  [/swollen\s+members/i, 'Swollen Members'],
  [/night\s+lovell/i, 'Night Lovell'],
  [/\bSHAD\b/i, 'SHAD'],
  [/most[-\s]streamed/i, '"most-streamed"'],
  [/no\s+sleep/i, 'single "No Sleep"'],
  [/6ix\s+side/i, 'single "6ix Side"'],
  [/\bpressure\b(?!\s*(&|&amp;|and)\s*diamonds)/i, 'single "Pressure"'],
  [/after\s+dark/i, 'single "After Dark"'],
];

for (const f of OUTPUTS) {
  const s = fs.readFileSync(f, 'utf8');
  const raw = dec(s);
  const t = (x) => dec(String(x || '')).trim();
  if (t(one(s, /<title>([^<]*)<\/title>/)) !== TITLE) bad.push(`${f}: <title> != "${TITLE}"`);
  if (t(one(s, /<meta property="og:title" content="([^"]*)"/)) !== TITLE) bad.push(`${f}: og:title != title`);
  if (t(one(s, /<meta name="twitter:title" content="([^"]*)"/)) !== TITLE) bad.push(`${f}: twitter:title != title`);
  const h1s = [...s.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)];
  if (h1s.length !== 1 || text(h1s[0][1]) !== H1) bad.push(`${f}: expected exactly one <h1> "${H1}"`);
  if (/class="num"/.test(s)) bad.push(`${f}: rank-number card (.num) present`);

  // Disclosure: exactly once, in the article before the first <h2> (right after the intro).
  const n = raw.split(DISCLOSURE).length - 1;
  if (n !== 1) bad.push(`${f}: disclosure line found ${n} times (want 1)`);
  const art = s.slice(s.indexOf('<h1'));
  const beforeH2 = text(art.slice(0, art.indexOf('<h2')));
  if (!beforeH2.includes(DISCLOSURE)) bad.push(`${f}: disclosure line is not between the H1 and the first H2`);

  for (const [re, label] of BANNED) { const m = raw.match(re); if (m) bad.push(`${f}: contains ${label} ("${m[0]}")`); }

  // Links: no raw-URL link text; Street Lights may only link to Apple Music.
  for (const [, href, inner] of s.matchAll(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const lt = text(inner);
    if (/^(https?:\/\/|www\.)/i.test(lt)) bad.push(`${f}: link text is a raw URL (${lt})`);
    if (/street\s*lights/i.test(lt) && !/^https:\/\/music\.apple\.com\//.test(href)) bad.push(`${f}: Street Lights links to ${href} (Apple Music only)`);
  }
  // Every artist card has the same five fields, in order.
  const FIELDS = ['From / based:', 'Active since:', 'Releases to know:', "Why they're here:", 'Start with:'];
  for (const [, id, card] of s.matchAll(/<div class="artist-card" id="([^"]+)">([\s\S]*?)<\/ul>/g)) {
    const got = [...card.matchAll(/<li><strong>([^<]+)<\/strong>/g)].map((m) => dec(m[1]));
    if (got.join('|') !== FIELDS.join('|')) bad.push(`${f}: card #${id} fields [${got.join(', ')}] != [${FIELDS.join(', ')}]`);
  }

  // Schema
  const blocks = [...s.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const byType = (ty) => blocks.find((b) => b['@type'] === ty);
  const art2 = byType('Article'), list = byType('ItemList'), faq = byType('FAQPage');
  if (!art2 || art2.headline !== TITLE) bad.push(`${f}: Article headline != title`);
  if (!byType('BreadcrumbList')) bad.push(`${f}: BreadcrumbList missing`);
  for (const b of blocks) { const j = JSON.stringify(b); if (/\bbest\b|\branked\b|\branking\b/i.test(j.replace(/not a ranking/gi, ''))) bad.push(`${f}: ${b['@type']} schema says best/ranked`); }
  if (!list || list.itemListOrder !== 'https://schema.org/ItemListUnordered') bad.push(`${f}: ItemList must be ItemListUnordered`);
  else if (list.itemListElement.map((i) => i.name).join('|') !== ARTISTS.map((a) => a.name).join('|')) bad.push(`${f}: ItemList does not match the cards in page order`);
  const cards = [...s.matchAll(/<div class="artist-card" id="([^"]+)">/g)].length;
  if (cards !== ARTISTS.length) bad.push(`${f}: ${cards} cards vs ${ARTISTS.length} artists`);
  // FAQ schema == visible FAQ
  const vis = new Map([...s.matchAll(/<div class="highlight-box">\s*<p><strong>([\s\S]*?)<\/strong><br>([\s\S]*?)<\/p>/g)].map((m) => [text(m[1]), text(m[2].replace(/<sup>[\s\S]*?<\/sup>/g, ''))]));
  if (!faq || !faq.mainEntity.length) bad.push(`${f}: FAQPage schema missing`);
  else for (const q of faq.mainEntity) if (vis.get(q.name) !== q.acceptedAnswer.text) bad.push(`${f}: FAQ schema/visible mismatch: ${q.name}`);
}

// Sitewide: no editorial placeholders in anything that ships.
const SKIP_DIRS = new Set(['.git', 'node_modules', '.wrangler', 'logs']);
const SKIP_FILES = new Set(['package-lock.json']);
let scanned = 0;
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p); continue; }
    if (!/\.(html|json|txt|xml)$/i.test(e.name) || SKIP_FILES.has(e.name)) continue;
    scanned++;
    const s = fs.readFileSync(p, 'utf8');
    const m = s.match(/\[(HELD|VERIFY|CONFIRM)\b[^\]\n]{0,60}/i);
    if (m) bad.push(`${p.replace(/^\.\//, '')}: placeholder "${m[0]}"`);
  }
};
walk('.');

if (bad.length) { console.error('ANCHOR-CHECK FAIL:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`ANCHOR-CHECK OK: ${OUTPUTS.join(' + ')} (title, H1, disclosure x1, ${ARTISTS.length} unranked cards, schema); no [HELD]/[VERIFY]/[CONFIRM] in ${scanned} shipped files.`);
