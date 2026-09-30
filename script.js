/* ========================================
   Плиточник.НСК — JavaScript
   ======================================== */

document.addEventListener('DOMContentLoaded', () => {

  // ===== HEADER SCROLL EFFECT =====
  const header = document.getElementById('header');
  let lastScroll = 0;

  const handleScroll = () => {
    const currentScroll = window.scrollY;
    if (currentScroll > 60) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
    lastScroll = currentScroll;
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll(); // init on load

  // ===== MOBILE NAVIGATION =====
  const burger = document.getElementById('burger');
  const nav = document.getElementById('nav');
  const navOverlay = document.getElementById('navOverlay');

  const toggleNav = () => {
    burger.classList.toggle('active');
    nav.classList.toggle('open');
    navOverlay.classList.toggle('active');
    document.body.style.overflow = nav.classList.contains('open') ? 'hidden' : '';
  };

  burger.addEventListener('click', toggleNav);
  navOverlay.addEventListener('click', toggleNav);

  // Close nav on link click
  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      if (nav.classList.contains('open')) {
        toggleNav();
      }
    });
  });

  // ===== SMOOTH SCROLL =====
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        const headerHeight = header.offsetHeight;
        const targetPosition = target.getBoundingClientRect().top + window.scrollY - headerHeight;
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    });
  });

  // ===== SCROLL REVEAL =====
  const revealElements = document.querySelectorAll('.reveal');

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  });

  revealElements.forEach(el => revealObserver.observe(el));

  // ===== ANIMATED COUNTERS =====
  const counters = document.querySelectorAll('[data-target]');
  let countersAnimated = new Set();

  const animateCounter = (el) => {
    const target = parseInt(el.getAttribute('data-target'));
    const duration = 2000; // ms
    const start = performance.now();

    const updateCounter = (currentTime) => {
      const elapsed = currentTime - start;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(eased * target);

      // Keep the suffix span
      const suffix = el.querySelector('span');
      const suffixHTML = suffix ? suffix.outerHTML : '';
      el.textContent = current;
      if (suffixHTML) {
        el.innerHTML = current + suffixHTML;
      }

      if (progress < 1) {
        requestAnimationFrame(updateCounter);
      }
    };

    requestAnimationFrame(updateCounter);
  };

  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !countersAnimated.has(entry.target)) {
        countersAnimated.add(entry.target);
        animateCounter(entry.target);
      }
    });
  }, { threshold: 0.5 });

  counters.forEach(counter => counterObserver.observe(counter));

  // ===== PORTFOLIO FILTER =====
  const filterBtns = document.querySelectorAll('.filter-btn');
  const portfolioItems = document.querySelectorAll('.portfolio-item');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Update active button
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.getAttribute('data-filter');

      portfolioItems.forEach(item => {
        const category = item.getAttribute('data-category');
        if (filter === 'all' || category === filter) {
          item.style.display = '';
          item.style.animation = 'fadeIn 0.5s ease forwards';
        } else {
          item.style.display = 'none';
        }
      });
    });
  });

  // Add fadeIn animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
  `;
  document.head.appendChild(style);

  // ===== LIGHTBOX =====
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxClose = document.getElementById('lightboxClose');

  portfolioItems.forEach(item => {
    item.addEventListener('click', () => {
      const img = item.querySelector('img');
      lightboxImg.src = img.src;
      lightboxImg.alt = img.alt;
      lightbox.classList.add('active');
      document.body.style.overflow = 'hidden';
    });
  });

  const closeLightbox = () => {
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
  };

  lightboxClose.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) {
      closeLightbox();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightbox.classList.contains('active')) {
      closeLightbox();
    }
  });

  // ===== REVIEWS SLIDER =====
  const reviewsTrack = document.getElementById('reviewsTrack');
  const reviewCards = reviewsTrack.querySelectorAll('.review-card');
  const reviewPrev = document.getElementById('reviewPrev');
  const reviewNext = document.getElementById('reviewNext');
  const reviewsDots = document.querySelectorAll('.reviews-dot');
  let currentReview = 0;
  let autoSlideInterval;

  const goToReview = (index) => {
    if (index < 0) index = reviewCards.length - 1;
    if (index >= reviewCards.length) index = 0;
    currentReview = index;
    reviewsTrack.style.transform = `translateX(-${currentReview * 100}%)`;

    reviewsDots.forEach((dot, i) => {
      dot.classList.toggle('active', i === currentReview);
    });
  };

  reviewPrev.addEventListener('click', () => {
    goToReview(currentReview - 1);
    resetAutoSlide();
  });

  reviewNext.addEventListener('click', () => {
    goToReview(currentReview + 1);
    resetAutoSlide();
  });

  reviewsDots.forEach(dot => {
    dot.addEventListener('click', () => {
      goToReview(parseInt(dot.getAttribute('data-index')));
      resetAutoSlide();
    });
  });

  // Auto slide
  const startAutoSlide = () => {
    autoSlideInterval = setInterval(() => {
      goToReview(currentReview + 1);
    }, 5000);
  };

  const resetAutoSlide = () => {
    clearInterval(autoSlideInterval);
    startAutoSlide();
  };

  startAutoSlide();

  // Touch/Swipe support for slider
  let touchStartX = 0;
  let touchEndX = 0;

  reviewsTrack.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  reviewsTrack.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    const diff = touchStartX - touchEndX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        goToReview(currentReview + 1);
      } else {
        goToReview(currentReview - 1);
      }
      resetAutoSlide();
    }
  }, { passive: true });

  // ===== CONTACT FORM =====
  const contactForm = document.getElementById('contactForm');

  const LEAD_API = 'https://xn--l1aib.xn--h1aagabnceg1af5d.xn--p1ai:8443/api/order';

  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(contactForm);
    const btn = contactForm.querySelector('.btn');
    const originalText = btn.innerHTML;

    const showResult = (html, color, reset) => {
      btn.innerHTML = html;
      btn.style.background = color;
      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.style.background = '';
        btn.disabled = false;
        if (reset) contactForm.reset();
      }, 4000);
    };

    btn.disabled = true;
    btn.innerHTML = 'Отправляем...';

    try {
      const res = await fetch(LEAD_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          phone: formData.get('phone'),
          comment: [formData.get('message'), '(заявка с сайта)'].filter(Boolean).join(' ')
        })
      });
      if (!res.ok) throw new Error(res.status);
      showResult(`
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Заявка отправлена!
      `, '#22C55E', true);
    } catch (err) {
      showResult('Не отправилось — позвоните: +7 953 887-77-93', '#EF4444', false);
    }
  });

  // ===== PHONE MASK =====
  const phoneInput = document.getElementById('phone');

  phoneInput.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 0) {
      if (value[0] === '7' || value[0] === '8') {
        value = value.substring(1);
      }
      let formatted = '+7';
      if (value.length > 0) formatted += ' (' + value.substring(0, 3);
      if (value.length > 3) formatted += ') ' + value.substring(3, 6);
      if (value.length > 6) formatted += '-' + value.substring(6, 8);
      if (value.length > 8) formatted += '-' + value.substring(8, 10);
      e.target.value = formatted;
    }
  });

  // ===== ACTIVE NAV LINK HIGHLIGHT =====
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav a');

  const highlightNav = () => {
    const scrollPos = window.scrollY + header.offsetHeight + 100;

    sections.forEach(section => {
      const top = section.offsetTop;
      const height = section.offsetHeight;
      const id = section.getAttribute('id');

      if (scrollPos >= top && scrollPos < top + height) {
        navLinks.forEach(link => {
          link.style.fontWeight = '';
          if (link.getAttribute('href') === '#' + id) {
            link.style.fontWeight = '700';
          }
        });
      }
    });
  };

  window.addEventListener('scroll', highlightNav, { passive: true });

});
