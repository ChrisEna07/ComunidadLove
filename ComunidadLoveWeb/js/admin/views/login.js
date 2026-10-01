/* ==========================================================================
   VISTA: ACCESO AL PANEL
   ========================================================================== */

import { signIn, sendReset } from '../../lib/auth.js';
import { showToast, qs } from '../../lib/dom.js';
import { pageHeader as _pageHeader, field, markInvalid, clearInvalid, setLoading } from '../ui.js';

export function renderLogin(container) {
  container.innerHTML = `
    <div class="clg-auth">
      <div class="clg-auth-card">
        <div class="clg-auth-brand">
          <img src="../../Assets/logo-color.png" alt="Comunidad Love">
          <h1>CLGestión</h1>
          <p>Sistema integral de gestión · Comunidad Love Cartagena</p>
        </div>

        <form class="clg-form clg-auth-form" id="clg-login-form" novalidate>
          ${field({
            name: 'email',
            label: 'Correo electrónico',
            type: 'email',
            placeholder: 'pastor@comunidadlove.co',
            required: true,
            autocomplete: 'email',
            icon: 'fa-envelope'
          })}
          ${field({
            name: 'password',
            label: 'Contraseña',
            type: 'password',
            placeholder: '••••••••',
            required: true,
            autocomplete: 'current-password',
            icon: 'fa-lock',
            trailing: `<button type="button" class="clg-password-toggle" id="clg-toggle-password"
                        aria-label="Mostrar contraseña" aria-pressed="false">
                        <i class="fas fa-eye"></i>
                      </button>`
          })}
          <button type="submit" class="clg-btn clg-btn-primary clg-btn-block clg-auth-submit">
            <i class="fas fa-right-to-bracket"></i><span>Ingresar</span>
          </button>
          <button type="button" class="clg-link-btn" id="clg-forgot">
            ¿Olvidaste tu contraseña?
          </button>
        </form>

        <footer class="clg-auth-footer">
          <a href="../../index.html"><i class="fas fa-arrow-left"></i> Volver al sitio público</a>
        </footer>
      </div>
    </div>
  `;

  const form = qs('#clg-login-form', container);

  const togglePassword = qs('#clg-toggle-password', container);
  togglePassword.addEventListener('click', () => {
    const input = form.password;
    const hidden = input.type === 'password';
    input.type = hidden ? 'text' : 'password';
    togglePassword.setAttribute('aria-pressed', String(hidden));
    togglePassword.setAttribute('aria-label', hidden ? 'Ocultar contraseña' : 'Mostrar contraseña');
    togglePassword.querySelector('i').className = hidden ? 'fas fa-eye-slash' : 'fas fa-eye';
    input.focus();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearInvalid(form);
    const email = form.email.value.trim();
    const password = form.password.value;

    if (!email || !password) {
      markInvalid(form, 'Ingresa tu correo y contraseña.');
      return;
    }

    setLoading(form, true, 'Ingresando…');
    try {
      await signIn(email, password);
      showToast('Sesión iniciada correctamente.', 'success');
    } catch (error) {
      console.warn('[CL] Error de inicio de sesión:', error);
      const map = {
        'auth/invalid-credential': 'Correo o contraseña incorrectos.',
        'auth/invalid-email': 'El correo no tiene un formato válido.',
        'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos e intenta de nuevo.',
        'auth/network-request-failed': 'Sin conexión a internet.'
      };
      markInvalid(form, map[error.code] || error.message || 'No se pudo iniciar sesión.');
    } finally {
      setLoading(form, false);
    }
  });

  qs('#clg-forgot', container).addEventListener('click', async () => {
    const email = form.email.value.trim();
    if (!email) {
      markInvalid(form, 'Escribe primero tu correo para restablecer la contraseña.');
      form.email.focus();
      return;
    }
    try {
      await sendReset(email);
      showToast('Te enviamos el enlace de restablecimiento a tu correo.', 'success', 6000);
    } catch (error) {
      const map = {
        'auth/missing-email': 'Ingresa tu correo.',
        'auth/invalid-email': 'El correo no tiene un formato válido.',
        'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.'
      };
      showToast(map[error.code] || error.message || 'No se pudo enviar el correo.', 'error');
    }
  });

  return () => {};
}
