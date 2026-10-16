// Guard: no skipped heading levels (e.g. H1 -> H3, H2 -> H4) on any static
// page except index.html (homepage handled separately) and admin pages.
import fs from 'node:fs';
import path from 'node:path';
const SKIP = new Set(['index.html', 'admin.html', 'admin-email.html']);
const dirs = ['.', 'blog', 'news', 'music', 'videos'];
const bad = [];
let n = 0;
for (const d of dirs) {
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.html'))) {
    const rel = path.join(d, f).replace(/^\.\//, '');
    if (SKIP.has(rel)) continue;
    const s = fs.readFileSync(rel, 'utf8');
    const body = s.slice(Math.max(0, s.indexOf('<body')));
    let prev = 0;
    for (const m of body.matchAll(/<h([1-6])\b/g)) {
      const l = Number(m[1]);
      if (prev && l > prev + 1) { bad.push(`${rel}: h${prev} -> h${l}`); break; }
      prev = l;
    }
    n++;
  }
}
// KV-rendered blog template: CTA heading after the body must not be an h3.
const tpl = fs.readFileSync('functions/blog/[slug].js', 'utf8');
if (/cta-box"><h3/.test(tpl)) bad.push('functions/blog/[slug].js: cta-box uses <h3> (skips a level when the body has no h2)');
if (bad.length) { console.error('HEADING-CHECK FAIL:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`HEADING-CHECK OK: ${n} pages, no skipped heading levels.`);
