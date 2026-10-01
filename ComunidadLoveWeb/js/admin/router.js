/* ==========================================================================
   ROUTER DEL PANEL (hash routing: /admin/#/registro)
   ========================================================================== */

import { can, roleLabel } from '../lib/auth.js';
import { escapeHTML } from '../lib/dom.js';
import { getState } from './store.js';

const routes = new Map();
let notFound = null;
let currentCleanup = null;
let outlet = null;
let activeRoute = '';

// Se evalúa el PERFIL completo, no sólo el rol: así una función delegada se
// respeta igual que el acceso heredado del rol.
const getProfile = () => getState().profile || null;

/**
 * Registra una vista. `permission` es una clave de PERMISSIONS; si el usuario no
 * cumple el nivel mínimo se muestra un aviso en vez de la vista, de modo que
 * escribir la URL a mano no permite saltarse el control de acceso.
 */
export function defineRoute(path, view, permission = null) {
  routes.set(path, { view, permission });
}

export function setNotFound(view) {
  notFound = view;
}

function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [path, queryString = ''] = raw.split('?');
  return { path: path || 'panel', params: new URLSearchParams(queryString) };
}

export function navigate(path) {
  const target = `#/${String(path).replace(/^#?\/?/, '')}`;
  if (window.location.hash === target) {
    resolve();
  } else {
    window.location.hash = target;
  }
}

export function currentPath() {
  return parseHash().path;
}

async function render(path, params) {
  if (!outlet) return;
  const entry = routes.get(path);
  const view = entry ? entry.view : notFound;
  if (!view) return;

  if (typeof currentCleanup === 'function') {
    try {
      currentCleanup();
    } catch (error) {
      console.warn('[CL] Error limpiando la vista anterior:', error);
    }
  }
  currentCleanup = null;
  outlet.innerHTML = '';
  activeRoute = path;
  document.body.dataset.clgRoute = path;

  const profile = getProfile();
  const isSuperOnly = entry && entry.permission === 'superadmin.only';
  const hasAccess = isSuperOnly
    ? profile?.role === 'superadmin'
    : (!entry || !entry.permission || can(profile, entry.permission));

  if (!hasAccess) {
    outlet.innerHTML = `
      <div class="clg-error-state">
        <i class="fas fa-lock"></i>
        <h2>No tienes acceso a esta sección</h2>
        <p>Esta sección es de diagnóstico avanzado y solo está disponible para el <strong>Super Admin</strong> de la plataforma.</p>
        <button class="clg-btn clg-btn-primary" type="button" data-route-home>
          <i class="fas fa-house"></i><span>Ir al resumen</span>
        </button>
      </div>
    `;
    outlet.querySelector('[data-route-home]')?.addEventListener('click', () => navigate('panel'));
    return;
  }

  try {
    currentCleanup = await view(outlet, { params });
  } catch (error) {
    console.error(`[CL] Error renderizando la vista "${path}":`, error);
    outlet.innerHTML = `
      <div class="clg-error-state">
        <i class="fas fa-triangle-exclamation"></i>
        <h2>No pudimos cargar esta sección</h2>
        <p>${escapeHTML((error && error.message) || 'Ocurrió un error inesperado.')}</p>
        <button class="clg-btn clg-btn-primary" type="button" data-route-retry>
          <i class="fas fa-rotate-right"></i> Reintentar
        </button>
      </div>
    `;
    outlet.querySelector('[data-route-retry]')?.addEventListener('click', () => {
      const current = parseHash();
      render(current.path, current.params);
    });
  }
}

function resolve() {
  const { path, params } = parseHash();
  render(path, params);
}

export function startRouter(element, onChange) {
  outlet = element;
  const handler = () => {
    resolve();
    if (typeof onChange === 'function') onChange(currentPath());
  };
  window.addEventListener('hashchange', handler);
  if (!window.location.hash) {
    window.location.replace(`${window.location.pathname}${window.location.search}#/panel`);
  }
  resolve();
  if (typeof onChange === 'function') onChange(currentPath());
  return () => window.removeEventListener('hashchange', handler);
}

export function routeIsActive(path) {
  return activeRoute === path;
}
