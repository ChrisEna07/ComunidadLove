/* ==========================================================================
   APP LOGIC - COMUNIDAD LOVE (CARTAGENA)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initVerseRotator();
  initScrollAnimations();
  initCalendar();
  initGallery();
  initAudioPlayerSim();
  initPrayerRequestSystem();
  initLottieAnimations();
  initDonationClipboard();
  initLoveMarket();
  initLocationTabs();
});

/* ==========================================================================
   NAVBAR SCROLL EFFECT & MOBILE MENU
   ========================================================================== */
function initNavbar() {
  const header = document.querySelector('header');
  const menuToggle = document.querySelector('.menu-toggle');
  const navMenu = document.querySelector('.nav-menu');
  const navLinks = document.querySelectorAll('.nav-link');

  // Change style on scroll
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  });

  // Toggle mobile menu
  menuToggle.addEventListener('click', () => {
    navMenu.classList.toggle('active');
    const icon = menuToggle.querySelector('i');
    if (navMenu.classList.contains('active')) {
      icon.className = 'fas fa-times';
    } else {
      icon.className = 'fas fa-bars';
    }
  });

  // Close mobile menu when link is clicked
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      navMenu.classList.remove('active');
      const icon = menuToggle.querySelector('i');
      icon.className = 'fas fa-bars';
    });
  });
}

/* ==========================================================================
   BIBLE VERSES ROTATOR (LANDING PAGE)
   ========================================================================== */
const VERSES = [
  {
    text: "El amor es paciente, es servicial; el amor no es envidioso, no es jactancioso, no se engríe; no es decoroso, no busca su interés, no se irrita, no toma en cuenta el mal; no se alegra de la injusticia, se alegra con la verdad. Todo lo excusa. Todo lo cree. Todo lo espera. Todo lo soporta.",
    ref: "1 Corintios 13:4-7"
  },
  {
    text: "Y nosotros hemos conocido y creído el amor que Dios tiene para con nosotros. Dios es amor; y el que permanece en amor, permanece en Dios, y Dios en él.",
    ref: "1 Juan 4:16"
  },
  {
    text: "Un mandamiento nuevo os doy: Que os améis unos a otros; como yo os he amado, que también os améis unos a otros. En esto conocerán todos que sois mis discípulos, si tuviereis amor los unos con los otros.",
    ref: "Juan 13:34-35"
  },
  {
    text: "Sobre todas estas cosas vestíos de amor, que es el vínculo perfecto. Y la paz de Dios gobierne en vuestros corazones, a la que asimismo fuisteis llamados en un solo cuerpo; y sed agradecidos.",
    ref: "Colosenses 3:14-15"
  },
  {
    text: "Ámense los unos a los otros con amor fraternal; en cuanto a honra, prefiriéndose los unos a los otros. En lo que requiere diligencia, no perezosos; fervientes en espíritu, sirviendo al Señor.",
    ref: "Romanos 12:10-11"
  },
  {
    text: "Nosotros le amamos a él, porque él nos amó primero. Si alguno dice: Yo amo a Dios, y aborrece a su hermano, es mentiroso. Pues el que no ama a su hermano a quien ha visto, ¿cómo puede amar a Dios a quien no ha visto?",
    ref: "1 Juan 4:19-20"
  }
];

function initVerseRotator() {
  const textEl = document.querySelector('.verse-text');
  const refEl = document.querySelector('.verse-ref');
  const refreshBtn = document.querySelector('.verse-refresh-btn');
  
  if (!textEl || !refEl) return;

  let currentIndex = 0;

  function showVerse(index) {
    textEl.style.opacity = 0;
    refEl.style.opacity = 0;
    
    setTimeout(() => {
      textEl.textContent = VERSES[index].text;
      refEl.textContent = VERSES[index].ref;
      textEl.style.opacity = 1;
      refEl.style.opacity = 1;
    }, 400);
  }

  showVerse(currentIndex);

  let intervalId = setInterval(() => {
    currentIndex = (currentIndex + 1) % VERSES.length;
    showVerse(currentIndex);
  }, 10000);

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      clearInterval(intervalId);
      let newIndex = Math.floor(Math.random() * VERSES.length);
      while (newIndex === currentIndex) {
        newIndex = Math.floor(Math.random() * VERSES.length);
      }
      currentIndex = newIndex;
      showVerse(currentIndex);
      
      intervalId = setInterval(() => {
        currentIndex = (currentIndex + 1) % VERSES.length;
        showVerse(currentIndex);
      }, 10000);
    });
  }
}

/* ==========================================================================
   SCROLL ANIMATIONS ACTIVATOR (Intersection Observer)
   ========================================================================== */
function initScrollAnimations() {
  const reveals = document.querySelectorAll('.reveal, section:not(.hero)');

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal-visible');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    });

    reveals.forEach(reveal => {
      observer.observe(reveal);
    });
  } else {
    reveals.forEach(reveal => {
      reveal.classList.add('reveal-visible');
    });
  }
}

/* ==========================================================================
   CALENDARIO INTERACTIVO DINÁMICO
   ========================================================================== */
const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

function initCalendar() {
  const monthNameEl = document.getElementById('calendar-month-name');
  const daysContainer = document.getElementById('calendar-days');
  const prevBtn = document.getElementById('calendar-prev');
  const nextBtn = document.getElementById('calendar-next');
  const eventTitleEl = document.getElementById('event-detail-title');
  const eventDescEl = document.getElementById('event-detail-desc');

  if (!daysContainer) return;

  const today = new Date();
  let currentMonth = today.getMonth();
  let currentYear = today.getFullYear();

  function renderCalendar(month, year) {
    daysContainer.innerHTML = '';
    monthNameEl.textContent = `${MONTH_NAMES[month]} ${year}`;

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    // Fill empty spots for previous month
    for (let i = 0; i < firstDayIndex; i++) {
      const emptyDay = document.createElement('div');
      emptyDay.classList.add('calendar-day', 'empty');
      daysContainer.appendChild(emptyDay);
    }

    // Fill days of the current month
    for (let day = 1; day <= totalDays; day++) {
      const dayEl = document.createElement('div');
      dayEl.classList.add('calendar-day');
      dayEl.textContent = day;

      const dateObj = new Date(year, month, day);
      const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 3 = Wednesday, 6 = Saturday

      let hasEvent = false;
      let eventTitle = "";
      let eventDesc = "";

      // Deterministic Saturdays index logic:
      // First Saturday = Love Woman
      // Second Saturday = Jóvenes
      // Last Saturday = Parejas & Jóvenes
      if (dayOfWeek === 6) { // Saturday
        const isFirstSat = (day <= 7);
        const isSecondSat = (day > 7 && day <= 14);
        const isLastSat = (day + 7 > totalDays);

        if (isFirstSat) {
          hasEvent = true;
          eventTitle = "Servicio de Love Woman 🌸";
          eventDesc = "Reunión especial mensual para mujeres. Un tiempo hermoso de café, palabra, amistad y bendición. 5:00 PM.";
        } else if (isSecondSat) {
          hasEvent = true;
          eventTitle = "Servicio de Jóvenes (Love Youth) 🔥";
          eventDesc = "Reunión especial de jóvenes y adolescentes en Cartagena. Dinámicas, alabanza juvenil y un mensaje directo al corazón. 6:00 PM.";
        } else if (isLastSat) {
          hasEvent = true;
          eventTitle = "Servicio de Parejas & Jóvenes 💑🔥";
          eventDesc = "¡Sábado de doble bendición! A las 6:00 PM tenemos nuestra reunión quincenal de Jóvenes, y a las 7:30 PM un taller especial y cena para Parejas.";
        } else {
          // Any intermediate Saturday
          hasEvent = false;
        }
      } else if (dayOfWeek === 3) { // Wednesday
        hasEvent = true;
        eventTitle = "Miércoles de Series 🎬📖";
        eventDesc = "Nuestras noches temáticas de estudio bíblico. Una serie de enseñanzas dinámicas con aplicaciones prácticas para la vida diaria. 7:00 PM.";
      } else if (dayOfWeek === 0) { // Sunday
        hasEvent = true;
        eventTitle = "Domingo Familia 👨‍👩‍👧‍👦";
        eventDesc = "Nuestro servicio principal de celebración congregacional. Ven con toda tu familia a adorar y recibir la Palabra. 9:00 AM.";
      }

      if (hasEvent) {
        dayEl.classList.add('has-event');
        dayEl.setAttribute('data-title', eventTitle);
        dayEl.setAttribute('data-desc', eventDesc);
      }

      if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
        dayEl.classList.add('today');
      }

      dayEl.addEventListener('click', () => {
        document.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
        dayEl.classList.add('selected');

        if (hasEvent) {
          eventTitleEl.innerHTML = `<i class="far fa-calendar-check" style="color:var(--primary);"></i> ${eventTitle}`;
          eventDescEl.textContent = eventDesc;
        } else {
          eventTitleEl.textContent = `Día ${day} de ${MONTH_NAMES[month]}`;
          eventDescEl.textContent = "No hay eventos especiales programados para este día. Acompáñanos en nuestros servicios los domingos a las 9:00 AM, miércoles a las 7:00 PM y sábados de ministerios.";
        }
      });

      daysContainer.appendChild(dayEl);
    }
  }

  renderCalendar(currentMonth, currentYear);

  prevBtn.addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    renderCalendar(currentMonth, currentYear);
  });

  nextBtn.addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    renderCalendar(currentMonth, currentYear);
  });
}

/* ==========================================================================
   EVENTOS LOVE - GALERÍA CON FILTROS Y LIGHTBOX
   ========================================================================== */
function initGallery() {
  const filterBtns = document.querySelectorAll('.filter-btn');
  const galleryItems = document.querySelectorAll('.gallery-item');
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = lightbox ? lightbox.querySelector('img') : null;
  const lightboxCaption = lightbox ? lightbox.querySelector('.lightbox-caption') : null;
  const lightboxClose = lightbox ? lightbox.querySelector('.lightbox-close') : null;

  if (!galleryItems.length) return;

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.getAttribute('data-filter');

      galleryItems.forEach(item => {
        const categories = item.getAttribute('data-category').split(' ');
        
        if (filter === 'all' || categories.includes(filter)) {
          item.style.display = 'block';
          item.style.opacity = 0;
          setTimeout(() => {
            item.style.opacity = 1;
          }, 50);
        } else {
          item.style.display = 'none';
        }
      });
    });
  });

  galleryItems.forEach(item => {
    item.addEventListener('click', () => {
      const img = item.querySelector('img');
      const title = item.querySelector('.gallery-title').textContent;
      
      if (lightbox && lightboxImg && lightboxCaption) {
        lightboxImg.src = img.src;
        lightboxCaption.textContent = title;
        lightbox.classList.add('active');
        document.body.style.overflow = 'hidden';
      }
    });
  });

  if (lightboxClose) {
    lightboxClose.addEventListener('click', () => {
      lightbox.classList.remove('active');
      document.body.style.overflow = 'auto';
    });
  }

  if (lightbox) {
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) {
        lightbox.classList.remove('active');
        document.body.style.overflow = 'auto';
      }
    });
  }
}

/* ==========================================================================
   SIMULADOR DE REPRODUCTOR DE AUDIO (LOVE ADORA)
   ========================================================================== */
function initAudioPlayerSim() {
  const playBtn = document.querySelector('.play-sim-btn');
  const progressFill = document.querySelector('.progress-fill-sim');
  const trackTitle = document.querySelector('.track-details h5');
  const trackArtist = document.querySelector('.track-details p');

  if (!playBtn) return;

  let isPlaying = false;
  let progressPercent = 12;
  let simInterval = null;

  playBtn.addEventListener('click', () => {
    isPlaying = !isPlaying;
    const icon = playBtn.querySelector('i');

    if (isPlaying) {
      icon.className = 'fas fa-pause';
      trackTitle.textContent = "Glorioso Salvador (Love Adora Live)";
      trackArtist.style.color = "#a29bfe";
      
      simInterval = setInterval(() => {
        progressPercent += 0.4;
        if (progressPercent >= 100) {
          progressPercent = 0;
        }
        progressFill.style.width = `${progressPercent}%`;
      }, 250);
    } else {
      icon.className = 'fas fa-play';
      trackArtist.style.color = "rgba(255, 255, 255, 0.5)";
      clearInterval(simInterval);
    }
  });
}

/* ==========================================================================
   SISTEMA DE PETICIONES DE ORACIÓN & REFLEXIÓN (LOCAL STORAGE)
   ========================================================================== */
const DEFAULT_PRAYERS = [
  {
    id: 1,
    name: "Milena Andrade",
    type: "petición",
    text: "Pido oración por el nuevo proyecto de evangelismo Love Buenas Nuevas, para que Dios abra puertas en los hogares de Cartagena.",
    date: "Hace 1 hora",
    prayersCount: 18,
    prayedBy: []
  },
  {
    id: 2,
    name: "Aron Andrade R.",
    type: "inquietud",
    text: "Me gustaría ser voluntario en el grupo de alabanza Love Adora. ¿A quién me puedo dirigir para los ensayos?",
    date: "Hace 4 horas",
    prayersCount: 5,
    prayedBy: []
  },
  {
    id: 3,
    name: "Zuleima de Andrade",
    type: "petición",
    text: "Clamamos por el servicio de Love Woman de este fin de semana. Que cada mujer que asista experimente restauración y libertad.",
    date: "Ayer",
    prayersCount: 32,
    prayedBy: []
  }
];

function initPrayerRequestSystem() {
  const form = document.getElementById('prayer-form');
  const prayersList = document.getElementById('prayers-list');
  const prayersCountBadge = document.getElementById('prayers-count-badge');

  if (!prayersList) return;

  let prayers = JSON.parse(localStorage.getItem('cl_prayers'));
  if (!prayers || prayers.length === 0) {
    prayers = DEFAULT_PRAYERS;
    localStorage.setItem('cl_prayers', JSON.stringify(prayers));
  }

  function renderPrayers() {
    prayersList.innerHTML = '';
    
    if (prayersCountBadge) {
      prayersCountBadge.textContent = `${prayers.length} Activas`;
    }

    if (prayers.length === 0) {
      prayersList.innerHTML = `
        <div class="prayers-empty">
          <i class="fas fa-heart-broken"></i>
          <p>No hay peticiones recientes. ¡Sé el primero en compartir tu petición!</p>
        </div>
      `;
      return;
    }

    const sortedPrayers = [...prayers].sort((a, b) => b.id - a.id);

    sortedPrayers.forEach(prayer => {
      const item = document.createElement('div');
      item.classList.add('prayer-item');
      
      const typeLabel = prayer.type === 'petición' ? 'Petición de Oración' : 'Inquietud / Pregunta';

      item.innerHTML = `
        <div class="prayer-meta">
          <span class="prayer-author">${escapeHTML(prayer.name)}</span>
          <span class="prayer-type">${typeLabel}</span>
        </div>
        <p class="prayer-text">"${escapeHTML(prayer.text)}"</p>
        <div class="prayer-footer">
          <span class="prayer-date">${prayer.date}</span>
          <button class="pray-action-btn" data-id="${prayer.id}">
            <i class="fas fa-hands-praying"></i> <span>Unirme en oración (${prayer.prayersCount})</span>
          </button>
        </div>
      `;

      const actionBtn = item.querySelector('.pray-action-btn');
      if (prayer.prayedBy && prayer.prayedBy.includes('user_local')) {
        actionBtn.classList.add('prayed');
        actionBtn.innerHTML = `<i class="fas fa-hands-praying"></i> <span>Orando (${prayer.prayersCount})</span>`;
      }

      prayersList.appendChild(item);
    });

    document.querySelectorAll('.pray-action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.getAttribute('data-id'));
        togglePrayerCount(id);
      });
    });
  }

  function togglePrayerCount(id) {
    prayers = prayers.map(p => {
      if (p.id === id) {
        if (!p.prayedBy) p.prayedBy = [];
        
        if (p.prayedBy.includes('user_local')) {
          p.prayedBy = p.prayedBy.filter(u => u !== 'user_local');
          p.prayersCount = Math.max(0, p.prayersCount - 1);
        } else {
          p.prayedBy.push('user_local');
          p.prayersCount++;
        }
      }
      return p;
    });

    localStorage.setItem('cl_prayers', JSON.stringify(prayers));
    renderPrayers();
  }

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const nameInput = document.getElementById('form-name');
      const typeSelect = document.getElementById('form-type');
      const textInput = document.getElementById('form-text');

      if (!nameInput.value.trim() || !textInput.value.trim()) {
        alert("Por favor completa los campos requeridos.");
        return;
      }

      const newPrayer = {
        id: Date.now(),
        name: nameInput.value.trim(),
        type: typeSelect.value,
        text: textInput.value.trim(),
        date: "Hace un momento",
        prayersCount: 0,
        prayedBy: []
      };

      prayers.push(newPrayer);
      localStorage.setItem('cl_prayers', JSON.stringify(prayers));

      form.reset();
      renderPrayers();

      const successMsg = document.createElement('div');
      successMsg.style.cssText = `
        background: #e3faf2;
        color: #0ca678;
        padding: 12px;
        border-radius: var(--border-radius-sm);
        font-size: 0.9rem;
        margin-top: 15px;
        text-align: center;
        animation: fadeInUp 0.4s ease;
      `;
      successMsg.textContent = "Petición enviada con éxito. Estaremos orando contigo.";
      form.appendChild(successMsg);
      setTimeout(() => successMsg.remove(), 4000);
    });
  }

  renderPrayers();
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

/* ==========================================================================
   DONACIONES CLIPBOARD COPY FUNCTIONALITY
   ========================================================================== */
function initDonationClipboard() {
  const copyBtns = document.querySelectorAll('.copy-btn');
  
  copyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const textToCopy = btn.getAttribute('data-copy');
      
      navigator.clipboard.writeText(textToCopy).then(() => {
        // Show tooltip visual feedback
        const tooltip = btn.querySelector('.copy-tooltip') || document.createElement('span');
        tooltip.className = 'copy-tooltip';
        tooltip.style.cssText = `
          position: absolute;
          bottom: 120%;
          left: 50%;
          transform: translateX(-50%);
          background: #333;
          color: #fff;
          font-size: 0.75rem;
          padding: 4px 8px;
          border-radius: 4px;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.3s ease;
          white-space: nowrap;
          z-index: 10;
        `;
        tooltip.textContent = "¡Copiado!";
        
        if (!btn.querySelector('.copy-tooltip')) {
          btn.style.position = 'relative';
          btn.appendChild(tooltip);
        }
        
        // Trigger reflow
        tooltip.offsetHeight;
        tooltip.style.opacity = '1';
        
        // Hide after 1.5 seconds
        setTimeout(() => {
          tooltip.style.opacity = '0';
          setTimeout(() => tooltip.remove(), 300);
        }, 1500);
      }).catch(err => {
        console.error('Error copying text: ', err);
      });
    });
  });
}

/* ==========================================================================
   LOVE MARKET - CAROUSEL & PREVIEW MODAL
   ========================================================================== */
function initLoveMarket() {
  const productCards = document.querySelectorAll('.product-card');
  const marketModal = document.getElementById('market-modal');
  
  if (!productCards.length || !marketModal) return;
  
  const modalImg = marketModal.querySelector('.modal-product-img');
  const modalTitle = marketModal.querySelector('.modal-product-title');
  const modalPrice = marketModal.querySelector('.modal-product-price');
  const modalDesc = marketModal.querySelector('.modal-product-desc');
  const whatsappLink = marketModal.querySelector('.whatsapp-checkout-btn');
  const modalClose = marketModal.querySelector('.modal-market-close');
  
  productCards.forEach(card => {
    const viewBtn = card.querySelector('.btn-view-details');
    if (!viewBtn) return;
    
    viewBtn.addEventListener('click', () => {
      const title = card.querySelector('.product-title').textContent;
      const price = card.querySelector('.product-price').textContent;
      const imgUrl = card.querySelector('.product-image img').src;
      const desc = card.getAttribute('data-desc') || "Producto oficial de la Comunidad Love Cartagena. Excelente calidad y confección.";
      
      modalImg.src = imgUrl;
      modalTitle.textContent = title;
      modalPrice.textContent = price;
      modalDesc.textContent = desc;
      
      // Configure WhatsApp Link
      const message = encodeURIComponent(`Hola Comunidad Love, estoy interesado en adquirir el producto: *${title}* (${price}). ¿Me podrían confirmar disponibilidad y tallas?`);
      whatsappLink.href = `https://wa.me/573001234567?text=${message}`;
      
      marketModal.classList.add('active');
      document.body.style.overflow = 'hidden';
    });
  });
  
  if (modalClose) {
    modalClose.addEventListener('click', () => {
      marketModal.classList.remove('active');
      document.body.style.overflow = 'auto';
    });
  }
  
  marketModal.addEventListener('click', (e) => {
    if (e.target === marketModal) {
      marketModal.classList.remove('active');
      document.body.style.overflow = 'auto';
    }
  });
}

/* ==========================================================================
   LOTTIE ANIMATIONS INITIALIZATION (WITH HIGH-QUALITY FALLBACKS)
   ========================================================================== */
function initLottieAnimations() {
  renderSVGAnimationsFallback();
}

function renderSVGAnimationsFallback() {
  const heroLottie = document.getElementById('hero-lottie');
  if (heroLottie) {
    heroLottie.innerHTML = `
      <style>
        .pulse-logo-glow {
          animation: logoGlow 3s infinite ease-in-out;
          filter: drop-shadow(0 0 15px rgba(255, 87, 41, 0.3));
        }
        @keyframes logoGlow {
          0% { transform: scale(1); filter: drop-shadow(0 0 10px rgba(255, 87, 41, 0.2)); }
          50% { transform: scale(1.03); filter: drop-shadow(0 0 25px rgba(255, 87, 41, 0.5)); }
          100% { transform: scale(1); filter: drop-shadow(0 0 10px rgba(255, 87, 41, 0.2)); }
        }
      </style>
      <div class="pulse-logo-glow" style="display:flex; justify-content:center; align-items:center; width: 100%; height: 100%;">
        <img src="./Assets/logo-color.png" alt="Logo Comunidad Love" style="max-width: 300px; object-fit: contain;">
      </div>
    `;
  }

  const kidsLottie = document.getElementById('kids-lottie');
  if (kidsLottie) {
    kidsLottie.innerHTML = `
      <div style="display:flex; justify-content:center; align-items:center; height: 100%;">
        <i class="fas fa-child-reaching" style="font-size: 8rem; color: var(--kids-primary); filter: drop-shadow(0 5px 15px rgba(255, 159, 67, 0.25)); animation: bounce 3s infinite ease-in-out;"></i>
      </div>
      <style>
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-15px); }
        }
      </style>
    `;
  }
}

/* ==========================================================================
   INTERACTIVE LOCATION TABS (ABOUT US)
   ========================================================================== */
function initLocationTabs() {
  const tabs = document.querySelectorAll('.location-tab');
  const contents = document.querySelectorAll('.tab-content');

  if (!tabs.length) return;

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Deactivate all tabs and contents
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      // Activate selected tab and target content
      tab.classList.add('active');
      const target = tab.getAttribute('data-target');
      const targetContent = document.getElementById(`location-${target}-wrapper`);
      if (targetContent) {
        targetContent.classList.add('active');
      }

      // If map tab was activated, force window resize to recalculate Leaflet canvas size
      if (target === 'map') {
        setTimeout(() => {
          window.dispatchEvent(new Event('resize'));
        }, 150);
      }
    });
  });
}
