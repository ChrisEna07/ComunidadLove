/* ==========================================================================
   ALMACÉN COMPARTIDO DEL PANEL CLGESTIÓN
   Centraliza una única suscripción en tiempo real por colección y notifica
   a las vistas suscritas. Evita abrir un listener por cada vista.
   ========================================================================== */

import { watchMembers } from '../services/members.js';
import { watchEvents } from '../services/events.js';
import { watchAnnouncements } from '../services/announcements.js';
import { watchSettings } from '../services/site.js';
import { watchUsers, watchTeam } from '../services/users.js';
import { watchProducts } from '../services/market.js';
import { watchAllPrayers } from '../services/prayers.js';
import { watchAudit } from '../services/audit.js';
import { firebaseReady } from '../firebase.js';
import { can } from '../lib/roles.js';
import {
  DEFAULT_MARKET_PRODUCTS,
  DEFAULT_EVENTS,
  DEFAULT_ANNOUNCEMENTS
} from '../services/seed.js';

const state = {
  ready: false,
  session: null,
  profile: null,
  members: [],
  events: [],
  activeEvents: [],
  announcements: [],
  users: [],
  team: [],
  products: [],
  activeProducts: [],
  prayers: [],
  auditLogs: [],
  settings: null,
  settingsExists: false
};

const listeners = new Map();
let unsubs = [];
let started = false;

function emit(keys) {
  const notified = new Set();
  keys.forEach((key) => {
    (listeners.get(key) || []).forEach((fn) => {
      if (notified.has(fn)) return;
      notified.add(fn);
      try {
        fn(state);
      } catch (error) {
        console.error(`[CL] Error en un suscriptor de "${key}":`, error);
      }
    });
  });
}

export function getState() {
  return state;
}

/** Suscribe `fn` a una o varias claves. Devuelve la función para cancelar. */
export function subscribe(keys, fn) {
  const list = Array.isArray(keys) ? keys : [keys];
  list.forEach((key) => {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(fn);
  });
  fn(state);
  return () => list.forEach((key) => listeners.get(key)?.delete(fn));
}

export function setSession(session, profile) {
  state.session = session;
  state.profile = profile;
  emit(['session', 'profile']);
}

export function removeLocalEntity(key, id) {
  if (Array.isArray(state[key])) {
    state[key] = state[key].filter((item) => item.id !== id);
    if (key === 'products') {
      state.activeProducts = (state.activeProducts || []).filter((item) => item.id !== id);
      emit(['products', 'activeProducts']);
    } else if (key === 'events') {
      state.activeEvents = (state.activeEvents || []).filter((item) => item.id !== id);
      emit(['events', 'activeEvents']);
    } else {
      emit([key]);
    }
  }
}

/**
 * Arranca los listeners de datos. Es idempotente.
 *
 * Cada listener se abre sólo si el usuario puede leer esa colección: abrirlo
 * sin permiso sólo genera rechazos y ruido en la consola, y `audit_logs` está
 * deliberadamente restringida.
 */
export function startDataStream() {
  if (started || !firebaseReady) return;
  started = true;

  const me = state.profile || {};
  const allowed = (permission) => can(me, permission);

  const listeners = [
    // Contenido público: cualquiera con sesión activa puede leerlo.
    ['members', () => watchMembers((members) => {
      state.members = members;
      emit(['members']);
    }), allowed('members.read')],

    ['events', () => watchEvents(({ all, active }) => {
      const fallbackEvents = DEFAULT_EVENTS.map((e, idx) => ({ ...e, id: `seed-evt-${idx}`, isFallback: true }));
      state.events = all.length ? all : fallbackEvents;
      state.activeEvents = active.length ? active : fallbackEvents.filter((e) => e.isActive !== false);
      emit(['activeEvents', 'events']);
    }), true],

    ['announcements', () => watchAnnouncements((list) => {
      const fallbackAnn = DEFAULT_ANNOUNCEMENTS.map((a, idx) => ({ ...a, id: `seed-ann-${idx}`, isFallback: true }));
      state.announcements = list.length ? list : fallbackAnn;
      emit(['announcements']);
    }), true],

    ['settings', () => watchSettings((settings, exists) => {
      state.settings = settings;
      state.settingsExists = exists;
      emit(['settings']);
    }), true],

    ['team', () => watchTeam((team) => {
      state.team = team;
      emit(['team']);
    }), true],

    ['market', () => watchProducts(({ all, active }) => {
      const fallbackProd = DEFAULT_MARKET_PRODUCTS.map((p, idx) => ({ ...p, id: `seed-prod-${idx}`, isFallback: true }));
      state.products = all.length ? all : fallbackProd;
      state.activeProducts = active.length ? active : fallbackProd.filter((p) => p.isActive !== false);
      emit(['products', 'activeProducts']);
    }), true],

    // Peticiones: el equipo las gestiona; el muro público va aparte.
    ['prayers', () => watchAllPrayers((list) => {
      state.prayers = list;
      emit(['prayers']);
    }), allowed('prayers.reply')],

    // Gestión de usuarios: la tienen superadmin y pastor (admin).
    ['users', () => watchUsers((users) => {
      state.users = users;
      emit(['users']);
    }), allowed('users.manage')],

    // Auditoría: superadmin, pastor o quien tenga `audit:view` delegada.
    ['audit', () => watchAudit(300, (logs) => {
      state.auditLogs = logs;
      emit(['auditLogs']);
    }), allowed('audit.view')]
  ];

  unsubs = listeners
    .filter(([, factory, isAllowed]) => isAllowed)
    .map(([, factory]) => {
      try {
        return factory();
      } catch (error) {
        console.error('[CL] No se pudo abrir un listener:', error);
        return () => {};
      }
    });

  state.ready = true;
  emit(['ready']);
}

export function stopDataStream() {
  unsubs.forEach((unsub) => {
    try {
      if (typeof unsub === 'function') unsub();
    } catch (error) {
      console.warn('[CL] Error cerrando un listener:', error);
    }
  });
  unsubs = [];
  started = false;
  state.members = [];
  state.events = [];
  state.activeEvents = [];
  state.announcements = [];
  state.users = [];
  state.team = [];
  state.products = [];
  state.activeProducts = [];
  state.prayers = [];
  state.auditLogs = [];
  state.ready = false;
}

/** Líderes disponibles para asignar miembros (colección `team`). */
export function leaders() {
  return (state.team || []).filter((l) => l.role !== 'superadmin');
}