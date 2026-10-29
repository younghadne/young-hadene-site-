<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
<!-- Google tag (gtag.js) — deferred: events queue in dataLayer; library loads on first interaction or ~3s after window load -->
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
</script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
{{META}}
  <link rel="stylesheet" href="../css/style.css">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='28' font-size='28'>🎤</text></svg>">
{{SCHEMA}}
  <style>
    /* CLS: metric-matched fallbacks (same values as PR #11) so the Anton/Inter/Plex swap moves nothing. */
    @font-face { font-family: 'Anton Fallback Narrow'; src: local('Arial Narrow Bold'), local('ArialNarrow-Bold'); size-adjust: 80.84%; ascent-override: 145.51%; descent-override: 40.71%; line-gap-override: 0%; }
    @font-face { font-family: 'Anton Fallback'; src: local('Arial Bold'), local('Arial-BoldMT'), local('Liberation Sans Bold'), local('LiberationSans-Bold'); size-adjust: 66.28%; ascent-override: 177.47%; descent-override: 49.65%; line-gap-override: 0%; }
    @font-face { font-family: 'Inter Fallback'; src: local('Arial'), local('ArialMT'), local('Liberation Sans'), local('LiberationSans-Regular'); size-adjust: 107.48%; ascent-override: 90.14%; descent-override: 22.44%; line-gap-override: 0%; }
    @font-face { font-family: 'Inter Fallback'; font-weight: 700; src: local('Arial Bold'), local('Arial-BoldMT'), local('Liberation Sans Bold'), local('LiberationSans-Bold'); size-adjust: 102.42%; ascent-override: 94.58%; descent-override: 23.55%; line-gap-override: 0%; }
    @font-face { font-family: 'IBM Plex Mono Fallback'; src: local('Menlo-Regular'), local('Menlo'), local('Liberation Mono'), local('LiberationMono-Regular'), local('DejaVu Sans Mono'), local('Courier New'); size-adjust: 100%; ascent-override: 102.5%; descent-override: 27.5%; line-gap-override: 0%; }
    :root { --font-heading: 'Anton', 'Anton Fallback Narrow', 'Anton Fallback', sans-serif; --font-body: 'Inter', 'Inter Fallback', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; --font-mono: 'IBM Plex Mono', 'IBM Plex Mono Fallback', ui-monospace, SFMono-Regular, Menlo, monospace; }
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
    .article-wrap .toc ul ul { padding-left: 20px; }
    .article-wrap blockquote { border-left: 3px solid var(--accent); padding: 16px 20px; margin: 24px 0; background: var(--bg-card); border-radius: 0 var(--radius-sm) var(--radius-sm) 0; color: var(--text-secondary); font-style: italic; }
    .article-wrap .highlight-box { background: var(--accent-tint); border: 1px solid var(--accent-hairline); border-radius: var(--radius); padding: 24px; margin: 24px 0; }
    .article-wrap .highlight-box p { margin-bottom: 0; }
    .article-wrap .cta-box { text-align: center; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius); padding: 32px; margin: 40px 0; }
    .article-wrap .cta-box h3, .article-wrap .cta-box h2 { margin-top: 0; color: var(--text-primary); }
    .article-wrap .cta-box p { margin-bottom: 20px; }
    .back-link { display: inline-flex; align-items: center; gap: 8px; color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 32px; transition: color var(--transition); }
    .back-link:hover { color: var(--accent); }
    .artist-card { display: flex; gap: 20px; align-items: flex-start; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius); padding: 24px; margin: 20px 0; }
    .artist-card .num { font-family: var(--font-heading); font-size: 2rem; color: var(--accent); line-height: 1; flex-shrink: 0; width: 40px; }
    .artist-card .info { flex: 1; }
    .artist-card .info h4, .artist-card .info h3 { font-family: var(--font-heading); font-size: 1.2rem; margin-bottom: 4px; }
    .artist-card .info .tag { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; display: block; }
    .artist-card .info p { font-size: 0.85rem; margin-bottom: 0; color: var(--text-secondary); }
    .artist-card.featured { border-color: var(--accent-border); background: var(--accent-tint); }
    .artist-card.featured .num { color: #fff; }
    @media (max-width: 600px) { .artist-card { flex-direction: column; gap: 12px; } .article-wrap { padding: 24px 0; } }
    .artist-card .info ul { margin: 0; padding-left: 18px; font-size: 0.85rem; }
    .sources, .sources li, .sources a { overflow-wrap: anywhere; }
    /* Tap targets (UX, same technique as PR #8): padding offset by matching negative margins, so nothing visible moves. Back link >= 44px tall (12px + 20.5px text + 12px; bottom margin 20px + 12px padding = the original 32px gap); footnote refs >= 24px tall (site css gives 4px). */
    .back-link { padding-block: 12px; margin-block: -12px 20px; }
    .article-wrap sup a { padding-block: 6px; margin-block: -6px; }
    /* Adjacent footnote refs (FAQ "1,2"; build-anchor.mjs marks the second as sup.fn-adj): site css pads sup a by 10px each side, so side-by-side refs overlapped by 20px. A CSS comma + 17px gap separates them; ref 1 keeps 10px on its right, ref 2 gets 7px on its left (10 + 7 = 17), so the hit boxes touch but never overlap and both stay >= 24px wide. */
    .article-wrap sup.fn-adj::before { content: ","; display: inline-block; width: 17px; }
    .article-wrap sup.fn-adj a { padding-left: 7px; margin-left: -7px; }
    /* Sources: the 16 single-link entries >= 44px tall (line-height 20px + 2 x 12px, offset by -12px so the line box is unchanged); li gap 8px -> 18px so neighbouring 44px targets don't overlap. Multi-link Apple Music entry: 2.5px padding -> 24px, under its 27.36px line pitch. */
    .article-wrap .sources li { margin-bottom: 18px; }
    .article-wrap .sources li > a:only-child { display: inline-block; line-height: 20px; padding-block: 12px; margin-block: -12px; }
    .article-wrap .sources li > a:not(:only-child) { padding-block: 2.5px; margin-block: -2.5px; }
    /* '"Broken" video' inline link: 16px text box (0.85rem) + 2 x 4px = 24px, under its 24.48px line pitch. */
    .article-wrap .artist-card a[href="/music/broken"] { padding-block: 4px; margin-block: -4px; }
    /* Footer nav + Music links: site css (style.css "Tap targets: footer links") pads these inline links 14px each way to 44px, but the rows are only 35.59px apart (25.59px line + 10px li gap), so neighbours overlapped by 8.41px. Here each link is a 44px inline-block (20px line + 2 x 12px) and the li gap is 0, so rows sit exactly 44px apart: tap areas touch, never overlap. */
    .footer ul li { margin-bottom: 0; }
    .footer ul li a { display: inline-block; vertical-align: top; line-height: 20px; padding-block: 12px; margin-block: 0; }
    /* From PR #9: table of contents: 24.48px line + 2 x 6px = 36.48px -> 2 x 10px = 44.48px, offset by -4px each side; flow-root on the li stops the negative margins collapsing into the 8px li gap, so the rows stay put and neighbouring targets touch (4px + 4px = 8px) without overlapping. */
    .article-wrap .toc li { display: flow-root; }
    .article-wrap .toc a { padding-block: 10px; margin-block: -4px; }
    /* From PR #9: inline links in body copy >= 24px tall. Inline vertical padding does not change line boxes, so no offset is needed: 0.95rem text (19px box) + 2 x 3px = 25px under a 27.36px line pitch; 0.85rem card text (16px box) + 2 x 4px = 24px under a 24.48px pitch. Footnote refs (sup a) are not direct children of p and keep their own rule. */
    .article-wrap p > a:not(.btn) { padding-block: 3px; }
    .article-wrap .artist-card .info p > a:not(.btn) { padding-block: 4px; }
  </style>
{{BREADCRUMB}}
</head>
<body>

  <header class="header">
    <div class="header-inner">
      <a href="/" class="logo">YOUNG<span class="logo-accent">HADENE</span><span class="logo-sub">Toronto • Dark Trap</span></a>
      <button class="hamburger" aria-label="Toggle menu"><span></span><span></span><span></span></button>
      <nav>
        <ul class="nav-list">
          <li><a href="/" class="nav-link">Home</a></li>
          <li><a href="/music" class="nav-link">Music</a></li>
          <li><a href="/videos" class="nav-link">Videos</a></li>
          <li><a href="/blog" class="nav-link active">Blog</a></li>
          <li><a href="/news" class="nav-link">News</a></li>
          <li><a href="/about" class="nav-link">About</a></li>
          <li><a href="/contact" class="nav-link">Contact</a></li>
        
          <li><a href="/admin" class="nav-link" style="color:var(--text-muted);font-size:0.7rem;">Admin</a></li></ul>
      </nav>
    </div>
  </header>

  <section class="section" style="padding-top:120px;">
    <div class="container">
      <a href="/blog" class="back-link">&#8592; Back to Blog</a>
      <div class="article-wrap">
{{BODY}}
      </div>
    </div>
  </section>

  <footer class="footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <a href="/" class="logo">YOUNG<span class="logo-accent">HADENE</span><span class="logo-sub">Toronto • Dark Trap</span></a>
          <p>Haitian-Toronto drill and dark trap artist. Heavy 808s from the 6ix. Built different.</p>
          <div class="footer-social">
            <a href="https://www.instagram.com/YOUNGHADENE" target="_blank" rel="noopener">📷</a>
            <a href="https://www.youtube.com/channel/UCSJd-7T-_K3MCve3GY4k8mg" target="_blank" rel="noopener">▶</a>
            <a href="https://open.spotify.com/artist/4MYeewqn16CCiuIgmpIaGA" target="_blank" rel="noopener" aria-label="Spotify">♫</a>
            <a href="https://soundcloud.com/young_hadene" aria-label="SoundCloud">☁</a>
          </div>
        </div>
        <div>
          <h2 class="footer-heading">Navigate</h2>
          <ul>
            <li><a href="/">Home</a></li>
            <li><a href="/music">Music</a></li>
            <li><a href="/blog">Blog</a></li>
            <li><a href="/contact">Contact</a></li>
          </ul>
        </div>
        <div>
          <h2 class="footer-heading">Music</h2>
          <ul>
            <li><a href="https://open.spotify.com/artist/4MYeewqn16CCiuIgmpIaGA" target="_blank">Spotify</a></li>
            <li><a href="https://music.apple.com/ca/artist/young-hadene/1080604782">Apple Music</a></li>
            <li><a href="https://soundcloud.com/young_hadene">SoundCloud</a></li>
            <li><a href="https://www.youtube.com/channel/UCSJd-7T-_K3MCve3GY4k8mg" target="_blank" rel="noopener">YouTube</a></li>
          </ul>
        </div>
        <div>
          <h2 class="footer-heading">Contact</h2>
          <ul>
            <li><a href="mailto:contact@younghadene.ca">Email</a></li>
            <li><a href="/contact">Bookings</a></li>
            <li><a href="/contact">Press Kit</a></li>
            <li><a href="/contact">Collaborate</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <p>&copy; 2026 Young Hadene. All rights reserved. Toronto. 6ix.</p>
        <div class="footer-bottom-links">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </div>
      </div>
    </div>
  </footer>

  <script src="../js/main.js"></script>
</body>
</html>
