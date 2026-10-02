/* ==========================================================================
   CLGESTIÓN - PUNTO DE ENTRADA DEL PANEL ADMINISTRATIVO
   ========================================================================== */

import { firebaseReady, configError } from '../firebase.js';
import { watchSession, signOut, can, roleLabel, updateUserPassword } from '../lib/auth.js';
import { updateOwnProfile } from '../services/users.js';
import { escapeHTML, qs, qsa, showToast } from '../lib/dom.js';
import { installImageFallback } from '../lib/image.js';
import { defineRoute, setNotFound, startRouter, navigate, updateSidebarActiveLink } from './router.js';
import { subscribe, getState, setSession, startDataStream, stopDataStream } from './store.js';
import { renderLogin } from './views/login.js';
import { renderPanel } from './views/panel.js';
import { renderRegistro } from './views/registro.js';
import { renderAsistencia } from './views/asistencia.js';
import { renderSeguimiento } from './views/seguimiento.js';
import { renderEventos } from './views/eventos.js';
import { renderAvisos } from './views/avisos.js';
import { renderAjustes } from './views/ajustes.js';
import { renderUsuarios } from './views/usuarios.js';
import { renderMarket } from './views/market.js';
import { renderOracion } from './views/oracion.js';
import { renderAuditoria } from './views/auditoria.js';
import { renderConsola } from './views/consola.js';
import { initGlobalErrorCapture } from '../lib/logger.js';
import { initPWA, installPWAApp, onPWAInstallAvailable } from '../lib/pwa.js';
import { emptyState, drawer, field, readForm, markInvalid, clearInvalid, setLoading } from './ui.js';

// Indicar inmediatamente que el script de administración ha iniciado
if (typeof window !== 'undefined') {
  window.__CLG_STARTED__ = true;
}

// Inicializar captura global de excepciones y PWA offline
initGlobalErrorCapture();
initPWA();
const getAppRoot = () => document.getElementById('clg-app') || document.getElementById('app') || qs('#clg-app') || qs('#app') || document.body;
let root = getAppRoot();

const NAV_ITEMS = [
  { path: 'panel', label: 'Resumen', icon: 'fa-gauge-high', permission: null },
  { path: 'asistencia', label: 'Registro y Asistencia', icon: 'fa-user-check', permission: 'members.write' },
  { path: 'seguimiento', label: 'Seguimiento', icon: 'fa-address-book', permission: 'members.read' },
  { path: 'eventos', label: 'Eventos', icon: 'fa-calendar-days', permission: 'events.manage' },
  { path: 'avisos', label: 'Avisos', icon: 'fa-bullhorn', permission: 'content.write' },
  { path: 'market', label: 'Love Market', icon: 'fa-store', permission: 'market.manage' },
  { path: 'oracion', label: 'Muro de Clamor', icon: 'fa-hands-praying', permission: 'prayers.reply' },
  { path: 'ajustes', label: 'Ajustes del Sitio', icon: 'fa-sliders', permission: 'content.write' },
  { path: 'usuarios', label: 'Usuarios y Roles', icon: 'fa-users-gear', permission: 'users.manage' },
  { path: 'auditoria', label: 'Auditoría', icon: 'fa-clipboard-list', permission: 'audit.view' },
  { path: 'consola', label: 'Consola Técnica Dev', icon: 'fa-terminal', permission: 'superadmin.only' }
];

defineRoute('panel', renderPanel);
defineRoute('asistencia', renderAsistencia, 'members.write');
defineRoute('registro', renderAsistencia, 'members.write');
defineRoute('seguimiento', renderSeguimiento, 'members.read');
defineRoute('eventos', renderEventos, 'events.manage');
defineRoute('avisos', renderAvisos, 'content.write');
defineRoute('market', renderMarket, 'market.manage');
defineRoute('oracion', renderOracion, 'prayers.reply');
defineRoute('ajustes', renderAjustes, 'content.write');
defineRoute('usuarios', renderUsuarios, 'users.manage');
defineRoute('auditoria', renderAuditoria, 'audit.view');
defineRoute('consola', renderConsola, 'superadmin.only');

setNotFound((container) => {
  container.innerHTML = emptyState({
    icon: 'fa-compass',
    title: 'Sección no encontrada',
    message: 'La ruta que buscas no existe en el panel.',
    action: '<button class="clg-btn clg-btn-primary" type="button" data-action="go-home"><i class="fas fa-house"></i><span>Ir al resumen</span></button>'
  });
  qs('[data-action="go-home"]', container)?.addEventListener('click', () => navigate('panel'));
});

/* --------------------------------------------------------------------------
   PANTALLAS GENERALES
   -------------------------------------------------------------------------- */
function renderBoot(message, { fatal = false } = {}) {
  if (fatal) {
    root.innerHTML = `
      <div class="clg-boot">
        <div class="clg-boot-card" style="max-width: 520px; text-align: left; padding: 32px 28px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <div style="width: 56px; height: 56px; border-radius: 16px; background: rgba(255, 107, 74, 0.12); color: #ff6b4a; display: inline-flex; align-items: center; justify-content: center; font-size: 1.6rem;">
              <i class="fas fa-triangle-exclamation"></i>
            </div>
            <h1 style="font-size: 1.4rem; margin-top: 14px; color: var(--clg-secondary);">Configuración de Firebase no encontrada</h1>
            <p style="font-size: 0.88rem; color: var(--clg-muted); margin-top: 6px;">
              ${escapeHTML(message)}
            </p>
          </div>

          <div class="clg-boot-hint" style="font-size: 0.84rem; line-height: 1.5; margin-bottom: 20px;">
            <p style="margin: 0 0 6px 0;"><strong>Diagnóstico de Conexión</strong></p>
            <p style="margin: 0;">No se pudo verificar la configuración de Firebase. Puedes ingresar las credenciales para este navegador o recargar la página.</p>
          </div>

          <div style="background: var(--clg-bg); border: 1px solid var(--clg-line); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
            <label style="display: block; font-size: 0.82rem; font-weight: 600; color: var(--clg-secondary); margin-bottom: 6px;">
              Conectar ingresando la configuración para este navegador:
            </label>
            <textarea id="clg-manual-config" class="clg-input" rows="6" style="font-family: monospace; font-size: 0.78rem; width: 100%; box-sizing: border-box; resize: vertical;">{
  "apiKey": "AIzaSyDeGyzjhjTB1IHfNZ9VYhXGh6fofOzo9mk",
  "authDomain": "comunidadlove-cbe75.firebaseapp.com",
  "projectId": "comunidadlove-cbe75",
  "messagingSenderId": "311051033862",
  "appId": "1:311051033862:web:17127d96c610a45b0f5287"
}</textarea>
            <div style="display: flex; gap: 8px; margin-top: 10px; justify-content: flex-end;">
              <button type="button" class="clg-btn clg-btn-primary" id="clg-save-config-btn" style="font-size: 0.82rem; padding: 8px 14px;">
                <i class="fas fa-plug"></i><span>Guardar y Conectar</span>
              </button>
            </div>
          </div>

          <div style="display: flex; gap: 10px; justify-content: space-between; align-items: center; border-top: 1px solid var(--clg-line); padding-top: 16px;">
            <a href="../index.html" class="clg-btn clg-btn-ghost" style="text-decoration: none; font-size: 0.84rem;">
              <i class="fas fa-arrow-left"></i><span>Volver al sitio público</span>
            </a>
            <button type="button" class="clg-btn clg-btn-ghost" onclick="location.reload()" style="font-size: 0.84rem;">
              <i class="fas fa-rotate"></i><span>Reintentar</span>
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('clg-save-config-btn')?.addEventListener('click', () => {
      const text = document.getElementById('clg-manual-config')?.value?.trim();
      if (!text) {
        showToast('Por favor pega el objeto JSON con la configuración de Firebase.', 'danger');
        return;
      }
      try {
        const parsed = JSON.parse(text);
        if (!parsed.apiKey || !parsed.projectId) {
          showToast('El JSON debe contener al menos apiKey y projectId.', 'danger');
          return;
        }
        localStorage.setItem('cl_firebase_config', JSON.stringify(parsed));
        showToast('Configuración guardada. Conectando...', 'success');
        setTimeout(() => window.location.reload(), 600);
      } catch (e) {
        showToast('El texto no es un JSON válido. Revisa llaves y comillas.', 'danger');
      }
    });

    return;
  }

  root.innerHTML = `
    <div class="clg-boot">
      <div class="clg-boot-card clg-boot-pulse">
        <div class="clg-heart-pulse-box">
          <img src="../Assets/logo-color.png" alt="Comunidad Love" class="clg-heart-pulse-logo">
        </div>
        <h1>CLGestión</h1>
        <p>${escapeHTML(message)}</p>
      </div>
    </div>
  `;
}

/**
 * Cuenta registrada pero todavía sin rol. Ahora el rol puede asignarlo un
 * Pastor (admin) además del Super Admin, así que el texto no lo personaliza.
 */
function renderNoProfile(session) {
  root.innerHTML = `
    <div class="clg-boot">
      <div class="clg-boot-card">
        <i class="fas fa-hourglass-half"></i>
        <h1>Tu cuenta está pendiente</h1>
        <p>
          <strong>${escapeHTML(session.user.displayName || session.user.email || session.user.uid)}</strong>
          ya está registrada, pero todavía no se te ha asignado un rol.
        </p>
        <p class="clg-boot-hint">
          Pídeselo a un Pastor o al Super Admin. En cuanto te lo asignen, cierras
          sesión y vuelves a entrar: tu acceso aparecerá en el resumen con las
          secciones que te correspondan.
        </p>
        <button class="clg-btn clg-btn-primary" type="button" data-action="logout">
          <i class="fas fa-right-from-bracket"></i><span>Cerrar sesión</span>
        </button>
      </div>
    </div>
  `;
  qs('[data-action="logout"]', root)?.addEventListener('click', doLogout);
}

/* --------------------------------------------------------------------------
   ESTRUCTURA DEL PANEL
   -------------------------------------------------------------------------- */
function renderShell() {
  const profile = getState().profile || {};

  const isSuper = profile.role === 'superadmin';
  const visibleNav = NAV_ITEMS.filter((item) => {
    if (item.permission === 'superadmin.only') return isSuper;
    return !item.permission || can(profile, item.permission);
  });

  root.innerHTML = `
    <div class="clg-layout">
      <aside class="clg-sidebar" id="clg-sidebar">
        <div class="clg-sidebar-brand">
          <img src="../Assets/logo-color.png" alt="Comunidad Love">
          <div>
            <strong>CLGestión</strong>
            <small>Comunidad Love</small>
          </div>
        </div>
        <nav class="clg-nav" id="clg-nav">
          ${visibleNav
            .map(
              (item) => `
            <a href="#/${item.path}" class="clg-nav-link" data-nav="${item.path}">
              <i class="fas ${item.icon}"></i><span>${escapeHTML(item.label)}</span>
            </a>`
            )
            .join('')}
        </nav>
        <div class="clg-sidebar-footer">
          <a href="../index.html" class="clg-nav-link clg-nav-link-muted">
            <i class="fas fa-globe"></i><span>Ver sitio público</span>
          </a>
          <button type="button" class="clg-nav-link clg-nav-link-danger" data-action="logout">
            <i class="fas fa-right-from-bracket"></i><span>Cerrar sesión</span>
          </button>
          <a href="https://christian-romero.vercel.app/" target="_blank" rel="noopener noreferrer" class="clg-dev-credit-link" title="Portafolio del Desarrollador">
            <i class="fas fa-code"></i>
            <span>By <strong>ChrizDev</strong> (Christian Romero)</span>
          </a>
        </div>
      </aside>

      <div class="clg-main">
        <header class="clg-topbar">
          <button class="clg-icon-btn clg-icon-btn-ghost clg-menu-toggle" type="button" data-action="toggle-sidebar" aria-label="Abrir menú">
            <i class="fas fa-bars"></i>
          </button>
          <div class="clg-topbar-spacer"></div>
          <button type="button" class="clg-btn clg-btn-sm" id="btn-install-pwa" style="display: none; background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.35); font-size: 0.78rem; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 8px; margin-right: 8px;" title="Instalar CLGestión en tu dispositivo">
            <i class="fas fa-download"></i> <span>Instalar App Localmente</span>
          </button>
          ${
            isSuper
              ? `<a href="#/consola" class="clg-btn clg-btn-sm" style="background: rgba(56, 189, 248, 0.12); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); font-size: 0.78rem; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 8px; margin-right: 8px;" title="Abrir consola de diagnóstico en vivo">
                   <i class="fas fa-terminal"></i> <span>Consola Dev</span>
                 </a>`
              : ''
          }
          <div class="clg-user-chip" style="cursor: pointer;" data-action="my-profile" title="Clic para gestionar tu perfil (${escapeHTML(profile.email || '')})">
            <span class="clg-avatar clg-avatar-sm">${escapeHTML(initials(profile.displayName || profile.email))}</span>
            <div class="clg-user-chip-text">
              <strong>${escapeHTML(profile.displayName || 'Usuario')}</strong>
              <small>${escapeHTML(roleLabel(profile.role))}</small>
            </div>
          </div>
        </header>
        <main class="clg-outlet" id="clg-outlet"></main>
      </div>
      <div class="clg-sidebar-overlay" data-action="close-sidebar"></div>
      <div id="clg-my-profile-drawer"></div>
    </div>
  `;

  const btnInstall = qs('#btn-install-pwa', root);
  onPWAInstallAvailable((canInstall) => {
    if (btnInstall) {
      btnInstall.style.display = canInstall ? 'inline-flex' : 'none';
    }
  });
  btnInstall?.addEventListener('click', installPWAApp);

  qs('[data-action="logout"]', root)?.addEventListener('click', doLogout);

  const sidebar = qs('#clg-sidebar', root);
  const toggleSidebar = () => {
    sidebar?.classList.toggle('is-open');
    sidebar?.classList.toggle('active');
    sidebar?.classList.toggle('open');
  };
  const closeSidebar = () => {
    sidebar?.classList.remove('is-open', 'active', 'open');
  };

  qs('[data-action="toggle-sidebar"]', root)?.addEventListener('click', toggleSidebar);
  qs('[data-action="close-sidebar"]', root)?.addEventListener('click', closeSidebar);
  
  // Delegación asíncrona optimizada para INP en enlaces de navegación
  root.addEventListener('click', (e) => {
    if (e.target.closest('.clg-nav-link')) {
      requestAnimationFrame(() => closeSidebar());
    }
  }, { passive: true });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSidebar();
  });

  qs('[data-action="my-profile"]', root)?.addEventListener('click', () => {
    openMyProfileModal(profile);
  });

  syncActiveNav();
  startRouter(qs('#clg-outlet', root), syncActiveNav);
}

function openMyProfileModal(profile) {
  const host = qs('#clg-my-profile-drawer', root);
  if (!host) return;

  const body = `
    <form id="clg-my-profile-form" class="clg-form" autocomplete="off" novalidate>
      <div class="clg-drawer-profile" style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; padding: 1rem; background: var(--clg-surface-2, #1e293b); border-radius: var(--clg-radius-md, 8px);">
        <span class="clg-avatar" style="width: 48px; height: 48px; font-size: 1.25rem;">${escapeHTML(initials(profile.displayName || profile.email))}</span>
        <div>
          <div style="font-weight: 700; font-size: 1rem; color: var(--clg-text, #f8fafc);">${escapeHTML(profile.email || '')}</div>
          <span class="clg-badge clg-badge-primary" style="margin-top: 0.25rem; display: inline-block;">${escapeHTML(roleLabel(profile.role))}</span>
        </div>
      </div>

      <section class="clg-form-section">
        <h3 class="clg-section-title"><i class="fas fa-id-card"></i> Datos personales</h3>
        ${field({
          key: 'fullName',
          label: 'Nombre completo',
          value: profile.displayName || '',
          required: true,
          icon: 'fa-user',
          placeholder: 'Ej. Christian Romero'
        })}
      </section>

      <section class="clg-form-section" style="margin-top: 1.5rem;">
        <h3 class="clg-section-title"><i class="fas fa-shield-halved"></i> Seguridad y Contraseña</h3>
        <p class="clg-hint" style="margin-bottom: 0.75rem;">Si no deseas cambiar tu contraseña, deja estos campos en blanco.</p>
        ${field({
          key: 'newPassword',
          label: 'Nueva contraseña',
          type: 'password',
          icon: 'fa-lock',
          placeholder: 'Mínimo 6 caracteres'
        })}
        ${field({
          key: 'confirmPassword',
          label: 'Confirmar nueva contraseña',
          type: 'password',
          icon: 'fa-lock',
          placeholder: 'Repite la nueva contraseña'
        })}
      </section>

      <div class="clg-drawer-actions" style="margin-top: 2rem; display: flex; justify-content: flex-end; gap: 0.75rem;">
        <button type="button" class="clg-btn clg-btn-ghost" data-close-drawer="clg-profile-drawer">Cancelar</button>
        <button type="submit" class="clg-btn clg-btn-primary">
          <i class="fas fa-floppy-disk"></i><span>Guardar cambios</span>
        </button>
      </div>
    </form>
  `;

  host.innerHTML = drawer({
    id: 'clg-profile-drawer',
    title: 'Mi Perfil de Usuario',
    body
  });

  const form = qs('#clg-my-profile-form', host);
  const overlay = host.querySelector('.clg-drawer-overlay');
  qs('#clg-profile-drawer', host)?.classList.add('is-open');

  const closeDrawer = () => {
    qs('#clg-profile-drawer', host)?.classList.remove('is-open');
    host.innerHTML = '';
  };

  host.querySelectorAll('[data-close-drawer]').forEach((btn) => {
    btn.addEventListener('click', closeDrawer);
  });
  overlay?.addEventListener('click', closeDrawer);

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearInvalid(form);
    const data = readForm(form);

    if (!data.fullName || data.fullName.length < 3) {
      markInvalid(form, 'Ingresa un nombre completo válido (mínimo 3 caracteres).');
      return;
    }

    if (data.newPassword || data.confirmPassword) {
      if (data.newPassword.length < 6) {
        markInvalid(form, 'La nueva contraseña debe tener al menos 6 caracteres.');
        return;
      }
      if (data.newPassword !== data.confirmPassword) {
        markInvalid(form, 'Las contraseñas ingresadas no coinciden.');
        return;
      }
    }

    setLoading(form, true, 'Actualizando…');

    try {
      if (data.fullName !== profile.displayName) {
        await updateOwnProfile({ fullName: data.fullName });
        profile.displayName = data.fullName;
        const currentProfile = getState().profile;
        if (currentProfile) currentProfile.displayName = data.fullName;

        const chip = qs('.clg-user-chip-text', root);
        if (chip) chip.querySelector('strong').textContent = data.fullName;
        const avatar = qs('.clg-user-chip .clg-avatar', root);
        if (avatar) avatar.textContent = initials(data.fullName);
      }

      if (data.newPassword) {
        await updateUserPassword(data.newPassword);
      }

      showToast('Perfil actualizado correctamente.', 'success');
      closeDrawer();
    } catch (err) {
      console.error('[CL] Error al actualizar perfil:', err);
      let msg = err.message || 'No se pudo actualizar el perfil.';
      if (err.code === 'auth/requires-recent-login') {
        msg = 'Por seguridad, debes cerrar sesión e iniciarla nuevamente para cambiar tu contraseña.';
      }
      markInvalid(form, msg);
    } finally {
      setLoading(form, false);
    }
  });
}

function syncActiveNav() {
  const active = document.body.dataset.clgRoute;
  if (active) {
    updateSidebarActiveLink(active);
  } else {
    qsa('[data-nav]', root).forEach((link) => {
      link.classList.remove('active', 'is-active');
    });
  }
}

function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || '')
    .join('')
    .toUpperCase();
}

async function doLogout() {
  try {
    await signOut();
    stopDataStream();
    showToast('Sesión cerrada.', 'info');
  } catch (error) {
    console.warn('[CL] Error al cerrar sesión:', error);
    showToast('No se pudo cerrar la sesión.', 'error');
  }
}

/* --------------------------------------------------------------------------
   ARRANQUE Y CICLO DE VIDA DEL PANEL
   -------------------------------------------------------------------------- */
export async function startAdminRouter() {
  root = getAppRoot();
  try {
    installImageFallback(document);

    if (!firebaseReady) {
      renderBoot(configError || 'No se pudo conectar a Firebase.', { fatal: true });
      return;
    }

    renderBoot('Verificando sesión…');

    // Salvaguarda: si Firebase Auth tarda más de 3.5s (ej. red lenta o primera sincronización de caché),
    // pintar preventivamente la vista de login para evitar bloqueos perceptuales.
    let sessionSettled = false;
    const sessionTimer = setTimeout(() => {
      if (!sessionSettled && !getState().session?.user) {
        console.warn('[CLGestión] Verificación de sesión lenta; renderizando login preventivamente.');
        setSession(null, null);
        stopDataStream();
        renderLogin(root);
      }
    }, 3500);

    watchSession((session) => {
      sessionSettled = true;
      clearTimeout(sessionTimer);

      if (!session) {
        setSession(null, null);
        stopDataStream();
        renderLogin(root);
        return;
      }

      if (session.pending) return;

      if (session.profile?.error) {
        renderBoot('No se pudo verificar tu rol. Revisa las reglas de Firestore y tu sesión.', { fatal: true });
        return;
      }

      if (!session.profile?.role) {
        setSession(session.user, null);
        renderNoProfile(session);
        return;
      }

      setSession(session.user, session.profile);

      if (!root.querySelector('.clg-layout')) {
        renderShell();
      }
      startDataStream();
      syncActiveNav();
    });

    // Mantiene el menú lateral sincronizado con la ruta activa.
    subscribe(['session'], () => {
      if (root.querySelector('.clg-layout')) {
        syncActiveNav();
        const chip = qs('.clg-user-chip-text', root);
        const profile = getState().profile;
        if (chip && profile) {
          chip.querySelector('strong').textContent = profile.displayName || 'Usuario';
          chip.querySelector('small').textContent = roleLabel(profile.role);
        }
      }
    });
  } catch (err) {
    console.error('[CLGestión] Error crítico al arrancar:', err);
    const app = document.getElementById('app') || document.getElementById('clg-app') || root;
    if (app) {
      app.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:2rem;text-align:center;font-family:sans-serif;">
          <div style="font-size:2.5rem;margin-bottom:1rem;">⚠️</div>
          <h2 style="margin:0 0 0.5rem;color:#1e293b;">Error al iniciar CLGestión</h2>
          <p style="color:#64748b;max-width:400px;margin-bottom:1.5rem;">${escapeHTML(err?.message || 'Error de conexión')}</p>
          <button onclick="location.reload()" style="background:#f97316;color:#fff;border:none;padding:0.75rem 1.5rem;border-radius:8px;font-weight:600;cursor:pointer;">Reintentar</button>
        </div>
      `;
    }
  }
}

export const initApp = startAdminRouter;
export const boot = startAdminRouter;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      await startAdminRouter();
    } catch (err) {
      console.error('[CLGestión] Error crítico al arrancar:', err);
    }
  }, { once: true });
} else {
  startAdminRouter();
}
