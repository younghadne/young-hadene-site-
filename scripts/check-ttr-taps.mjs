// Guards the /blog/top-toronto-rappers tap-target CSS (PR #9) and its clean BreadcrumbList URLs.
// Each rule is padding offset so nothing visible moves; see the comments in the page's <style>.
// Fails if a rule is missing or loosened, or if a BreadcrumbList item points at a .html URL.
import fs from 'node:fs';

const FILE = 'blog/top-toronto-rappers.html';
const html = fs.readFileSync(FILE, 'utf8');
const css = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1].replace(/\/\*[\s\S]*?\*\//g, '')).join('\n');
const errors = [];

const rule = (sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const m = [...css.matchAll(new RegExp('(?:^|[}\\s])' + esc + '\\s*\\{([^}]*)\\}', 'g'))];
  return m.length ? m.map((x) => x[1]).join(';') : null;
};
const need = (sel, decls, why) => {
  const body = rule(sel);
  if (body == null) return errors.push(`${FILE}: missing rule "${sel}" (${why})`);
  const norm = body.replace(/\s+/g, ' ');
  for (const d of decls) if (!new RegExp('(^|;)\\s*' + d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s*') + '\\s*(;|$)').test(norm)) errors.push(`${FILE}: "${sel}" lacks "${d}" (${why})`);
};

need('.back-link', ['padding-block: 12px', 'margin-block: -12px 20px'], 'back link >= 44px, original 32px gap kept');
need('.footer ul li', ['margin-bottom: 0'], 'footer rows 44px apart so tap areas touch, not overlap');
need('.footer ul li a', ['display: inline-block', 'line-height: 20px', 'padding-block: 12px', 'margin-block: 0'], 'footer links 44px tall');
if (/class="toc"/.test(html)) {
  need('.article-wrap .toc li', ['display: flow-root'], 'stops TOC link margins collapsing into the li gap');
  need('.article-wrap .toc a', ['padding-block: 10px', 'margin-block: -4px'], 'TOC links >= 44px, rows unchanged');
}
need('.article-wrap p > a:not(.btn)', ['padding-block: 3px'], 'inline body links >= 24px');
need('.article-wrap .artist-card .info p > a:not(.btn)', ['padding-block: 4px'], 'inline card links >= 24px');

for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
  let j; try { j = JSON.parse(m[1]); } catch { continue; }
  for (const node of [j, ...(j['@graph'] || [])]) if (node && node['@type'] === 'BreadcrumbList')
    for (const it of node.itemListElement || []) { const u = typeof it.item === 'string' ? it.item : it.item && it.item['@id']; if (/\.html?(?:[?#]|$)/.test(u || '')) errors.push(`${FILE}: BreadcrumbList item ${it.position} uses ${u} (use the clean URL)`); }
}

if (errors.length) { console.error('TTR-TAPS-CHECK FAILED:\n  ' + errors.join('\n  ')); process.exit(1); }
console.log(`TTR-TAPS-CHECK OK: ${FILE} tap-target rules present, BreadcrumbList URLs clean.`);
