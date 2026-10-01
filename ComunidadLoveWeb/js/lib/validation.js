/* ==========================================================================
   VALIDACIONES Y MÁSCARAS DE ENTRADA EN TIEMPO REAL
   --------------------------------------------------------------------------
   - Teléfono: estrictamente 10 dígitos numéricos (/^[0-9]{10}$/).
   - Documento: solo números (/^[0-9]+$/), longitud de 6 a 15 dígitos.
   - Nombre y Apellido: solo letras y espacios (/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/).
   - Correo electrónico: validación estándar con feedback visual en vivo.
   ========================================================================== */

/** Teléfono: estrictamente 10 dígitos */
export const PHONE_REGEX = /^[0-9]{10}$/;

/** Documento de identidad: 6 a 15 dígitos numéricos */
export const DOCUMENT_REGEX = /^[0-9]{6,15}$/;

/** Nombre y apellido: solo letras y espacios */
export const NAME_REGEX = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/;

/** Correo electrónico estándar */
export const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Actualiza el feedback visual (verde/rojo) y mensaje de error de un input.
 * @param {HTMLInputElement} input
 * @param {() => boolean | string} validator Retorna true si es válido, string con el error si es inválido, o '' si es neutro
 */
export function updateInputFeedback(input, validator) {
  const result = validator();
  const parent = input.closest('.clg-field') || input.closest('.form-group') || input.parentElement;
  let msgEl = parent?.querySelector('.clg-field-error-msg, .field-error-msg');

  if (result === true) {
    input.classList.remove('is-invalid');
    input.classList.add('is-valid');
    if (msgEl) msgEl.remove();
  } else if (typeof result === 'string' && result.length > 0) {
    input.classList.remove('is-valid');
    input.classList.add('is-invalid');
    if (!msgEl && parent) {
      msgEl = document.createElement('small');
      msgEl.className = parent.classList.contains('clg-field') ? 'clg-field-error-msg' : 'field-error-msg';
      parent.appendChild(msgEl);
    }
    if (msgEl) {
      msgEl.textContent = result;
    }
  } else {
    // Estado neutro
    input.classList.remove('is-valid', 'is-invalid');
    if (msgEl) msgEl.remove();
  }
}

/**
 * Sanitiza y valida un campo de teléfono en vivo: estrictamente 10 dígitos numéricos.
 */
export function sanitizePhoneInput(input) {
  const raw = input.value;
  const digitsOnly = raw.replace(/\D/g, '').slice(0, 10);
  if (raw !== digitsOnly) {
    input.value = digitsOnly;
  }
  updateInputFeedback(input, () => {
    if (!digitsOnly) {
      return input.required ? 'El teléfono es obligatorio y debe tener 10 dígitos.' : '';
    }
    if (digitsOnly.length === 10) return true;
    return `Debe tener estrictamente 10 dígitos numéricos (llevas ${digitsOnly.length}).`;
  });
}

/**
 * Sanitiza y valida un documento de identidad en vivo: solo números (6 a 15 dígitos).
 */
export function sanitizeDocumentInput(input) {
  const raw = input.value;
  const digitsOnly = raw.replace(/\D/g, '').slice(0, 15);
  if (raw !== digitsOnly) {
    input.value = digitsOnly;
  }
  updateInputFeedback(input, () => {
    if (!digitsOnly) {
      return input.required ? 'El documento es obligatorio (6 a 15 dígitos).' : '';
    }
    if (digitsOnly.length >= 6 && digitsOnly.length <= 15) return true;
    return `El documento debe tener entre 6 y 15 dígitos numéricos (llevas ${digitsOnly.length}).`;
  });
}

/**
 * Sanitiza y valida nombre y apellido en vivo (solo letras y espacios).
 */
export function sanitizeNameInput(input) {
  const raw = input.value;
  const lettersOnly = raw.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '');
  if (raw !== lettersOnly) {
    input.value = lettersOnly;
  }
  updateInputFeedback(input, () => {
    const trimmed = lettersOnly.trim();
    if (!trimmed) {
      return input.required ? 'Ingresa el nombre completo (solo letras y espacios).' : '';
    }
    if (trimmed.length < 3) {
      return 'El nombre debe tener al menos 3 letras.';
    }
    return true;
  });
}

/**
 * Valida un correo electrónico en vivo con feedback visual.
 */
export function validateEmailInput(input) {
  const value = input.value.trim();
  updateInputFeedback(input, () => {
    if (!value) {
      return input.required ? 'Ingresa el correo electrónico.' : '';
    }
    if (EMAIL_REGEX.test(value)) return true;
    return 'Ingresa un correo electrónico válido (ej. usuario@dominio.com).';
  });
}

/**
 * Enlaza automáticamente los listeners de input masks y sanitización en vivo
 * a todos los campos pertinentes dentro del contenedor o formulario.
 */
export function bindLiveFormValidation(root = document) {
  if (!root) return;

  // Teléfonos
  const phoneInputs = root.querySelectorAll('input[type="tel"], input[name*="phone" i], input[name*="telefono" i], #order-customer-phone');
  phoneInputs.forEach((input) => {
    if (input.dataset.validationBound === '1') return;
    input.dataset.validationBound = '1';
    input.addEventListener('input', () => sanitizePhoneInput(input));
    input.addEventListener('blur', () => sanitizePhoneInput(input));
  });

  // Documentos de identidad
  const docInputs = root.querySelectorAll('input[name*="document" i], input[name*="cedula" i]');
  docInputs.forEach((input) => {
    if (input.dataset.validationBound === '1') return;
    input.dataset.validationBound = '1';
    input.addEventListener('input', () => sanitizeDocumentInput(input));
    input.addEventListener('blur', () => sanitizeDocumentInput(input));
  });

  // Nombres y apellidos
  const nameInputs = root.querySelectorAll('input[name*="fullName" i], input[name*="displayName" i], input[name="prayer-name"], #order-customer-name, #form-name');
  nameInputs.forEach((input) => {
    if (input.dataset.validationBound === '1') return;
    input.dataset.validationBound = '1';
    input.addEventListener('input', () => sanitizeNameInput(input));
    input.addEventListener('blur', () => sanitizeNameInput(input));
  });

  // Correos electrónicos
  const emailInputs = root.querySelectorAll('input[type="email"], input[name*="email" i], input[name*="correo" i]');
  emailInputs.forEach((input) => {
    if (input.dataset.validationBound === '1') return;
    input.dataset.validationBound = '1';
    input.addEventListener('input', () => validateEmailInput(input));
    input.addEventListener('blur', () => validateEmailInput(input));
  });
}
