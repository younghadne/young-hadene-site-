// Shared helpers for repo-first news posts (scripts/news/<slug>.md).
// The .md files are the approved drafts, copied byte-for-byte. Each one is
// built to news/<slug>.html and served by functions/news/[slug].js through
// its static fallback (no KV doc exists for these slugs). URL: /news/<slug>.
import fs from 'node:fs';
import path from 'node:path';

export const SITE = 'https://younghadene.ca';
export const SRC_DIR = 'scripts/news';

export function listSources() {
  if (!fs.existsSync(SRC_DIR)) return [];
  return fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.md')).sort().map((f) => path.join(SRC_DIR, f));
}

// Minimal front-matter reader for the fields our drafts use.
export function parse(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: no front matter`);
  const fm = {}, lines = m[1].split('\n');
  const unq = (s) => s.trim().replace(/^"(.*)"$/, '$1');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const kv = l.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (!kv) continue;
    const [, k, v] = kv;
    if (v !== '') { fm[k] = v.startsWith('[') ? JSON.parse(v) : unq(v); continue; }
    if (k === 'author') {
      const a = {};
      while (i + 1 < lines.length && /^\s+/.test(lines[i + 1])) {
        const s = lines[++i].trim().match(/^"?([@A-Za-z_]+)"?:\s*(.*)$/);
        if (s) a[s[1]] = unq(s[2]);
      }
      fm.author = a;
    } else {
      const arr = [];
      while (i + 1 < lines.length && /^\s+-\s/.test(lines[i + 1])) arr.push(unq(lines[++i].replace(/^\s+-\s/, '')));
      fm[k] = arr;
    }
  }
  const slug = path.basename(file, '.md');
  const sources = (fm.sources || []).map((s) => {
    const u = (s.match(/(https?:\/\/\S+)\s*$/) || [])[1] || '';
    const parts = s.replace(/,?\s*https?:\/\/\S+\s*$/, '').split(':');
    return { text: s, url: u, publisher: parts[0].trim() };
  });
  return { file, slug, fm, sources, body: m[2], raw };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s) {
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => /^https?:/.test(u)
    ? `<a href="${u}" target="_blank" rel="noopener">${t}</a>`
    : `<a href="${u}">${t}</a>`);
  // **bold** may contain *italic* (e.g. **When does *Title* come out?**);
  // the italic pass below then converts the inner *...*.
  s = s.replace(/\*\*((?:[^*]|\*[^*]+\*)+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // _italic_ only at word edges, so snake_case and URL underscores are left alone.
  s = s.replace(/(^|[\s(>])_([^_\s](?:[^_]*[^_\s])?)_(?=$|[\s.,;:!?)<])/g, '$1<em>$2</em>');
  return s;
}

// Markdown subset used by the drafts: #/## headings, paragraphs, "- " lists,
// pipe tables, **bold**, *italic* or _italic_ (italic may sit inside bold),
// [links](url).
export function renderBody(md) {
  const blocks = md.trim().split(/\n\s*\n/);
  let h1 = '', html = '';
  for (const b of blocks) {
    const lines = b.split('\n');
    if (/^# /.test(b) && lines.length === 1) { h1 = b.slice(2).trim(); continue; }
    if (/^## /.test(b) && lines.length === 1) { html += `<h2>${inline(b.slice(3).trim())}</h2>`; continue; }
    if (lines.every((l) => /^- /.test(l))) { html += '<ul>' + lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join('') + '</ul>'; continue; }
    if (lines.length >= 2 && lines.every((l) => /^\|.*\|$/.test(l)) && /^\|[\s|:-]+\|$/.test(lines[1])) {
      const cells = (l) => l.slice(1, -1).split('|').map((c) => c.trim());
      const head = cells(lines[0]);
      html += '<div class="table-wrap"><table><thead><tr>' + head.map((c) => `<th scope="col">${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
        lines.slice(2).map((l) => '<tr>' + cells(l).map((c, i) => i === 0 ? `<th scope="row">${inline(c)}</th>` : `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
        '</tbody></table></div>';
      continue;
    }
    html += '<p>' + lines.map(inline).join('<br>') + '</p>';
  }
  return { h1, html };
}

// <title> is the approved front-matter title exactly (no site suffix), so it
// matches og:title, twitter:title and the schema headline.
export function pageTitle(t) { return t; }

export function longDate(iso) {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function buildPage(p) {
  const { fm, slug, sources } = p;
  const { h1, html } = renderBody(p.body);
  const canon = `${SITE}/news/${slug}`;
  const img = `${SITE}/images/poster1.png`;
  const schema = {
    '@context': 'https://schema.org', '@type': 'NewsArticle',
    headline: fm.title, description: fm.meta_description, image: img,
    datePublished: fm.datePublished, dateModified: fm.datePublished,
    author: { '@type': 'Organization', name: fm.author.name, url: `${SITE}/editorial-policy` },
    publisher: { '@type': 'NewsMediaOrganization', name: 'Young Hadene News', logo: { '@type': 'ImageObject', url: img } },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canon },
    isBasedOn: sources.map((s) => s.url),
    citation: sources.map((s) => ({ '@type': 'CreativeWork', url: s.url, publisher: { '@type': 'Organization', name: s.publisher } })),
  };
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
    { '@type': 'ListItem', position: 2, name: 'News', item: `${SITE}/news` },
    { '@type': 'ListItem', position: 3, name: fm.title, item: canon },
  ] };
  const ld = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<!-- Built from ${p.file} by scripts/build-news-posts.mjs. Edit the .md, then run: node scripts/build-news-posts.mjs -->
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-G6KR0GM63L');
  (function(){
    var done = false, evs = ['scroll', 'pointerdown', 'keydown', 'touchstart'];
    function loadGtag(){
      if (done) return; done = true;
      evs.forEach(function(e){ window.removeEventListener(e, loadGtag, true); });
      var s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=G-G6KR0GM63L';
      document.head.appendChild(s);
    }
    evs.forEach(function(e){ window.addEventListener(e, loadGtag, {capture: true, passive: true, once: true}); });
    function later(){ setTimeout(function(){ if (window.requestIdleCallback) requestIdleCallback(loadGtag, {timeout: 2000}); else loadGtag(); }, 3000); }
    if (document.readyState === 'complete') later();
    else window.addEventListener('load', later, {once: true});
  })();
</script><meta name="viewport" content="width=device-width,initial-scale=1.0, viewport-fit=cover"><title>${esc(pageTitle(fm.title))}</title><meta name="description" content="${esc(fm.meta_description)}"><link rel="canonical" href="${canon}"><meta property="og:title" content="${esc(fm.title)}"><meta property="og:description" content="${esc(fm.meta_description)}"><meta property="og:image" content="${img}"><meta property="og:url" content="${canon}"><meta property="og:type" content="article"><meta property="og:locale" content="en_CA"><meta property="og:site_name" content="Young Hadene"><meta property="article:published_time" content="${fm.datePublished}"><meta property="article:author" content="${esc(fm.author.name)}"><meta name="author" content="${esc(fm.author.name)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(fm.title)}"><meta name="twitter:description" content="${esc(fm.meta_description)}"><meta name="twitter:image" content="${img}"><link rel="stylesheet" href="../css/style.css"><link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='28' font-size='28'>🎤</text></svg>"><script type="application/ld+json">${ld(schema)}</script><script type="application/ld+json">${ld(crumbs)}</script><style>
.article-wrap{max-width:720px;margin:0 auto;padding:40px 0;}
.article-wrap h1{font-size:clamp(2rem,5vw,3rem);margin-bottom:16px;line-height:1.08;}
.article-wrap .meta{color:var(--text-muted);font-size:.8rem;margin-bottom:32px;text-transform:uppercase;letter-spacing:.08em;}
.article-wrap .meta a{color:var(--accent);}
.article-wrap p{color:var(--text-secondary);line-height:1.8;margin-bottom:18px;font-size:.95rem;overflow-wrap:anywhere;}
.article-wrap p strong{color:var(--text-primary);}
.article-wrap p a,.article-wrap li a{color:var(--accent);}
.article-wrap h2{font-size:1.5rem;margin-top:40px;margin-bottom:14px;font-family:var(--font-heading);letter-spacing:.04em;}
.article-wrap ul{color:var(--text-secondary);line-height:1.8;margin-bottom:18px;padding-left:24px;font-size:.95rem;}
.article-wrap li{margin-bottom:8px;}
.article-wrap .table-wrap{overflow-x:auto;margin-bottom:24px;}
.article-wrap table{width:100%;border-collapse:collapse;font-size:.9rem;color:var(--text-secondary);}
.article-wrap th,.article-wrap td{text-align:left;vertical-align:top;padding:10px 12px;border-bottom:1px solid var(--border-color);}
.article-wrap thead th{color:var(--text-primary);text-transform:uppercase;font-size:.75rem;letter-spacing:.06em;}
.article-wrap tbody th{color:var(--text-primary);font-weight:600;white-space:nowrap;}
.back-link{display:inline-flex;align-items:center;gap:8px;color:var(--text-muted);font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;margin-bottom:32px;}
.back-link:hover{color:var(--accent);}
.correction-note{margin-top:40px;padding:16px 20px;border:1px solid var(--border-color);border-radius:8px;font-size:.8rem;color:var(--text-muted);}
</style>
</head><body><header class="header"><div class="header-inner"><a href="/" class="logo">YOUNG<span class="logo-accent">HADENE</span><span class="logo-sub">Toronto • Dark Trap</span></a><button class="hamburger" aria-label="Menu"><span></span><span></span><span></span></button><nav><ul class="nav-list"><li><a href="/" class="nav-link">Home</a></li><li><a href="/music" class="nav-link">Music</a></li><li><a href="/videos" class="nav-link">Videos</a></li><li><a href="/blog" class="nav-link">Blog</a></li><li><a href="/news" class="nav-link active">News</a></li><li><a href="/about" class="nav-link">About</a></li><li><a href="/contact" class="nav-link">Contact</a></li><li><a href="/admin" class="nav-link" style="color:var(--text-muted);font-size:0.7rem;">Admin</a></li></ul></nav></div></header><section class="section" style="padding-top:120px;"><div class="container"><a href="/news" class="back-link">&#8592; Back to News</a><article class="article-wrap"><div class="meta"><time datetime="${fm.datePublished}">${longDate(fm.datePublished)}</time> &middot; <span>News</span> &middot; By <a href="/editorial-policy" rel="author">${esc(fm.author.name)}</a></div><h1>${inline(h1 || fm.title)}</h1>${html}<div class="correction-note">Correction notice: none to date. Spotted an error? See our <a href="/corrections-policy">Corrections Policy</a> or email <a href="mailto:contact@younghadene.ca">contact@younghadene.ca</a>.</div></article></div></section><footer class="footer"><div class="container"><div class="footer-bottom"><p>&copy; 2026 Young Hadene. All rights reserved. Toronto. 6ix.</p><div class="footer-bottom-links"><a href="/news">News</a><a href="/editorial-policy">Editorial Policy</a><a href="/privacy">Privacy</a></div></div></div></footer><script src="../js/main.js"></script></body></html>
`;
}

export function card(p) {
  return `        <a class="news-card" href="/news/${p.slug}">
          <div class="news-card-body">
            <span class="cat">News</span>
            <h2>${esc(p.fm.title)}</h2>
            <p>${esc(p.fm.meta_description)}</p>
            <span class="date">${longDate(p.fm.datePublished)} · By ${esc(p.fm.author.name)}</span>
          </div>
        </a>
`;
}

export function sitemapItem(p) {
  return `  <url>
    <loc>${SITE}/news/${p.slug}</loc>
    <news:news>
      <news:publication>
        <news:name>Young Hadene</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${p.fm.datePublished}</news:publication_date>
      <news:title>${esc(p.fm.title)}</news:title>
    </news:news>
  </url>
`;
}

export function rssItem(p) {
  const d = new Date(p.fm.datePublished + 'T04:00:00Z').toUTCString();
  return `  <item>
    <title>${esc(p.fm.title)}</title>
    <link>${SITE}/news/${p.slug}</link>
    <guid isPermaLink="true">${SITE}/news/${p.slug}</guid>
    <pubDate>${d}</pubDate>
    <description>${esc(p.fm.meta_description)}</description>
  </item>
`;
}
