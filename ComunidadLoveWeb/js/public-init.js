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
import { installImageFallback, compressFileToDataUrl } from './lib/image.js';
import { watchSettings } from './services/site.js';
import { watchEvents, CATEGORY_LABELS } from './services/events.js';
import { watchAnnouncements, isAnnouncementVisible } from './services/announcements.js';
import { watchActiveProducts, formatPriceCOP, createMarketOrder } from './services/market.js';
import {
  watchPublicPrayers,
  createPrayer,
  toggleReaction,
  watchReactions,
  myReactions,
  reactionMeta,
  REACTIONS
} from './services/prayers.js';
import { escapeHTML, qs, qsa, showToast, skeletonList } from './lib/dom.js';
import { smartDate, formatTime, formatDate, daysUntil, MONTH_NAMES, parseDate } from './lib/dates.js';
import { contienePalabrasObscenas } from './lib/text.js';

let settingsUnsub = null;
let eventsUnsub = null;
let announcementsUnsub = null;
let productsUnsub = null;
let prayersUnsub = null;
const reactionUnsubs = new Map();
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
  const host = qs('#cl-banner-alert');
  if (!host) return;
  const alert = settings.bannerAlert || {};
  if (!alert.show || !alert.message) {
    host.hidden = true;
    host.innerHTML = '';
    return;
  }
  const type = ['info', 'warning'].includes(alert.type) ? alert.type : 'info';
  const icon = type === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-info';
  host.hidden = false;
  host.className = `cl-banner cl-banner-${type}`;
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
  host.querySelector('.cl-banner-close')?.addEventListener('click', () => {
    host.hidden = true;
  });
}

/* --------------------------------------------------------------------------
   HORARIOS DE SERVICIO (site_settings.serviceHours)
   -------------------------------------------------------------------------- */
function renderServiceHours(settings) {
  const host = qs('#services-list');
  if (!host) return;
  const hours = Array.isArray(settings.serviceHours) ? settings.serviceHours : [];
  if (!hours.length) return;

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
  const host = qs('#announcements-list');
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
      const priorityTag = item.priority >= 2
        ? '<span class="announcement-badge announcement-badge-high">Importante</span>'
        : item.priority === 1
          ? '<span class="announcement-badge">Nuevo</span>'
          : '';
      const expires = item.expirationDate
        ? `<span class="announcement-expires"><i class="far fa-clock"></i> Hasta el ${escapeHTML(formatDate(item.expirationDate))}</span>`
        : '';
      return `
        <article class="announcement-card">
          <div class="announcement-head">
            <h3>${escapeHTML(item.title)}</h3>
            ${priorityTag}
          </div>
          <p>${escapeHTML(item.message)}</p>
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

  const now = Date.now();
  const list = (events || [])
    .filter((event) => {
      if (!event.dateStart) return false;
      const start = parseDate(event.dateStart);
      const diff = start.getTime() - now;
      return diff > -86400000 && diff < 1000 * 60 * 60 * 24 * 120;
    })
    .slice(0, 4);

  if (!list.length) {
    host.innerHTML = `
      <div class="announcement-empty">
        <i class="fas fa-calendar-check" aria-hidden="true"></i>
        <p>No hay eventos programados en los próximos días. Consulta nuestros horarios de servicio.</p>
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
        ? `<span><i class="fas fa-location-dot"></i> ${escapeHTML(event.location)}</span>`
        : '';
      // `bannerUrl` admite URL externa o data:image/webp;base64,… (sin Storage).
      // Un `onerror` tolerante oculta el banner roto en lugar de dejar el hueco.
      const banner = event.bannerUrl
        ? `<img class="upcoming-banner" src="${escapeHTML(event.bannerUrl)}" alt="${escapeHTML(event.title)}" loading="lazy" decoding="async" data-img-fallback="hide">`
        : '';
      return `
        <article class="upcoming-card">
          <div class="upcoming-date">
            <span class="upcoming-month">${escapeHTML(month)}</span>
            <span class="upcoming-day">${start.getDate()}</span>
          </div>
          <div class="upcoming-body">
            <div class="upcoming-tags">
              <span class="upcoming-category">${escapeHTML(CATEGORY_LABELS[event.category] || 'General')}</span>
              <span class="upcoming-countdown">${escapeHTML(countdownLabel)}</span>
            </div>
            <h4>${escapeHTML(event.title)}</h4>
            ${event.description ? `<p>${escapeHTML(event.description)}</p>` : ''}
            <div class="upcoming-meta">
              <span><i class="far fa-clock"></i> ${escapeHTML(time || 'Por definir')}</span>
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
              <button class="btn btn-primary btn-order-product" style="flex: 1;" type="button" data-product-id="${escapeHTML(product.id)}" data-product-name="${escapeHTML(product.name)}" data-product-price="${product.price}">¡Lo quiero! <i class="fas fa-bag-shopping"></i></button>
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
  const peticiones = prayers.filter((p) => p.type !== 'inquietud');
  const inquietudes = prayers.filter((p) => p.type === 'inquietud');

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

  // Cierra o abre los listeners de reacciones de la vista anterior.
  reactionUnsubs.forEach((unsub, id) => {
    if (!activeItems.some((p) => p.id === id)) {
      try {
        unsub();
      } catch {
        /* sin impacto */
      }
      reactionUnsubs.delete(id);
    }
  });

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

  // Las reacciones se cargan por tarjeta para no traer el muro entero dos veces.
  activeItems.forEach((prayer) => {
    if (reactionUnsubs.has(prayer.id)) return;
    const host2 = qs(`[data-reactions="${prayer.id}"]`, host);
    if (!host2) return;

    myReactions(prayer.id)
      .then((mine) => paintReactionState(prayer.id, mine))
      .catch(() => {});

    reactionUnsubs.set(
      prayer.id,
      watchReactions(
        prayer.id,
        ({ counts }) => paintReactionCounts(prayer.id, counts),
        () => {}
      )
    );
  });
}

function renderPrayerCard(prayer) {
  const replies = (prayer.replies || []).slice(-2);
  const when = smartDate(prayer.createdAt);

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
                .map(
                  (reply) => `
                <div class="prayer-answer">
                  <div class="prayer-answer-badge">
                    <i class="fas fa-circle-check" aria-hidden="true"></i>
                    ${escapeHTML(reply.badgeLabel || 'Equipo Love')}
                    <span class="prayer-verified" title="Respuesta verificada del equipo">
                      <i class="fas fa-badge-check" aria-hidden="true"></i>
                    </span>
                  </div>
                  <p>${escapeHTML(reply.text)}</p>
                  <small>${escapeHTML(smartDate(reply.createdAt))}</small>
                </div>`
                )
                .join('')}
            </div>`
          : ''
      }

      <div class="prayer-reactions" data-reactions="${escapeHTML(prayer.id)}">
        ${REACTIONS.map(
          (r) => `
          <button type="button" class="prayer-reaction" data-kind="${r.kind}" data-prayer="${escapeHTML(prayer.id)}"
                  aria-pressed="false" title="${escapeHTML(r.label)}">
            <span aria-hidden="true">${r.emoji}</span>
            <span class="prayer-reaction-count" data-count="${r.kind}">0</span>
          </button>`
        ).join('')}
      </div>
    </article>
  `;
}

function paintReactionCounts(prayerId, counts) {
  const host = qs(`[data-reactions="${prayerId}"]`);
  if (!host) return;
  REACTIONS.forEach((r) => {
    const node = host.querySelector(`[data-count="${r.kind}"]`);
    if (node) node.textContent = String(counts[r.kind] || 0);
  });
}

function paintReactionState(prayerId, mine) {
  const host = qs(`[data-reactions="${prayerId}"]`);
  if (!host) return;
  REACTIONS.forEach((r) => {
    const btn = host.querySelector(`[data-kind="${r.kind}"]`);
    if (!btn) return;
    const active = mine.includes(r.kind);
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
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

  // Reacciones.
  document.addEventListener('click', async (event) => {
    const btn = event.target.closest('.prayer-reaction');
    if (!btn) return;
    const kind = btn.dataset.kind;
    const prayerId = btn.dataset.prayer;
    const meta = reactionMeta(kind);
    if (!meta || !prayerId) return;

    const wasActive = btn.classList.contains('is-active');
    btn.disabled = true;
    try {
      await toggleReaction(prayerId, kind, !wasActive);
      btn.classList.toggle('is-active', !wasActive);
      btn.setAttribute('aria-pressed', !wasActive ? 'true' : 'false');
      const countNode = btn.querySelector('.prayer-reaction-count');
      if (countNode) {
        const next = (Number(countNode.textContent) || 0) + (wasActive ? -1 : 1);
        countNode.textContent = String(Math.max(0, next));
      }
    } catch (error) {
      showToast(error.message || 'No se pudo registrar tu reacción.', 'danger');
    } finally {
      btn.disabled = false;
    }
  });

  initPublicMarketOrders();
}

/* --------------------------------------------------------------------------
   ARRANQUE
   -------------------------------------------------------------------------- */
export function initPublicSync() {
  // Se instala siempre: aunque no haya Firebase, la landing estática puede
  // enlazar imágenes externas que se caigan.
  installImageFallback(document);

  if (!firebaseReady) {
    warnOnce('general');
    // Aun sin Firebase el formulario de oración está en el HTML: se avisa en
    // vez de dejar un formulario que no envía nada.
    whenReady(() => {
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
        () => warnOnce('contenido')
      );

      eventsUnsub = watchEvents(
        ({ active }) => {
          renderUpcomingEvents(active);
          pushCalendarEvents(active);
        },
        () => warnOnce('contenido')
      );

      announcementsUnsub = watchAnnouncements(
        (list) => renderAnnouncements(list),
        () => warnOnce('avisos')
      );

      productsUnsub = watchActiveProducts(
        (list) => renderMarket(list),
        () => warnOnce('market')
      );

      prayersUnsub = watchPublicPrayers(
        (list) => renderPublicPrayers(list),
        () => warnOnce('oracion')
      );

      bindPublicInteractions();
    } catch (error) {
      console.error('[CL] Fallo al iniciar la sincronización pública:', error);
      showToast('No se pudo conectar con el servidor de contenido.', 'warning');
    }
  });
}

export function stopPublicSync() {
  [settingsUnsub, eventsUnsub, announcementsUnsub].forEach((unsub) => {
    try {
      if (typeof unsub === 'function') unsub();
    } catch (error) {
      console.warn('[CL] Error al cerrar una suscripción:', error);
    }
  });
  settingsUnsub = null;
  eventsUnsub = null;
  announcementsUnsub = null;
}

initPublicSync();
