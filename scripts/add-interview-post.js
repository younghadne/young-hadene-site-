#!/usr/bin/env node
/** One-off: editorial Q&A / interview feature with Young Hadene. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BLOG_DIR = path.join(ROOT, 'blog');
const EV_URL = 'https://exposedvocals.com/press-room/young-hadene-releases-new-album-they-took-me-down/';
const ALBUM_URL = 'https://open.spotify.com/album/4Xbt1M92j0fuzqFUOrE0nM';
const THANKS_SLUG = 'thank-you-exposed-vocals-they-took-me-down-feature';

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

const title = 'Young Hadene Interview: On \u2018They Took Me Down\u2019, Toronto Drill & the Independent Grind (2026 Q&A)';
const excerpt = 'Exclusive Q&A: Young Hadene breaks down his 11-track album \u2018they took me down\u2019, his Haitian-Toronto sound, going independent, and what\u2019s next for the 6ix.'.substring(0, 160);
const slug = 'young-hadene-interview-they-took-me-down-2026';
const cat = 'Behind The Scenes';
const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

const tplRaw = fs.readFileSync(path.join(BLOG_DIR, 'top-toronto-rappers.html'), 'utf8');
const header = tplRaw.substring(tplRaw.indexOf('<header'), tplRaw.indexOf('</header>') + 9);
const footer = tplRaw.substring(tplRaw.indexOf('<footer'), tplRaw.indexOf('</footer>') + 9);

const QA = [
  {
    q: '\u2018They took me down\u2019 just dropped — 11 tracks. What does this album mean to you?',
    a: `Everything. This is the most honest body of work I ever put together. Eleven tracks, no filler, no skips — every song is a chapter. The title is real life: I been counted out, talked about, set up to fail. People really tried to take me down. But I\u2019m still here, still dropping, still independent. When you press play on <a href="${ALBUM_URL}" style="color:var(--accent);" target="_blank" rel="noopener"><strong>\u2018they took me down\u2019 on Spotify</strong></a>, you\u2019re hearing what survival sounds like.`
  },
  {
    q: 'The title sounds personal. Who took you down?',
    a: `I\u2019m not naming names — the music says what it needs to say. But everybody from the streets knows how it goes: fake love, people switching up when things get heavy, doors closing because you won\u2019t compromise. I turned all of that into fuel. Instead of crashing out, I went to the studio. That\u2019s the difference between me and a lot of artists — my pain becomes product. Every disappointment on this album got turned into a hook.`
  },
  {
    q: 'How did you decide which songs made the final 11?',
    a: `It started as way more than eleven. I probably recorded thirty records for this project. The rule was simple: if a song didn\u2019t make me feel something on the first listen a week later, it got cut. I\u2019d record, sit with it, drive around the city at night listening, and ask — does this move me? The eleven that survived all passed that test. Cohesion mattered more than quantity. It had to play front to back like one story, not a playlist.`
  },
  {
    q: 'Born in Haiti, raised in Toronto. How do both worlds show up in the music?',
    a: `Haiti is in my blood and Toronto raised me, so the music carries both. You\u2019ll hear Caribbean cadence in how I ride a beat — the bounce, the pockets I choose, certain melodies that come from island music. Then the content is straight 6ix: the pressure, the ambition, the loyalty codes of the streets here. I\u2019m Haitian-Toronto, and I don\u2019t water either side down. That fusion is my signature. Nobody else in the city sounds like me because nobody else lived my exact story.`
  },
  {
    q: 'Describe your sound for someone who\u2019s never heard you before.',
    a: `Dark trap meets Toronto drill with melody. Heavy 808s that shake the car, haunting beats, and I switch cadences mid-verse — I might start aggressive then slide into something almost sung. I call my whole aesthetic Trap Blueprints and Hood Rich Stories: real street narratives with emotional depth. Start with \u201cNo Sleep\u201d and \u201c6ix Side,\u201d then go run the new album. You\u2019ll get it within three songs.`
  },
  {
    q: 'You\u2019re fully independent under Str8hitsRecords. What\u2019s the hardest part of that grind?',
    a: `Doing everything. I\u2019m the artist, the A&R, the marketing department, the budget. Nobody\u2019s handing me a rollout — I build it. The hardest part is patience: watching artists with machine backing blow past while you\u2019re funding your own videos and pitching your own records. But the flip side is ownership. I own my masters, my vision, my timeline. Nobody can shelve me. Every stream on <a href="https://open.spotify.com/artist/4MYeewqn16CCiuIgmpIaGA" style="color:var(--accent);" target="_blank" rel="noopener">my Spotify page</a> comes directly to the team that made it. That\u2019s worth more than a fast advance.`
  },
  {
    q: 'Exposed Vocals just featured the album in their Press Room. What did that mean to you?',
    a: `Major love for that. I actually wrote about it — <a href="https://younghadene.ca/blog/${THANKS_SLUG}.html" style="color:var(--accent);">here\u2019s my full thank-you to Exposed Vocals</a> — because platforms that cover independent artists for real deserve their flowers. Their <a href="${EV_URL}" style="color:var(--accent);" target="_blank" rel="noopener">feature on \u2018they took me down\u2019</a> gave the album a permanent press home with streaming links and everything. For an indie artist, that kind of coverage travels — curators find you through it, bloggers reference it. One link becomes ten opportunities. So yeah, salute to them.`
  },
  {
    q: 'Where is Toronto drill headed right now, in your view?',
    a: `It\u2019s getting more melodic and more global at the same time. The pure aggression era evolved — now you need hooks, you need atmosphere, you need something that works outside the block. And the Caribbean and African influences are taking over the sound of the city, whether people admit it or not. Toronto drill in 2026 is really world music with 808s. The artists who understand that — who bring their heritage into the production instead of copying Chicago for the hundredth time — those are the ones who\u2019ll last.`
  },
  {
    q: 'Take us inside your studio process. How does a Young Hadene record get made?',
    a: `Late nights. Most of my best work happens after midnight when the city\u2019s quiet — that\u2019s literally where \u201cNo Sleep\u201d came from. I don\u2019t really write on paper much anymore; I catch melodies first, mumble flows until the pocket locks, then the words come. The beat has to be dark — minor keys, space in the production so my voice is the main instrument. Then ad-libs last, mixed like instrumentation. If the hook doesn\u2019t stick in my head by morning, we rework it. Simple as that.`
  },
  {
    q: 'What\u2019s next — and what\u2019s your message to the fans, to Z Nation?',
    a: `Visuals for the album, more shows, and I\u2019m already working — I never stop. To Z Nation: thank you for streaming, for sharing, for showing up. We built this with no machine, just consistency and real music. Go run up <a href="${ALBUM_URL}" style="color:var(--accent);" target="_blank" rel="noopener">\u2018they took me down\u2019</a>, send it to one person who never heard me, and watch what we do next. We\u2019re just getting started. The ones who tried to take me down are about to watch me go up.`
  },
];

const qaBlock = (item, i) => `
<div class="highlight-box">
<p><strong>Q${i + 1}: ${item.q}</strong></p>
</div>
<p><strong>Young Hadene:</strong> ${item.a}</p>`;

const section = (from, to) => QA.slice(from, to).map((item, k) => qaBlock(item, from + k)).join('\n');

const bodyHtml = `
<p><em>Editor\u2019s note: this exclusive Q&A is an editorial feature told in Young Hadene\u2019s voice — the stories behind the music, straight from the artist.</em></p>
<p>With his 11-track album <a href="${ALBUM_URL}" style="color:var(--accent);" target="_blank" rel="noopener"><strong>\u2018they took me down\u2019</strong></a> out now and a fresh <a href="${EV_URL}" style="color:var(--accent);" target="_blank" rel="noopener">feature on Exposed Vocals</a>, <strong>Young Hadene</strong> sat down — pen, not microphone — to answer ten questions about the project, his Haitian-Toronto roots, the independent grind, and where Toronto drill goes from here.</p>

<div class="takeaways">
<h2>Key Takeaways</h2>
<ul>
<li><strong>\u2018They took me down\u2019</strong> — 11 tracks, released October 2, 2026 — is Young Hadene\u2019s most personal full-length project. <a href="${ALBUM_URL}" style="color:var(--accent);" target="_blank" rel="noopener">Stream it on Spotify</a>.</li>
<li>His sound: Haitian-Toronto drill meets dark trap — heavy 808s, cadence switches, melodic hooks, Caribbean texture.</li>
<li>Fully independent under Str8hitsRecords: owns his masters, funds his own rollouts, builds direct with fans.</li>
<li>On the <a href="${EV_URL}" style="color:var(--accent);" target="_blank" rel="noopener">Exposed Vocals feature</a>: \u201cone link becomes ten opportunities.\u201d</li>
<li>Next up: album visuals, more shows, and new music already in motion. Start at <a href="https://younghadene.ca" style="color:var(--accent);">younghadene.ca</a>.</li>
</ul>
</div>

<div class="toc">
<h2>Table of Contents</h2>
<ul>
<li><a href="#qa1">The Album & Its Meaning</a></li>
<li><a href="#qa2">Roots, Sound & Identity</a></li>
<li><a href="#qa3">Independence & Press</a></li>
<li><a href="#qa4">Toronto Drill & What\u2019s Next</a></li>
<li><a href="#faq">Frequently Asked Questions</a></li>
</ul>
</div>

<h2 id="qa1">The Album & Its Meaning</h2>
${section(0, 3)}

<h2 id="qa2">Roots, Sound & Identity</h2>
${section(3, 5)}

<h2 id="qa3">Independence & Press</h2>
${section(5, 7)}

<h2 id="qa4">Toronto Drill & What\u2019s Next</h2>
${section(7, 10)}

<h2 id="faq">Frequently Asked Questions</h2>
<div class="highlight-box">
<p><strong>What is Young Hadene\u2019s new album?</strong><br>
\u2018They took me down\u2019 — 11 tracks, released October 2, 2026. <a href="${ALBUM_URL}" style="color:var(--accent);" target="_blank" rel="noopener">Stream it on Spotify</a>.</p>
</div>
<div class="highlight-box">
<p><strong>Where can I read the Young Hadene interview?</strong><br>
Right here — this 2026 Q&A covers the album, his Haitian-Toronto sound, independence, and what\u2019s next.</p>
</div>
<div class="highlight-box">
<p><strong>Who is Young Hadene?</strong><br>
A Haitian-Toronto drill and dark trap artist releasing independently under Str8hitsRecords. Full story at <a href="https://younghadene.ca" style="color:var(--accent);">younghadene.ca</a>.</p>
</div>
<div class="highlight-box">
<p><strong>Where can I listen to Young Hadene?</strong><br>
On <a href="https://open.spotify.com/artist/4MYeewqn16CCiuIgmpIaGA" style="color:var(--accent);" target="_blank" rel="noopener">Spotify</a>, Apple Music, YouTube, and all major platforms.</p>
</div>

<div class="cta-box">
<h3>Read It, Then Stream It</h3>
<p>Now you know the stories — go hear them in the music. \u2018They took me down\u2019 is out now.</p>
<a href="${ALBUM_URL}" target="_blank" class="btn btn-primary">&#9654; Stream the Album on Spotify</a>
</div>
`;

const faqSchema = {
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: [
    { '@type': 'Question', name: 'What is Young Hadene\u2019s new album?', acceptedAnswer: { '@type': 'Answer', text: '\u2018They took me down\u2019 — an 11-track album released October 2, 2026, streaming on Spotify.' } },
    { '@type': 'Question', name: 'Who is Young Hadene?', acceptedAnswer: { '@type': 'Answer', text: 'A Haitian-Toronto drill and dark trap artist releasing independently under Str8hitsRecords.' } },
    { '@type': 'Question', name: 'Where can I listen to Young Hadene?', acceptedAnswer: { '@type': 'Answer', text: 'On Spotify, Apple Music, YouTube, and at younghadene.ca.' } },
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
<div class="meta">Published ${dateStr} &middot; <span>${esc(cat)}</span> &middot; 8 min read</div>
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

const id = Date.now();
const entry = { id, title, slug, category: cat, date: dateStr, dateNum: id, featured: false, content: excerpt };

const yhPath = path.join(ROOT, 'yh_blogPosts.json');
const yh = JSON.parse(fs.readFileSync(yhPath, 'utf8'));
yh.unshift({ ...entry, content: `# ${title}\n\n${excerpt}\n\nRead the full article on younghadene.ca/blog/${slug}.html` });
fs.writeFileSync(yhPath, JSON.stringify(yh, null, 2));
console.log(`yh_blogPosts.json total ${yh.length}`);

const bpPath = path.join(BLOG_DIR, 'posts.json');
const bp = JSON.parse(fs.readFileSync(bpPath, 'utf8'));
bp.unshift(entry);
fs.writeFileSync(bpPath, JSON.stringify(bp, null, 2));
console.log(`blog/posts.json total ${bp.length}`);

const sp = path.join(ROOT, 'sitemap.xml');
let sm = fs.readFileSync(sp, 'utf8');
const today = new Date().toISOString().split('T')[0];
sm = sm.replace('</urlset>', `  <url>\n    <loc>https://younghadene.ca/blog/${slug}.html</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n</urlset>`);
fs.writeFileSync(sp, sm);
console.log('sitemap.xml updated');
console.log('DONE:', `https://younghadene.ca/blog/${slug}.html`);
