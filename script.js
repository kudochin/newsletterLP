/* ===================================================
   Health Consulting LP — JavaScript
   Scroll animations, FAQ, Mobile menu
   =================================================== */

document.addEventListener('DOMContentLoaded', () => {

  // ----- Loading Screen -----
  const loadingScreen = document.getElementById('loading-screen');
  window.addEventListener('load', () => {
    setTimeout(() => {
      loadingScreen.classList.add('hidden');
    }, 1200);
  });

  // Fallback: hide after 3s even if load doesn't fire
  setTimeout(() => {
    loadingScreen.classList.add('hidden');
  }, 3000);

  // ----- Header Scroll Effect -----
  const header = document.getElementById('header');
  let lastScroll = 0;

  const handleHeaderScroll = () => {
    const currentScroll = window.scrollY;
    if (currentScroll > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
    lastScroll = currentScroll;
  };

  window.addEventListener('scroll', handleHeaderScroll, { passive: true });

  // ----- Mobile Menu -----
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobile-menu');

  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    mobileMenu.classList.toggle('active');
    document.body.style.overflow = mobileMenu.classList.contains('active') ? 'hidden' : '';
  });

  // Close mobile menu on link click
  mobileMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('active');
      mobileMenu.classList.remove('active');
      document.body.style.overflow = '';
    });
  });

  // ----- Scroll Reveal (IntersectionObserver) -----
  const revealElements = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // Add stagger delay based on data attribute or CSS animation-delay
        const delay = entry.target.style.animationDelay || '0s';
        const delayMs = parseFloat(delay) * 1000;

        setTimeout(() => {
          entry.target.classList.add('visible');
        }, delayMs);

        revealObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.15,
    rootMargin: '0px 0px -40px 0px'
  });

  revealElements.forEach(el => {
    revealObserver.observe(el);
  });

  // ----- FAQ Accordion -----
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');

    question.addEventListener('click', () => {
      const isActive = item.classList.contains('active');

      // Close all other items
      faqItems.forEach(faq => {
        faq.classList.remove('active');
        faq.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
      });

      // Toggle clicked item
      if (!isActive) {
        item.classList.add('active');
        question.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // ----- Smooth Scroll -----
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;

      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        const headerHeight = header.offsetHeight;
        const targetPosition = targetElement.getBoundingClientRect().top + window.scrollY - headerHeight;

        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    });
  });

  // ----- Hero Slideshow -----
  const slides = document.querySelectorAll('.hero-slide');
  const indicators = document.querySelectorAll('.hero-indicator');
  let currentSlide = 0;
  let slideInterval = null;
  const SLIDE_DURATION = 5000; // 5s per slide

  function goToSlide(index) {
    // Remove active from all slides and indicators
    slides.forEach(slide => slide.classList.remove('active'));
    indicators.forEach(ind => {
      ind.classList.remove('active');
    });

    // Set new active
    currentSlide = index;
    slides[currentSlide].classList.add('active');
    indicators[currentSlide].classList.add('active');

    // Re-trigger Ken Burns animation
    const activeSlide = slides[currentSlide];
    activeSlide.style.animation = 'none';
    activeSlide.offsetHeight; // force reflow
    activeSlide.style.animation = '';
  }

  function nextSlide() {
    const next = (currentSlide + 1) % slides.length;
    goToSlide(next);
  }

  function startSlideshow() {
    slideInterval = setInterval(nextSlide, SLIDE_DURATION);
  }

  function stopSlideshow() {
    clearInterval(slideInterval);
  }

  // Manual indicator clicks
  indicators.forEach(indicator => {
    indicator.addEventListener('click', () => {
      const slideIndex = parseInt(indicator.dataset.slide);
      stopSlideshow();
      goToSlide(slideIndex);
      startSlideshow();
    });
  });

  // Start auto-slideshow after loading screen
  setTimeout(() => {
    startSlideshow();
  }, 1500);

  // ----- Contact Form: 3-Step Flow (Input → Confirm → Complete) -----
  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    const STORAGE_KEY = 'contactFormData';
    const formFields = contactForm.querySelectorAll('input, textarea, select');

    const stepInput = document.getElementById('contact-step-input');
    const stepConfirm = document.getElementById('contact-step-confirm');
    const stepComplete = document.getElementById('contact-step-complete');

    // Restore saved data on page load
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
      if (saved) {
        formFields.forEach(field => {
          if (field.name && saved[field.name] !== undefined && field.type !== 'checkbox') {
            field.value = saved[field.name];
          }
        });
      }
    } catch (e) { /* ignore */ }

    // Save data on every input change
    const saveFormData = () => {
      const data = {};
      formFields.forEach(field => {
        if (field.name && field.type !== 'checkbox') {
          data[field.name] = field.value;
        }
      });
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    };

    formFields.forEach(field => {
      field.addEventListener('input', saveFormData);
      field.addEventListener('change', saveFormData);
    });

    // STEP 1 → STEP 2: Show confirmation
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const name = document.getElementById('name').value.trim();
      const email = document.getElementById('email').value.trim();
      const message = document.getElementById('message').value.trim();
      const consent = document.getElementById('consent').checked;

      // Validate
      if (!name) { alert('お名前を入力してください'); return; }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { alert('正しいメールアドレスを入力してください'); return; }
      if (!message) { alert('ご相談内容を入力してください'); return; }
      if (!consent) { alert('利用規約・免責事項への同意が必要です'); return; }

      // Populate confirm screen
      document.getElementById('confirm-name').textContent = name;
      document.getElementById('confirm-email').textContent = email;
      document.getElementById('confirm-age').textContent = document.getElementById('age').value || '未回答';
      document.getElementById('confirm-message').textContent = message;

      // Switch to confirm step
      stepInput.style.display = 'none';
      stepConfirm.style.display = 'block';
      stepComplete.style.display = 'none';

      // Scroll to top of contact section
      document.getElementById('contact').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // STEP 2 → STEP 1: Back to edit
    document.getElementById('contact-back-btn').addEventListener('click', () => {
      stepInput.style.display = 'block';
      stepConfirm.style.display = 'none';
      document.getElementById('contact').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // STEP 2 → STEP 3: Send email via API
    document.getElementById('contact-send-btn').addEventListener('click', async () => {
      const sendBtn = document.getElementById('contact-send-btn');
      const btnText = document.getElementById('send-btn-text');
      const btnLoading = document.getElementById('send-btn-loading');

      sendBtn.disabled = true;
      btnText.style.display = 'none';
      btnLoading.style.display = 'inline';

      try {
        const res = await fetch('/.netlify/functions/send-contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: document.getElementById('name').value.trim(),
            email: document.getElementById('email').value.trim(),
            age: document.getElementById('age').value,
            message: document.getElementById('message').value.trim(),
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || '送信に失敗しました');
        }

        // Clear form and storage
        contactForm.reset();
        sessionStorage.removeItem(STORAGE_KEY);

        // Switch to complete step
        stepInput.style.display = 'none';
        stepConfirm.style.display = 'none';
        stepComplete.style.display = 'block';
        document.getElementById('contact').scrollIntoView({ behavior: 'smooth', block: 'start' });

      } catch (err) {
        alert(err.message || '送信中にエラーが発生しました。時間を置いて再度お試しください。');
        sendBtn.disabled = false;
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
      }
    });
  }

});
