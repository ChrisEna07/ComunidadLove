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
  root.innerHTML = `
    <div class="clg-boot">
      <div class="clg-boot-card">
        <i class="fas ${fatal ? 'fa-plug-circle-xmark' : 'fa-circle-notch fa-spin'}"></i>
        <h1>CLGestión</h1>
        <p>${escapeHTML(message)}</p>
        ${fatal ? '<p class="clg-boot-hint">Revisa el archivo <code>js/firebase-config.js</code> y vuelve a cargar la página.</p>' : ''}
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
