/* ==========================================================================
   CAMPO DE IMAGEN HÍBRIDO (URL externa + archivo local comprimido)
   --------------------------------------------------------------------------
   Como el proyecto no usa Cloud Storage, las imágenes llegan al documento de
   Firestore de dos formas:

     • URL externa  → https://… escrita por el usuario
     • Archivo local → data:image/webp;base64,… comprimido en el navegador

   El control expone siempre un <input type="hidden"> con el valor final, así
   que `readForm()` lo recoge sin ninguna lógica adicional.

   Uso:
     imageInput({ name: 'bannerUrl', keyPrefix: 'ev', label: 'Banner' })
     bindImageInputs(container)
   ========================================================================== */

import { escapeHTML, qs, qsa, showToast } from '../lib/dom.js';
import {
  IMAGE_LIMITS,
  compressImageFile,
  describeImageSource,
  isDataUrl,
  sanitizeImageValue
} from '../lib/image.js';

const PLACEHOLDER = `<div class="clg-image-empty">
  <i class="fas fa-image"></i>
  <span>Pega una dirección o sube una imagen desde tu equipo</span>
</div>`;

/** Genera el HTML del campo. */
export function imageInput({ name, keyPrefix = '', label, value = '', hint = '', required = false, compact = false }) {
  const key = keyPrefix ? `${keyPrefix}-${name}` : name;
  const id = `clg-${key}`;
  const current = String(value || '').trim();
  const startsAsData = isDataUrl(current);

  return `
    <div class="clg-field clg-image-field${compact ? ' clg-image-compact' : ''}"
         data-image-input data-image-name="${escapeHTML(key)}">
      <label for="${id}-url">${escapeHTML(label)}${required ? '<span class="clg-req">*</span>' : ''}</label>

      <div class="clg-segmented clg-image-modes" role="radiogroup" aria-label="Origen de la imagen">
        <button type="button" role="radio" aria-checked="${!startsAsData}"
                class="clg-segment${startsAsData ? '' : ' is-active'}" data-image-mode="url">
          <i class="fas fa-link"></i><span>Desde URL</span>
        </button>
        <button type="button" role="radio" aria-checked="${startsAsData}"
                class="clg-segment${startsAsData ? ' is-active' : ''}" data-image-mode="file">
          <i class="fas fa-cloud-arrow-up"></i><span>Subir imagen</span>
        </button>
      </div>

      <div class="clg-image-panel" data-image-panel="url"${startsAsData ? ' hidden' : ''}>
        <div class="clg-image-url-row">
          <input type="url" id="${id}-url" data-image-url
                 value="${startsAsData ? '' : escapeHTML(current)}"
                 placeholder="https://ejemplo.com/imagen.jpg"
                 inputmode="url" autocomplete="off">
          <button type="button" class="clg-btn clg-btn-ghost" data-image-url-apply>
            <i class="fas fa-check"></i><span>Usar</span>
          </button>
        </div>
        <small class="clg-hint">Enlaza una imagen que ya esté publicada en internet.</small>
      </div>

      <div class="clg-image-panel" data-image-panel="file"${startsAsData ? '' : ' hidden'}>
        <input type="file" data-image-file accept="image/*"
               aria-label="Seleccionar imagen desde el equipo">
        <p class="clg-image-progress" data-image-progress hidden>
          <span class="clg-image-progress-bar"><i data-image-bar></i></span>
          <small data-image-status>Comprimiendo…</small>
        </p>
        <small class="clg-hint">
          Se reduce a ${IMAGE_LIMITS.maxDimension} px y se comprime a WebP para no superar
          los ${Math.round(IMAGE_LIMITS.maxDataUrlBytes / 1024)} KB por registro.
        </small>
      </div>

      <div class="clg-image-preview" data-image-preview>${renderPreview(current)}</div>
      <p class="clg-image-note" data-image-note>${escapeHTML(describeImageSource(current))}</p>

      <input type="hidden" name="${escapeHTML(key)}" value="${escapeHTML(current)}" data-image-value>

      <button type="button" class="clg-link-btn clg-link-danger" data-image-clear${current ? '' : ' hidden'}>
        <i class="fas fa-trash-can"></i> Quitar imagen
      </button>
      ${hint ? `<small class="clg-hint">${escapeHTML(hint)}</small>` : ''}
      <small class="clg-field-error clg-image-error" data-image-error hidden></small>
    </div>
  `;
}

function renderPreview(value) {
  const raw = String(value || '').trim();
  if (!raw) return PLACEHOLDER;
  return `<img src="${escapeHTML(raw)}" alt="Vista previa de la imagen" loading="lazy" decoding="async" data-img-fallback="preview">`;
}

/* --------------------------------------------------------------------------
   COMPORTAMIENTO
   -------------------------------------------------------------------------- */

/** Conecta todos los campos híbridos que contenga `root`. */
export function bindImageInputs(root) {
  qsa('[data-image-input]', root).forEach(setup);
}

function setup(root) {
  if (root.dataset.imageBound === '1') return;
  root.dataset.imageBound = '1';

  const valueInput = qs('[data-image-value]', root);
  const preview = qs('[data-image-preview]', root);
  const note = qs('[data-image-note]', root);
  const errorBox = qs('[data-image-error]', root);
  const clearButton = qs('[data-image-clear]', root);
  const urlInput = qs('[data-image-url]', root);
  const urlApply = qs('[data-image-url-apply]', root);
  const fileInput = qs('[data-image-file]', root);
  const progress = qs('[data-image-progress]', root);
  const bar = qs('[data-image-bar]', root);
  const status = qs('[data-image-status]', root);

  const commit = (value, message) => {
    valueInput.value = value;
    preview.innerHTML = renderPreview(value);
    note.textContent = describeImageSource(value);
    clearButton.hidden = !value;
    root.classList.toggle('has-image', Boolean(value));
    hideError();
    if (message) showToast(message, 'success');
  };

  const showError = (message) => {
    errorBox.textContent = message;
    errorBox.hidden = false;
    errorBox.classList.add('is-visible');
    root.classList.add('has-error');
  };
  const hideError = () => {
    errorBox.hidden = true;
    errorBox.textContent = '';
    errorBox.classList.remove('is-visible');
    root.classList.remove('has-error');
  };

  const setMode = (mode) => {
    qsa('[data-image-mode]', root).forEach((button) => {
      const active = button.dataset.imageMode === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-checked', String(active));
    });
    qs('[data-image-panel="url"]', root).hidden = mode !== 'url';
    qs('[data-image-panel="file"]', root).hidden = mode !== 'file';
  };

  qsa('[data-image-mode]', root).forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.imageMode));
  });

  urlApply?.addEventListener('click', () => {
    try {
      const url = sanitizeImageValue(urlInput.value, {
        field: 'la imagen'
      });
      if (!url) {
        showError('Escribe una dirección de imagen o sube un archivo.');
        urlInput.focus();
        return;
      }
      setMode('url');
      commit(url);
    } catch (error) {
      showError(error.message);
    }
  });

  // Al escribir/pegar una URL se aplica al instante: no hace falta pulsar «Usar».
  urlInput?.addEventListener('input', () => {
    const raw = urlInput.value.trim();
    if (!raw) return;
    try {
      commit(sanitizeImageValue(raw, { field: 'la imagen' }));
    } catch (error) {
      showError(error.message);
    }
  });

  urlInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      urlApply.click();
    }
  });

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    progress.hidden = false;
    bar.style.width = '4%';
    status.textContent = 'Comprimiendo…';
    hideError();

    try {
      const result = await compressImageFile(file, {
        onProgress: (percent) => {
          bar.style.width = `${Math.max(4, percent)}%`;
          status.textContent =
            percent >= 100 ? '¡Listo!' : `Comprimiendo… ${Math.round(percent)}%`;
        }
      });
      const before = Math.round(result.originalBytes / 1024);
      const after = Math.round(result.bytes / 1024);
      commit(
        result.dataUrl,
        `Imagen optimizada: ${before} KB → ${after} KB (${result.mime.replace('image/', '').toUpperCase()}).`
      );
      // Si venía una URL escrita a mano, el campo debe reflejar el Base64.
      if (urlInput) urlInput.value = '';
    } catch (error) {
      fileInput.value = '';
      bar.style.width = '0%';
      status.textContent = 'No se pudo usar esa imagen.';
      showError(error.message);
      showToast(error.message, 'error');
    } finally {
      setTimeout(() => {
        progress.hidden = true;
        bar.style.width = '0%';
      }, 900);
    }
  });

  clearButton?.addEventListener('click', () => {
    fileInput.value = '';
    urlInput.value = '';
    setMode('url');
    commit('');
  });
}

/**
 * Normaliza el valor antes de guardarlo. Centraliza la validación para que
 * ningún formulario se salte el tope de 200 KB.
 */
export function prepareImageValue(value, field) {
  return sanitizeImageValue(value, { field });
}