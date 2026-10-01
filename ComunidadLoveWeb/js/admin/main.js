/* ==========================================================================
   CLGESTIÓN - PUNTO DE ENTRADA DEL PANEL ADMINISTRATIVO
   ========================================================================== */

import { firebaseReady, configError } from '../firebase.js';
import { watchSession, signOut, can, roleLabel } from '../lib/auth.js';
import { escapeHTML, qs, qsa, showToast } from '../lib/dom.js';
import { installImageFallback } from '../lib/image.js';
import { defineRoute, setNotFound, startRouter, navigate } from './router.js';
import { subscribe, getState, setSession, startDataStream, stopDataStream } from './store.js';
import { renderLogin } from './views/login.js';
import { renderPanel } from './views/panel.js';
import { renderRegistro } from './views/registro.js';
import { renderSeguimiento } from './views/seguimiento.js';
import { renderEventos } from './views/eventos.js';
import { renderAvisos } from './views/avisos.js';
import { renderAjustes } from './views/ajustes.js';
import { renderUsuarios } from './views/usuarios.js';
import { renderMarket } from './views/market.js';
import { renderOracion } from './views/oracion.js';
import { renderAuditoria } from './views/auditoria.js';
import { emptyState } from './ui.js';

const root = qs('#clg-app');

const NAV_ITEMS = [
  { path: 'panel', label: 'Resumen', icon: 'fa-gauge-high', permission: null },
  { path: 'registro', label: 'Registro y Asistencia', icon: 'fa-user-plus', permission: 'members.write' },
  { path: 'seguimiento', label: 'Seguimiento', icon: 'fa-address-book', permission: 'members.read' },
  { path: 'eventos', label: 'Eventos', icon: 'fa-calendar-days', permission: 'events.manage' },
  { path: 'avisos', label: 'Avisos', icon: 'fa-bullhorn', permission: 'content.write' },
  { path: 'market', label: 'Love Market', icon: 'fa-store', permission: 'market.manage' },
  { path: 'oracion', label: 'Muro de Clamor', icon: 'fa-hands-praying', permission: 'prayers.reply' },
  { path: 'ajustes', label: 'Ajustes del Sitio', icon: 'fa-sliders', permission: 'content.write' },
  { path: 'usuarios', label: 'Usuarios y Roles', icon: 'fa-users-gear', permission: 'users.manage' },
  { path: 'auditoria', label: 'Auditoría', icon: 'fa-clipboard-list', permission: 'audit.view' }
];

defineRoute('panel', renderPanel);
defineRoute('registro', renderRegistro, 'members.write');
defineRoute('seguimiento', renderSeguimiento, 'members.read');
defineRoute('eventos', renderEventos, 'events.manage');
defineRoute('avisos', renderAvisos, 'content.write');
defineRoute('market', renderMarket, 'market.manage');
defineRoute('oracion', renderOracion, 'prayers.reply');
defineRoute('ajustes', renderAjustes, 'content.write');
defineRoute('usuarios', renderUsuarios, 'users.manage');
defineRoute('auditoria', renderAuditoria, 'audit.view');

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
            <p style="margin: 0 0 6px 0;"><strong>¿Por qué ocurre esto?</strong></p>
            <p style="margin: 0;">Por seguridad, el archivo <code>js/firebase-config.js</code> está protegido en <code>.gitignore</code> para evitar exponer credenciales en repositorios públicos. Al desplegar en Vercel, este archivo no se sube automáticamente.</p>
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
      <div class="clg-boot-card">
        <i class="fas fa-circle-notch fa-spin"></i>
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
          ${NAV_ITEMS.filter((item) => !item.permission || can(profile, item.permission))
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
        </div>
      </aside>

      <div class="clg-main">
        <header class="clg-topbar">
          <button class="clg-icon-btn clg-icon-btn-ghost clg-menu-toggle" type="button" data-action="toggle-sidebar" aria-label="Abrir menú">
            <i class="fas fa-bars"></i>
          </button>
          <div class="clg-topbar-spacer"></div>
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
    </div>
  `;

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
  qsa('.clg-nav-link', root).forEach((link) => {
    link.addEventListener('click', closeSidebar);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSidebar();
  });

  qs('[data-action="my-profile"]', root)?.addEventListener('click', () => {
    navigate('usuarios');
  });

  syncActiveNav();
  startRouter(qs('#clg-outlet', root), syncActiveNav);
}

function syncActiveNav() {
  const active = document.body.dataset.clgRoute;
  qsa('[data-nav]', root).forEach((link) => {
    link.classList.toggle('is-active', link.dataset.nav === active);
  });
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
   ARRANQUE
   -------------------------------------------------------------------------- */
function boot() {
  installImageFallback(document);

  if (!firebaseReady) {
    renderBoot(configError, { fatal: true });
    return;
  }

  renderBoot('Verificando sesión…');

  watchSession((session) => {
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
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
