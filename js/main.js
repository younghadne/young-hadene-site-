document.addEventListener('DOMContentLoaded', () => {

  // ---- Mobile Menu ----
  const hamburger = document.querySelector('.hamburger');
  const navList = document.querySelector('.nav-list');

  if (hamburger) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('active');
      navList.classList.toggle('open');
    });

    // Close menu on link click
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        navList.classList.remove('open');
      });
    });
  }

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

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  fadeElements.forEach(el => observer.observe(el));

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
