/* ==========================================================================
   LIBRERÍA DOM COMPARTIDA
   Utilidades de render, escapado, notificaciones y diálogos reutilizables
   tanto en la landing pública como en el panel de administración.
   ========================================================================== */

export const qs = (selector, root = document) => root.querySelector(selector);
export const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const HTML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

export function escapeHTML(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);
}

export function normalizeText(value) {
  if (!value) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function clear(node) {
  if (!node) return;
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function setHTML(node, html) {
  if (!node) return;
  node.innerHTML = html;
}

export function createEl(tag, attributes = {}, children = []) {
  const element = document.createElement(tag);
  Object.entries(attributes).forEach(([key, value]) => {
    if (value === null || value === undefined || value === false) return;
    if (key === 'class') element.className = value;
    else if (key === 'dataset') Object.assign(element.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') element.addEventListener(key.slice(2), value);
    // `textContent`, `innerHTML`, `value` y `checked` son PROPIEDADES del DOM.
    // Si se trataran como atributos, `setAttribute('textcontent', ...)` crearía
    // un atributo personalizado sin efecto y el nodo se pintaría vacío: era lo
    // que dejaba los toasts, los modales de confirmación y los botones de
    // familiares sin texto.
    else if (key in element && (key === 'textContent' || key === 'innerHTML' || key === 'value' || key === 'checked' || key === 'disabled' || key === 'hidden')) {
      element[key] = value;
    } else element.setAttribute(key, value === true ? '' : value);
  });
  (Array.isArray(children) ? children : [children]).forEach((child) => {
    if (child === null || child === undefined) return;
    element.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  });
  return element;
}

export function debounce(fn, wait = 250) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/* --------------------------------------------------------------------------
   SKELETONS DE CARGA
   -------------------------------------------------------------------------- */

export function skeletonCard() {
  return `
    <div class="cl-skeleton-card" aria-hidden="true">
      <div class="cl-skeleton-line cl-skeleton-line-lg"></div>
      <div class="cl-skeleton-line"></div>
      <div class="cl-skeleton-line cl-skeleton-line-sm"></div>
    </div>
  `;
}

export function skeletonList(count = 3) {
  return Array.from({ length: count }, skeletonCard).join('');
}

export function skeletonRows(count = 5, columns = 5) {
  return Array.from({ length: count }, () => `
    <div class="cl-skeleton-row" aria-hidden="true">
      ${Array.from({ length: columns }, (_, i) => `<div class="cl-skeleton-cell"></div>`).join('')}
    </div>
  `).join('');
}

export function skeletonBlock(count = 3) {
  return Array.from({ length: count }, () => '<div class="cl-skeleton-line"></div>').join('');
}

/* --------------------------------------------------------------------------
   NOTIFICACIONES (TOASTS)
   -------------------------------------------------------------------------- */

const TOAST_ICONS = {
  success: 'fa-circle-check',
  error: 'fa-circle-exclamation',
  danger: 'fa-circle-exclamation',
  warning: 'fa-triangle-exclamation',
  info: 'fa-circle-info'
};

/** Texto de último recurso cuando la llamada no trae mensaje. */
const TOAST_FALLBACK = {
  success: 'Operación completada.',
  error: 'Ocurrió un error inesperado.',
  danger: 'Ocurrió un error inesperado.',
  warning: 'Revisa los datos e inténtalo de nuevo.',
  info: 'Tarea realizada.'
};

function toastHost() {
  // Reutiliza el contenedor del documento si ya existe (p. ej. el panel admin).
  let host = qs('#clg-toast-host') || qs('#cl-toast-host');
  if (!host) {
    host = createEl('div', { id: 'cl-toast-host', class: 'cl-toast-host', 'aria-live': 'polite' });
    document.body.appendChild(host);
  }
  return host;
}

export function showToast(message, type = 'success', timeout = 4200) {
  try {
    // Nunca se lanza un toast sin texto: un aviso vacío confunde más que no
    // avisar, y era el síntoma de llamadas con `message` sin definir.
    const text = String(message ?? '').trim() || TOAST_FALLBACK[type] || TOAST_FALLBACK.info;
    const host = toastHost();
    // El panel y la web pública usan estilos distintos para el mismo aviso.
    const prefix = host.id === 'clg-toast-host' ? 'clg' : 'cl';
    const toast = createEl(
      'div',
      { class: `${prefix}-toast ${prefix}-toast-${type}`, role: 'status' },
      [
        createEl('i', { class: `fas ${TOAST_ICONS[type] || TOAST_ICONS.info}` }),
        createEl('span', { class: `${prefix}-toast-text`, textContent: text })
      ]
    );
    host.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    setTimeout(() => {
      toast.classList.remove('is-visible');
      setTimeout(() => toast.remove(), 350);
    }, timeout);
  } catch (error) {
    console.warn('[CL] No se pudo mostrar el aviso:', error);
  }
}

/* --------------------------------------------------------------------------
   DIÁLOGO DE CONFIRMACIÓN
   -------------------------------------------------------------------------- */

export function confirmDialog({ title, message, confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false }) {
  // Valores por defecto: sin título o mensaje el modal se abriría vacío.
  const safeTitle = String(title ?? '').trim() || 'Confirmar acción';
  const safeMessage = String(message ?? '').trim() || 'Revisa los detalles antes de continuar.';
  return new Promise((resolve) => {
    const overlay = createEl('div', { class: 'cl-modal-overlay', role: 'dialog', 'aria-modal': 'true' });
    const close = (result) => {
      overlay.classList.remove('is-open');
      setTimeout(() => overlay.remove(), 220);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') close(false);
    };

    overlay.appendChild(createEl('div', { class: 'cl-modal-box' }, [
      createEl('h3', { class: 'cl-modal-title', textContent: safeTitle }),
      createEl('p', { class: 'cl-modal-text', textContent: safeMessage }),
      createEl('div', { class: 'cl-modal-actions' }, [
        createEl('button', { type: 'button', class: 'cl-btn cl-btn-ghost', textContent: cancelText, onclick: () => close(false) }),
        createEl('button', {
          type: 'button',
          class: `cl-btn ${danger ? 'cl-btn-danger' : 'cl-btn-primary'}`,
          textContent: confirmText,
          onclick: () => close(true)
        })
      ])
    ]));

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close(false);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('is-open'));
  });
}

/* --------------------------------------------------------------------------
   TELÉFONOS Y WHATSAPP
   -------------------------------------------------------------------------- */

export function normalizePhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('57') && digits.length > 10) return `+${digits}`;
  if (digits.length === 10) return `+57${digits}`;
  return `+${digits}`;
}

export function formatPhoneCO(raw) {
  const phone = normalizePhone(raw);
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('57')) {
    return `+57 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  return phone;
}

export function whatsappLink(rawPhone, text) {
  const phone = normalizePhone(rawPhone).replace(/\D/g, '');
  return `https://wa.me/${phone}?text=${encodeURIComponent(text || '')}`;
}

export function birthdayWhatsappMessage(fullName) {
  return `¡Feliz cumpleaños, ${fullName || ''}! 🙏 Comunidad Love te desea un año abundante en blessings, salud y amor. ¡Gracias por ser parte de nuestra familia!`;
}

export function downloadCSV(filename, rows) {
  try {
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = createEl('a', { href: url, download: filename });
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.warn('[CL] No se pudo exportar el archivo:', error);
    showToast('No se pudo generar el archivo de exportación.', 'error');
  }
}
