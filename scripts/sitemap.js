#!/usr/bin/env node
// Static sitemap.xml generator + check (run: npm run sitemap / npm test).
// Includes every .html page whose canonical points to itself, except:
// noindex pages, /admin*, blog posts in BLOG_REDIRECTS/BLOG_NOINDEX, news in NEWS_NOINDEX,
// and EXCLUDE below. lastmod = git date of the page's last commit.
// KV-only posts are added at request time by functions/sitemap.xml.js.
// `node scripts/sitemap.js` writes sitemap.xml; `--check` fails if it is stale.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), SITE = 'https://younghadene.ca';
// Legacy root-level posts not in the sitemap before; kept out pending SEO Lead review.
const EXCLUDE = new Set([
  '/basement-to-stage-first-show', '/inside-young-hadene-an-honest-look', '/late-night-lab-no-sleep',
  '/studio-gear-dark-trap-signal-chain', '/top-10-underground-toronto-tracks-2026', '/underground-toronto-sound-2026',
  '/venues-built-toronto-sound', '/who-is-young-hadene', '/privacy', '/terms',
]);
const isLegacy = (u) => /^\/what-to-know-about-/.test(u);
const load = (f, name) => {
  const src = fs.readFileSync(path.join(ROOT, 'functions', f), 'utf8').replace(/export const /g, 'const ');
  return new Function(src + `; return ${name};`)();
};
const REDIRECTS = load('_blog-redirects.js', 'BLOG_REDIRECTS');
const NOINDEX = load('_news-noindex.js', 'NEWS_NOINDEX');
const BLOG_NOINDEX = load('_blog-redirects.js', 'BLOG_NOINDEX');
const PRIORITY = { '/': '1.0', '/music': '0.9', '/blog': '0.9', '/news': '0.9', '/videos': '0.9' };

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.wrangler', 'functions', 'scripts'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out); else if (e.name.endsWith('.html')) out.push(full);
  }
  return out;
}
function gitDate(file) {
  try { return execFileSync('git', ['log', '-1', '--format=%cs', '--', file], { cwd: ROOT }).toString().trim(); } catch { return ''; }
}
function pages() {
  const out = [], seen = new Set();
  for (const file of walk(ROOT)) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    let url = '/' + rel.replace(/\.html$/, '').replace(/(^|\/)index$/, '');
    if (url.length > 1) url = url.replace(/\/$/, '');
    const html = fs.readFileSync(file, 'utf8');
    if (/<meta[^>]+name="robots"[^>]+noindex/i.test(html)) continue;
    if (url.startsWith('/admin') || url === '/404' || EXCLUDE.has(url) || isLegacy(url)) continue;
    const m = url.match(/^\/(blog|news)\/([^/]+)$/);
    if (m && (m[1] === 'blog' ? REDIRECTS[m[2]] || BLOG_NOINDEX.has(m[2]) : NOINDEX.has(m[2]))) continue;
    const can = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
    if (can && can.replace(SITE, '').replace(/\/$/, '') !== (url === '/' ? '' : url)) continue;
    if (seen.has(url)) continue; // e.g. blog.html and blog/index.html both = /blog
    seen.add(url);
    out.push({ url, file: rel });
  }
  return out.sort((a, b) => (a.url === '/' ? -1 : b.url === '/' ? 1 : a.url.localeCompare(b.url)));
}
function build(withDates = true) {
  let x = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const p of pages()) {
    const lm = withDates ? gitDate(p.file) : '';
    const pr = PRIORITY[p.url] || (/^\/(blog|news|music|videos)\//.test(p.url) ? '0.8' : '0.7');
    x += `  <url><loc>${SITE}${p.url}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ''}<priority>${pr}</priority></url>\n`;
  }
  return x + '</urlset>\n';
}
const locs = (s) => [...s.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
// Every sitemap URL must be clean (no .html), equal its page's canonical, and not be a redirect source.
function redirectSources() {
  const set = new Set(Object.keys(REDIRECTS).map((s) => '/blog/' + s));
  const f = path.join(ROOT, '_redirects');
  if (fs.existsSync(f)) for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    set.add(t.split(/\s+/)[0].replace(/\/$/, '') || '/');
  }
  return set;
}
function fileFor(u) {
  const rel = u === '/' ? 'index.html' : u.replace(/^\//, '');
  for (const c of [rel + '.html', path.join(rel, 'index.html'), rel]) if (c.endsWith('.html') && fs.existsSync(path.join(ROOT, c))) return c;
  return null;
}
function validate(list) {
  const errs = [], redir = redirectSources(), dup = new Set();
  for (const loc of list) {
    if (dup.has(loc)) errs.push(`duplicate URL: ${loc}`);
    dup.add(loc);
    const u = loc.replace(SITE, '') || '/';
    if (!loc.startsWith(SITE + '/')) { errs.push(`not on ${SITE}: ${loc}`); continue; }
    if (/\.html$/.test(u)) errs.push(`ends in .html: ${loc}`);
    if (redir.has(u.replace(/\/$/, '') || '/')) errs.push(`is a redirect source in _redirects/BLOG_REDIRECTS: ${loc}`);
    const f = fileFor(u.replace(/\.html$/, ''));
    if (!f) { errs.push(`no page file: ${loc}`); continue; }
    const can = (fs.readFileSync(path.join(ROOT, f), 'utf8').match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
    if (!can) errs.push(`page has no canonical: ${loc}`);
    else if (can.replace(/\/$/, '') !== loc.replace(/\/$/, '')) errs.push(`canonical mismatch: ${loc} (page canonical ${can})`);
  }
  return errs;
}
if (process.argv.includes('--check')) {
  const fi = process.argv.indexOf('--file'), file = fi > 0 ? path.resolve(process.argv[fi + 1]) : path.join(ROOT, 'sitemap.xml');
  const raw = locs(fs.readFileSync(file, 'utf8'));
  const errs = validate(raw);
  if (errs.length) {
    errs.slice(0, 15).forEach((e) => console.log('SITEMAP-CHECK FAIL', e));
    console.log(`SITEMAP-CHECK FAIL: ${errs.length} problem(s) in ${raw.length} URLs (${path.basename(file)}).`); process.exit(1);
  }
  const want = locs(build(false)), have = raw;
  const missing = want.filter((u) => !have.includes(u)), extra = have.filter((u) => !want.includes(u));
  if (missing.length || extra.length) {
    missing.forEach((u) => console.log('SITEMAP-CHECK FAIL missing:', u));
    extra.forEach((u) => console.log('SITEMAP-CHECK FAIL no such indexable page:', u));
    console.log('Run `npm run sitemap` to regenerate.'); process.exit(1);
  }
  console.log(`SITEMAP-CHECK OK: ${want.length} URLs match the indexable pages.`);
} else {
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), build());
  console.log(`sitemap.xml written: ${pages().length} URLs`);
}
