/* ==========================================================================
   SINCRONIZACIÓN DE LA LANDING PÚBLICA CON FIRESTORE
   --------------------------------------------------------------------------
   Reglas de degradación:
   - Si Firebase no está configurado, este módulo no hace nada y la página
     conserva exactamente su contenido estático actual.
   - Cada bloque muestra un skeleton de carga mientras consulta.
   - Si una colección llega vacía o falla, se mantiene el markup original.
   ========================================================================== */

import { firebaseReady, configError } from './firebase.js';
import { installImageFallback, compressImageFile, compressFileToDataUrl } from './lib/image.js';
import { watchSettings } from './services/site.js';
import { watchEvents, CATEGORY_LABELS } from './services/events.js';
import { watchAnnouncements, isAnnouncementVisible } from './services/announcements.js';
import { watchActiveProducts, formatPriceCOP, createMarketOrder } from './services/market.js';
import {
  watchPublicPrayers,
  createPrayer,
  toggleReaction,
  getMyReactionsSync,
  reactionMeta,
  REACTIONS
} from './services/prayers.js';
import { escapeHTML, qs, qsa, showToast, skeletonList } from './lib/dom.js';
import { smartDate, formatTime, formatDate, daysUntil, MONTH_NAMES, parseDate } from './lib/dates.js';
import { contienePalabrasObscenas } from './lib/text.js';
import { bindLiveFormValidation } from './lib/validation.js';
import { watchMinistries } from './services/ministries.js';
import { watchGallery } from './services/gallery.js';
import { watchPublicBirthdays, createMember } from './services/members.js';
import { initPWA } from './lib/pwa.js';

let settingsUnsub = null;
let eventsUnsub = null;
let announcementsUnsub = null;
let productsUnsub = null;
let prayersUnsub = null;
let ministriesUnsub = null;
let galleryUnsub = null;
let birthdaysUnsub = null;
const warned = new Set();
let lastPrayersList = [];
let currentPrayerTab = 'peticiones';

function whenReady(callback) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback, { once: true });
  } else {
    callback();
  }
}

whenReady(() => {
  initPWA();
});

/**
 * Aviso por bloque. Antes era un único aviso global; con varias colecciones
 * interesa saber cuál falló, sin repetirlo en cada callback de esa misma
 * colección.
 */
function warnOnce(scope = 'general') {
  if (warned.has(scope)) return;
  warned.add(scope);
  console.info(`[CL] ${configError} La web pública opera con su contenido estático (${scope}).`);
}

/* --------------------------------------------------------------------------
   AVISO SUPERIOR (bannerAlert)
   -------------------------------------------------------------------------- */
function renderBannerAlert(settings) {
  const host = qs('#cl-banner-alert') || qs('.site-banner-alert') || qs('#announcement-bar');
  if (!host) return;
  const alert = settings.bannerAlert || {};
  if (!alert.show || !alert.message) {
    host.hidden = true;
    host.innerHTML = '';
    document.documentElement.style.setProperty('--cl-banner-height', '0px');
    return;
  }
  try {
    const dismissed = sessionStorage.getItem('cl_dismissed_banner');
    if (dismissed === alert.message) {
      host.hidden = true;
      document.documentElement.style.setProperty('--cl-banner-height', '0px');
      return;
    }
  } catch {}

  const type = ['info', 'warning'].includes(alert.type) ? alert.type : 'info';
  const icon = type === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-info';
  host.hidden = false;
  host.className = `cl-banner cl-banner-${type} site-banner-alert cl-alert-banner`;
  host.innerHTML = `
    <div class="container cl-banner-inner">
      <i class="fas ${icon}" aria-hidden="true"></i>
      <div class="cl-banner-content">
        <span class="cl-banner-text">${escapeHTML(alert.message)}</span>
      </div>
      <button type="button" class="cl-banner-close" aria-label="Cerrar aviso">
        <i class="fas fa-xmark" aria-hidden="true"></i>
      </button>
    </div>
  `;
  requestAnimationFrame(() => {
    const h = host.offsetHeight || 42;
    document.documentElement.style.setProperty('--cl-banner-height', `${h}px`);
  });
  host.querySelector('.cl-banner-close')?.addEventListener('click', () => {
    host.hidden = true;
    document.documentElement.style.setProperty('--cl-banner-height', '0px');
    try { sessionStorage.setItem('cl_dismissed_banner', alert.message); } catch {}
  });
}

/* --------------------------------------------------------------------------
   HORARIOS DE SERVICIO (site_settings.serviceHours)
   -------------------------------------------------------------------------- */
function renderServiceHours(settings) {
  const host = qs('#services-list');
  if (!host) return;
  host.innerHTML = '';
  const hours = Array.isArray(settings.serviceHours)
    ? settings.serviceHours
    : (Array.isArray(settings.services) ? settings.services : []);

  if (!hours.length) {
    host.innerHTML = `
      <h3 style="margin-bottom: 24px; color: var(--secondary);">Nuestras Reuniones</h3>
      <p style="color: var(--text-muted); font-size: 0.9rem;">No hay servicios regulares programados actualmente.</p>
    `;
    if (typeof window.CL_Calendar?.setServiceHours === 'function') {
      window.CL_Calendar.setServiceHours([]);
    }
    return;
  }

  const cards = hours
    .map(
      (entry) => `
      <div class="service-card">
        <div class="service-time"><i class="far fa-clock"></i> ${escapeHTML(entry.day || '')} - ${escapeHTML(entry.time || '')}</div>
        <h4>${escapeHTML(entry.label || 'Servicio')}</h4>
        ${entry.description ? `<p>${escapeHTML(entry.description)}</p>` : ''}
      </div>
    `
    )
    .join('');

  host.innerHTML = `
    <h3 style="margin-bottom: 24px; color: var(--secondary);">Nuestras Reuniones</h3>
    ${cards}
  `;

  if (typeof window.CL_Calendar?.setServiceHours === 'function') {
    window.CL_Calendar.setServiceHours(hours);
  }
}

/* --------------------------------------------------------------------------
   TRANSMISIÓN Y DATOS DE CONTACTO
   -------------------------------------------------------------------------- */
function applyStreaming(settings) {
  if (settings.streamingUrl) {
    qsa('#streaming-frame').forEach((frame) => {
      frame.src = settings.streamingUrl;
    });
  }
  if (settings.streamingChannelUrl) {
    qsa('[data-role="streaming-channel"]').forEach((link) => {
      link.href = settings.streamingChannelUrl;
    });
  }
}

function applyContact(settings) {
  const phone = settings.contactPhone;
  if (phone) {
    qsa('[data-role="contact-phone"]').forEach((node) => {
      node.textContent = phone;
    });
  }
  if (settings.contactEmail) {
    qsa('[data-role="contact-email"]').forEach((node) => {
      node.textContent = settings.contactEmail;
      if (node.tagName === 'A') node.href = `mailto:${settings.contactEmail}`;
    });
  }
  if (settings.address) {
    qsa('[data-role="contact-address"]').forEach((node) => {
      node.textContent = settings.address;
    });
  }
}

function applySocialLinks(settings) {
  const map = {
    instagram: '[data-social="instagram"]',
    facebook: '[data-social="facebook"]',
    youtube: '[data-social="youtube"]'
  };
  Object.entries(map).forEach(([key, selector]) => {
    const url = settings.socialLinks?.[key];
    if (!url) return;
    qsa(selector).forEach((link) => {
      link.href = url;
    });
  });
}

/* --------------------------------------------------------------------------
   AVISOS (announcements)
   -------------------------------------------------------------------------- */
function renderAnnouncements(list) {
  const host = qs('#avisos-container') || qs('#announcements-list') || qs('.announcements-grid');
  if (!host) return;
  const visible = (list || []).filter((item) => isAnnouncementVisible(item));

  if (!visible.length) {
    host.innerHTML = `
      <div class="announcement-empty">
        <i class="fas fa-bell-slash" aria-hidden="true"></i>
        <p>Por ahora no hay avisos publicados. Te esperamos en nuestros servicios.</p>
      </div>
    `;
    return;
  }

  host.innerHTML = visible
    .map((item) => {
      const badgeText = item.badge || (item.priority >= 2 ? 'Importante' : item.priority === 1 ? 'Nuevo' : '');
      const priorityTag = badgeText
        ? `<span class="announcement-badge ${item.priority >= 2 || String(badgeText).toLowerCase().includes('import') ? 'announcement-badge-high' : ''}">${escapeHTML(badgeText)}</span>`
        : '';
      const expires = item.expirationDate
        ? `<span class="announcement-expires"><i class="far fa-clock"></i> Hasta el ${escapeHTML(formatDate(item.expirationDate))}</span>`
        : '';
      const bodyText = item.content || item.message || '';
      return `
        <article class="announcement-card">
          <div class="announcement-head">
            <h3>${escapeHTML(item.title)}</h3>
            ${priorityTag}
          </div>
          <p>${escapeHTML(bodyText)}</p>
          <div class="announcement-meta">
            <span><i class="far fa-calendar"></i> ${escapeHTML(smartDate(item.publishDate))}</span>
            ${expires}
          </div>
        </article>
      `;
    })
    .join('');
}

/* --------------------------------------------------------------------------
   PRÓXIMOS EVENTOS
   -------------------------------------------------------------------------- */
function renderUpcomingEvents(events) {
  const host = qs('#upcoming-events');
  if (!host) return;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const list = (events || [])
    .filter((event) => {
      const dateVal = event.dateStart || event.date || event.startDate;
      if (!dateVal) return false;
      const start = parseDate(dateVal);
      if (!start) return false;
      const end = event.dateEnd ? parseDate(event.dateEnd) : start;
      const endTime = end ? end.getTime() : start.getTime();
      return (
        endTime >= todayStart &&
        event.isPublic !== false &&
        event.status !== 'inactivo' &&
        event.isActive !== false
      );
    })
    .slice(0, 4);

  if (!list.length) {
    host.innerHTML = `
      <div class="announcement-empty" style="grid-column: 1 / -1; text-align: center; padding: 2.5rem 1rem;">
        <i class="fas fa-calendar-check" style="font-size: 2rem; color: var(--primary); margin-bottom: 0.75rem; display: block;" aria-hidden="true"></i>
        <p style="color: var(--text-muted); font-size: 0.95rem;">No hay eventos programados en los próximos días. Consulta nuestros horarios de servicio regulares.</p>
      </div>
    `;
    return;
  }

  host.innerHTML = list
    .map((event) => {
      const start = parseDate(event.dateStart);
      const month = MONTH_NAMES[start.getMonth()].toUpperCase();
      const countdown = daysUntil(start);
      const countdownLabel = countdown === 0 ? '¡Hoy!' : countdown === 1 ? 'Mañana' : `En ${countdown} días`;
      const time = formatTime(start);
      const location = event.location
        ? `<span class="event-meta-item"><i class="fas fa-location-dot"></i> ${escapeHTML(event.location)}</span>`
        : '';
      // `bannerUrl` admite URL externa o data:image/webp;base64,… (sin Storage).
      // Un `onerror` tolerante oculta el banner roto en lugar de dejar el hueco.
      const banner = event.bannerUrl
        ? `<img class="upcoming-banner" src="${escapeHTML(event.bannerUrl)}" alt="${escapeHTML(event.title)}" loading="lazy" decoding="async" data-img-fallback="hide">`
        : '';
      return `
        <article class="upcoming-card event-card">
          <div class="upcoming-date event-date-badge">
            <span class="upcoming-month">${escapeHTML(month)}</span>
            <span class="upcoming-day">${start.getDate()}</span>
          </div>
          <div class="upcoming-body event-card-content">
            <div class="upcoming-tags">
              <span class="upcoming-category">${escapeHTML(CATEGORY_LABELS[event.category] || 'General')}</span>
              <span class="upcoming-countdown">${escapeHTML(countdownLabel)}</span>
            </div>
            <h4 class="event-title">${escapeHTML(event.title)}</h4>
            ${event.description ? `<p class="event-desc">${escapeHTML(event.description)}</p>` : ''}
            <div class="upcoming-meta event-meta">
              <span class="event-meta-item"><i class="far fa-clock"></i> ${escapeHTML(time || 'Por definir')}</span>
              ${location}
            </div>
          </div>
          ${banner}
        </article>
      `;
    })
    .join('');
}

/* --------------------------------------------------------------------------
   ENLACE CON EL CALENDARIO EXISTENTE (app.js)
   -------------------------------------------------------------------------- */
function pushCalendarEvents(events) {
  try {
    if (typeof window.CL_Calendar?.setEvents === 'function') {
      window.CL_Calendar.setEvents(events || []);
    }
  } catch (error) {
    console.warn('[CL] No se pudo actualizar el calendario:', error);
  }
}

/* --------------------------------------------------------------------------
   LOVE MARKET
   --------------------------------------------------------------------------
   Los productos vienen de `market_products`. Si la colección llega vacía o
   falla la consulta, NO se toca el HTML: los cuatro productos de ejemplo que
   ya vienen en `index.html` siguen siendo la vitrine, para que la sección
   nunca se quede en blanco.
   -------------------------------------------------------------------------- */
function renderMarket(products) {
  const host = qs('#market-grid');
  if (!host) return;

  if (!products || !products.length) {
    host.innerHTML = `
      <div class="market-empty">
        <i class="fas fa-store-slash" style="font-size: 2.8rem; margin-bottom: 1rem; color: var(--primary); opacity: 0.8; display: block;"></i>
        <h4 style="font-size: 1.2rem; font-weight: 600; color: var(--secondary); margin-bottom: 0.5rem;">Catálogo en renovación</h4>
        <p style="max-width: 480px; margin: 0 auto; font-size: 0.95rem; line-height: 1.6;">Pronto tendremos nuevos productos oficiales disponibles para apoyar la obra. ¡Te esperamos en nuestros servicios presenciales!</p>
      </div>
    `;
    return;
  }

  host.innerHTML = products
    .map((product) => {
      const soldOut = product.stock === 0;
      const desc = product.description || 'Producto oficial de la Comunidad Love.';
      return `
        <div class="product-card" data-desc="${escapeHTML(desc)}">
          <div class="product-image">
            ${product.badge ? `<span class="product-badge">${escapeHTML(product.badge)}</span>` : ''}
            ${
              product.imageUrl
                ? `<img src="${escapeHTML(product.imageUrl)}" alt="${escapeHTML(product.name)}" loading="lazy" decoding="async" data-img-fallback="hide">`
                : `<img src="./Assets/MERCHANDISING/01.jpg" alt="${escapeHTML(product.name)}" data-img-fallback="hide">`
            }
          </div>
          <div class="product-info">
            <h4 class="product-title">${escapeHTML(product.name)}</h4>
            <div class="product-price">${escapeHTML(formatPriceCOP(product.price))}</div>
            ${
              soldOut
                ? '<div class="product-stock-out">Agotado</div>'
                : product.stock > 0 && product.stock <= 5
                  ? `<div class="product-stock-low">Últimas ${product.stock}</div>`
                  : ''
            }
            <div class="product-actions" style="display: flex; gap: 8px;">
              <button class="btn btn-outline btn-view-details" style="flex: 1;" type="button">Detalles <i class="fas fa-eye"></i></button>
              ${
                soldOut
                  ? '<button class="btn btn-secondary" style="flex: 1; opacity: 0.6; cursor: not-allowed;" type="button" disabled title="Producto agotado">Agotado <i class="fas fa-ban"></i></button>'
                  : `<button class="btn btn-primary btn-order-product" style="flex: 1;" type="button" data-product-id="${escapeHTML(product.id)}" data-product-name="${escapeHTML(product.name)}" data-product-price="${product.price}">¡Lo quiero! <i class="fas fa-bag-shopping"></i></button>`
              }
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

/* --------------------------------------------------------------------------
   SOLICITUD DE PEDIDOS (Love Market - "¡Lo quiero!")
   -------------------------------------------------------------------------- */
function initPublicMarketOrders() {
  const modal = qs('#market-modal');
  if (!modal) return;

  const detailsView = qs('#market-modal-info');
  const detailsImg = qs('#modal-product-img-wrapper');
  const formWrapper = qs('#market-order-form-wrapper');
  const orderForm = qs('#cl-public-order-form');
  const btnStartOrder = qs('#btn-start-order');
  const btnOrderBack = qs('#btn-order-back');
  const paymentSelect = qs('#order-payment-method');
  const transferBox = qs('#transfer-instructions-box');
  const receiptFileInput = qs('#order-receipt-file');
  const receiptUrlInput = qs('#order-receipt-url');
  const receiptPreviewBox = qs('#receipt-preview-box');
  const receiptPreviewImg = qs('#receipt-preview-img');
  const receiptStatusText = qs('#receipt-status-text');
  const feedbackBox = qs('#order-form-feedback');
  const successScreen = qs('#order-success-screen');
  const whatsappChatBtn = qs('#order-whatsapp-chat-btn');

  function showDetails() {
    if (formWrapper) formWrapper.style.display = 'none';
    if (successScreen) successScreen.style.display = 'none';
    if (detailsView) detailsView.style.display = 'block';
    if (detailsImg) detailsImg.style.display = 'block';
  }

  function showOrderForm(prodId, prodName, prodPrice) {
    if (detailsView) detailsView.style.display = 'none';
    if (detailsImg) detailsImg.style.display = 'none';
    if (successScreen) successScreen.style.display = 'none';
    if (formWrapper) formWrapper.style.display = 'block';

    if (orderForm) {
      orderForm.style.display = 'block';
      qs('#order-product-id', orderForm).value = prodId || '';
      qs('#order-product-name', orderForm).value = prodName || '';
      qs('#order-product-price', orderForm).value = prodPrice || '0';
    }
  }

  btnStartOrder?.addEventListener('click', () => {
    const title = qs('.modal-product-title', modal)?.textContent || 'Producto';
    const priceText = qs('.modal-product-price', modal)?.textContent || '';
    const numericPrice = Number(priceText.replace(/\D/g, '')) || 0;
    showOrderForm('item', title, numericPrice);
  });

  btnOrderBack?.addEventListener('click', showDetails);

  // Delegado: botón directo "¡Lo quiero!" en cualquier tarjeta
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-order-product');
    if (!btn) return;
    const card = btn.closest('.product-card');
    const prodId = btn.dataset.productId || 'seed-item';
    const prodName = btn.dataset.productName || card?.querySelector('.product-title')?.textContent.trim() || 'Producto Love';
    const prodPrice = btn.dataset.productPrice || card?.querySelector('.product-price')?.textContent.replace(/\D/g, '') || 0;
    const img = card?.querySelector('.product-image img');

    const modalImg = modal.querySelector('.modal-product-img');
    const modalTitle = modal.querySelector('.modal-product-title');
    const modalPrice = modal.querySelector('.modal-product-price');
    const modalDesc = modal.querySelector('.modal-product-desc');

    if (modalImg && img) modalImg.src = img.src;
    if (modalTitle) modalTitle.textContent = prodName;
    if (modalPrice) modalPrice.textContent = `$${Number(prodPrice).toLocaleString('es-CO')} COP`;
    if (modalDesc && card) modalDesc.textContent = card.getAttribute('data-desc') || '';

    showOrderForm(prodId, prodName, prodPrice);
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  });

  // Toggle de instrucciones de transferencia
  paymentSelect?.addEventListener('change', () => {
    if (transferBox) {
      transferBox.style.display = paymentSelect.value === 'transfer' ? 'block' : 'none';
    }
  });

  // Compresión en cliente del comprobante < 200 KB
  receiptFileInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (receiptStatusText) receiptStatusText.textContent = 'Comprimiendo imagen…';
    if (receiptPreviewBox) receiptPreviewBox.style.display = 'flex';

    try {
      const result = await compressFileToDataUrl(file);
      if (receiptUrlInput) receiptUrlInput.value = result.dataUrl;
      if (receiptPreviewImg) receiptPreviewImg.src = result.dataUrl;
      if (receiptStatusText) {
        receiptStatusText.textContent = `✓ Lista (${Math.round(result.bytes / 1024)} KB)`;
        receiptStatusText.style.color = '#16a34a';
      }
    } catch (err) {
      console.warn('[CL] Error al comprimir comprobante:', err);
      if (receiptStatusText) {
        receiptStatusText.textContent = err.message || 'No se pudo procesar la imagen.';
        receiptStatusText.style.color = '#dc2626';
      }
      e.target.value = '';
    }
  });

  // Envío del formulario de pedido
  orderForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (feedbackBox) {
      feedbackBox.style.display = 'none';
      feedbackBox.textContent = '';
    }

    const name = qs('#order-customer-name', orderForm).value.trim();
    const phone = qs('#order-customer-phone', orderForm).value.trim();
    const prodId = qs('#order-product-id', orderForm).value;
    const prodName = qs('#order-product-name', orderForm).value;
    const prodPrice = Number(qs('#order-product-price', orderForm).value) || 0;
    const variant = qs('#order-variant', orderForm).value;
    const paymentMethod = qs('#order-payment-method', orderForm).value;
    const receiptUrl = qs('#order-receipt-url', orderForm).value;
    const notes = qs('#order-notes', orderForm).value.trim();

    if (!name || name.length < 3) {
      showOrderError('Por favor ingresa tu nombre completo.');
      return;
    }
    if (!phone || phone.replace(/\D/g, '').length < 7) {
      showOrderError('Por favor ingresa un número de teléfono o WhatsApp válido.');
      return;
    }
    if (contienePalabrasObscenas(name) || contienePalabrasObscenas(notes)) {
      showOrderError('Por favor exprésate con respeto. Se detectó lenguaje inapropiado.');
      return;
    }

    const submitBtn = qs('#btn-submit-order', orderForm);
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Registrando pedido…';
    }

    try {
      await createMarketOrder({
        customerName: name,
        customerPhone: phone,
        productId: prodId,
        productName: prodName,
        productPrice: prodPrice,
        variant,
        paymentMethod,
        receiptUrl,
        notes
      });

      orderForm.style.display = 'none';
      if (successScreen) {
        successScreen.style.display = 'block';
        const msg = qs('#order-success-msg', successScreen);
        if (msg) {
          msg.textContent = `¡Muchas gracias, ${name}! Tu solicitud de ${prodName} (${variant}) ha sido registrada. Nos pondremos en contacto contigo al ${phone}.`;
        }
      }

      if (whatsappChatBtn) {
        const text = encodeURIComponent(
          `¡Hola Comunidad Love! Acabo de solicitar un pedido en su tienda virtual:\n\n` +
          `• Producto: *${prodName}*\n` +
          `• Variante / Talla: ${variant}\n` +
          `• Total: $${prodPrice.toLocaleString('es-CO')} COP\n` +
          `• Pago: ${paymentMethod === 'transfer' ? 'Transferencia bancaria' : 'Efectivo en sede'}\n` +
          `• A nombre de: ${name} (${phone})\n\n` +
          `Quedo atento a la confirmación y entrega. ¡Bendiciones!`
        );
        whatsappChatBtn.href = `https://wa.me/573001234567?text=${text}`;
      }
    } catch (err) {
      showOrderError(err.message || 'No se pudo enviar el pedido. Por favor intenta de nuevo.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-check-circle"></i> Confirmar Solicitud de Pedido';
      }
    }
  });

  function showOrderError(msg) {
    if (feedbackBox) {
      feedbackBox.style.display = 'block';
      feedbackBox.style.background = '#fef2f2';
      feedbackBox.style.color = '#dc2626';
      feedbackBox.style.border = '1px solid #fecaca';
      feedbackBox.textContent = msg;
    }
  }

  modal.querySelector('.modal-market-close')?.addEventListener('click', () => {
    setTimeout(showDetails, 300);
  });
}

/* --------------------------------------------------------------------------
   MURO DE CLAMOR (Público)
   --------------------------------------------------------------------------
   El visitante puede enviar una petición y REACCIONAR, pero ya no puede
   responder: eso lo hace el equipo desde el panel y la respuesta sale con
   insignia verificada. Por eso `app.js` ya no monta un formulario de
   respuestas aquí.
   -------------------------------------------------------------------------- */
function renderPublicPrayers(list) {
  if (Array.isArray(list)) lastPrayersList = list;
  const host = qs('#prayers-list');
  if (!host) return;

  const prayers = lastPrayersList || [];
  const peticiones = prayers.filter((p) => {
    const t = String(p.type || p.category || '').toLowerCase();
    return t !== 'inquietud' && t !== 'pregunta';
  });
  const inquietudes = prayers.filter((p) => {
    const t = String(p.type || p.category || '').toLowerCase();
    return t === 'inquietud' || t === 'pregunta';
  });

  // Actualizar contadores en pestañas
  const countPeticiones = qs('#count-peticiones');
  if (countPeticiones) countPeticiones.textContent = String(peticiones.length);
  const countInquietudes = qs('#count-inquietudes');
  if (countInquietudes) countInquietudes.textContent = String(inquietudes.length);

  // Contador de peticiones activas global
  const badge = qs('#prayers-count-badge');
  if (badge) {
    badge.textContent = prayers.length === 1 ? '1 Activa' : `${prayers.length} Activas`;
  }

  // Elementos correspondientes a la pestaña activa
  const activeItems = currentPrayerTab === 'inquietudes' ? inquietudes : peticiones;

  if (!activeItems.length) {
    host.innerHTML = `
      <div class="prayer-empty">
        <i class="${currentPrayerTab === 'inquietudes' ? 'fas fa-comments' : 'fas fa-hand-holding-heart'}" aria-hidden="true"></i>
        <p>${
          currentPrayerTab === 'inquietudes'
            ? 'Aún no hay inquietudes o preguntas publicadas. ¡Deja tu consulta!'
            : 'Aún no hay peticiones publicadas. Puedes ser el primero en dejarla.'
        }</p>
      </div>
    `;
    return;
  }

  host.innerHTML = activeItems.map(renderPrayerCard).join('');
}

function renderPrayerCard(prayer) {
  const replies = (prayer.replies || []).slice(-2);
  const when = smartDate(prayer.createdAt);
  const mySet = new Set(getMyReactionsSync(prayer.id));

  return `
    <article class="prayer-card" data-prayer="${prayer.id}">
      <header class="prayer-card-head">
        <span class="prayer-avatar" aria-hidden="true">${escapeHTML(initialsOf(prayer.name))}</span>
        <div>
          <strong>${escapeHTML(prayer.name)}</strong>
          <small>${escapeHTML(when)}</small>
        </div>
        <span class="prayer-type">${prayer.type === 'inquietud' ? 'Inquietud' : 'Petición'}</span>
      </header>

      <p class="prayer-card-text">${escapeHTML(prayer.text)}</p>

      ${
        replies.length
          ? `<div class="prayer-answers">
              ${replies
                .map((reply) => {
                  const badgeText = reply.authorBadge || reply.badgeLabel || 'Equipo Pastoral';
                  const nameText = reply.responderName || reply.authorName || 'Servidor';
                  const roleText = (reply.responderRole || 'servidor').toUpperCase();
                  const authorDisplay = `${badgeText} · ${nameText} (${roleText})`;
                  return `
                <div class="prayer-answer">
                  <div class="prayer-answer-badge">
                    <i class="fas fa-circle-check" aria-hidden="true"></i>
                    <span>${escapeHTML(authorDisplay)}</span>
                    <span class="prayer-verified" title="Respuesta verificada del equipo">
                      <i class="fas fa-badge-check" aria-hidden="true"></i>
                    </span>
                  </div>
                  <p>${escapeHTML(reply.text)}</p>
                  <small>${escapeHTML(smartDate(reply.createdAt))}</small>
                </div>`;
                })
                .join('')}
            </div>`
          : ''
      }

      <div class="prayer-reactions" data-reactions="${escapeHTML(prayer.id)}">
        ${REACTIONS.map((r) => {
          const count = prayer.reactions?.[r.kind] || 0;
          const isActive = mySet.has(r.kind);
          return `
          <button type="button" class="prayer-reaction${isActive ? ' is-active' : ''}" data-kind="${r.kind}" data-prayer="${escapeHTML(prayer.id)}"
                  aria-pressed="${isActive ? 'true' : 'false'}" title="${escapeHTML(r.label)}">
            <span aria-hidden="true">${r.emoji}</span>
            <span class="prayer-reaction-count" data-count="${r.kind}">${count}</span>
          </button>`;
        }).join('')}
      </div>
    </article>
  `;
}

function initialsOf(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase();
}

/** Delegado: sirve para las reacciones creadas dinámicamente. */
function bindPublicInteractions() {
  // Envío de la petición.
  const form = qs('#prayer-form');
  if (form && form.dataset.clBound !== '1') {
    form.dataset.clBound = '1';
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const nameInput = form.querySelector('[name="prayer-name"], #prayer-name');
      const typeInput = form.querySelector('[name="prayer-type"], #prayer-type');
      const textInput = form.querySelector('[name="prayer-text"], #prayer-text');
      const submit = form.querySelector('[type="submit"]');

      const submitBtn = submit;
      const nameVal = (nameInput?.value || '').trim();
      const textVal = (textInput?.value || '').trim();

      if (contienePalabrasObscenas(nameVal) || contienePalabrasObscenas(textVal)) {
        showToast('Por favor exprésate con respeto. Se detectó lenguaje inapropiado.', 'danger');
        return;
      }

      const prayerType = typeInput?.value || 'petición';
      if (submitBtn) submitBtn.disabled = true;
      try {
        await createPrayer({
          name: nameVal,
          type: prayerType,
          text: textVal
        });
        form.reset();
        showToast(
          prayerType === 'inquietud'
            ? 'Tu inquietud fue enviada. El equipo pastoral te responderá pronto.'
            : 'Tu petición fue enviada. El equipo pastoral la responderá con bendición.',
          'success'
        );
        // Conmutar pestaña activa para mostrar el mensaje recién creado
        const targetTab = prayerType === 'inquietud' ? 'inquietudes' : 'peticiones';
        if (currentPrayerTab !== targetTab) {
          currentPrayerTab = targetTab;
          const tabsHost = qs('#public-prayers-tabs');
          if (tabsHost) {
            tabsHost.querySelectorAll('.prayers-tab-btn').forEach((b) => {
              const isActive = b.dataset.tab === currentPrayerTab;
              b.classList.toggle('active', isActive);
              b.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });
          }
          renderPublicPrayers();
        }
      } catch (error) {
        showToast(error.message || 'No se pudo enviar tu petición.', 'danger');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // Pestañas del Muro de Clamor / Inquietudes
  const tabsHost = qs('#public-prayers-tabs');
  if (tabsHost && tabsHost.dataset.bound !== '1') {
    tabsHost.dataset.bound = '1';
    tabsHost.addEventListener('click', (e) => {
      const btn = e.target.closest('.prayers-tab-btn');
      if (!btn) return;
      const tab = btn.dataset.tab;
      if (tab === currentPrayerTab) return;
      currentPrayerTab = tab;
      tabsHost.querySelectorAll('.prayers-tab-btn').forEach((b) => {
        const isActive = b.dataset.tab === currentPrayerTab;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      renderPublicPrayers();
    });
  }

  // Reacciones (actualización optimista instantánea sin bloquear la UI)
  document.addEventListener('click', (event) => {
    const btn = event.target.closest('.prayer-reaction');
    if (!btn) return;
    const kind = btn.dataset.kind;
    const prayerId = btn.dataset.prayer;
    const meta = reactionMeta(kind);
    if (!meta || !prayerId) return;

    const wasActive = btn.classList.contains('is-active');
    const willBeActive = !wasActive;

    // Actualización visual inmediata en el siguiente cuadro de animación
    requestAnimationFrame(() => {
      btn.classList.toggle('is-active', willBeActive);
      btn.setAttribute('aria-pressed', willBeActive ? 'true' : 'false');
      const countNode = btn.querySelector('.prayer-reaction-count');
      if (countNode) {
        const currentCount = Number(countNode.textContent) || 0;
        const next = currentCount + (willBeActive ? 1 : -1);
        countNode.textContent = String(Math.max(0, next));
      }
    });

    // Guardado en Firestore en segundo plano
    toggleReaction(prayerId, kind, willBeActive).catch((error) => {
      console.warn('[CL] Error en la reacción:', error);
      // Revertir optimismo si falló la red
      requestAnimationFrame(() => {
        btn.classList.toggle('is-active', wasActive);
        btn.setAttribute('aria-pressed', wasActive ? 'true' : 'false');
        const countNode = btn.querySelector('.prayer-reaction-count');
        if (countNode) {
          const currentCount = Number(countNode.textContent) || 0;
          const reverted = currentCount + (wasActive ? 1 : -1);
          countNode.textContent = String(Math.max(0, reverted));
        }
      });
      showToast(error.message || 'No se pudo registrar tu reacción.', 'danger');
    });
  });

    initPublicMarketOrders();
    initPublicGallery();
  }

  function initPublicGallery() {
    const filterContainer = qs('.gallery-filters');
    if (filterContainer && filterContainer.dataset.bound !== '1') {
      filterContainer.dataset.bound = '1';
      filterContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-btn');
        if (!btn) return;
        filterContainer.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const filter = btn.dataset.filter || 'all';
        qsa('.gallery-grid .gallery-item').forEach((item) => {
          const cat = item.dataset.category || '';
          const cats = cat.split(' ');
          if (filter === 'all' || cats.includes(filter)) {
            item.style.display = 'block';
          } else {
            item.style.display = 'none';
          }
        });
      });
    }

    const galleryGrid = qs('.gallery-grid');
    if (galleryGrid && galleryGrid.dataset.bound !== '1') {
      galleryGrid.dataset.bound = '1';
      galleryGrid.addEventListener('click', (e) => {
        const item = e.target.closest('.gallery-item');
        if (!item) return;
        const img = item.querySelector('img');
        const title = item.querySelector('.gallery-title')?.textContent || '';
        const lightbox = document.getElementById('lightbox');
        if (lightbox && img) {
          const lightboxImg = lightbox.querySelector('img');
          const lightboxCaption = lightbox.querySelector('.lightbox-caption');
          if (lightboxImg) lightboxImg.src = img.src;
          if (lightboxCaption) lightboxCaption.textContent = title;
          lightbox.classList.add('active');
          document.body.style.overflow = 'hidden';
        }
      });
    }
  }

/* --------------------------------------------------------------------------
   MINISTERIOS DINÁMICOS (CMS FIRESTORE)
   -------------------------------------------------------------------------- */
function renderDynamicMinistries(ministries) {
  if (!ministries || !ministries.length) return;
  const map = new Map(ministries.map((m) => [m.id, m]));

  // 1. Kids
  const kids = map.get('kids');
  if (kids) {
    const card = qs('.kids-section .kids-card');
    if (card) {
      const badge = card.querySelector('.kids-badge');
      if (badge && kids.badge) badge.textContent = kids.badge;
      const desc = card.querySelector('.about-desc');
      if (desc && kids.description) desc.textContent = kids.description;
      const img = card.querySelector('.kids-main-img');
      if (img && kids.imageUrl) img.src = kids.imageUrl;
      const title = kids.name || kids.title;
      if (title) {
        const h3 = card.querySelector('h3');
        if (h3) {
          const logoImg = h3.querySelector('.kids-logo-img');
          const cleanSuffix = title.replace(/^Love\s*/i, '');
          if (logoImg) {
            h3.innerHTML = '';
            h3.appendChild(logoImg);
            const span = document.createElement('span');
            span.textContent = cleanSuffix ? ` ${cleanSuffix}` : '';
            h3.appendChild(span);
          } else {
            h3.textContent = title;
          }
        }
      }
    }
  }

  // 2. Woman
  const woman = map.get('woman');
  if (woman) {
    const card = qs('.woman-section .woman-card');
    if (card) {
      const badge = card.querySelector('.woman-badge');
      if (badge && woman.badge) badge.textContent = woman.badge;
      const desc = card.querySelector('.about-desc');
      if (desc && woman.description) desc.textContent = woman.description;
      const quote = card.querySelector('.woman-quote');
      if (quote && woman.quote) quote.textContent = woman.quote;
      const img = card.querySelector('.woman-media-container img');
      if (img && woman.imageUrl) img.src = woman.imageUrl;
      const title = woman.name || woman.title;
      if (title) {
        const h3 = card.querySelector('h3');
        if (h3) {
          const parts = title.split(' ');
          if (parts.length > 1) {
            h3.innerHTML = `${escapeHTML(parts[0])} <span>${escapeHTML(parts.slice(1).join(' '))}</span>`;
          } else {
            h3.textContent = title;
          }
        }
      }
    }
  }

  // 3. Adora
  const adora = map.get('adora') || map.get('love-adora');
  if (adora) {
    const card = qs('.adora-section .adora-card');
    if (card) {
      const badge = card.querySelector('.adora-badge');
      if (badge && adora.badge) badge.textContent = adora.badge;
      const desc = card.querySelector('.adora-desc');
      if (desc && adora.description) desc.textContent = adora.description;
      const iframe = card.querySelector('.adora-video-container iframe');
      if (iframe && adora.videoUrl) iframe.src = adora.videoUrl;
      const title = adora.name || adora.title;
      if (title) {
        const h3 = card.querySelector('h3');
        if (h3) {
          const parts = title.split(' ');
          if (parts.length > 1) {
            h3.innerHTML = `${escapeHTML(parts[0])} <span>${escapeHTML(parts.slice(1).join(' '))}</span>`;
          } else {
            h3.textContent = title;
          }
        }
      }
    }
    // Collage de 4 fotos
    const galleryContainer = qs('#adora-gallery') || qs('.adora-media-container');
    if (galleryContainer) {
      const defaults = [
        './Assets/Love adora/love adora (1).jpg',
        './Assets/Love adora/love adora (2).jpg',
        './Assets/Love adora/love adora (3).jpg',
        './Assets/Love adora/love adora (4).jpg'
      ];
      const alts = [
        'Love Adora Alabanza',
        'Love Adora Adoración',
        'Love Adora Músicos',
        'Love Adora Voces'
      ];
      const photos = Array.isArray(adora.gallery) && adora.gallery.length
        ? adora.gallery
        : (adora.imageUrl ? [adora.imageUrl] : []);

      const imgs = galleryContainer.querySelectorAll('img');
      if (imgs.length === 4) {
        for (let i = 0; i < 4; i++) {
          const src = photos[i] || defaults[i];
          if (src) imgs[i].src = src;
          imgs[i].alt = alts[i] || `Love Adora ${i + 1}`;
        }
      } else {
        galleryContainer.innerHTML = [0, 1, 2, 3].map((i) => `
          <img src="${escapeHTML(photos[i] || defaults[i])}" alt="${escapeHTML(alts[i])}">
        `).join('');
      }
    }
  }

  // 4. Buenas Nuevas
  const bn = map.get('buenas-nuevas') || map.get('love-buenas-nuevas');
  if (bn) {
    const card = qs('.buenas-nuevas-section .news-card');
    if (card) {
      const badge = card.querySelector('.news-badge');
      if (badge && bn.badge) badge.textContent = bn.badge;
      const desc = card.querySelector('.about-desc');
      if (desc && bn.description) desc.textContent = bn.description;
      if (bn.stats) {
        const statBoxes = card.querySelectorAll('.stat-box');
        if (statBoxes[0] && bn.stats.homes) statBoxes[0].querySelector('.stat-number').textContent = bn.stats.homes;
        if (statBoxes[1] && bn.stats.zones) statBoxes[1].querySelector('.stat-number').textContent = bn.stats.zones;
        if (statBoxes[2] && bn.stats.volunteers) statBoxes[2].querySelector('.stat-number').textContent = bn.stats.volunteers;
      }

      // Collage de 2 fotos para Buenas Nuevas
      const bnGallery = qs('#buenas-nuevas-gallery') || card.querySelector('.news-media-grid');
      if (bnGallery) {
        const defaults = [
          './Assets/somos comunidad love/love comunidad (6).jpeg',
          './Assets/somos comunidad love/love comunidad (7).jpeg'
        ];
        const photos = Array.isArray(bn.gallery) && bn.gallery.length
          ? bn.gallery
          : (bn.imageUrl ? [bn.imageUrl, defaults[1]] : defaults);

        const imgs = bnGallery.querySelectorAll('img');
        if (imgs.length >= 2) {
          if (photos[0] || defaults[0]) imgs[0].src = photos[0] || defaults[0];
          if (photos[1] || defaults[1]) imgs[1].src = photos[1] || defaults[1];
        }
      }

      const title = bn.name || bn.title;
      if (title) {
        const h3 = card.querySelector('h3');
        if (h3) {
          const parts = title.split(' ');
          if (parts.length > 1) {
            h3.innerHTML = `${escapeHTML(parts[0])} <span>${escapeHTML(parts.slice(1).join(' '))}</span>`;
          } else {
            h3.textContent = title;
          }
        }
      }
    }
  }

  // 5. Comunidad
  const com = map.get('comunidad');
  if (com) {
    const title = com.name || com.title;
    if (title) {
      const h3 = qs('.pastors-info h3');
      if (h3) h3.textContent = title;
    }
    const desc = qs('.pastors-info .about-desc');
    if (desc && com.description) desc.textContent = com.description;
    const quote = qs('.pastors-quote');
    if (quote && com.quote) quote.textContent = com.quote;
    const img = qs('.pastors-image-wrapper img');
    if (img && com.imageUrl) img.src = com.imageUrl;
  }
}

/* --------------------------------------------------------------------------
   GALERÍA DINÁMICA (CMS FIRESTORE)
   -------------------------------------------------------------------------- */
function renderDynamicGallery(items) {
  const grid = qs('.gallery-grid');
  if (!grid || !items || !items.length) return;

  const catLabels = {
    comunidad: 'Comunidad',
    ninos: 'Love Kids',
    mujeres: 'Love Woman',
    adoracion: 'Love Adora'
  };

  grid.innerHTML = items.map((item) => `
    <div class="gallery-item" data-category="${escapeHTML(item.category || 'comunidad')}">
      <img src="${escapeHTML(item.imageUrl)}" alt="${escapeHTML(item.title || 'Galería Comunidad Love')}" loading="lazy">
      <div class="gallery-overlay">
        <span class="gallery-tag">${escapeHTML(catLabels[item.category] || item.category || 'Comunidad')}</span>
        <div class="gallery-title">${escapeHTML(item.title || '')}</div>
      </div>
    </div>
  `).join('');

  // Re-aplicar filtro activo si existe
  const activeBtn = qs('.gallery-filters .filter-btn.active');
  const activeFilter = activeBtn?.dataset?.filter || 'all';
  grid.querySelectorAll('.gallery-item').forEach((item) => {
    const cat = item.dataset.category || '';
    const cats = cat.split(' ');
    if (activeFilter === 'all' || cats.includes(activeFilter)) {
      item.style.display = 'block';
    } else {
      item.style.display = 'none';
    }
  });
}

/* --------------------------------------------------------------------------
   ARRANQUE
   -------------------------------------------------------------------------- */
export function initPublicSync() {
  // Se instala siempre: aunque no haya Firebase, la landing estática puede
  // enlazar imágenes externas que se caigan y valida formularios.
  installImageFallback(document);
  whenReady(() => bindLiveFormValidation(document));

  if (!firebaseReady) {
    warnOnce('general');
    whenReady(() => {
      renderMarket([]);
      renderAnnouncements([]);
      renderUpcomingEvents([]);
      renderPublicPrayers([]);
      bindPublicInteractions();
      showToast('Contenido en modo estático: no se pudo conectar con el servidor.', 'warning');
    });
    return;
  }

  whenReady(() => {
    try {
      qsa('[data-cl-skeleton="announcements"]').forEach((node) => {
        node.innerHTML = skeletonList(3);
      });
      const eventsHost = qs('#upcoming-events');
      if (eventsHost) eventsHost.innerHTML = skeletonList(2);

      settingsUnsub = watchSettings(
        (settings, exists) => {
          if (!exists) return;
          renderBannerAlert(settings);
          renderServiceHours(settings);
          applyStreaming(settings);
          applyContact(settings);
          applySocialLinks(settings);
        },
        (err) => {
          console.error('[CL] Error en tiempo real de configuración:', err);
        }
      );

      eventsUnsub = watchEvents(
        ({ active }) => {
          renderUpcomingEvents(active);
          pushCalendarEvents(active);
        },
        (err) => {
          console.error('[CL] Error en tiempo real de eventos:', err);
          renderUpcomingEvents([]);
          pushCalendarEvents([]);
        }
      );

      announcementsUnsub = watchAnnouncements(
        (list) => renderAnnouncements(list),
        (err) => {
          console.error('[CL] Error en tiempo real de avisos:', err);
          renderAnnouncements([]);
        }
      );

      productsUnsub = watchActiveProducts(
        (list) => renderMarket(list),
        (err) => {
          console.error('[CL] Error en tiempo real de Love Market:', err);
          renderMarket([]);
        }
      );

      prayersUnsub = watchPublicPrayers(
        (list) => renderPublicPrayers(list),
        (err) => {
          console.error('[CL] Error en tiempo real de oraciones:', err);
          renderPublicPrayers([]);
        }
      );

      ministriesUnsub = watchMinistries(
        (list) => renderDynamicMinistries(list),
        (err) => {
          console.error('[CL] Error en tiempo real de ministerios:', err);
        }
      );

      galleryUnsub = watchGallery(
        (items) => renderDynamicGallery(items),
        (err) => {
          console.error('[CL] Error en tiempo real de galería:', err);
        }
      );

      birthdaysUnsub = watchPublicBirthdays(
        (birthdays) => {
          if (typeof window.CL_Calendar?.setBirthdays === 'function') {
            window.CL_Calendar.setBirthdays(birthdays || []);
          }
        },
        (err) => {
          console.warn('[CL] No se pudieron sincronizar los cumpleaños públicos:', err);
        }
      );

      bindPublicInteractions();
    } catch (error) {
      console.error('[CL] Fallo al iniciar la sincronización pública:', error);
      renderMarket([]);
      renderAnnouncements([]);
      renderUpcomingEvents([]);
      renderPublicPrayers([]);
      showToast('No se pudo conectar con el servidor de contenido.', 'warning');
    }
  });
}

/* --------------------------------------------------------------------------
   AUTO-REGISTRO PÚBLICO DE VISITANTES (#/registro-asistencia)
   -------------------------------------------------------------------------- */
function checkSelfRegistrationHash() {
  const hash = window.location.hash || '';
  if (hash.includes('registro-asistencia')) {
    openSelfRegistrationModal();
  }
}

function openSelfRegistrationModal() {
  const existing = document.getElementById('cl-self-register-modal');
  if (existing) return;

  const modal = document.createElement('div');
  modal.id = 'cl-self-register-modal';
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(8px);
    z-index: 99999; display: flex; align-items: center; justify-content: center;
    padding: 16px; box-sizing: border-box; overflow-y: auto;
  `;

  modal.innerHTML = `
    <div style="background: #ffffff; color: #1e293b; max-width: 480px; width: 100%; border-radius: 18px; padding: 28px 24px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); position: relative; font-family: inherit;">
      <button type="button" id="cl-close-self-reg" style="position: absolute; top: 16px; right: 16px; background: #f1f5f9; border: none; width: 34px; height: 34px; border-radius: 50%; font-size: 1.1rem; color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center;">✕</button>
      
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="width: 56px; height: 56px; border-radius: 16px; background: rgba(255, 107, 74, 0.12); color: #ff6b4a; display: inline-flex; align-items: center; justify-content: center; font-size: 1.8rem; margin-bottom: 10px;">
          <i class="fas fa-church"></i>
        </div>
        <h2 style="margin: 0; font-size: 1.35rem; color: #0f172a; font-weight: 700;">¡Bienvenido a Comunidad Love!</h2>
        <p style="margin: 6px 0 0 0; font-size: 0.88rem; color: #64748b;">Mesa de Bienvenida y Auto-Registro de Asistencia</p>
      </div>

      <form id="cl-self-reg-form" style="display: flex; flex-direction: column; gap: 14px;">
        <div>
          <label style="display: block; font-size: 0.82rem; font-weight: 600; color: #334155; margin-bottom: 4px;">Nombre Completo *</label>
          <input type="text" name="fullName" required placeholder="Ej: Camilo Pérez" style="width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.92rem; outline: none;">
        </div>

        <div>
          <label style="display: block; font-size: 0.82rem; font-weight: 600; color: #334155; margin-bottom: 4px;">Documento de Identidad (Cédula / Tarjeta)</label>
          <input type="tel" name="documentId" placeholder="Ej: 1047123456" style="width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.92rem; outline: none;">
        </div>

        <div>
          <label style="display: block; font-size: 0.82rem; font-weight: 600; color: #334155; margin-bottom: 4px;">Teléfono / WhatsApp *</label>
          <input type="tel" name="phone" required placeholder="Ej: 3001234567 (10 dígitos)" maxlength="10" style="width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.92rem; outline: none;">
        </div>

        <div>
          <label style="display: block; font-size: 0.82rem; font-weight: 600; color: #334155; margin-bottom: 4px;">Barrio / Sector</label>
          <input type="text" name="neighborhood" placeholder="Ej: Pie de la Popa, Bocagrande, etc." style="width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.92rem; outline: none;">
        </div>

        <button type="submit" id="cl-btn-submit-self-reg" style="margin-top: 8px; padding: 12px 18px; background: #ff6b4a; color: #ffffff; border: none; border-radius: 10px; font-weight: 600; font-size: 0.95rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: background 0.15s;">
          <i class="fas fa-check"></i><span>Confirmar mi Asistencia</span>
        </button>
      </form>

      <div id="cl-self-reg-success" style="display: none; text-align: center; padding: 20px 0;">
        <div style="font-size: 3rem; color: #10b981; margin-bottom: 12px;">🎉</div>
        <h3 style="margin: 0; font-size: 1.25rem; color: #0f172a;">¡Registro Exitoso!</h3>
        <p id="cl-self-reg-success-msg" style="margin: 8px 0 20px 0; font-size: 0.9rem; color: #475569; line-height: 1.5;"></p>
        <button type="button" id="cl-btn-finish-self-reg" style="padding: 10px 24px; background: #0f172a; color: #ffffff; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">
          Entendido
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => {
    modal.remove();
    if (window.location.hash.includes('registro-asistencia')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  };

  modal.querySelector('#cl-close-self-reg')?.addEventListener('click', closeModal);
  modal.querySelector('#cl-btn-finish-self-reg')?.addEventListener('click', closeModal);

  const form = modal.querySelector('#cl-self-reg-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = modal.querySelector('#cl-btn-submit-self-reg');
    const fd = new FormData(form);
    const fullName = (fd.get('fullName') || '').toString().trim();
    const documentId = (fd.get('documentId') || '').toString().trim();
    const phone = (fd.get('phone') || '').toString().trim();
    const neighborhood = (fd.get('neighborhood') || '').toString().trim();

    if (!fullName) {
      showToast('Por favor escribe tu nombre completo.', 'warning');
      return;
    }
    if (phone && phone.replace(/\D/g, '').length !== 10) {
      showToast('Por favor escribe un número de WhatsApp de 10 dígitos.', 'warning');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando…';
    }

    try {
      const today = new Date().toISOString().slice(0, 10);
      await createMember({
        fullName,
        documentId,
        phone,
        neighborhood,
        status: 'nuevo',
        churchRole: 'Nuevo Asistente',
        firstVisitDate: today,
        attendanceType: 'solo',
        attendances: [{
          date: today,
          service: 'Servicio Presencial Love',
          registeredAt: new Date().toISOString()
        }],
        lastAttendance: today,
        attendanceCount: 1
      });

      form.style.display = 'none';
      const successDiv = modal.querySelector('#cl-self-reg-success');
      const msg = modal.querySelector('#cl-self-reg-success-msg');
      if (msg) msg.textContent = `¡Hola, ${fullName}! Tu asistencia ha sido confirmada en Comunidad Love. Nos alegra mucho tenerte hoy con nosotros.`;
      if (successDiv) successDiv.style.display = 'block';
      showToast('¡Asistencia confirmada exitosamente!', 'success');
    } catch (err) {
      showToast(err.message || 'Error al guardar el registro.', 'danger');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i><span>Confirmar mi Asistencia</span>';
      }
    }
  });
}

export function stopPublicSync() {
  [settingsUnsub, eventsUnsub, announcementsUnsub, productsUnsub, prayersUnsub, ministriesUnsub, galleryUnsub, birthdaysUnsub].forEach((unsub) => {
    try {
      if (typeof unsub === 'function') unsub();
    } catch (error) {
      console.warn('[CL] Error al cerrar una suscripción:', error);
    }
  });
  settingsUnsub = null;
  eventsUnsub = null;
  announcementsUnsub = null;
  productsUnsub = null;
  prayersUnsub = null;
  ministriesUnsub = null;
  galleryUnsub = null;
  birthdaysUnsub = null;
}

window.addEventListener('hashchange', checkSelfRegistrationHash);
whenReady(checkSelfRegistrationHash);

initPublicSync();
