// Tap-target guard for the PR #18 blog batch (UX tap check at 360/402, Android Chromium + iPhone WebKit).
// Technique (same as PR #8): padding offset by a matching negative margin, so layout and CLS do not change.
// Fails when, on any of the 5 posts:
//  - "← Back to Blog" < 44px (20.47px text + 2 x padding-block) or its margins don't cancel the padding (32px gap kept)
//  - breadcrumb "Home"/"Blog" < 44px (15px text box; 14.52px while a fallback font shows) or no matching negative margin
//  - byline "Young Hadene Team" < 24px (14px text box) or no matching negative margin
//  - a standalone "… on YouTube" video link (only child of its li) < 44px (19px text box), padding without matching
//    negative margin, or two of them on consecutive rows (35.36px apart) whose tap areas overlap, or one reaching into
//    the next row's link (text box 4.18px below the row top) / above the 20px gap under the preceding block
//  - the 4-minutes-of-hell inline "official upload on YouTube" link (mid-sentence in a list item) < 24px (19px text box,
//    18.39px while a fallback font shows), has any margin (it must be padding only, so no line box moves), or pads more
//    than the 4.18px half-leading per side (27.36px line, 19px text), which could reach a link on an adjacent line
//  - the 4-minutes-of-hell 'Inter Optional' (font-display: optional) fix is missing
import fs from 'node:fs';

const POSTS = ['young-hadene-4-minutes-of-hell-freestyle', 'young-hadene-nightmares-in-the-nighttime', 'young-hadene-in-the-cut',
  'young-hadene-rise-again-from-the-bottom', 'haitian-rappers-in-toronto-young-hadene-and-the-new-generation'];
const bad = [];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const px = (v) => { const m = String(v).trim().match(/^(-?[\d.]+)px$/); return m ? Number(m[1]) : (String(v).trim() === '0' ? 0 : NaN); };
// [top, right, bottom, left] from a 1-4 value shorthand
const box = (v) => { const p = v.trim().split(/\s+/).map(px); return [p[0], p[1] ?? p[0], p[2] ?? p[0], p[3] ?? p[1] ?? p[0]]; };
function rule(css, sel) {
  const ms = [...css.matchAll(new RegExp('(?:^|[}\\n])\\s*' + esc(sel) + '\\s*\\{([^}]*)\\}', 'g'))];
  if (!ms.length) return null;
  const d = Object.fromEntries(ms.map((m) => m[1]).join(';').split(';').map((x) => x.split(':')).filter((x) => x.length >= 2).map(([k, ...v]) => [k.trim(), v.join(':').trim()]));
  let pad, mar;
  if (d['padding-block']) { const p = d['padding-block'].split(/\s+/).map(px); pad = [p[0], p[1] ?? p[0]]; }
  if (d.padding) { const b = box(d.padding); pad = [b[0], b[2]]; }
  if (d['margin-block']) { const p = d['margin-block'].split(/\s+/).map(px); mar = [p[0], p[1] ?? p[0]]; }
  if (d.margin) { const b = box(d.margin); mar = [b[0], b[2]]; }
  return { pad, mar };
}
const H = { back: 20.47, crumb: 14.52, byline: 14, video: 19 };
const ROW = 27.36 + 8, INSET = 4.18, LINK_GAP = ROW - H.video; // 16.36px between consecutive rows' link text boxes

for (const slug of POSTS) {
  const f = `blog/${slug}.html`;
  const s = fs.readFileSync(f, 'utf8');
  const css = (s.match(/<style>([\s\S]*?)<\/style>/g) || []).join('\n');
  const check = (label, sel, textH, min, keepBottom) => {
    const r = rule(css, sel);
    if (!r || !r.pad) return bad.push(`${f}: no "${sel} { padding }" tap-target rule (${label})`), null;
    const tap = textH + r.pad[0] + r.pad[1];
    if (!(tap + 1e-6 >= min)) bad.push(`${f}: ${label} tap target ${tap.toFixed(2)}px (< ${min}px)`);
    if (!r.mar || Math.abs(r.mar[0] + r.pad[0]) > 1e-6 || Math.abs(r.mar[1] + r.pad[1] - (keepBottom || 0)) > 1e-6)
      bad.push(`${f}: ${label} padding ${r.pad.join('/')}px not cancelled by a matching negative margin (got ${r.mar ? r.mar.join('/') : 'none'})`);
    return r;
  };
  check('"← Back to Blog"', '.back-link', H.back, 44, 32);
  check('breadcrumb links', '.article-wrap .breadcrumb a', H.crumb, 44);
  check('byline link', '.article-wrap .meta a[rel="author"]', H.byline, 24);
  if (!/<nav class="breadcrumb"[^>]*><a href="\/">Home<\/a> &rsaquo; <a href="\/blog">Blog<\/a>/.test(s)) bad.push(`${f}: breadcrumb markup changed (Home › Blog)`);
  if (!/<a href="\/about" rel="author"[^>]*>Young Hadene Team<\/a>/.test(s)) bad.push(`${f}: byline link markup changed`);

  // Standalone video links: each <li> whose only child is an <a> ending "on YouTube".
  const lists = [...s.matchAll(/<ul>([\s\S]*?)<\/ul>/g)].map((m) => [...m[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((x) => x[1].trim()));
  for (const items of lists) {
    let prev = null; // bottom of the previous row's tap area, relative to that row's text box bottom
    items.forEach((li, i) => {
      const a = li.match(/^<a href="(https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11})"[^>]*>([^<]*on YouTube)<\/a>$/);
      if (!a) { if (prev !== null && prev > LINK_GAP + 1e-6) bad.push(`${f}: "${items[i - 1].replace(/<[^>]+>/g, '')}" tap area reaches ${prev}px below its text, into the next row's link (gap ${LINK_GAP.toFixed(2)}px)`); prev = null; return; }
      const r = check(`"${a[2]}"`, `.article-wrap li > a[href="${a[1]}"]:only-child`, H.video, 44);
      if (!r) { prev = null; return; }
      if (i === 0 && r.pad[0] > 20 + INSET + 1e-6) bad.push(`${f}: "${a[2]}" reaches ${r.pad[0]}px above its text, past the 20px gap under the block before the list`);
      if (prev !== null && prev + r.pad[0] > LINK_GAP + 1e-6) bad.push(`${f}: "${a[2]}" tap area overlaps the row above by ${(prev + r.pad[0] - LINK_GAP).toFixed(2)}px`);
      prev = r.pad[1];
    });
    if (prev !== null && prev > LINK_GAP) bad.push(`${f}: last video link tap area too deep`);
  }
  if (slug === 'young-hadene-in-the-cut' && !/a\[href="https:\/\/www\.youtube\.com\/watch\?v=CHgnY3hmxng"\]:only-child/.test(css)) bad.push(`${f}: "Watch In the Cut on YouTube" tap rule missing`);
  if (slug === 'young-hadene-rise-again-from-the-bottom' && !(/BoQNixsRSUU"\]:only-child/.test(css) && /YMaBpODIwKM"\]:only-child/.test(css))) bad.push(`${f}: Rise Again / From the Bottom tap rules missing`);
  if (slug === 'young-hadene-4-minutes-of-hell-freestyle') {
    const href = 'https://www.youtube.com/watch?v=GTo22YurPzY', label = '"official upload on YouTube" (inline)';
    if (!s.includes(`<li>Watch the <a href="${href}" target="_blank" rel="noopener">official upload on YouTube</a>.</li>`)) bad.push(`${f}: ${label} link markup changed`);
    const r = rule(css, `.article-wrap li > a[href="${href}"]`);
    if (!r || !r.pad) bad.push(`${f}: no tap-target padding rule for ${label}`);
    else {
      const tap = 18.39 + r.pad[0] + r.pad[1];
      if (!(tap + 1e-6 >= 24)) bad.push(`${f}: ${label} tap target ${tap.toFixed(2)}px with a fallback font (< 24px)`);
      if (r.pad.some((p) => p > INSET + 1e-6)) bad.push(`${f}: ${label} padding ${r.pad.join('/')}px exceeds the ${INSET}px half-leading (could overlap a link on an adjacent line)`);
      if (r.mar && r.mar.some((m) => m !== 0)) bad.push(`${f}: ${label} must use padding only (no margin), got margin ${r.mar.join('/')}px`);
    }
  }
  if (slug === 'young-hadene-4-minutes-of-hell-freestyle' && !(/font-family: 'Inter Optional';[^}]*font-display: optional/.test(css) && /--font-body: 'Inter Optional'/.test(css)))
    bad.push(`${f}: 'Inter Optional' font-display: optional fix missing`);
}
if (bad.length) { console.error('BLOG-TAPS FAIL:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`BLOG-TAPS OK: ${POSTS.length} posts (back link 44px, breadcrumbs 44px, byline 24px, standalone YouTube links 44px without overlap, inline "official upload" link 24px padding-only; padding cancelled by negative margins elsewhere).`);
