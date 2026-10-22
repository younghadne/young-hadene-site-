// Builds /blog/top-toronto-rappers (blog/top-toronto-rappers.html and its root
// twin top-toronto-rappers.html) from scripts/anchor/*.
//   node scripts/build-anchor.mjs          write both files
//   node scripts/build-anchor.mjs --check  fail if either file is out of date
// To change the page title, edit TITLE below and re-run (one place).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TITLE = 'Top Toronto Rappers to Know: 15 Artists, From Maestro to Now';
export const H1 = 'Top Toronto Rappers to Know: 15 Artists, From Maestro to Now';
export const DESCRIPTION = 'Our guide to 15 top Toronto rappers to know, from Maestro Fresh Wes and Drake to Pressa and Young Hadene, with sourced facts and a first track for each.';
export const DISCLOSURE = "This site is run by Young Hadene's team. Every artist on this list gets the same format and the same kinds of facts.";
export const CANONICAL = 'https://younghadene.ca/blog/top-toronto-rappers';
export const OUTPUTS = ['blog/top-toronto-rappers.html', 'top-toronto-rappers.html'];
const IMAGE = 'https://younghadene.ca/images/poster1.png';
const PUBLISHED = '2026-05-31', MODIFIED = '2026-10-22';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const blocks = JSON.parse(fs.readFileSync(path.join(here, 'anchor', 'top-toronto-rappers.content.json'), 'utf8'));
const template = fs.readFileSync(path.join(here, 'anchor', 'top-toronto-rappers.template.html'), 'utf8');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (s) => esc(s).replace(/"/g, '&quot;');
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fnKeys = blocks.filter((b) => b.t === 'fn').map((b) => b.k);
const fnNum = (k) => { const i = fnKeys.indexOf(k); if (i < 0) throw new Error('unknown footnote ' + k); return i + 1; };
const inline = (s) => esc(s)
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\*([^*]+)\*/g, '<em>$1</em>')
  .replace(/\[\^([^\]]+)\]/g, (_, k) => `<sup><a href="#src-${k}">${fnNum(k)}</a></sup>`)
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`);
const plain = (s) => s.replace(/\[\^[^\]]+\]/g, '').replace(/\*\*?([^*]+)\*\*?/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
const linkify = (s) => esc(s).replace(/https?:\/\/(?:[^\s;,()]|\([^\s()]*\))+/g, (u) => `<a href="${u}" rel="noopener">${u}</a>`);

// ---- body ----
const out = [];
const artists = [];
const faq = [];
let section = '';
for (let i = 0; i < blocks.length; i++) {
  const b = blocks[i];
  if (b.t === 'h2') {
    section = b.x;
    const id = /^Sources$/.test(b.x) ? 'sources' : /^Frequently/.test(b.x) ? 'faq' : slugify(b.x.replace(/\(.*\)/, ''));
    out.push(`<h2 id="${id}">${inline(b.x)}</h2>`);
    if (id === 'sources') {
      // intro line, then numbered list of sources
      const p = blocks[i + 1]; if (p && p.t === 'p') { out.push(`<p>${inline(p.x)}</p>`); i++; }
      out.push('<ol class="sources">');
      for (const f of blocks.filter((x) => x.t === 'fn')) out.push(`  <li id="src-${f.k}">${linkify(f.x)}</li>`);
      out.push('</ol>');
      i = blocks.length;
    }
    continue;
  }
  if (b.t === 'h3') {
    const ul = blocks[i + 1];
    if (!ul || ul.t !== 'ul') throw new Error('artist without facts: ' + b.x);
    const id = slugify(b.x);
    artists.push({ name: b.x, id });
    out.push(`<div class="artist-card" id="${id}">`, '  <div class="info">', `    <h3>${inline(b.x)}</h3>`, '    <ul>');
    for (const it of ul.items) out.push(`      <li>${inline(it)}</li>`);
    out.push('    </ul>', '  </div>', '</div>');
    i++;
    continue;
  }
  if (b.t === 'ul') { out.push('<ul>', ...b.items.map((it) => `  <li>${inline(it)}</li>`), '</ul>'); continue; }
  if (b.t === 'p' && /^Frequently/.test(section) && /^\*\*[^*]+\*\*$/.test(b.x)) {
    const a = blocks[i + 1];
    faq.push({ q: plain(b.x), a: plain(a.x) });
    out.push('<div class="highlight-box">', `  <p><strong>${inline(b.x.slice(2, -2))}</strong><br>`, `  ${inline(a.x)}</p>`, '</div>');
    i++;
    continue;
  }
  if (b.t === 'p') {
    const isDisclosure = b.x.startsWith('**' + DISCLOSURE + '**');
    out.push(`<p${isDisclosure ? ' class="disclosure"' : ''}>${inline(b.x)}</p>`);
    continue;
  }
}
const words = out.join(' ').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
const mins = Math.max(1, Math.round(words / 230));
const body = [
  '        <div class="meta">Published May 31, 2026 &middot; Updated October 22, 2026 &middot; <span>By Young Hadene Team</span> &middot; ' + mins + ' min read</div>',
  '',
  `        <h1>${esc(H1)}</h1>`,
  '',
  ...out.map((l) => (l ? '        ' + l : l)),
  '',
].join('\n');

// ---- head ----
const meta = [
  `  <title>${esc(TITLE)}</title>`,
  `  <meta name="description" content="${attr(DESCRIPTION)}">`,
  `  <link rel="canonical" href="${CANONICAL}">`,
  `  <meta property="og:title" content="${attr(TITLE)}">`,
  `  <meta property="og:description" content="${attr(DESCRIPTION)}">`,
  `  <meta property="og:image" content="${IMAGE}">`,
  `  <meta property="og:url" content="${CANONICAL}">`,
  '  <meta property="og:type" content="article">',
  '  <meta property="og:locale" content="en_CA">',
  '  <meta property="og:site_name" content="Young Hadene">',
  '  <meta name="twitter:card" content="summary_large_image">',
  `  <meta name="twitter:image" content="${IMAGE}">`,
  `  <meta name="twitter:description" content="${attr(DESCRIPTION)}">`,
  `  <meta name="twitter:title" content="${attr(TITLE)}">`,
].join('\n');
const ld = (o) => '  <script type="application/ld+json">\n' + JSON.stringify(o, null, 2).replace(/^/gm, '  ').replace(/</g, '\\u003c') + '\n  </script>';
const schema = [
  ld({
    '@context': 'https://schema.org', '@type': 'Article', headline: TITLE, description: DESCRIPTION,
    author: { '@type': 'Organization', name: 'Young Hadene Team', url: 'https://younghadene.ca/about' },
    publisher: { '@type': 'Organization', name: 'Young Hadene', url: 'https://younghadene.ca/' },
    datePublished: PUBLISHED, dateModified: MODIFIED, image: IMAGE,
    mainEntityOfPage: { '@type': 'WebPage', '@id': CANONICAL }, url: CANONICAL,
  }),
  ld({
    '@context': 'https://schema.org', '@type': 'ItemList', name: 'Toronto rappers to know, grouped by era (not a ranking)',
    itemListOrder: 'https://schema.org/ItemListUnordered', numberOfItems: artists.length,
    itemListElement: artists.map((a, i) => ({ '@type': 'ListItem', position: i + 1, name: a.name, url: `${CANONICAL}#${a.id}` })),
  }),
  ld({
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  }),
].join('\n');
const breadcrumb = '  <script type="application/ld+json">' + JSON.stringify({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://younghadene.ca/' },
    { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://younghadene.ca/blog.html' },
    { '@type': 'ListItem', position: 3, name: TITLE, item: CANONICAL },
  ] }) + '</script>';

export const html = template.replace('{{META}}', () => meta).replace('{{SCHEMA}}', () => schema)
  .replace('{{BREADCRUMB}}', () => breadcrumb).replace('{{BODY}}', () => body);
export const ARTISTS = artists;
export const FAQ = faq;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const f of OUTPUTS) {
    const p = path.join(root, f);
    if (check) { if (fs.readFileSync(p, 'utf8') !== html) { stale++; console.error('ANCHOR-BUILD STALE: ' + f + ' (run node scripts/build-anchor.mjs)'); } }
    else fs.writeFileSync(p, html);
  }
  if (stale) process.exit(1);
  console.log(check ? `ANCHOR-BUILD OK: ${OUTPUTS.join(', ')} match scripts/anchor sources.` : `Wrote ${OUTPUTS.join(', ')} (${artists.length} artists, ${faq.length} FAQ, ${mins} min read).`);
}
