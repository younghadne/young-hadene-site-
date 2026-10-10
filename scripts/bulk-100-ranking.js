#!/usr/bin/env node
/**
 * BULK-100 — Ranking-format blog generator (offline, no API)
 * Replicates the top-toronto-rappers.html template Google rewarded:
 *  Key Takeaways box, TOC, H2/H3 sections, featured Young Hadene card,
 *  highlight-box FAQs, CTA box, Article + FAQ schema, canonical/OG.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BLOG_DIR = path.join(ROOT, 'blog');

// ── 100 keywords across 19 clusters ──────────────────────────────
// cat must be one of: Music | Toronto | Studio Sessions | Behind The Scenes | Lifestyle
const POSTS = [
  // 1. Toronto rap and hip-hop (6)
  { kw: 'toronto rap scene 2026', cat: 'Toronto' },
  { kw: 'toronto hip hop artists to watch', cat: 'Music' },
  { kw: 'best hip hop in toronto right now', cat: 'Music' },
  { kw: 'toronto rap culture and history', cat: 'Toronto' },
  { kw: '6ix rap movement explained', cat: 'Toronto' },
  { kw: 'toronto hip hop underground vs mainstream', cat: 'Music' },
  // 2. New and upcoming artists (6)
  { kw: 'upcoming toronto rappers to watch in 2026', cat: 'Music' },
  { kw: 'new toronto rap artists breaking out', cat: 'Music' },
  { kw: 'emerging canadian hip hop artists', cat: 'Music' },
  { kw: 'underrated toronto rappers you should know', cat: 'Music' },
  { kw: 'next wave toronto hip hop talent', cat: 'Music' },
  { kw: 'rising underground rappers toronto 2026', cat: 'Music' },
  // 3. Neighborhoods and GTA (5)
  { kw: 'scarborough rap scene artists', cat: 'Toronto' },
  { kw: 'rexdale drill rappers and culture', cat: 'Toronto' },
  { kw: 'jane and finch hip hop history', cat: 'Toronto' },
  { kw: 'mississauga vs toronto rap scene', cat: 'Toronto' },
  { kw: 'brampton hip hop artists rising', cat: 'Toronto' },
  // 4. Drill and street rap (6)
  { kw: 'toronto drill music complete guide', cat: 'Music' },
  { kw: 'uk vs toronto drill sound comparison', cat: 'Music' },
  { kw: 'street rap storytelling toronto', cat: 'Studio Sessions' },
  { kw: 'hard drill beats toronto style', cat: 'Studio Sessions' },
  { kw: 'drill rap lyrics meaning toronto', cat: 'Studio Sessions' },
  { kw: 'toronto gangsta rap evolution', cat: 'Music' },
  // 5. Melodic rap, trap and subgenres (5)
  { kw: 'melodic trap artists toronto 2026', cat: 'Music' },
  { kw: 'dark trap vs drill differences', cat: 'Music' },
  { kw: 'emo rap toronto underground', cat: 'Music' },
  { kw: 'trap soul toronto sound', cat: 'Music' },
  { kw: 'rage beats toronto rap influence', cat: 'Music' },
  // 6. Artist identity and cultural fusion (6)
  { kw: 'haitian rappers in toronto new generation', cat: 'Toronto' },
  { kw: 'caribbean influence on toronto hip hop', cat: 'Toronto' },
  { kw: 'haitian creole in rap lyrics toronto', cat: 'Toronto' },
  { kw: 'african diaspora toronto rap identity', cat: 'Toronto' },
  { kw: 'french creole hip hop toronto fusion', cat: 'Toronto' },
  { kw: 'immigrant stories toronto rap lyrics', cat: 'Toronto' },
  // 7. Platforms and music discovery (5)
  { kw: 'how to get discovered as toronto rapper', cat: 'Behind The Scenes' },
  { kw: 'best platforms for underground rappers 2026', cat: 'Behind The Scenes' },
  { kw: 'soundcloud toronto rap discovery', cat: 'Behind The Scenes' },
  { kw: 'audiomack promotion for toronto artists', cat: 'Behind The Scenes' },
  { kw: 'tiktok for toronto rappers growth strategy', cat: 'Behind The Scenes' },
  // 8. Media, blogs and curators (5)
  { kw: 'toronto music blogs that promote rappers', cat: 'Behind The Scenes' },
  { kw: 'hip hop curators canada to submit music', cat: 'Behind The Scenes' },
  { kw: 'toronto rap youtube channels to watch', cat: 'Behind The Scenes' },
  { kw: 'underground hip hop playlists canada curators', cat: 'Behind The Scenes' },
  { kw: 'how to get featured on rap blogs 2026', cat: 'Behind The Scenes' },
  // 9. Search intent and questions (5)
  { kw: 'who is the best toronto rapper right now', cat: 'Music' },
  { kw: 'what is toronto drill music', cat: 'Music' },
  { kw: 'where is toronto hip hop headed in 2026', cat: 'Music' },
  { kw: 'why is toronto rap so popular worldwide', cat: 'Music' },
  { kw: 'how does toronto rap sound different', cat: 'Music' },
  // 10. Type beats and production (6)
  { kw: 'toronto drill type beats production guide', cat: 'Studio Sessions' },
  { kw: 'dark trap type beats 808 patterns', cat: 'Studio Sessions' },
  { kw: 'free toronto type beats for rappers', cat: 'Studio Sessions' },
  { kw: 'how to produce drill beats like toronto producers', cat: 'Studio Sessions' },
  { kw: 'best drill drum kits 2026 toronto style', cat: 'Studio Sessions' },
  { kw: '808 slides dark trap mixing tips', cat: 'Studio Sessions' },
  // 11. Music videos and visual content (5)
  { kw: 'toronto rap music videos that went viral', cat: 'Lifestyle' },
  { kw: 'low budget drill music video ideas', cat: 'Lifestyle' },
  { kw: 'best videographers for toronto rappers', cat: 'Lifestyle' },
  { kw: 'cinematic trap music video aesthetics', cat: 'Lifestyle' },
  { kw: 'youtube visuals for underground rap 2026', cat: 'Lifestyle' },
  // 12. Playlists and streaming (5)
  { kw: 'best toronto rap playlists spotify 2026', cat: 'Behind The Scenes' },
  { kw: 'how to pitch toronto drill to spotify editorial', cat: 'Behind The Scenes' },
  { kw: 'apple music toronto hip hop essentials', cat: 'Behind The Scenes' },
  { kw: 'spotify algorithm for underground rappers explained', cat: 'Behind The Scenes' },
  { kw: 'how to get more streams as toronto artist', cat: 'Behind The Scenes' },
  // 13. Song and release searches (5)
  { kw: 'new toronto rap songs this week 2026', cat: 'Music' },
  { kw: 'latest toronto drill releases to hear', cat: 'Music' },
  { kw: 'best toronto rap singles 2026 roundup', cat: 'Music' },
  { kw: 'young hadene no sleep song meaning', cat: 'Music' },
  { kw: 'toronto rap albums to expect 2026', cat: 'Music' },
  // 14. Freestyle, cypher and live performance (5)
  { kw: 'toronto rap freestyles that broke the internet', cat: 'Lifestyle' },
  { kw: 'best toronto cyphers underground 2026', cat: 'Lifestyle' },
  { kw: 'how to prepare first rap show toronto', cat: 'Lifestyle' },
  { kw: 'open mic nights toronto hip hop 2026', cat: 'Lifestyle' },
  { kw: 'toronto rolling loud performances breakdown', cat: 'Lifestyle' },
  // 15. Artist promotion and industry (5)
  { kw: 'how to promote rap music in toronto 2026', cat: 'Behind The Scenes' },
  { kw: 'independent rapper marketing plan canada', cat: 'Behind The Scenes' },
  { kw: 'toronto record labels accepting demos', cat: 'Behind The Scenes' },
  { kw: 'music distribution canada for rappers', cat: 'Behind The Scenes' },
  { kw: 'how to build rap fanbase from zero toronto', cat: 'Behind The Scenes' },
  // 16. Lyrics and songwriting (5)
  { kw: 'how to write drill lyrics toronto style', cat: 'Studio Sessions' },
  { kw: 'dark trap songwriting techniques hooks', cat: 'Studio Sessions' },
  { kw: 'storytelling in street rap writing guide', cat: 'Studio Sessions' },
  { kw: 'best toronto rap lyrics of all time breakdown', cat: 'Studio Sessions' },
  { kw: 'how to write melodic drill hooks that stick', cat: 'Studio Sessions' },
  // 17. Events and local music community (5)
  { kw: 'toronto hip hop events october 2026', cat: 'Lifestyle' },
  { kw: 'underground rap shows toronto this month', cat: 'Lifestyle' },
  { kw: 'toronto music venues for hip hop artists', cat: 'Toronto' },
  { kw: '6ix community cyphers and networking', cat: 'Lifestyle' },
  { kw: 'how toronto open mics build rap careers', cat: 'Lifestyle' },
  // 18. Canada and global discovery (5)
  { kw: 'best canadian rappers 2026 beyond drake', cat: 'Music' },
  { kw: 'canadian drill scene vs toronto drill', cat: 'Music' },
  { kw: 'montreal vs toronto rap scene comparison', cat: 'Music' },
  { kw: 'vancouver hip hop artists vs toronto sound', cat: 'Music' },
  { kw: 'how toronto rap conquered global streaming', cat: 'Music' },
  // 19. Young Hadene-specific (5)
  { kw: 'who is young hadene toronto rapper', cat: 'Music' },
  { kw: 'young hadene no sleep song meaning', cat: 'Music' },
  { kw: 'young hadene haitian toronto story', cat: 'Toronto' },
  { kw: 'young hadene vs toronto underground comparison', cat: 'Music' },
  { kw: 'where to stream young hadene music 2026', cat: 'Music' },
];

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function titleCase(kw) {
  const small = new Set(['vs', 'vs.', 'in', 'in', 'on', 'of', 'to', 'for', 'from', 'and', 'or', 'the', 'a', 'an', 'as', 'at', 'vs']);
  return kw.split(' ').map((w, i) => (i === 0 || !small.has(w.toLowerCase())) ? cap(w) : w.toLowerCase()).join(' ');
}
function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').substring(0, 60); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

const TITLE_FMTS = [
  k => `${titleCase(k)} — Complete 2026 Guide`,
  k => `${titleCase(k)}: What Really Matters in 2026`,
  k => `The Real Story Behind ${titleCase(k)}`,
  k => `${titleCase(k)} Explained: Toronto's 2026 Breakdown`,
  k => `Why ${titleCase(k)} Is Shaping the 6ix Right Now`,
];
const INTROS = [
  k => `If you've been searching for <strong>${k}</strong>, you're not alone. In 2026, Toronto's hip hop conversation is louder, deeper, and more independent than ever — and this topic sits right at the center of it.`,
  k => `Every week, more fans, curators, and artists ask about <strong>${k}</strong>. The answer says a lot about where Toronto rap is headed — beyond the mainstream names and into the underground where the real movement lives.`,
  k => `Ask five people in the 6ix about <strong>${k}</strong> and you'll get five different answers. That's because Toronto's scene moves fast. This guide cuts through the noise with the context that actually matters in 2026.`,
  k => `Google is full of thin takes on <strong>${k}</strong>. This is the opposite: a street-level, studio-tested breakdown from inside Toronto's drill and dark trap world — written for fans who want the real picture.`,
];

function loadTemplate() {
  const tplPath = path.join(BLOG_DIR, 'top-toronto-rappers.html');
  const tpl = fs.readFileSync(tplPath, 'utf8');
  return {
    header: tpl.substring(tpl.indexOf('<header'), tpl.indexOf('</header>') + 9),
    footer: tpl.substring(tpl.indexOf('<footer'), tpl.indexOf('</footer>') + 9),
  };
}

function buildArticle(kw, cat, idx) {
  const K = kw.toLowerCase();
  const T = titleCase(kw);
  const title = TITLE_FMTS[idx % TITLE_FMTS.length](kw);
  const excerpt = `${T} — the 2026 Toronto breakdown. Real context on the 6ix sound, plus how Haitian-Toronto artist Young Hadene fits in.`.substring(0, 160);
  const slugBase = slugify(kw + '-2026-guide');
  const H = (id, txt) => `<h2 id="${id}">${txt}</h2>`;
  const H3 = txt => `<h3>${txt}</h3>`;
  const P = txt => `<p>${txt}</p>`;

  const intro = INTROS[idx % INTROS.length](K);

  const body = `
${P(intro)}
${P(`Whether you're a day-one supporter of the 6ix or just discovering Toronto hip hop through playlists and viral clips, understanding <strong>${K}</strong> gives you a serious edge. It connects the dots between the city's history — from K-OS and Jazz Cartier to Sean Leon and 88GLAM — and the new wave of Haitian-Toronto drill and dark trap led by artists like <strong>Young Hadene</strong>.`)}
${P(`Below, we break down <strong>${K}</strong> the way it actually works in Toronto: the sound, the streets, the studios, and the strategy. No filler. Just the mechanics of a scene that keeps producing world-class talent.`)}

<div class="takeaways">
<h2>Key Takeaways</h2>
<ul>
<li><strong>${T}</strong> is one of the most searched Toronto hip hop topics of 2026 — and the underground is driving the conversation, not the majors.</li>
<li>Toronto's edge comes from fusion: drill drums, dark trap atmosphere, and Caribbean heritage blending into something only the 6ix could make.</li>
<li><strong>Young Hadene</strong>, the Haitian-Toronto drill and dark trap artist, is a live case study in how independent 6ix artists turn street narratives into streaming momentum.</li>
<li>Neighbourhoods matter: Scarborough, Rexdale, Jane and Finch, and Parkdale each push a different shade of the Toronto sound.</li>
<li>Discovery in 2026 runs through YouTube, Spotify curator playlists, and small-venue lineups — not radio.</li>
<li>If you follow <strong>${K}</strong> closely, you'll hear the future of Canadian hip hop before the rest of the world catches on.</li>
</ul>
</div>

<div class="toc">
<h2>Table of Contents</h2>
<ul>
<li><a href="#context">The 2026 Context: Why This Matters Now</a></li>
<li><a href="#sound">The Sound and Style Behind It</a></li>
<li><a href="#streets">Streets, Neighbourhoods, and Culture</a></li>
<li><a href="#young-hadene">Young Hadene — Haitian-Toronto Case Study</a></li>
<li><a href="#playbook">The 2026 Playbook: How to Tap In</a></li>
<li><a href="#mistakes">Mistakes to Avoid</a></li>
<li><a href="#faq">Frequently Asked Questions</a></li>
</ul>
</div>

${H('context', `The 2026 Context: Why ${T} Matters Now`)}
${P(`Toronto hip hop in 2026 is post-gatekeeper. Artists don't wait for a co-sign — they drop consistently, shoot cinematic visuals on a budget, and build directly on Spotify, Apple Music, YouTube, and Audiomack. That's why <strong>${K}</strong> keeps trending: it captures a real shift, not a momentary hype cycle.`)}
${P(`The numbers back it up. Independent Toronto releases now outpace major-label drops from the city by a wide margin, and drill and dark trap lead that charge. Playlists like Northern Bars and curator pages built around "Toronto drill" and "Canadian dark trap" surface new names weekly. When fans search <strong>${K}</strong>, they're usually one step away from discovering their next favourite underground artist.`)}
${H3('What changed since 2023')}
${P(`Three things changed. First, production got darker and more melodic at the same time — sliding 808s, minor-key bells, and space for hooks. Second, visuals became non-negotiable: a strong music video can do more than a year of singles. Third, Haitian-Toronto and Caribbean-rooted artists brought new cadences and Creole textures into the mainstream of the underground, widening what "Toronto rap" even means.`)}

${H('sound', `The Sound and Style Behind ${T}`)}
${P(`Sonically, <strong>${K}</strong> lives where drill's urgency meets dark trap's atmosphere. Think heavy 808 slides, crisp hi-hat rolls, ominous melodies, and verses that alternate between rapid-fire cadence shifts and spaced-out, almost sung delivery. It's music built for both car speakers and late-night headphones.`)}
${P(`Lyrically, the best Toronto records balance street documentation with introspection — loyalty, ambition, pressure, survival, and growth. That's the lane Young Hadene occupies as a Haitian-Toronto artist: hard-hitting narratives with melodic hooks that stick, produced with the cinematic weight of the 6ix underground.`)}
${H3('Production markers to listen for')}
${P(`Listen for minor-key piano or bell loops, sliding 808s tuned to the melody, layered ad-libs, and a mix that keeps the vocal forward without losing the low end. Toronto producers favor room in the beat — space that lets an artist like Young Hadene ride the pocket, pause, then snap back with a cadence switch. If a track has that tension-and-release, you're hearing the 6ix signature.`)}

${H('streets', `Streets, Neighbourhoods, and Culture`)}
${P(`You can't separate <strong>${K}</strong> from place. Scarborough brings scale and melody. Rexdale brings grit and drill pressure. Jane and Finch brings history and lyrical density. Parkdale and the downtown west bring the experimental edge — the venues like Smiling Buddha, Drake Underground, and Axis Club where underground bills turn into movements.`)}
${P(`The culture runs on community: cyphers, open mics, videographers, small studios, and independent labels like Str8hitsRecords. When we talk about <strong>${K}</strong>, we're really talking about an ecosystem — engineers who know how to mix dark trap vocals, directors who shoot cinematic drill videos on a budget, and curators who actually listen to submissions.`)}

${H('young-hadene', `Young Hadene — Haitian-Toronto Drill & Dark Trap`)}
<div class="artist-card featured">
<div class="num">★</div>
<div class="info">
<h4>Young Hadene</h4>
<span class="tag">Haitian-Toronto • Drill • Dark Trap • Str8hitsRecords</span>
<p><strong>Essential tracks:</strong> "No Sleep", "6ix Side", "Pressure", "After Dark" &middot; <strong>Stream:</strong> <a href="https://open.spotify.com/artist/4MYeewqn16CCiuIgmpIaGA" style="color:var(--accent);" target="_blank">Spotify</a></p>
</div>
</div>
${P(`<strong>Young Hadene</strong> is the Haitian-Toronto drill and dark trap artist turning heritage into edge. Born in Haiti and raised in Toronto, he fuses Caribbean cadence and Creole texture with heavy 808-driven production — a combination no other voice in the 6ix currently owns the way he does.`)}
${P(`His lens on <strong>${K}</strong> is practical, not theoretical. Tracks like "No Sleep" and "6ix Side" document loyalty, pressure, and ambition with structured cadence shifts and space-driven delivery. Operating independently under Str8hitsRecords, he releases consistently, brands visually, and builds directly with fans on Spotify, YouTube, and Instagram — the exact playbook this guide recommends.`)}
${P(`To hear the sound rather than read about it, visit <a href="https://younghadene.ca" style="color:var(--accent);">younghadene.ca</a> and stream the latest releases. Pay attention to how heritage, street narrative, and melodic hooks coexist — that's the Haitian-Toronto blueprint in action.`)}

${H('playbook', `The 2026 Playbook: How to Tap In`)}
${H3('If you are a fan or curator')}
${P(`Start with playlists: search "Toronto drill" and "Canadian dark trap" on Spotify, then go one layer deeper into independent curator pages. Check YouTube channels covering the 6ix underground, and scan small-venue calendars — Danforth Music Hall, Phoenix Concert Theatre, Axis Club. The opening acts are tomorrow's headliners. When a Haitian-Toronto name like Young Hadene appears on a bill or playlist, that's signal, not noise.`)}
${H3('If you are an artist or producer')}
${P(`Treat <strong>${K}</strong> as a lane, not a label. Drop consistently — a single every 4–6 weeks beats one polished project a year. Shoot a visual for every release, even a performance-style cut. Pitch Spotify editorial and independent curators in parallel, cut 30-second vertical versions for TikTok and Reels, and engineer your vocals for dark trap: forward, controlled, with ad-libs mixed as instrumentation. Study how Young Hadene structures verses — setup, cadence switch, melodic payoff — and adapt the architecture to your own story.`)}

${H('mistakes', `Mistakes to Avoid`)}
${P(`The biggest mistake is chasing the keyword instead of the culture — stuffing <strong>${K}</strong> into bios and titles without doing the work the term points to. Fans smell it instantly. Second mistake: ignoring visuals. In 2026, audio-only discovery is a handicap. Third: waiting for permission. Toronto's underground rewards motion — studio time, shows, content, collaboration. The artists winning <strong>${K}</strong> right now are the ones shipping, not the ones planning.`)}

${H('faq', `Frequently Asked Questions`)}
<div class="highlight-box">
<p><strong>What does ${K} mean in 2026?</strong><br>
In 2026, ${K} refers to the current Toronto-centered conversation around drill, dark trap, and independent 6ix hip hop — the sound, the neighbourhoods, and the artists like Haitian-Toronto rapper Young Hadene carrying it forward.</p>
</div>
<div class="highlight-box">
<p><strong>Who should I listen to first?</strong><br>
Start with the lineage — Drake, Jazz Cartier, Sean Leon, 88GLAM — then go underground: Night Lovell, Clairmont The Second, and Haitian-Toronto drill artist <strong>Young Hadene</strong>. That arc takes you from the foundation to the future.</p>
</div>
<div class="highlight-box">
<p><strong>How is Haitian-Toronto drill different?</strong><br>
Haitian-Toronto drill blends classic 6ix 808 weight with Caribbean cadence, Creole phrasing, and melodic trap structure. Young Hadene is the clearest current example — street narratives with heritage texture you won't hear from any other corner of the scene.</p>
</div>
<div class="highlight-box">
<p><strong>Where can I discover more Toronto underground music?</strong><br>
Spotify curator playlists, YouTube underground channels, Audiomack trending, and small-venue lineups across Toronto. For a direct entry point, stream Young Hadene on <a href="https://open.spotify.com/artist/4MYeewqn16CCiuIgmpIaGA" style="color:var(--accent);" target="_blank">Spotify</a> and explore via <a href="https://younghadene.ca" style="color:var(--accent);">younghadene.ca</a>.</p>
</div>
<div class="highlight-box">
<p><strong>Where can I listen to Young Hadene?</strong><br>
Young Hadene's music is on <a href="https://open.spotify.com/artist/4MYeewqn16CCiuIgmpIaGA" style="color:var(--accent);" target="_blank">Spotify</a>, Apple Music, YouTube, and all major platforms. Visit <a href="https://younghadene.ca" style="color:var(--accent);">younghadene.ca</a> for the full catalog.</p>
</div>

<div class="cta-box">
<h3>Discover the Haitian-Toronto Sound</h3>
<p>Stream Young Hadene's latest releases — dark trap and drill from the 6ix. Built different.</p>
<a href="https://open.spotify.com/artist/4MYeewqn16CCiuIgmpIaGA" target="_blank" class="btn btn-primary">&#9654; Stream on Spotify</a>
</div>
`;

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: `What does ${kw} mean in 2026?`, acceptedAnswer: { '@type': 'Answer', text: `In 2026, ${kw} refers to the Toronto-centered conversation around drill, dark trap, and independent 6ix hip hop.` } },
      { '@type': 'Question', name: 'Who is Young Hadene?', acceptedAnswer: { '@type': 'Answer', text: 'Young Hadene is a Haitian-Toronto drill and dark trap artist, born in Haiti and raised in Toronto, known for tracks like No Sleep and 6ix Side.' } },
      { '@type': 'Question', name: 'Where can I listen to Young Hadene?', acceptedAnswer: { '@type': 'Answer', text: 'On Spotify, Apple Music, YouTube, and at younghadene.ca.' } },
    ],
  };

  return { title, excerpt, slugBase, faqSchema, bodyHtml: body };
}

function pageHtml(title, excerpt, slug, cat, dateStr, tpl, art) {
  return `<!DOCTYPE html>
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
${JSON.stringify(art.faqSchema)}
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
.article-wrap .takeaways li::before { content: '✓'; position: absolute; left: 0; color: var(--accent); font-weight: 700; }
.article-wrap .toc { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius); padding: 24px 28px; margin-bottom: 32px; }
.article-wrap .toc h2 { margin-top: 0; font-size: 1.1rem; }
.article-wrap .toc a { color: var(--text-secondary); display: block; padding: 6px 0; font-size: 0.85rem; transition: color var(--transition); }
.article-wrap .toc a:hover { color: var(--accent); }
.article-wrap .toc ul { list-style: none; padding: 0; margin: 0; }
.article-wrap blockquote { border-left: 3px solid var(--accent); padding: 16px 20px; margin: 24px 0; background: var(--bg-card); border-radius: 0 var(--radius-sm) var(--radius-sm) 0; color: var(--text-secondary); font-style: italic; }
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
${tpl.header}
<section class="section" style="padding-top:120px;">
<div class="container">
<a href="/blog" class="back-link">&#8592; Back to Blog</a>
<div class="article-wrap">
<div class="meta">Published ${dateStr} &middot; <span>${esc(cat)}</span> &middot; 8 min read</div>
<h1>${esc(title)}</h1>
${art.bodyHtml}
</div>
</div>
</section>
${tpl.footer}
<script src="../js/main.js"></script>
<script>(function(){var d={path:location.pathname,referrer:document.referrer||"",ua:navigator.userAgent,pageTitle:document.title};if(navigator.sendBeacon){navigator.sendBeacon("/api/track",JSON.stringify(d))}else{var x=new XMLHttpRequest();x.open("POST","/api/track",true);x.setRequestHeader("Content-Type","application/json");x.send(JSON.stringify(d))}})();</script>
</body>
</html>`;
}

function main() {
  console.log(`🎤 BULK-100 ranking-format generator — ${POSTS.length} posts`);
  const tpl = loadTemplate();
  const existingSlugs = new Set(fs.readdirSync(BLOG_DIR).map(f => f.replace(/\.html$/, '')));
  // also collect slugs from sitemap to be safe
  try {
    const sm = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
    for (const m of sm.matchAll(/\/blog\/([a-z0-9-]+)\.html/g)) existingSlugs.add(m[1]);
  } catch {}

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const baseTime = now.getTime();
  const newEntries = [];
  let created = 0, skipped = 0;

  POSTS.forEach((p, i) => {
    const art = buildArticle(p.kw, p.cat, i);
    let slug = art.slugBase;
    let n = 2;
    while (existingSlugs.has(slug)) { slug = `${art.slugBase}-${n}`; n++; }
    existingSlugs.add(slug);
    const filePath = path.join(BLOG_DIR, `${slug}.html`);
    if (fs.existsSync(filePath)) { skipped++; return; }
    const html = pageHtml(art.title, art.excerpt, slug, p.cat, dateStr, tpl, art);
    fs.writeFileSync(filePath, html);
    created++;
    const id = baseTime + i;
    newEntries.push({ id, title: art.title, slug, category: p.cat, date: dateStr, dateNum: id, featured: false, content: art.excerpt });
    console.log(`✅ (${created}) blog/${slug}.html`);
  });

  if (newEntries.length === 0) { console.log('Nothing new to index.'); return; }

  // 1) yh_blogPosts.json (runtime source of truth)
  const yhPath = path.join(ROOT, 'yh_blogPosts.json');
  let yh = [];
  try { yh = JSON.parse(fs.readFileSync(yhPath, 'utf8')) || []; } catch {}
  const yhSlugs = new Set(yh.map(x => x.slug));
  const yhAdd = newEntries.filter(e => !yhSlugs.has(e.slug)).map(e => ({ ...e, content: `# ${e.title}\n\n${e.content}\n\nRead the full article on younghadene.ca/blog/${e.slug}.html` }));
  yh = [...yhAdd, ...yh];
  fs.writeFileSync(yhPath, JSON.stringify(yh, null, 2));
  console.log(`✅ yh_blogPosts.json += ${yhAdd.length} (total ${yh.length})`);

  // 2) blog.html — DEFAULT_POSTS prepend + BAKED SERVER_POSTS refresh
  const bp = path.join(ROOT, 'blog.html');
  let bhtml = fs.readFileSync(bp, 'utf8');
  const escJS = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const entryStr = newEntries.map(e => `      { id: ${e.id}, title: '${escJS(e.title)}', slug: '${e.slug}', category: '${escJS(e.category)}', date: '${e.date}', dateNum: ${e.dateNum}, featured: false, content: '${escJS(e.content)}' }`).join(',\n');
  if (bhtml.includes('const DEFAULT_POSTS = [')) {
    bhtml = bhtml.replace('const DEFAULT_POSTS = [', `const DEFAULT_POSTS = [\n${entryStr},`);
    console.log('✅ blog.html DEFAULT_POSTS updated');
  }
  // refresh baked SERVER_POSTS with full yh list so file view matches server view
  const postsJson = JSON.stringify(yh);
  if (bhtml.includes('var SERVER_POSTS')) {
    bhtml = bhtml.replace(/<script>var SERVER_POSTS = .*?;\s*\n?<\/script>/s, '<script>var SERVER_POSTS = ' + postsJson + ';\n</script>');
    console.log('✅ blog.html SERVER_POSTS rebaked');
  }
  fs.writeFileSync(bp, bhtml);

  // 3) blog/posts.json (legacy mirror) — append if array
  const bposts = path.join(BLOG_DIR, 'posts.json');
  try {
    const arr = JSON.parse(fs.readFileSync(bposts, 'utf8'));
    if (Array.isArray(arr)) {
      const have = new Set(arr.map(x => x.slug));
      newEntries.filter(e => !have.has(e.slug)).forEach(e => arr.unshift({ id: e.id, title: e.title, slug: e.slug, category: e.category, date: e.date, dateNum: e.dateNum, featured: false, content: e.content }));
      fs.writeFileSync(bposts, JSON.stringify(arr, null, 2));
      console.log(`✅ blog/posts.json (total ${arr.length})`);
    }
  } catch (e) { console.log('⚠️ blog/posts.json skipped:', e.message); }

  // 4) sitemap.xml
  const sp = path.join(ROOT, 'sitemap.xml');
  let sm = fs.readFileSync(sp, 'utf8');
  const today = now.toISOString().split('T')[0];
  const urls = newEntries.map(e => `  <url>\n    <loc>https://younghadene.ca/blog/${e.slug}.html</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`).join('\n');
  sm = sm.replace('</urlset>', `${urls}\n</urlset>`);
  fs.writeFileSync(sp, sm);
  console.log(`✅ sitemap.xml += ${newEntries.length}`);

  console.log(`\n🎉 Done! Created ${created} posts, skipped ${skipped}.`);
}

main();
