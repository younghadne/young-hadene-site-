#!/usr/bin/env node
/** One-off: thank-you / backlink post for Exposed Vocals press feature. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BLOG_DIR = path.join(ROOT, 'blog');
const EV_URL = 'https://exposedvocals.com/press-room/young-hadene-releases-new-album-they-took-me-down/';
const ALBUM_URL = 'https://open.spotify.com/album/4Xbt1M92j0fuzqFUOrE0nM';

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

const title = 'Thank You Exposed Vocals for Featuring Young Hadene\u2019s New Album \u2018They Took Me Down\u2019';
const excerpt = 'A thank-you to Exposed Vocals for featuring Young Hadene\u2019s 11-track album \u2018they took me down\u2019 — plus the story behind the project and where to stream it.'.substring(0, 160);
const slug = 'thank-you-exposed-vocals-they-took-me-down-feature';
const cat = 'Behind The Scenes';
const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

const tplRaw = fs.readFileSync(path.join(BLOG_DIR, 'top-toronto-rappers.html'), 'utf8');
const header = tplRaw.substring(tplRaw.indexOf('<header'), tplRaw.indexOf('</header>') + 9);
const footer = tplRaw.substring(tplRaw.indexOf('<footer'), tplRaw.indexOf('</footer>') + 9);

const bodyHtml = `
<p>Real ones recognize real ones. This week, <a href="${EV_URL}" style="color:var(--accent);" target="_blank" rel="noopener"><strong>Exposed Vocals featured Young Hadene\u2019s new 11-track album \u2018they took me down\u2019</strong></a> in their Press Room — and we want to say thank you properly.</p>
<p>For an independent Haitian-Toronto artist building brick by brick, every piece of press matters. Exposed Vocals showing love to the project — for free — means the music is reaching new ears outside the 6ix. That\u2019s the whole mission.</p>
<p>If you found this page from their feature, welcome. Below is the full story behind <strong>\u2018they took me down\u2019</strong>, what the album means, and where to stream it.</p>

<div class="takeaways">
<h2>Key Takeaways</h2>
<ul>
<li><a href="${EV_URL}" style="color:var(--accent);" target="_blank" rel="noopener"><strong>Exposed Vocals featured \u2018they took me down\u2019</strong></a> — Young Hadene\u2019s 11-track album, released October 2, 2026.</li>
<li>The album is streaming now: <a href="${ALBUM_URL}" style="color:var(--accent);" target="_blank" rel="noopener">listen to \u2018they took me down\u2019 on Spotify</a>.</li>
<li><strong>Young Hadene</strong> is a Haitian-Toronto drill and dark trap artist building independently under Str8hitsRecords.</li>
<li>Press features like this one help independent artists reach curators, playlists, and fans worldwide.</li>
<li>The fastest way to support: stream the album, share the Exposed Vocals feature, and follow the journey at <a href="https://younghadene.ca" style="color:var(--accent);">younghadene.ca</a>.</li>
</ul>
</div>

<div class="toc">
<h2>Table of Contents</h2>
<ul>
<li><a href="#thanks">Thank You, Exposed Vocals</a></li>
<li><a href="#album">About the Album: \u2018They Took Me Down\u2019</a></li>
<li><a href="#sound">The Sound — Haitian-Toronto Drill & Dark Trap</a></li>
<li><a href="#young-hadene">Young Hadene — The Artist Behind It</a></li>
<li><a href="#support">How to Support Independent Music</a></li>
<li><a href="#faq">Frequently Asked Questions</a></li>
</ul>
</div>

<h2 id="thanks">Thank You, Exposed Vocals</h2>
<p>When <a href="${EV_URL}" style="color:var(--accent);" target="_blank" rel="noopener"><strong>Exposed Vocals published the \u2018they took me down\u2019 announcement</strong></a>, it put the album in front of their audience of artists, curators, and industry readers — the exact people an independent release needs to reach. No paywall games, no gatekeeping. Just the music, presented cleanly with the Spotify links, the artwork, and the story.</p>
<p>That kind of coverage is oxygen for the underground. Major outlets rarely look twice at independent Toronto drill, so platforms like Exposed Vocals that give emerging artists a real press page — with share tools, streaming embeds, and a permanent link — are doing genuine work for the culture. Thank you.</p>
<h3>Why this feature matters</h3>
<p>A permanent press link does three things at once: it gives fans a trusted place to verify the release, it gives Google a credible source connecting Young Hadene to the album title, and it gives curators and bloggers a starting point to write their own coverage. One feature compounds into many. If you run a blog or playlist, this is your sign — <a href="${EV_URL}" style="color:var(--accent);" target="_blank" rel="noopener">the Exposed Vocals feature is here</a>, and the album is ready for your rotation.</p>

<h2 id="album">About the Album: \u2018They Took Me Down\u2019</h2>
<p><strong>\u2018They took me down\u2019</strong> is an 11-track album released on <strong>October 2, 2026</strong>, now streaming on Spotify and all major platforms. The title says everything about the era it documents — pressure, setbacks, betrayal, and the climb back up. It\u2019s Young Hadene\u2019s most complete full-length statement to date.</p>
<p>The project sits in the pocket his fans know: heavy 808s, dark cinematic production, structured cadence shifts, and melodic hooks that carry the weight of the verses. From the cover art to the sequencing, it\u2019s built as one story — loyalty tested, ambition intact.</p>
<h3>Where to listen</h3>
<p>Stream the full album here: <a href="${ALBUM_URL}" style="color:var(--accent);" target="_blank" rel="noopener"><strong>\u2018they took me down\u2019 on Spotify</strong></a>. Follow the <a href="https://open.spotify.com/artist/4MYeewqn16CCiuIgmpIaGA" style="color:var(--accent);" target="_blank" rel="noopener">Young Hadene artist page</a> so you never miss a drop, and find videos and updates on <a href="https://www.youtube.com/@Young_Hadene" style="color:var(--accent);" target="_blank" rel="noopener">YouTube at @Young_Hadene</a>.</p>

<h2 id="sound">The Sound — Haitian-Toronto Drill & Dark Trap</h2>
<p>Young Hadene\u2019s lane is Haitian-Toronto drill and dark trap: the urgency of drill drums, the atmosphere of dark trap, and Caribbean cadence and heritage texture woven through both. Born in Haiti and raised in Toronto, he occupies a space no other voice in the 6ix currently owns the same way.</p>
<p>\u2018They took me down\u2019 pushes that fusion further — street narratives with emotional undertones, loyalty and struggle as recurring themes, and production that leaves room for both aggression and melody. It\u2019s the sound of the 6ix underground growing up without selling out.</p>

<h2 id="young-hadene">Young Hadene — The Artist Behind It</h2>
<div class="artist-card featured">
<div class="num">★</div>
<div class="info">
<h4>Young Hadene</h4>
<span class="tag">Haitian-Toronto • Drill • Dark Trap • Str8hitsRecords</span>
<p><strong>New album:</strong> \u2018they took me down\u2019 (11 tracks, Oct 2 2026) &middot; <strong>Stream:</strong> <a href="${ALBUM_URL}" style="color:var(--accent);" target="_blank">Spotify</a></p>
</div>
</div>
<p><strong>Young Hadene</strong> is an independent Haitian-Toronto drill and dark trap artist operating under Str8hitsRecords — writing, recording, releasing, and branding on his own terms. His catalog spans projects like <em>Trap Blueprints</em> and <em>Hood Rich Stories</em> alongside singles like \u201cNo Sleep\u201d and \u201c6ix Side,\u201d all documenting the journey from Haiti to the 6ix with unfiltered honesty.</p>
<p>Everything runs through <a href="https://younghadene.ca" style="color:var(--accent);">younghadene.ca</a> — the biography, the music, the visuals. Independent means every stream, share, and press link lands directly with the artist. Which brings us to the ask.</p>

<h2 id="support">How to Support Independent Music</h2>
<p>Press is powerful, but fans finish the job. Here\u2019s how to run up \u2018they took me down\u2019 today:</p>
<h3>Three things that take two minutes</h3>
<p>One — stream the album front to back on <a href="${ALBUM_URL}" style="color:var(--accent);" target="_blank" rel="noopener">Spotify</a> and add your favourite track to a playlist. Two — share the <a href="${EV_URL}" style="color:var(--accent);" target="_blank" rel="noopener">Exposed Vocals feature</a> to your story or group chat so their coverage travels further. Three — follow <a href="https://www.instagram.com/younghadene/" style="color:var(--accent);" target="_blank" rel="noopener">@younghadene on Instagram</a> and <a href="https://www.youtube.com/@Young_Hadene" style="color:var(--accent);" target="_blank" rel="noopener">YouTube</a> for what\u2019s next. Small actions, compounded across the Z Nation fanbase, are exactly how independent albums break.</p>

<h2 id="faq">Frequently Asked Questions</h2>
<div class="highlight-box">
<p><strong>What is Young Hadene\u2019s new album?</strong><br>
\u2018They took me down\u2019 — an 11-track album released October 2, 2026. Stream it on <a href="${ALBUM_URL}" style="color:var(--accent);" target="_blank" rel="noopener">Spotify</a> and read the announcement on <a href="${EV_URL}" style="color:var(--accent);" target="_blank" rel="noopener">Exposed Vocals</a>.</p>
</div>
<div class="highlight-box">
<p><strong>Who is Young Hadene?</strong><br>
Young Hadene is a Haitian-Toronto drill and dark trap artist — born in Haiti, raised in Toronto — releasing independently under Str8hitsRecords. Start at <a href="https://younghadene.ca" style="color:var(--accent);">younghadene.ca</a>.</p>
</div>
<div class="highlight-box">
<p><strong>Where was the album featured?</strong><br>
On Exposed Vocals\u2019 Press Room: <a href="${EV_URL}" style="color:var(--accent);" target="_blank" rel="noopener">Young Hadene releases new album \u2018they took me down\u2019</a>. Go show it some love.</p>
</div>
<div class="highlight-box">
<p><strong>Where can I listen to Young Hadene?</strong><br>
On <a href="https://open.spotify.com/artist/4MYeewqn16CCiuIgmpIaGA" style="color:var(--accent);" target="_blank" rel="noopener">Spotify</a>, Apple Music, YouTube, and all major platforms. Full catalog at <a href="https://younghadene.ca" style="color:var(--accent);">younghadene.ca</a>.</p>
</div>

<div class="cta-box">
<h3>Stream \u2018They Took Me Down\u2019 Now</h3>
<p>11 tracks. Zero skips. Thank you to Exposed Vocals for the feature — now go run it up.</p>
<a href="${ALBUM_URL}" target="_blank" class="btn btn-primary">&#9654; Stream the Album on Spotify</a>
</div>
`;

const faqSchema = {
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: [
    { '@type': 'Question', name: 'What is Young Hadene\u2019s new album?', acceptedAnswer: { '@type': 'Answer', text: '\u2018They took me down\u2019 — an 11-track album released October 2, 2026, streaming on Spotify.' } },
    { '@type': 'Question', name: 'Where was the album featured?', acceptedAnswer: { '@type': 'Answer', text: 'On Exposed Vocals\u2019 Press Room: Young Hadene releases new album \u2018they took me down\u2019.' } },
    { '@type': 'Question', name: 'Who is Young Hadene?', acceptedAnswer: { '@type': 'Answer', text: 'A Haitian-Toronto drill and dark trap artist releasing independently under Str8hitsRecords.' } },
  ],
};

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(excerpt)}">
<link rel="canonical" href="https://younghadene.ca/blog/${slug}.html">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(excerpt)}">
<meta property="og:image" content="https://younghadene.ca/images/poster1.png">
<meta property="og:url" content="https://younghadene.ca/blog/${slug}.html">
<meta property="og:type" content="article">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(excerpt)}">
<meta name="twitter:image" content="https://younghadene.ca/images/poster1.png">
<link rel="stylesheet" href="../css/style.css">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='28' font-size='28'>🎤</text></svg>">
<script type="application/ld+json">
{ "@context": "https://schema.org", "@type": "Article",
"headline": "${esc(title)}",
"description": "${esc(excerpt)}",
"author": { "@type": "MusicGroup", "name": "Young Hadene" },
"datePublished": "${dateStr}",
"image": "https://younghadene.ca/images/poster1.png" }
</script>
<script type="application/ld+json">
${JSON.stringify(faqSchema)}
</script>
<style>
.article-wrap { max-width: 720px; margin: 0 auto; padding: 40px 0; }
.article-wrap h1 { font-size: clamp(2.2rem, 5vw, 3.2rem); margin-bottom: 16px; line-height: 1.05; }
.article-wrap .meta { color: var(--text-muted); font-size: 0.8rem; margin-bottom: 32px; text-transform: uppercase; letter-spacing: 0.08em; }
.article-wrap .meta span { color: var(--accent); }
.article-wrap h2 { font-size: 1.6rem; margin-top: 48px; margin-bottom: 16px; font-family: var(--font-heading); letter-spacing: 0.04em; }
.article-wrap h3 { font-size: 1.15rem; margin-top: 28px; margin-bottom: 10px; font-family: var(--font-heading); letter-spacing: 0.03em; color: var(--accent); }
.article-wrap p { color: var(--text-secondary); line-height: 1.8; margin-bottom: 18px; font-size: 0.95rem; }
.article-wrap p strong { color: var(--text-primary); }
.article-wrap ul, .article-wrap ol { color: var(--text-secondary); line-height: 1.8; margin-bottom: 18px; padding-left: 24px; font-size: 0.95rem; }
.article-wrap li { margin-bottom: 8px; }
.article-wrap .takeaways { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius); padding: 28px 32px; margin-bottom: 32px; }
.article-wrap .takeaways h2 { margin-top: 0; font-size: 1.3rem; }
.article-wrap .takeaways li { list-style: none; padding-left: 24px; position: relative; }
.article-wrap .takeaways li::before { content: '\u2713'; position: absolute; left: 0; color: var(--accent); font-weight: 700; }
.article-wrap .toc { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius); padding: 24px 28px; margin-bottom: 32px; }
.article-wrap .toc h2 { margin-top: 0; font-size: 1.1rem; }
.article-wrap .toc a { color: var(--text-secondary); display: block; padding: 6px 0; font-size: 0.85rem; transition: color var(--transition); }
.article-wrap .toc a:hover { color: var(--accent); }
.article-wrap .toc ul { list-style: none; padding: 0; margin: 0; }
.article-wrap .highlight-box { background: rgba(220,38,38,0.05); border: 1px solid rgba(220,38,38,0.15); border-radius: var(--radius); padding: 24px; margin: 24px 0; }
.article-wrap .highlight-box p { margin-bottom: 0; }
.article-wrap .cta-box { text-align: center; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius); padding: 32px; margin: 40px 0; }
.article-wrap .cta-box h3 { margin-top: 0; color: var(--text-primary); }
.article-wrap .cta-box p { margin-bottom: 20px; }
.back-link { display: inline-flex; align-items: center; gap: 8px; color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 32px; transition: color var(--transition); }
.back-link:hover { color: var(--accent); }
.artist-card { display: flex; gap: 20px; align-items: flex-start; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius); padding: 24px; margin: 20px 0; }
.artist-card .num { font-family: var(--font-heading); font-size: 2rem; color: var(--accent); line-height: 1; flex-shrink: 0; width: 40px; }
.artist-card .info { flex: 1; }
.artist-card .info h4 { font-family: var(--font-heading); font-size: 1.2rem; margin-bottom: 4px; }
.artist-card .info .tag { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; display: block; }
.artist-card .info p { font-size: 0.85rem; margin-bottom: 0; color: var(--text-secondary); }
.artist-card.featured { border-color: rgba(220,38,38,0.3); background: rgba(220,38,38,0.05); }
.artist-card.featured .num { color: #fff; }
@media (max-width: 600px) { .artist-card { flex-direction: column; gap: 12px; } .article-wrap { padding: 24px 0; } }
</style>
</head>
<body>
${header}
<section class="section" style="padding-top:120px;">
<div class="container">
<a href="/blog" class="back-link">&#8592; Back to Blog</a>
<div class="article-wrap">
<div class="meta">Published ${dateStr} &middot; <span>${esc(cat)}</span> &middot; 6 min read</div>
<h1>${esc(title)}</h1>
${bodyHtml}
</div>
</div>
</section>
${footer}
<script src="../js/main.js"></script>
<script>(function(){var d={path:location.pathname,referrer:document.referrer||"",ua:navigator.userAgent,pageTitle:document.title};if(navigator.sendBeacon){navigator.sendBeacon("/api/track",JSON.stringify(d))}else{var x=new XMLHttpRequest();x.open("POST","/api/track",true);x.setRequestHeader("Content-Type","application/json");x.send(JSON.stringify(d))}})();</script>
</body>
</html>`;

const outPath = path.join(BLOG_DIR, `${slug}.html`);
if (fs.existsSync(outPath)) { console.error('EXISTS:', outPath); process.exit(1); }
fs.writeFileSync(outPath, html);
console.log('wrote', outPath);

// ── listings ──
const id = Date.now();
const entry = { id, title, slug, category: cat, date: dateStr, dateNum: id, featured: false, content: excerpt };

// yh_blogPosts.json
const yhPath = path.join(ROOT, 'yh_blogPosts.json');
const yh = JSON.parse(fs.readFileSync(yhPath, 'utf8'));
yh.unshift({ ...entry, content: `# ${title}\n\n${excerpt}\n\nRead the full article on younghadene.ca/blog/${slug}.html` });
fs.writeFileSync(yhPath, JSON.stringify(yh, null, 2));
console.log(`yh_blogPosts.json total ${yh.length}`);

// blog/posts.json
const bpPath = path.join(BLOG_DIR, 'posts.json');
const bp = JSON.parse(fs.readFileSync(bpPath, 'utf8'));
bp.unshift(entry);
fs.writeFileSync(bpPath, JSON.stringify(bp, null, 2));
console.log(`blog/posts.json total ${bp.length}`);

// blog.html DEFAULT_POSTS + SERVER_POSTS (handled by follow-up step)
console.log('LISTING_ENTRY:' + JSON.stringify(entry));

// sitemap.xml
const sp = path.join(ROOT, 'sitemap.xml');
let sm = fs.readFileSync(sp, 'utf8');
const today = new Date().toISOString().split('T')[0];
sm = sm.replace('</urlset>', `  <url>\n    <loc>https://younghadene.ca/blog/${slug}.html</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n</urlset>`);
fs.writeFileSync(sp, sm);
console.log('sitemap.xml updated');
console.log('DONE:', `https://younghadene.ca/blog/${slug}.html`);
