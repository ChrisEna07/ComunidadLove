/* ==========================================================================
   APP LOGIC - COMUNIDAD LOVE (CARTAGENA)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initVerseRotator();
  initScrollAnimations();
  initCalendar();
  initGallery();
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

  if (!menuToggle || !navMenu) return;

  const closeMobileMenu = () => {
    if (navMenu.classList.contains('active')) {
      navMenu.classList.remove('active');
      const icon = menuToggle.querySelector('i');
      if (icon) icon.className = 'fas fa-bars';
    }
  };

  // Toggle mobile menu
  menuToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    navMenu.classList.toggle('active');
    const icon = menuToggle.querySelector('i');
    if (navMenu.classList.contains('active')) {
      if (icon) icon.className = 'fas fa-times';
    } else {
      if (icon) icon.className = 'fas fa-bars';
    }
  });

  // Close mobile menu when link is clicked
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      closeMobileMenu();
    });
  });

  // Close when clicking outside header
  document.addEventListener('click', (e) => {
    if (navMenu.classList.contains('active') && !header.contains(e.target)) {
      closeMobileMenu();
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMobileMenu();
    }
  });

  // Reset menu on resize to desktop
  window.addEventListener('resize', () => {
    if (window.innerWidth > 1024) {
      closeMobileMenu();
    }
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

/** Formatea una fecha/hora Firestore como "7:00 PM" para el detalle del calendario. */
function formatClock(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const suffix = d.getHours() >= 12 ? 'PM' : 'AM';
  const hour12 = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
  return `${hour12}:${String(d.getMinutes()).padStart(2, '0')} ${suffix}`;
}

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

  // Eventos administrables cargados desde Firestore (js/public-init.js).
  // Tienen prioridad sobre el calendario recurrente local.
  let externalEvents = [];

  function externalEventFor(dateObj) {
    const y = dateObj.getFullYear();
    const m = dateObj.getMonth();
    const d = dateObj.getDate();

    return externalEvents.find((event) => {
      if (!event.dateStart) return false;
      const s = new Date(event.dateStart);
      if (s.getFullYear() === y && s.getMonth() === m && s.getDate() === d) return true;
      if (event.dateEnd) {
        const e = new Date(event.dateEnd);
        return new Date(y, m, d) >= new Date(s.getFullYear(), s.getMonth(), s.getDate())
          && new Date(y, m, d) <= new Date(e.getFullYear(), e.getMonth(), e.getDate());
      }
      return false;
    }) || null;
  }

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

      // 1) Eventos publicados desde el panel de administración (Firestore)
      const managed = externalEventFor(dateObj);

      if (managed) {
        hasEvent = true;
        eventTitle = managed.title;
        eventDesc = [
          managed.description,
          managed.location ? `📍 ${managed.location}` : '',
          managed.dateStart ? `🕐 ${formatClock(managed.dateStart)}` : ''
        ].filter(Boolean).join(' — ') || 'Consulta los detalles en el standing de la iglesia.';
        dayEl.classList.add('has-event', 'is-managed');
      }

      // 2) Calendario recurrente local (respaldo cuando no hay evento gestionado)
      if (managed) {
        // Se omite la lógica determinista: el evento de Firestore manda.
      } else if (dayOfWeek === 6) { // Saturday
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

  // Puente público para que el módulo de sincronización con Firestore
  // empuje los eventos administrados sin reescribir este calendario.
  window.CL_Calendar = {
    setEvents(list) {
      externalEvents = Array.isArray(list) ? list : [];
      renderCalendar(currentMonth, currentYear);
    },
    getEvents() {
      return externalEvents;
    }
  };
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
   LOVE MARKET - PREVIEW MODAL
   --------------------------------------------------------------------------
   Se usa DELEGACIÓN de eventos en lugar de un listener por tarjeta: los
   productos llegan de Firestore (`js/public-init.js`) después de que la página
   ya cargó, y un listener atado a cada `.product-card` se quedaría sin
   cubrir las tarjetas nuevas.
   ========================================================================== */
function initLoveMarket() {
  const marketModal = document.getElementById('market-modal');
  if (!marketModal) return;

  const modalImg = marketModal.querySelector('.modal-product-img');
  const modalTitle = marketModal.querySelector('.modal-product-title');
  const modalPrice = marketModal.querySelector('.modal-product-price');
  const modalDesc = marketModal.querySelector('.modal-product-desc');
  const whatsappLink = marketModal.querySelector('.whatsapp-checkout-btn');
  const modalClose = marketModal.querySelector('.modal-market-close');

  function openProductModal(card) {
    if (!card) return;

    const title = card.querySelector('.product-title')?.textContent.trim() || 'Producto';
    const price = card.querySelector('.product-price')?.textContent.trim() || '';
    const img = card.querySelector('.product-image img');
    const desc = card.getAttribute('data-desc') || "Producto oficial de la Comunidad Love Cartagena. Excelente calidad y confección.";

    if (modalImg && img) modalImg.src = img.src;
    if (modalTitle) modalTitle.textContent = title;
    if (modalPrice) modalPrice.textContent = price;
    if (modalDesc) modalDesc.textContent = desc;

    // Configura el enlace de compra por WhatsApp con los datos de la tarjeta.
    if (whatsappLink) {
      const message = encodeURIComponent(`Hola Comunidad Love, estoy interesado en adquirir el producto: *${title}* (${price}). ¿Me podrían confirmar disponibilidad y tallas?`);
      whatsappLink.href = `https://wa.me/573001234567?text=${message}`;
    }

    marketModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    marketModal.classList.remove('active');
    document.body.style.overflow = 'auto';
  }

  // Un solo listener cubre las tarjetas estáticas y las que inyecta Firestore.
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('.btn-view-details');
    if (!trigger) return;
    openProductModal(trigger.closest('.product-card'));
  });

  if (modalClose) modalClose.addEventListener('click', closeModal);

  marketModal.addEventListener('click', (e) => {
    if (e.target === marketModal) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && marketModal.classList.contains('active')) closeModal();
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

/* ==========================================================================
   PROFANITY FILTER (SPANISH, COSTEÑO & ENGLISH)
   ========================================================================== */
function contienePalabrasObscenas(texto) {
  if (!texto) return false;
  
  const palabrasObscenas = [
    // Costeño / Colombiano (Cartagena, Barranquilla, Santa Marta, etc.)
    'mamon', 'mamón', 'mamonazo', 'hijo de puta', 'hijoeputa', 'hijueputa', 'hpta', 'gonorrea', 
    'malparido', 'malparida', 'carechimba', 'chimba', 'monda', 'mondá', 'marica', 'maricon', 
    'maricón', 'pirobo', 'culero', 'careverga', 'verga', 'mierda', 'mierdero', 'puta', 'puto', 
    'cacorro', 'tripleputa', 'cabron', 'cabrón', 'hijuemadre', 'jijuemadre', 'caremonda', 'caremondá',
    'culipronta', 'culipronto', 'sipote', 'petardo', 'corroncho', 'cascorro', 'careculo', 'careverga',
    // Español general y otros departamentos
    'pendejo', 'pendeja', 'pendejada', 'joder', 'pingo', 'boludo', 'pelotudo', 'gil', 'concha', 
    'conchudo', 'culiao', 'hijo de perra', 'maraco', 'chucha', 'mamaguevo', 'mamagüevo', 'guevon', 
    'güevón', 'guevón', 'weon', 'culito', 'teta', 'panocha', 'bollo', 'guaricha',
    // Inglés
    'fuck', 'fucking', 'shit', 'asshole', 'bitch', 'cunt', 'dick', 'bastard', 'motherfucker', 
    'whore', 'piss', 'crap', 'wanker', 'bollocks'
  ];
  
  // Normalizar texto (quitar tildes, diéresis, espacios duplicados y convertir a minúsculas)
  const textoNormalizado = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // Quita tildes
    
  // Buscar palabras en el texto normalizado
  for (let i = 0; i < palabrasObscenas.length; i++) {
    const palabra = palabrasObscenas[i].normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // Si la palabra contiene espacios (como "hijo de puta"), la buscamos directamente
    if (palabra.includes(' ')) {
      if (textoNormalizado.includes(palabra)) return true;
    } else {
      // Si no, buscamos la palabra aislada usando límites \b
      const regex = new RegExp('\\b' + palabra + '\\b', 'i');
      if (regex.test(textoNormalizado)) return true;
    }
  }
  
  return false;
}
