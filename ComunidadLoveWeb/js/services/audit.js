/* ==========================================================================
   SERVICIO: AUDITORÍA (audit_logs)
   --------------------------------------------------------------------------
   Registra las acciones relevantes del equipo: altas, ediciones y bajas de
   miembros, respuestas de oración, cambios en eventos y productos, y cambios
   de roles.

   Reglas de privacidad:
   - Las acciones del SUPER ADMIN no se guardan. Son la operación ordinaria
     de quien administra el sistema y ensuciarían el registro sin aportar
     trazabilidad útil. Esto también evita exponer las decisiones del
     propietario de la cuenta.
   - La colección sólo la leen el superadmin, el pastor (admin) y quien tenga
     delegada la función `audit:view` (lo ejecutan `firestore.rules`).

   La escritura es best-effort a propósito: que falle el log NO debe impedir
   completar la operación de negocio que el usuario pidió.
   ========================================================================== */

import { addDoc, collection, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { db, requireService } from '../firebase.js';

const COLLECTION = 'audit_logs';

/** Módulos reconocidos. Se usan como filtro en la vista de auditoría. */
export const AUDIT_MODULES = [
  'members',
  'prayers',
  'events',
  'market',
  'users',
  'settings',
  'system'
];

export const AUDIT_MODULE_LABELS = {
  members: 'Miembros',
  prayers: 'Oración',
  events: 'Eventos',
  market: 'Love Market',
  users: 'Usuarios y Roles',
  settings: 'Ajustes',
  system: 'Sistema'
};

const ACTION_TONES = {
  create: 'success',
  update: 'info',
  delete: 'danger',
  reply: 'primary',
  grant: 'warning'
};

export function auditActionTone(action) {
  return ACTION_TONES[String(action || '').split('.')[0]] || 'neutral';
}

function decorate(id, data) {
  return {
    id,
    timestamp: data.timestamp || null,
    userId: data.userId || '',
    userEmail: data.userEmail || '',
    userName: data.userName || '',
    action: data.action || '',
    module: data.module || 'system',
    details: data.details || {}
  };
}

/**
 * Escribe una entrada de auditoría.
 *
 * @param {object} entry
 * @param {object} actor   Perfil de quien ejecuta: { role, displayName, email, uid }
 * @param {string} entry.action   p. ej. 'members.create', 'users.role.change'
 * @param {string} entry.module   una de AUDIT_MODULES
 * @param {object} entry.details  datos adicionales (sin datos sensibles de miembros)
 * @returns {Promise<string|null>} id de la entrada, o null si no se registró
 */
export async function logAudit({ actor, action, module: moduleName, details = {} }) {
  try {
    // El superadmin no deja rastro en la auditoría visible.
    if (!actor || actor.role === 'superadmin') return null;
    if (!action) return null;

    requireService(db, 'Firestore');
    const ref = await addDoc(collection(db, COLLECTION), {
      timestamp: serverTimestamp(),
      userId: actor.uid || '',
      userEmail: actor.email || '',
      userName: actor.displayName || '',
      action: String(action),
      module: AUDIT_MODULES.includes(moduleName) ? moduleName : 'system',
      details: sanitizeDetails(details)
    });
    return ref.id;
  } catch (error) {
    // Best-effort: un fallo de auditoría no debe tumbar la acción de negocio.
    console.warn('[CL] No se pudo registrar la auditoría:', error);
    return null;
  }
}

/**
 * Filtra los detalles antes de guardarlos. Los campos marcados como sensibles
 * se guardan como '[omitido]': la auditoría es para trazar QUÉ pasó, no para
 * duplicar la ficha del miembro.
 */
const REDACTED_KEYS = ['phone', 'address', 'email', 'notesPrivate', 'birthDate', 'documentId'];

function sanitizeDetails(details) {
  const out = {};
  if (!details || typeof details !== 'object') return out;
  Object.entries(details).forEach(([key, value]) => {
    if (REDACTED_KEYS.includes(key)) {
      out[key] = '[omitido]';
      return;
    }
    if (value === null || value === undefined) return;
    const type = typeof value;
    if (type === 'string' || type === 'number' || type === 'boolean') {
      out[key] = type === 'string' ? value.slice(0, 300) : value;
      return;
    }
    // Arrays y objetos se recortan para no inflar el documento. No se puede
    // recortar el JSON serializado: cortar a mitad produce texto invalido y
    // el try/catch terminaba devolviendo '[no serializable]' para cualquier
    // detalle anidado un poco grande. Se limita la profundidad y el tamaño.
    out[key] = clipValue(value, 0);
  });
  return out;
}

const MAX_DEPTH = 4;

function clipValue(value, depth) {
  if (depth > MAX_DEPTH) return '[…]';
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.slice(0, 300);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => clipValue(item, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const out = {};
    Object.entries(value)
      .slice(0, 20)
      .forEach(([key, item]) => {
        out[key] = REDACTED_KEYS.includes(key) ? '[omitido]' : clipValue(item, depth + 1);
      });
    return out;
  }
  return '[no serializable]';
}

/** Suscripción en tiempo real a las entradas más recientes (excluye Super Admin). */
export function watchAudit(limitCount = 200, callback, onError) {
  try {
    return onSnapshot(
      query(collection(db, COLLECTION), orderBy('timestamp', 'desc'), limit(limitCount)),
      (snapshot) => {
        const logs = snapshot.docs
          .map((d) => decorate(d.id, d.data()))
          .filter((l) => !l.userEmail?.toLowerCase().includes('chrispasena') && l.details?.role !== 'superadmin');
        callback(logs);
      },
      (error) => {
        console.warn('[CL] Error en tiempo real de auditoría:', error);
        if (onError) onError(error);
        callback([]);
      }
    );
  } catch (error) {
    console.warn('[CL] No se pudo suscribir a la auditoría:', error);
    if (onError) onError(error);
    callback([]);
    return () => {};
  }
}

/** Consulta puntual, usada por el botón "Exportar". */
export async function listAudit(limitCount = 500) {
  try {
    const snapshot = await getDocs(
      query(collection(db, COLLECTION), orderBy('timestamp', 'desc'), limit(limitCount))
    );
    return snapshot.docs
      .map((d) => decorate(d.id, d.data()))
      .filter((l) => !l.userEmail?.toLowerCase().includes('chrispasena') && l.details?.role !== 'superadmin');
  } catch (error) {
    console.warn('[CL] No se pudo listar la auditoría:', error);
    return [];
  }
}