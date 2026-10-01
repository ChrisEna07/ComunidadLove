/* ==========================================================================
   COMPONENTES DE INTERFAZ REUTILIZABLES DEL PANEL
   Todo el HTML se genera aquí para mantener las vistas limpias.
   ========================================================================== */

import { escapeHTML, createEl, qsa } from '../lib/dom.js';

export function pageHeader({ title, subtitle, icon, actions = '' }) {
  return `
    <header class="clg-page-header">
      <div class="clg-page-title">
        <span class="clg-page-icon"><i class="fas ${icon || 'fa-compass'}"></i></span>
        <div>
          <h1>${escapeHTML(title)}</h1>
          ${subtitle ? `<p>${escapeHTML(subtitle)}</p>` : ''}
        </div>
      </div>
      <div class="clg-page-actions">${actions}</div>
    </header>
  `;
}

export function card({ title, subtitle, body, footer, className = '' }) {
  return `
    <section class="clg-card ${className}">
      ${title ? `
        <header class="clg-card-header">
          <h2>${escapeHTML(title)}</h2>
          ${subtitle ? `<p>${escapeHTML(subtitle)}</p>` : ''}
        </header>
      ` : ''}
      <div class="clg-card-body">${body || ''}</div>
      ${footer ? `<footer class="clg-card-footer">${footer}</footer>` : ''}
    </section>
  `;
}

export function emptyState({ icon = 'fa-inbox', title, message, action = '' }) {
  return `
    <div class="clg-empty">
      <i class="fas ${icon}"></i>
      <h3>${escapeHTML(title)}</h3>
      ${message ? `<p>${escapeHTML(message)}</p>` : ''}
      ${action}
    </div>
  `;
}

export function errorState(message) {
  return `
    <div class="clg-error-state">
      <i class="fas fa-triangle-exclamation"></i>
      <h2>No pudimos cargar esta sección</h2>
      <p>${escapeHTML(message)}</p>
    </div>
  `;
}

export function statCard({ label, value, icon, tone = 'primary', hint = '' }) {
  return `
    <div class="clg-stat clg-stat-${tone}">
      <span class="clg-stat-icon"><i class="fas ${icon}"></i></span>
      <div class="clg-stat-body">
        <strong class="clg-stat-value">${escapeHTML(String(value))}</strong>
        <span class="clg-stat-label">${escapeHTML(label)}</span>
        ${hint ? `<span class="clg-stat-hint">${escapeHTML(hint)}</span>` : ''}
      </div>
    </div>
  `;
}

export function field({ name, keyPrefix = '', label, type = 'text', value = '', placeholder = '', required = false, hint = '', options = null, rows = 0, autocomplete = 'off', min = '', max = '', step = '', icon = '', trailing = '' }) {
  const key = keyPrefix ? `${keyPrefix}-${name}` : name;
  const id = `clg-${key}`;
  let control;
  if (options) {
    const opts = options
      .map((option) => {
        const optionValue = typeof option === 'string' ? option : option.value;
        const optionLabel = typeof option === 'string' ? option : option.label;
        return `<option value="${escapeHTML(optionValue)}"${String(optionValue) === String(value) ? ' selected' : ''}>${escapeHTML(optionLabel)}</option>`;
      })
      .join('');
    control = `<select id="${id}" name="${key}"${required ? ' required' : ''}>${opts}</select>`;
  } else if (type === 'textarea') {
    control = `<textarea id="${id}" name="${key}" rows="${rows || 3}" placeholder="${escapeHTML(placeholder)}"${required ? ' required' : ''}>${escapeHTML(value)}</textarea>`;
  } else {
    control = `<input id="${id}" type="${type}" name="${key}" value="${escapeHTML(value)}" placeholder="${escapeHTML(placeholder)}"${required ? ' required' : ''}${autocomplete ? ` autocomplete="${autocomplete}"` : ''}${min ? ` min="${escapeHTML(min)}"` : ''}${max ? ` max="${escapeHTML(max)}"` : ''}${step ? ` step="${escapeHTML(step)}"` : ''}>`;
  }
  return `
    <div class="clg-field${icon ? ' clg-field-icon' : ''}">
      <label for="${id}">${escapeHTML(label)}${required ? '<span class="clg-req">*</span>' : ''}</label>
      <div class="clg-control">
        ${icon ? `<i class="fas ${escapeHTML(icon)} clg-control-icon" aria-hidden="true"></i>` : ''}
        ${control}
        ${trailing}
      </div>
      ${hint ? `<small class="clg-hint">${escapeHTML(hint)}</small>` : ''}
    </div>
  `;
}

export function checkboxField({ name, label, checked = false, hint = '' }) {
  const id = `clg-${name}`;
  return `
    <label class="clg-check" for="${id}">
      <input id="${id}" type="checkbox" name="${name}"${checked ? ' checked' : ''}>
      <span class="clg-check-box"><i class="fas fa-check"></i></span>
      <span class="clg-check-text">
        ${escapeHTML(label)}
        ${hint ? `<small>${escapeHTML(hint)}</small>` : ''}
      </span>
    </label>
  `;
}

export function segmentedControl({ name, value, options }) {
  return `
    <div class="clg-segmented" role="radiogroup" aria-label="${escapeHTML(name)}">
      ${options
        .map(
          (option) => `
        <button type="button" class="clg-segment${option.value === value ? ' is-active' : ''}"
                role="radio" aria-checked="${option.value === value}" data-name="${name}" data-value="${escapeHTML(option.value)}">
          ${option.icon ? `<i class="fas ${option.icon}"></i>` : ''}
          <span>${escapeHTML(option.label)}</span>
        </button>`
        )
        .join('')}
    </div>
  `;
}

export function table({ head, rows, emptyMessage = 'Sin registros.' }) {
  if (!rows.length) {
    return `<div class="clg-table-empty">${escapeHTML(emptyMessage)}</div>`;
  }
  return `
    <div class="clg-table-scroll">
      <table class="clg-table">
        <thead><tr>${head.map((cell) => `<th>${escapeHTML(cell)}</th>`).join('')}</tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>
  `;
}

export function tag(text, tone = 'neutral') {
  return `<span class="clg-tag clg-tag-${tone}">${escapeHTML(text)}</span>`;
}

export function iconButton({ icon, label, action = '', data = '', variant = 'ghost' }) {
  let attrs = '';
  if (data && typeof data === 'object') {
    attrs = Object.entries(data)
      .map(([key, value]) => `data-${key}="${escapeHTML(value)}"`)
      .join(' ');
  } else if (typeof data === 'string' && data.trim()) {
    attrs = data.trim();
  }
  const actionClass = action === 'edit' ? ' btn-edit' : (action ? ` btn-${action}` : '');
  return `
    <button type="button" class="clg-icon-btn clg-icon-btn-${variant}${actionClass}" title="${escapeHTML(label)}"
            aria-label="${escapeHTML(label)}"${action ? ` data-action="${escapeHTML(action)}"` : ''}${attrs ? ` ${attrs}` : ''}>
      <i class="fas ${icon}"></i>
    </button>
  `;
}

export function button({ label, icon = '', variant = 'primary', type = 'button', action = '', disabled = false, data = '' }) {
  return `
    <button type="${type}" class="clg-btn clg-btn-${variant}"${action ? ` data-action="${escapeHTML(action)}"` : ''}${data}${disabled ? ' disabled' : ''}>
      ${icon ? `<i class="fas ${icon}"></i>` : ''}
      <span>${escapeHTML(label)}</span>
    </button>
  `;
}

export function drawer({ id, title, body, footer = '' }) {
  return `
    <div class="clg-drawer-overlay" data-drawer-overlay="${id}"></div>
    <aside class="clg-drawer" id="${id}" role="dialog" aria-modal="true" aria-label="${escapeHTML(title)}">
      <header class="clg-drawer-header">
        <h2>${escapeHTML(title)}</h2>
        <button type="button" class="clg-icon-btn clg-icon-btn-ghost" data-close-drawer="${id}" aria-label="Cerrar">
          <i class="fas fa-xmark"></i>
        </button>
      </header>
      <div class="clg-drawer-body">${body}</div>
      ${footer ? `<footer class="clg-drawer-footer">${footer}</footer>` : ''}
    </aside>
  `;
}

/* --------------------------------------------------------------------------
   FORMULARIOS: lectura y helpers
   -------------------------------------------------------------------------- */
export function readForm(form) {
  const data = {};
  qsa('[name]', form).forEach((input) => {
    if (input.type === 'checkbox') data[input.name] = input.checked;
    else if (input.type === 'radio') {
      if (input.checked) data[input.name] = input.value;
    } else data[input.name] = input.value.trim();
  });
  return data;
}

export function markInvalid(form, message) {
  const text = String(message ?? '').trim() || 'No se pudo completar la operación.';
  form.classList.add('has-error');
  const banner = form.querySelector('.clg-form-error');
  if (banner) {
    banner.textContent = text;
    banner.hidden = false;
  } else {
    form.prepend(
      createEl('div', { class: 'clg-form-error', role: 'alert' }, [
        createEl('i', { class: 'fas fa-circle-exclamation' }),
        createEl('span', { textContent: text })
      ])
    );
  }
  form.querySelector('.clg-form-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function clearInvalid(form) {
  form.classList.remove('has-error');
  const banner = form.querySelector('.clg-form-error');
  if (banner) banner.hidden = true;
}

export function setLoading(form, loading, label = 'Guardando…') {
  const button = form.querySelector('[type="submit"]');
  if (!button) return;
  if (loading) {
    button.dataset.originalLabel = button.querySelector('span')?.textContent || button.textContent;
    button.disabled = true;
    button.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i><span>${escapeHTML(label)}</span>`;
  } else {
    button.disabled = false;
    const text = button.dataset.originalLabel || label;
    button.innerHTML = `<span>${escapeHTML(text)}</span>`;
  }
}
