/* ============================================================
   BILAD AUTO — main.js
   Shared across all pages: index, projects, services, about, contact
   Handles: language toggle, mobile nav, scroll animations, counters,
            active nav, nav scroll effect, filter buttons, smooth scroll,
            contact form, spotlight hint
   ============================================================ */

/* ─────────────────────────────────────────────────────────────
   1. LANGUAGE TOGGLE
   Storage key: 'bilad-lang'  |  values: 'en' | 'ar'
   ───────────────────────────────────────────────────────────── */
(function initLanguage() {
  const saved = localStorage.getItem('bilad-lang') || 'ar';
  applyLanguage(saved, false); // false = don't save again on init
})();

/**
 * Apply a language ('ar' or 'en') to the page.
 * @param {string}  lang  - 'ar' or 'en'
 * @param {boolean} save  - whether to persist to localStorage
 */
function applyLanguage(lang, save = true) {
  const isEn  = lang === 'en';
  const body  = document.body;
  const html  = document.documentElement;

  // Toggle body class — CSS uses body.lang-en .ar { display:none } etc.
  body.classList.toggle('lang-en', isEn);

  // Set document direction
  html.setAttribute('dir', isEn ? 'ltr' : 'rtl');
  html.setAttribute('lang', isEn ? 'en' : 'ar');

  // Update toggle button label
  const btn = document.getElementById('lang-toggle');
  if (btn) {
    btn.textContent = isEn ? 'AR' : 'EN';
    btn.setAttribute('aria-label', isEn ? 'Switch to Arabic' : 'Switch to English');
  }

  // Persist
  if (save) {
    localStorage.setItem('bilad-lang', isEn ? 'en' : 'ar');
  }
}

// Wire up the toggle button
document.getElementById('lang-toggle')?.addEventListener('click', () => {
  const currentlyEn = document.body.classList.contains('lang-en');
  applyLanguage(currentlyEn ? 'ar' : 'en');
});


/* ─────────────────────────────────────────────────────────────
   2. MOBILE NAV HAMBURGER
   ───────────────────────────────────────────────────────────── */
(function initMobileNav() {
  const hamburger = document.getElementById('hamburger');
  const mobileNav = document.getElementById('mobile-nav');

  if (!hamburger || !mobileNav) return;

  // Toggle open/close on hamburger click
  hamburger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = hamburger.classList.toggle('open');
    mobileNav.classList.toggle('open', isOpen);
    hamburger.setAttribute('aria-expanded', String(isOpen));
  });

  // Close when clicking any nav-link inside mobile nav
  mobileNav.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', closeMobileNav);
  });

  // Close when clicking outside the nav
  document.addEventListener('click', (e) => {
    if (!mobileNav.contains(e.target) && !hamburger.contains(e.target)) {
      closeMobileNav();
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMobileNav();
  });

  function closeMobileNav() {
    hamburger.classList.remove('open');
    mobileNav.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
  }
})();


/* ─────────────────────────────────────────────────────────────
   3. INTERSECTION OBSERVER — SCROLL ANIMATIONS
   Targets: .fade-up, .fade-left, .fade-right
   ───────────────────────────────────────────────────────────── */
(function initScrollAnimations() {
  const animatedEls = document.querySelectorAll('.fade-up, .fade-left, .fade-right');
  if (!animatedEls.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target); // play once
      }
    });
  }, {
    threshold: 0.15,
    rootMargin: '0px 0px -50px 0px'
  });

  animatedEls.forEach(el => observer.observe(el));
})();


/* ─────────────────────────────────────────────────────────────
   4. COUNTER ANIMATION
   Targets: .stat-number[data-target]
   Optional: data-suffix="+" to append a plus sign
   ───────────────────────────────────────────────────────────── */
(function initCounters() {
  const statEls = document.querySelectorAll('.stat-number[data-target]');
  if (!statEls.length) return;

  /**
   * Animate a counter element from 0 to its data-target value.
   * @param {HTMLElement} el
   */
  function animateCounter(el) {
    const target   = parseFloat(el.dataset.target);
    const suffix   = el.dataset.suffix || '';
    const duration = 2000; // ms
    const startTime = performance.now();

    function formatNumber(value) {
      const rounded = Math.floor(value);
      // Add comma for thousands
      return rounded >= 1000
        ? rounded.toLocaleString('en-US')
        : String(rounded);
    }

    function easeOut(t) {
      // Quadratic ease-out: t goes from 0 → 1
      return t * (2 - t);
    }

    function tick(now) {
      const elapsed  = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased    = easeOut(progress);
      const current  = eased * target;

      el.textContent = formatNumber(current) + (progress === 1 ? suffix : '');

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        // Ensure exact final value
        el.textContent = formatNumber(target) + suffix;
      }
    }

    requestAnimationFrame(tick);
  }

  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        counterObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.15,
    rootMargin: '0px 0px -50px 0px'
  });

  statEls.forEach(el => counterObserver.observe(el));
})();


/* ─────────────────────────────────────────────────────────────
   5. ACTIVE NAV LINK
   Highlights the link matching the current page filename
   ───────────────────────────────────────────────────────────── */
(function initActiveNav() {
  // Determine current page filename
  let pagePath = window.location.pathname;
  // Strip trailing slash, get just the filename
  let page = pagePath.split('/').pop();
  // Root / or empty → treat as index
  if (!page || page === '') page = 'index.html';

  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href');
    if (!href) return;
    // Match exact filename, or just 'index.html' vs '/'
    const linkPage = href.split('/').pop();
    if (linkPage === page || (page === 'index.html' && (href === '/' || href === './'))) {
      link.classList.add('active');
    }
  });
})();


/* ─────────────────────────────────────────────────────────────
   6. NAV SCROLL EFFECT
   Adds .scrolled to .nav when scrollY > 50
   ───────────────────────────────────────────────────────────── */
(function initNavScroll() {
  const navEl = document.querySelector('.nav');
  if (!navEl) return;

  function updateNavState() {
    navEl.classList.toggle('scrolled', window.scrollY > 50);
  }

  // Initial check (in case page is loaded already scrolled)
  updateNavState();

  window.addEventListener('scroll', updateNavState, { passive: true });
})();


/* ─────────────────────────────────────────────────────────────
   7. FILTER BUTTONS (projects page)
   .filter-btn[data-filter]  →  .project-card[data-category]
   ───────────────────────────────────────────────────────────── */
(function initProjectFilter() {
  const filterBtns   = document.querySelectorAll('.filter-btn');
  const projectCards = document.querySelectorAll('.project-card');

  if (!filterBtns.length || !projectCards.length) return;

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Update active button state
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.dataset.filter || 'all';

      projectCards.forEach(card => {
        const category = card.dataset.category || '';
        const show     = filter === 'all' || category === filter;

        if (show) {
          // Fade in
          card.style.display = '';
          // Allow display to apply before triggering opacity transition
          requestAnimationFrame(() => {
            card.style.opacity  = '1';
            card.style.transform = 'translateY(0)';
          });
        } else {
          // Fade out then hide
          card.style.opacity  = '0';
          card.style.transform = 'translateY(20px)';
          // After transition, set display:none
          const onTransitionEnd = () => {
            if (card.style.opacity === '0') {
              card.style.display = 'none';
            }
            card.removeEventListener('transitionend', onTransitionEnd);
          };
          card.addEventListener('transitionend', onTransitionEnd);
        }
      });
    });
  });
})();


/* ─────────────────────────────────────────────────────────────
   8. SMOOTH SCROLL for anchor links starting with #
   ───────────────────────────────────────────────────────────── */
(function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (targetId === '#') return; // bare # links → skip

      const targetEl = document.querySelector(targetId);
      if (!targetEl) return;

      e.preventDefault();
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
})();


/* ─────────────────────────────────────────────────────────────
   9. CONTACT FORM SUBMISSION
   Form id="contact-form"
   ───────────────────────────────────────────────────────────── */
(function initContactForm() {
  const form = document.getElementById('contact-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const submitBtn = form.querySelector('button[type="submit"]');
    if (!submitBtn) return;

    // Save original button content
    const originalContent = submitBtn.innerHTML;

    // Show loading state
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <span class="ar">جاري الإرسال...</span>
      <span class="en">Sending...</span>
    `;

    // Simulate async form submission (replace with real fetch in production)
    setTimeout(() => {
      // Determine current language
      const isEn = document.body.classList.contains('lang-en');
      const successMsg = isEn
        ? "Your message was sent successfully! We'll contact you soon."
        : 'تم إرسال رسالتك بنجاح! سنتواصل معك قريباً';

      // Show success message
      let successEl = form.querySelector('.form-success');
      if (!successEl) {
        successEl = document.createElement('div');
        successEl.className = 'form-success';
        form.appendChild(successEl);
      }
      successEl.textContent = successMsg;
      successEl.style.display = 'block';

      // Reset form fields
      form.reset();

      // Restore button
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalContent;

      // Hide success message after 5 seconds
      setTimeout(() => {
        successEl.style.display = 'none';
      }, 5000);
    }, 1500);
  });
})();


/* ─────────────────────────────────────────────────────────────
   10. SPOTLIGHT HINT AUTO-HIDE (index page only)
   Hides .spotlight-hint after 4 seconds
   ───────────────────────────────────────────────────────────── */
(function initSpotlightHint() {
  const hint = document.querySelector('.spotlight-hint');
  if (!hint) return;

  setTimeout(() => {
    hint.classList.add('hidden');
  }, 4000);
})();

/* ============================================================
   BILAD AUTO — WordPress AJAX Form Handling
   ============================================================ */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var form = document.getElementById('bilad-quote-form');
    if (!form || typeof biladData === 'undefined') return;

    var msgBox   = document.getElementById('bilad-form-message');
    var btnText  = form.querySelector('.btn-text');
    var btnLoad  = form.querySelector('.btn-loading');
    var submitBtn= form.querySelector('button[type="submit"]');

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      // حالة التحميل
      if (btnText) btnText.classList.add('hidden');
      if (btnLoad) btnLoad.classList.remove('hidden');
      if (submitBtn) submitBtn.disabled = true;

      var data = new FormData(form);
      data.append('action', 'bilad_quote');
      data.append('nonce', biladData.nonce);

      fetch(biladData.ajaxUrl, { method: 'POST', body: data })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (!msgBox) return;
          msgBox.classList.remove('hidden', 'form-error');
          msgBox.classList.add(res.success ? 'form-success' : 'form-error');
          msgBox.textContent = res.data.message;
          if (res.success) form.reset();
        })
        .catch(function () {
          if (!msgBox) return;
          msgBox.classList.remove('hidden');
          msgBox.classList.add('form-error');
          msgBox.textContent = 'حدث خطأ. الرجاء المحاولة مرة أخرى أو التواصل عبر واتساب.';
        })
        .finally(function () {
          if (btnText) btnText.classList.remove('hidden');
          if (btnLoad) btnLoad.classList.add('hidden');
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  });
})();

/* ── فلترة المشاريع ─────────────────────────────────── */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var btns  = document.querySelectorAll('.filter-btn');
    var cards = document.querySelectorAll('.project-card');
    if (!btns.length || !cards.length) return;

    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        btns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');

        var filter = btn.dataset.filter;
        cards.forEach(function (card) {
          var cats = (card.dataset.category || '').split(' ');
          card.style.display = (filter === 'all' || cats.indexOf(filter) !== -1) ? '' : 'none';
        });
      });
    });
  });
})();
