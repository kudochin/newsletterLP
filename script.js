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

  // ----- Form Data Persistence (sessionStorage) -----
  // Saves form data so it isn't lost when navigating to terms page and back
  const contactForm = document.querySelector('.contact-form');
  if (contactForm) {
    const STORAGE_KEY = 'contactFormData';
    const formFields = contactForm.querySelectorAll('input, textarea, select');

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
    } catch (e) { /* ignore parse errors */ }

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

    // Clear saved data on successful submission
    contactForm.addEventListener('submit', () => {
      sessionStorage.removeItem(STORAGE_KEY);
    });
  }

});
