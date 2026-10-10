#!/usr/bin/env node
// Scaffold a new /news/ article with NewsArticle schema, byline,
// correction notice, and site chrome pre-wired.
// Usage: node scripts/new-news.js --title "Headline" --category Press --desc "One-line summary." [--slug custom-slug]
// Then edit the body paragraphs, run node scripts/build-static.js, commit + sync to gh-pages.
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const get = (k) => {
  const i = args.indexOf('--' + k);
  return i >= 0 && args[i + 1] ? args[i + 1] : '';
};
const title = get('title');
const category = get('category') || 'News';
const desc = get('desc') || title;
if (!title) {
  console.error('Usage: node scripts/new-news.js --title "Headline" --category Press --desc "Summary." [--slug custom-slug]');
  process.exit(1);
}
let slug = get('slug') || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 80);
const ROOT = path.join(__dirname, '..');
const SITE_URL = process.env.SITE_URL || 'https://younghadene.ca';
const now = new Date();
const iso = now.toISOString();
const dateShort = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${esc(title)} — Young Hadene News</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${SITE_URL}/news/${slug}.html"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="${SITE_URL}/images/poster1.png"><meta property="og:url" content="${SITE_URL}/news/${slug}.html"><meta property="og:type" content="article"><meta property="article:published_time" content="${iso.substring(0, 10)}"><meta property="article:author" content="Young Hadene"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${SITE_URL}/images/poster1.png"><link rel="stylesheet" href="../css/style.css"><link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='28' font-size='28'>🎤</text></svg>"><script type="application/ld+json">{"@context":"https://schema.org","@type":"NewsArticle","headline":${JSON.stringify(title)},"description":${JSON.stringify(desc)},"datePublished":${JSON.stringify(iso)},"dateModified":${JSON.stringify(iso)},"author":{"@type":"Person","name":"Young Hadene","jobTitle":"Editor","url":"${SITE_URL}/about.html"},"publisher":{"@type":"NewsMediaOrganization","name":"Young Hadene News","logo":{"@type":"ImageObject","url":"${SITE_URL}/images/poster1.png"}},"image":"${SITE_URL}/images/poster1.png","mainEntityOfPage":{"@type":"WebPage","@id":"${SITE_URL}/news/${slug}.html"}}</script><style>
.article-wrap{max-width:720px;margin:0 auto;padding:40px 0;}
.article-wrap h1{font-size:clamp(2rem,5vw,3rem);margin-bottom:16px;line-height:1.08;}
.article-wrap .meta{color:var(--text-muted);font-size:.8rem;margin-bottom:32px;text-transform:uppercase;letter-spacing:.08em;}
.article-wrap .meta a{color:var(--accent);}
.article-wrap p{color:var(--text-secondary);line-height:1.8;margin-bottom:18px;font-size:.95rem;}
.article-wrap p strong{color:var(--text-primary);}
.article-wrap h2{font-size:1.5rem;margin-top:40px;margin-bottom:14px;font-family:var(--font-heading);letter-spacing:.04em;}
.back-link{display:inline-flex;align-items:center;gap:8px;color:var(--text-muted);font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;margin-bottom:32px;}
.back-link:hover{color:var(--accent);}
.correction-note{margin-top:40px;padding:16px 20px;border:1px solid var(--border-color);border-radius:8px;font-size:.8rem;color:var(--text-muted);}
</style></head><body><header class="header"><div class="header-inner"><a href="/" class="logo">YOUNG<span class="logo-accent">HADENE</span><span class="logo-sub">Toronto • Dark Trap</span></a><button class="hamburger" aria-label="Menu"><span></span><span></span><span></span></button><nav><ul class="nav-list"><li><a href="/" class="nav-link">Home</a></li><li><a href="/music.html" class="nav-link">Music</a></li><li><a href="/blog.html" class="nav-link">Blog</a></li><li><a href="/news.html" class="nav-link active">News</a></li><li><a href="/contact.html" class="nav-link">Contact</a></li></ul></nav></div></header><section class="section" style="padding-top:120px;"><div class="container"><a href="/news.html" class="back-link">&#8592; Back to News</a><div class="article-wrap"><div class="meta">${dateShort} &middot; <span>${esc(category)}</span> &middot; By <a href="/about.html" rel="author">Young Hadene</a>, Editor</div><h1>${esc(title)}</h1><p><strong>Toronto, ON —</strong> REPLACE WITH LEDE PARAGRAPH (what happened, when, why it matters).</p><p>REPLACE WITH BODY PARAGRAPHS. Include at least one original element: a direct quote with permission, a photo, or first-hand detail.</p><h2>Details</h2><p>REPLACE WITH FACTS: dates, venues, links to stream/tickets.</p><div class="correction-note">Correction notice: none to date. Spotted an error? See our <a href="/corrections-policy.html">Corrections Policy</a> or email <a href="mailto:contact@younghadene.ca">contact@younghadene.ca</a>.</div></div></div></section><footer class="footer"><div class="container"><div class="footer-bottom"><p>&copy; 2026 Young Hadene. All rights reserved. Toronto. 6ix.</p><div class="footer-bottom-links"><a href="/news.html">News</a><a href="/editorial-policy.html">Editorial Policy</a><a href="/privacy.html">Privacy</a></div></div></div></footer><script src="../js/main.js"></script></body></html>
`;

const out = path.join(ROOT, 'news', slug + '.html');
fs.mkdirSync(path.join(ROOT, 'news'), { recursive: true });
fs.writeFileSync(out, html);
console.log('Created news/' + slug + '.html — now edit the body, add a card to news.html, run node scripts/build-static.js');
