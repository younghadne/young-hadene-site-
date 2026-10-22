// Guard: a page's Article / BlogPosting / NewsArticle JSON-LD must describe
// that page: its url / mainEntityOfPage must match the page's canonical, and
// (url compared by slug: root/blog twin copies share one)
// its headline must not be another page's <title>/<h1> (unless it is also
// this page's own). Catches copied schema blocks from other pages.
import fs from 'node:fs';
import path from 'node:path';
const SKIP = new Set(['index.html', 'admin.html', 'admin-email.html']);
const ART = new Set(['Article', 'BlogPosting', 'NewsArticle']);
const norm = (s) => String(s || '').replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const clean = (u) => String(u || '').replace(/[#?].*$/, '').replace(/\.html$/, '').replace(/\/$/, '');
const slug = (u) => clean(u).split('/').pop();
const lead = (h) => norm(h).split(/ [—|:–-] /)[0];
const pages = [];
for (const d of ['.', 'blog', 'news', 'music', 'videos']) {
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.html'))) {
    const rel = path.join(d, f).replace(/^\.\//, '');
    if (SKIP.has(rel)) continue;
    const s = fs.readFileSync(rel, 'utf8');
    const own = new Set([...s.matchAll(/<title>([^<]*)<\/title>/g), ...s.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => norm(m[1])));
    const canon = (s.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || '';
    pages.push({ rel, s, own, canon });
  }
}
const owner = new Map();
for (const p of pages) for (const t of p.own) if (t) { if (!owner.has(t)) owner.set(t, []); owner.get(t).push(p.rel); }
const bad = [];
const seen = new Map();
for (const p of pages) for (const m of p.s.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
  try { for (const o of [].concat((x => x['@graph'] || x)(JSON.parse(m[1])))) if (o && ART.has(o['@type']) && o.headline) seen.set(norm(o.headline), (seen.get(norm(o.headline)) || 0) + 1); } catch {}
}
for (const p of pages) {
  for (const m of p.s.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let j; try { j = JSON.parse(m[1]); } catch { continue; }
    for (const o of [].concat(j['@graph'] || j)) {
      if (!o || !ART.has(o['@type'])) continue;
      const u = o.url || (o.mainEntityOfPage && (o.mainEntityOfPage['@id'] || o.mainEntityOfPage));
      if (u && typeof u === 'string' && p.canon && slug(u) !== slug(p.canon)) bad.push(`${p.rel}: ${o['@type']} url ${u} != canonical ${p.canon}`);
      const h = norm(o.headline);
      if (!h || p.own.has(h)) continue;
      if (owner.has(h)) { bad.push(`${p.rel}: ${o['@type']} headline belongs to ${owner.get(h).join(', ')}`); continue; }
      // Same headline on several pages and not even this page's own title lead -> copied block.
      const ownLead = [...p.own].some((t) => t.startsWith(lead(h)));
      if (!ownLead && (seen.get(h) || 0) > 1) bad.push(`${p.rel}: ${o['@type']} headline "${o.headline}" is copied from another page`);
    }
  }
}
if (bad.length) { console.error('ARTICLE-SCHEMA-CHECK FAIL:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`ARTICLE-SCHEMA-CHECK OK: ${pages.length} pages, Article schema describes its own page.`);
