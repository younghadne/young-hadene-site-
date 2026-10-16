document.addEventListener('DOMContentLoaded', () => {

  // ---- Shared navigation (SINGLE SOURCE OF TRUTH) ----
  // Every page used to hardcode its own <nav> copy, so tabs (News, About…)
  // silently went missing on some pages. The canonical tab list lives HERE
  // only: on load, the visible nav is rebuilt from it (active tab derived
  // from the URL), so switching tabs can never remove navigation items.
  // The static per-page markup remains as a no-JS fallback and is guarded
  // by scripts/check-nav.js (npm test).
  const NAV_ITEMS = [
    { label: 'Home', href: '/' },
    { label: 'Music', href: '/music' },
    { label: 'Videos', href: '/videos' },
    { label: 'Blog', href: '/blog' },
    { label: 'News', href: '/news' },
    { label: 'About', href: '/about' },
    { label: 'Contact', href: '/contact' },
    { label: 'Admin', href: '/admin', style: 'color:var(--text-muted);font-size:0.7rem;' },
  ];

  function navPath() {
    try {
      let p = location.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
      if (p.length > 1) p = p.replace(/\/$/, '');
      return p || '/';
    } catch {
      return '/';
    }
  }

  function navActive(item, path) {
    if (item.href === '/') return path === '/';
    return path === item.href || path.indexOf(item.href + '/') === 0;
  }

  try {
    const navList = document.querySelector('nav ul.nav-list');
    if (navList) {
      const path = navPath();
      navList.innerHTML = NAV_ITEMS.map((item) => {
        const active = navActive(item, path) ? ' active' : '';
        const style = item.style ? ` style="${item.style}"` : '';
        return `<li><a href="${item.href}" class="nav-link${active}"${style}>${item.label}</a></li>`;
      }).join('');
    }
  } catch (e) { /* static fallback nav stays */ }

  // ---- Mobile Menu ----
  const hamburger = document.querySelector('.hamburger');
  const navList = document.querySelector('.nav-list');

  if (hamburger && navList) {
    if (!navList.id) navList.id = 'site-nav';
    hamburger.setAttribute('aria-controls', navList.id);
    hamburger.setAttribute('aria-expanded', 'false');

    const setMenu = (open) => {
      hamburger.classList.toggle('active', open);
      navList.classList.toggle('open', open);
      hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    hamburger.addEventListener('click', () => {
      setMenu(!navList.classList.contains('open'));
    });

    // Close menu on link tap
    navList.addEventListener('click', (e) => {
      if (e.target.closest('a')) setMenu(false);
    });

    // Close menu on Escape and return focus to the toggle
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && navList.classList.contains('open')) {
        setMenu(false);
        hamburger.focus();
      }
    });
  }

  // ---- Defer heavy embeds (Spotify) until scrolled near or after interaction ----
  const deferred = document.querySelectorAll('iframe[data-src]');
  if (deferred.length) {
    const load = (f) => { if (f.dataset.src) { f.src = f.dataset.src; delete f.dataset.src; } };
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => { if (en.isIntersecting) { load(en.target); io.unobserve(en.target); } });
      }, { rootMargin: '200px 0px' });
      deferred.forEach((f) => io.observe(f));
    } else {
      deferred.forEach(load);
    }
  }

  // ---- YouTube facade: load the iframe only on tap (autoplay) ----
  document.querySelectorAll('.yt-facade').forEach((btn) => {
    btn.addEventListener('click', () => {
      const iframe = document.createElement('iframe');
      iframe.src = btn.dataset.ytSrc;
      iframe.title = btn.dataset.ytTitle || 'YouTube video';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      iframe.allowFullscreen = true;
      btn.replaceChildren(iframe);
      btn.removeAttribute('aria-label');
      iframe.focus();
    }, { once: true });
  });

  // ---- Header scroll effect ----
  const header = document.querySelector('.header');
  let lastScroll = 0;

  window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;

    if (currentScroll > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }

    lastScroll = currentScroll;
  });

  // ---- Scroll-triggered fade-in ----
  const fadeElements = document.querySelectorAll('.fade-in');

  const observerOptions = {
    threshold: 0.15,
    rootMargin: '0px 0px -50px 0px'
  };

  // Content is visible by default (no-JS safe). The first IO callback (runs after the browser's own
  // layout, so no forced reflow) marks on-screen items visible, then html.reveal-ready enables hiding.
  let firstPass = true;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting || (firstPass && entry.boundingClientRect.top < window.innerHeight)) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
    if (firstPass) { firstPass = false; document.documentElement.classList.add('reveal-ready'); }
  }, observerOptions);

  // stagger siblings via --i (capped at 6 in CSS)
  fadeElements.forEach(el => { if (!el.style.getPropertyValue('--i') && el.parentElement) { const sib = [...el.parentElement.children].filter(c => c.classList.contains('fade-in')); if (sib.length > 1) el.style.setProperty('--i', sib.indexOf(el)); } observer.observe(el); });
  if (!fadeElements.length) document.documentElement.classList.add('reveal-ready');

  // ---- Play button handler ----
  document.querySelectorAll('.btn-play').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = btn.closest('.release-card, .feature-card');
      const label = card ? card.querySelector('h4, h3')?.textContent || 'track' : 'track';
      console.log(`[Young Hadene] Play: ${label}`);
      btn.classList.toggle('playing');
      const icon = btn.querySelector('span') || btn;
      if (btn.classList.contains('playing')) {
        icon.textContent = '⏸';
      } else {
        icon.textContent = '▶';
      }
    });
  });

  // ---- Google Business Profile link injector (site-wide footer) ----
  // Ensures every page links to the Google card for SEO / discovery,
  // even on older blog posts without a hardcoded footer link.
  try {
    var GOOGLE_URL = 'https://share.google/HesREN5rtFGRek6bi';
    document.querySelectorAll('.footer-social').forEach(function (wrap) {
      if (wrap.querySelector('a[href*="share.google"]')) return;
      var a = document.createElement('a');
      a.href = GOOGLE_URL;
      a.target = '_blank';
      a.rel = 'noopener';
      a.setAttribute('aria-label', 'Young Hadene on Google');
      a.title = 'Find Young Hadene on Google';
      a.textContent = 'G';
      a.style.fontWeight = '800';
      wrap.appendChild(a);
    });
  } catch (e) { /* no-op */ }

  // ---- Newsletter form ----
  const newsletterForm = document.querySelector('.newsletter-form');
  if (newsletterForm) {
    newsletterForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = newsletterForm.querySelector('input');
      if (input.value.trim()) {
        const btn = newsletterForm.querySelector('.btn');
        const originalText = btn.textContent;
        btn.textContent = 'Joined ✓';
        btn.style.background = '#22c55e';
        setTimeout(() => {
          btn.textContent = originalText;
          btn.style.background = '';
          input.value = '';
        }, 2500);
      }
    });
  }

});

// ---- Batch 2: album sticky Stream bar (shown once the deep-link row scrolls away, hidden at the end row) ----
(function () {
  var bar = document.querySelector('.album-sticky'), row = document.getElementById('album-links'), end = document.querySelector('.album-end');
  if (!bar || !row || !('IntersectionObserver' in window)) return;
  var a = bar.querySelector('a'), past = false, atEnd = false;
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (e.target === row) past = !e.isIntersecting && e.boundingClientRect.top < 0;
      else atEnd = e.isIntersecting;
    });
    var on = past && !atEnd;
    bar.classList.toggle('is-shown', on);
    bar.inert = !on;
    if (on) bar.removeAttribute('aria-hidden'); else bar.setAttribute('aria-hidden', 'true');
  });
  io.observe(row); if (end) io.observe(end);
})();

// ---- Ninefold index swap: hovering/focusing a title swaps the cover art ----
(function () {
  var root = document.querySelector('[data-nf-index]');
  if (!root) return;
  var rows = root.querySelectorAll('a.nf-row'), arts = root.querySelectorAll('.nf-art img'), meta = root.querySelector('[data-nf-meta]');
  function on(i) {
    rows.forEach(function (r, j) { r.parentElement.classList.toggle('is-on', j === i); });
    arts.forEach(function (a, j) { a.classList.toggle('is-on', j === i); });
    if (meta) meta.textContent = rows[i].querySelector('.nf-meta:not(.n)').textContent;
  }
  rows.forEach(function (r, i) { r.addEventListener('mouseenter', function () { on(i); }); r.addEventListener('focus', function () { on(i); }); });
})();
