// Guard for /blog/top-toronto-rappers (anchor page) plus a sitewide
// placeholder check. Fails on:
//  - page out of date with scripts/build-anchor.mjs sources (blog + root twin)
//  - tap targets: back link < 44px / footnote refs < 24px tall, or padding without a matching negative margin
//  - tap targets: Sources single-link entries < 44px (or overlapping), other Sources links / "Broken" video < 24px,
//    adjacent footnote refs ("1,2") whose hit boxes overlap
//  - tap targets: footer Navigate/Music/Contact links < 44px tall or overlapping the next row
//  - tap targets: an Apple Music Sources link on its own line (standalone entry) not getting the 44px rule;
//    Apple Music links inline in the Sources sentence < 24px
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
let appleSummary = '';
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

  // Tap targets (UX on #17): "← Back to Blog" >= 44px tall, footnote refs >= 24px
  // tall, via padding-block offset by a matching negative margin-block (PR #8
  // technique). Text-box heights measured at 375px in Chromium: back link
  // 20.47px (0.8rem x 1.6), footnote ref 14px. Static CSS check, not a render.
  const rule = (sel) => (s.match(new RegExp(`\\n\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*padding-block[^}]*)\\}`)) || [])[1] || '';
  const tap = (sel, textH, min) => {
    const r = rule(sel);
    const pad = r.match(/padding-block:\s*([\d.]+)px/), mar = r.match(/margin-block:\s*-([\d.]+)px/);
    if (!pad) return bad.push(`${f}: no "${sel} { padding-block }" tap-target rule`);
    if (!mar || mar[1] !== pad[1]) bad.push(`${f}: ${sel} padding-block ${pad[1]}px needs a matching -${pad[1]}px margin-block so layout does not shift`);
    if (textH + 2 * Number(pad[1]) < min) bad.push(`${f}: ${sel} tap target ${(textH + 2 * Number(pad[1])).toFixed(2)}px tall (< ${min}px)`);
  };
  tap('.back-link', 20.47, 44);
  tap('.article-wrap sup a', 14, 24);
  // QA batch-1023 on #17: Sources single-link entries (16) >= 44px with inline-block
  // line-height 20px; multi-link Apple Music entry >= 24px; '"Broken" video' (16px
  // text box at 0.85rem) >= 24px. Neighbouring 44px Sources targets must not overlap:
  // li line box 27.36px (0.95rem x 1.8) + li margin-bottom >= 44px.
  tap('.article-wrap .sources li > a:only-child', 20, 44);
  if (!/\.article-wrap \.sources li > a:only-child\s*\{[^}]*display:\s*inline-block[^}]*line-height:\s*20px/.test(s)) bad.push(`${f}: Sources single-link rule must be display:inline-block; line-height:20px (44px = 20 + 2 x 12)`);
  tap('.article-wrap .sources li > a:not(:only-child)', 19, 24);
  const srcMb = Number(one(s, /\.article-wrap \.sources li\s*\{[^}]*margin-bottom:\s*([\d.]+)px/) || 0);
  if (27.36 + srcMb < 44) bad.push(`${f}: .sources li margin-bottom ${srcMb}px lets neighbouring 44px Sources targets overlap (need >= 16.64px)`);
  const single = [...s.matchAll(/<li id="src-[^"]+">(<a [^>]*>[^<]*<\/a>)<\/li>/g)].length;
  if (single < 16) bad.push(`${f}: expected >= 16 single-link Sources entries, found ${single}`);
  if (!/<a href="\/music\/broken">/.test(s)) bad.push(`${f}: '"Broken" video' link missing`);
  tap('.article-wrap .artist-card a[href="/music/broken"]', 16, 24);
  // Adjacent footnote refs ("1,2"): the second ref is sup.fn-adj; its comma gap must fit
  // ref 1's 10px right padding (site css) + ref 2's left padding, so the hit boxes never overlap.
  if (/<\/sup><sup>/.test(s)) bad.push(`${f}: adjacent footnote refs without class fn-adj (tap areas overlap)`);
  if (/<\/sup><sup class="fn-adj">/.test(s)) {
    const gap = Number(one(s, /\.article-wrap sup\.fn-adj::before\s*\{[^}]*width:\s*([\d.]+)px/) || 0);
    const r2 = one(s, /\.article-wrap sup\.fn-adj a\s*\{([^}]*)\}/) || '';
    const pl = r2.match(/padding-left:\s*([\d.]+)px/), ml = r2.match(/margin-left:\s*-([\d.]+)px/);
    if (!pl || !ml || pl[1] !== ml[1]) bad.push(`${f}: sup.fn-adj a needs padding-left with a matching negative margin-left`);
    else if (10 + Number(pl[1]) > gap) bad.push(`${f}: footnote gap ${gap}px < 10px + ${pl[1]}px, adjacent refs overlap`);
    else if (Number(pl[1]) < 6) bad.push(`${f}: sup.fn-adj a padding-left ${pl[1]}px leaves ref 2 under 24px wide`);
  }
  if (!/\.sources,\s*\.sources li,\s*\.sources a\s*\{\s*overflow-wrap:\s*anywhere/.test(s)) bad.push(`${f}: Sources overflow-wrap:anywhere rule missing`);

  // Footer link lists (UX on #17): site css (style.css "Tap targets: footer links") pads the
  // inline links 14px each way (16px text box at 0.85rem -> 44px), but rows are 25.59px line
  // + 10px li margin = 35.59px apart, so neighbours overlapped by 8.41px (Chromium, 360/375px).
  // The page must make each link a 44px inline-block whose margin box sets the row pitch, so
  // tap areas touch but never overlap: pitch = L + 2P + 2M + li margin-bottom >= L + 2P >= 44.
  {
    const SITE_PAD = 14, SITE_TEXT = 16, SITE_LINE = 25.59, SITE_LI_MB = 10;
    const fa = one(s, /\n\s*\.footer ul li a\s*\{([^}]*)\}/) || '';
    const liMb = Number(one(s, /\n\s*\.footer ul li\s*\{[^}]*margin-bottom:\s*(-?[\d.]+)(?:px)?/) ?? SITE_LI_MB);
    const num = (re, d) => { const m = fa.match(re); return m ? Number(m[1]) : d; };
    if (/display:\s*inline-block/.test(fa) && /vertical-align:\s*top/.test(fa)) {
      const L = num(/line-height:\s*([\d.]+)px/, NaN), P = num(/padding-block:\s*([\d.]+)px/, NaN), M = num(/margin-block:\s*(-?[\d.]+)(?:px)?/, 0);
      const tapH = L + 2 * P, box = tapH + 2 * M, pitch = Math.max(box, SITE_LINE) + liMb;
      if (!(tapH >= 44)) bad.push(`${f}: footer links tap target ${tapH}px tall (< 44px; need line-height + 2 x padding-block)`);
      else if (pitch + 0.01 < tapH) bad.push(`${f}: footer links overlap the next row by ${(tapH - pitch).toFixed(2)}px (pitch ${pitch.toFixed(2)}px < ${tapH}px tap)`);
    } else {
      const tapH = SITE_TEXT + 2 * SITE_PAD, pitch = SITE_LINE + liMb;
      if (tapH > pitch) bad.push(`${f}: footer links (inline, site css padding-block ${SITE_PAD}px) overlap the next row by ${(tapH - pitch).toFixed(2)}px; add a page ".footer ul li a { display:inline-block; vertical-align:top; line-height; padding-block }" rule with rows >= the tap height apart`);
    }
  }
  // Apple Music links in Sources (Design Lead on #17): one on its own line (the entry's whole
  // text is the link) must be the entry's only child so the 44px a:only-child rule applies;
  // ones inline in the Apple Music sentence get the >= 24px a:not(:only-child) rule (checked above).
  const apple = { standalone: [], inline: [] };
  for (const [, id, li] of s.matchAll(/<li id="(src-[^"]+)">([\s\S]*?)<\/li>/g)) {
    for (const [a, inner] of li.matchAll(/<a [^>]*href="https:\/\/music\.apple\.com\/[^"]*"[^>]*>([\s\S]*?)<\/a>/g)) {
      const label = `${id}: ${text(inner)}`;
      if (text(li) === text(inner)) {
        apple.standalone.push(label);
        if (li.trim() !== a.trim()) bad.push(`${f}: standalone Apple Music source "${label}" is not the entry's only child, so it misses the 44px rule`);
      } else apple.inline.push(label);
    }
  }
  if (apple.standalone.length + apple.inline.length < 5) bad.push(`${f}: expected >= 5 Apple Music links in Sources, found ${apple.standalone.length + apple.inline.length}`);
  appleSummary = `Apple Music Sources: ${apple.standalone.length} standalone (44px), ${apple.inline.length} inline (24px)`;

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
  const vis = new Map([...s.matchAll(/<div class="highlight-box">\s*<p><strong>([\s\S]*?)<\/strong><br>([\s\S]*?)<\/p>/g)].map((m) => [text(m[1]), text(m[2].replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/g, ''))]));
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
console.log(`ANCHOR-CHECK OK: ${OUTPUTS.join(' + ')} (title, H1, disclosure x1, ${ARTISTS.length} unranked cards, schema, footer taps 44px no overlap, ${appleSummary}); no [HELD]/[VERIFY]/[CONFIRM] in ${scanned} shipped files.`);
