/* ==========================================================================
   SERVICIO: ORACIÓN Y MURO DE CLAMOR (prayers)
   --------------------------------------------------------------------------
   Cambios de modelo respecto a la versión anterior (que vivía en localStorage
   y permitía responder desde la web pública):

   - Las peticiones viven en Firestore, así el equipo las responde de verdad.
   - El visitante YA NO puede responder. Sólo el equipo lo hace desde el panel
     y la respuesta sale con insignia verificada.
   - El visitante sí puede "reaccionar" con cuatro emociones cristianas
     predefinidas. Las reacciones son la única escritura pública.

   Reacciones: subcolección `prayers/{prayerId}/reactions/{docId}`.
   Cada reacción es un documento con identificador aleatorio generado en el
   navegador, guardado en localStorage para que el visitante pueda quitar la
   suya. Se elige una subcolección y no contadores en el documento padre porque
   un contador compartido exigiría permisos de escritura sobre el documento
   completo, lo que permitiría a un visitante alterar nombre o texto de la
   petición.
   ========================================================================== */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { db, requireService } from '../firebase.js';
import { toDate, parseDate } from '../lib/dates.js';

import { contienePalabrasObscenas } from '../lib/text.js';

const COLLECTION = 'prayers';
const REACTIONS_SUBCOLLECTION = 'reactions';
const VISITOR_KEY = 'cl_prayer_visitor';

/* --------------------------------------------------------------------------
   REACCIONES CRISTIANAS
   -------------------------------------------------------------------------- */
export const REACTIONS = [
  { kind: 'praying', emoji: '🙏', label: 'Me uno en oración' },
  { kind: 'love', emoji: '❤️', label: 'Amor de Dios' },
  { kind: 'blessed', emoji: '🙌', label: 'Me siento bendecido' },
  { kind: 'faith', emoji: '🔥', label: 'Fuego y Fe' }
];

export const REACTION_KINDS = REACTIONS.map((r) => r.kind);

const REACTION_BY_KIND = REACTIONS.reduce((acc, r) => {
  acc[r.kind] = r;
  return acc;
}, {});

export function reactionMeta(kind) {
  return REACTION_BY_KIND[kind] || null;
}

/**
 * Identidad estable y anónimo del visitante. Se usa para construir el id del
 * documento de reacción (`<tipo>_<visitante>`), de forma que añadir y quitar la
 * misma reacción sea siempre la misma clave y no se acumulen duplicados.
 */
export function visitorId() {
  try {
    const stored = localStorage.getItem(VISITOR_KEY);
    if (stored) return stored;
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    // Sin localStorage (modo privado) cada carga cuenta como un visitante
    // distinto: se pierde el "quitar", no la capacidad de reaccionar.
    // Se escribe en hexadecimal porque `firestore.rules` exige que el id de la
    // reacción sea `<tipo>_<hex>`: cualquier otro carácter sería denegado.
    return Date.now().toString(16);
  }
}

export function reactionDocId(kind, visitor = visitorId()) {
  return `${kind}_${visitor}`;
}

/* --------------------------------------------------------------------------
   INSIGNIAS DE RESPUESTA VERIFICADA (Exclusiva del Equipo Pastoral)
   -------------------------------------------------------------------------- */
export const RESPONSE_BADGES = {
  admin: { label: 'Respuesta del Equipo Pastoral', tone: 'primary', icon: 'fa-church' },
  webmaster: { label: 'Respuesta del Equipo Pastoral', tone: 'primary', icon: 'fa-church' },
  servidor: { label: 'Respuesta del Equipo Pastoral', tone: 'primary', icon: 'fa-church' },
  superadmin: { label: 'Respuesta del Equipo Pastoral', tone: 'primary', icon: 'fa-church' }
};

export function responseBadge(role) {
  return RESPONSE_BADGES[role] || RESPONSE_BADGES.admin;
}

export const PRAYER_TYPES = [
  { value: 'petición', label: 'Petición de Oración' },
  { value: 'inquietud', label: 'Inquietud / Pregunta' }
];

export const PRAYER_STATUSES = [
  { value: 'abierta', label: 'Abierta' },
  { value: 'atendida', label: 'Atendida' },
  { value: 'archivada', label: 'Archivada' }
];

const STATUS_TONES = { abierta: 'news', atendida: 'success', archivada: 'neutral' };

export function statusLabel(status) {
  const found = PRAYER_STATUSES.find((s) => s.value === status);
  return found ? found.label : 'Abierta';
}

export function statusTone(status) {
  return STATUS_TONES[status] || 'neutral';
}

function emptyReactions() {
  return REACTIONS.reduce((acc, r) => {
    acc[r.kind] = 0;
    return acc;
  }, {});
}

function decorate(id, data) {
  const counts = { ...emptyReactions(), ...(data.reactions || {}) };
  const rawType = String(data.type || data.category || 'petición').toLowerCase();
  const isQuestion = rawType === 'inquietud' || rawType === 'pregunta';
  return {
    id,
    name: data.name || 'Anónimo',
    text: data.text || '',
    type: isQuestion ? 'inquietud' : 'petición',
    category: isQuestion ? 'inquietud' : 'oracion',
    status: data.status || 'abierta',
    isPublic: data.isPublic !== false,
    replies: Array.isArray(data.replies) ? data.replies : [],
    reactions: counts,
    totalReactions: REACTIONS.reduce((sum, r) => sum + (counts[r.kind] || 0), 0),
    createdAt: data.createdAt ? parseDate(data.createdAt) : new Date(),
    respondedAt: data.respondedAt ? parseDate(data.respondedAt) : null
  };
}

/* --------------------------------------------------------------------------
   LECTURA
   -------------------------------------------------------------------------- */

/**
 * Muro público: sólo peticiones visibles al público y no archivadas.
 * El listener entrega el documento completo; las reacciones se cargan aparte
 * para no multiplicar los oyentes por cada tarjeta.
 */
export function watchPublicPrayers(callback, onError) {
  try {
    return onSnapshot(
      query(collection(db, COLLECTION), where('isPublic', '==', true)),
      (snapshot) => {
        const list = snapshot.docs
          .map((d) => decorate(d.id, d.data()))
          .filter((p) => p.status !== 'archivada')
          .sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0));
        callback(list);
      },
      (error) => {
        console.warn('[CL] Error en tiempo real de peticiones:', error);
        if (onError) onError(error);
        callback([]);
      }
    );
  } catch (error) {
    console.warn('[CL] No se pudo suscribir a las peticiones:', error);
    if (onError) onError(error);
    callback([]);
    return () => {};
  }
}

/** Panel: todas las peticiones, incluidas las archivadas. */
export function watchAllPrayers(callback, onError) {
  try {
    return onSnapshot(
      query(collection(db, COLLECTION), orderBy('createdAt', 'desc')),
      (snapshot) => callback(snapshot.docs.map((d) => decorate(d.id, d.data()))),
      (error) => {
        console.warn('[CL] Error en tiempo real de peticiones (panel):', error);
        if (onError) onError(error);
        callback([]);
      }
    );
  } catch (error) {
    console.warn('[CL] No se pudo suscribir a las peticiones (panel):', error);
    if (onError) onError(error);
    callback([]);
    return () => {};
  }
}

/**
 * Reacciones de una tarjeta concreta. Se suscribe sólo a las que el visitante
 * ya ha hecho, y para el total se usa un oyente agregado por tipo.
 */
export function watchReactions(prayerId, callback, onError) {
  try {
    return onSnapshot(
      collection(db, COLLECTION, prayerId, REACTIONS_SUBCOLLECTION),
      (snapshot) => {
        const counts = emptyReactions();
        snapshot.docs.forEach((d) => {
          const kind = d.data().kind;
          if (REACTION_KINDS.includes(kind)) counts[kind] += 1;
        });
        callback({ counts, total: Object.values(counts).reduce((a, b) => a + b, 0) });
      },
      (error) => {
        if (onError) onError(error);
        callback({ counts: emptyReactions(), total: 0 });
      }
    );
  } catch (error) {
    if (onError) onError(error);
    callback({ counts: emptyReactions(), total: 0 });
    return () => {};
  }
}

/** Reacciones ya marcadas por este visitante (para pintar el botón activo). */
export async function myReactions(prayerId) {
  const visitor = visitorId();
  const out = [];
  await Promise.all(
    REACTION_KINDS.map(async (kind) => {
      try {
        const snap = await getDoc(doc(db, COLLECTION, prayerId, REACTIONS_SUBCOLLECTION, reactionDocId(kind, visitor)));
        if (snap.exists()) out.push(kind);
      } catch {
        // Sin permiso o sin red: se trata como "no reaccionado".
      }
    })
  );
  return out;
}

/* --------------------------------------------------------------------------
   ESCRITURA PÚBLICA
   -------------------------------------------------------------------------- */

/** Alta de petición. Sólo escritura pública admitida junto a las reacciones. */
export async function createPrayer({ name, type, text }) {
  requireService(db, 'Firestore');
  const cleanName = String(name || '').trim().slice(0, 60);
  const cleanText = String(text || '').trim().slice(0, 1200);
  if (!cleanName) throw new Error('Escribe tu nombre o alias.');
  if (cleanText.length < 5) throw new Error('Escribe tu petición con un poco más de detalle.');

  if (contienePalabrasObscenas(cleanName) || contienePalabrasObscenas(cleanText)) {
    throw new Error('Por favor expresa tu petición o inquietud con respeto. Se detectó vocabulario inapropiado.');
  }
  try {
    const isQuestion = type === 'inquietud' || type === 'pregunta';
    const ref = await addDoc(collection(db, COLLECTION), {
      name: cleanName,
      text: cleanText,
      type: isQuestion ? 'inquietud' : 'petición',
      category: isQuestion ? 'inquietud' : 'oracion',
      status: 'abierta',
      isPublic: true,
      replies: [],
      reactions: emptyReactions(),
      createdAt: serverTimestamp()
    });
    return ref.id;
  } catch (error) {
    console.error('[CL] Error creando petición:', error);
    throw new Error(error.message || 'No se pudo enviar tu petición.');
  }
}

/** Alterna una reacción del visitante. `true` la añade, `false` la quita. */
export async function toggleReaction(prayerId, kind, active) {
  requireService(db, 'Firestore');
  if (!REACTION_KINDS.includes(kind)) throw new Error('Reacción no válida.');
  const ref = doc(db, COLLECTION, prayerId, REACTIONS_SUBCOLLECTION, reactionDocId(kind));
  try {
    if (active) {
      await setDoc(ref, { kind, createdAt: serverTimestamp() });
    } else {
      await deleteDoc(ref);
    }
    return true;
  } catch (error) {
    console.warn('[CL] Error en la reacción:', error);
    throw new Error(error.message || 'No se pudo registrar tu reacción.');
  }
}

/* --------------------------------------------------------------------------
   ESCRITURA DEL EQUIPO (panel)
   -------------------------------------------------------------------------- */

/**
 * Añade una respuesta verificada. `replies` es un array: se relee el documento
 * y se reescribe completo, que para el volumen de un muro de clamor es
 * suficiente y evita tener que mantener contadores aparte.
 */
export async function addPrayerReply(prayerId, { text, role, authorName }) {
  requireService(db, 'Firestore');
  const cleanText = String(text || '').trim().slice(0, 1000);
  if (!cleanText) throw new Error('Escribe la respuesta.');

  const badge = responseBadge(role);
  // El documento `prayers/{id}` es legible por el público cuando isPublic, así
  // que aquí NO se guarda el uid del que responde: quedaría expuesto en la
  // consola de cualquier visitante. `role` tampoco se guarda en crudo; la
  // insignia pública ya viene de `badgeLabel`. La trazabilidad interna vive en
  // `audit_logs` (acción `prayers.reply`, con userId y userName).
  const entry = {
    text: cleanText,
    authorName: String(authorName || 'Equipo Love').trim().slice(0, 60),
    badgeLabel: badge.label,
    createdAt: Timestamp.now()
  };

  try {
    const ref = doc(db, COLLECTION, prayerId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('La petición ya no existe.');

    const data = snap.data();
    const replies = Array.isArray(data.replies) ? data.replies : [];
    await updateDoc(ref, {
      replies: [...replies, entry],
      respondedAt: serverTimestamp(),
      status: data.status === 'abierta' ? 'atendida' : data.status
    });
    return true;
  } catch (error) {
    console.error('[CL] Error guardando la respuesta:', error);
    throw new Error(error.message || 'No se pudo guardar la respuesta.');
  }
}

export async function setPrayerStatus(prayerId, status) {
  requireService(db, 'Firestore');
  if (!PRAYER_STATUSES.some((s) => s.value === status)) throw new Error('Estado no válido.');
  try {
    // Archivar también despublica: la regla de lectura del muro sólo puede
    // mirar `isPublic` (una consulta debe filtrar por los campos que la regla
    // consulta), así que el estado no puede usarse como filtro en el cliente.
    //
    // OJO: sólo se fuerza `isPublic: false` al archivar. Antes se escribía
    // `isPublic: true` en el resto de estados, y eso publicaba de golpe una
    // petición que el equipo había marcado como privada. El resto de estados
    // no tocan la visibilidad; para eso está `setPrayerVisibility()`.
    const patch = { status };
    if (status === 'archivada') patch.isPublic = false;
    await updateDoc(doc(db, COLLECTION, prayerId), patch);
    return true;
  } catch (error) {
    console.error('[CL] Error cambiando el estado de la petición:', error);
    throw new Error(error.message || 'No se pudo cambiar el estado.');
  }
}

/** Oculta la petición del muro público sin borrarla. */
export async function setPrayerVisibility(prayerId, isPublic) {
  requireService(db, 'Firestore');
  try {
    await updateDoc(doc(db, COLLECTION, prayerId), { isPublic: isPublic === true });
    return true;
  } catch (error) {
    console.error('[CL] Error cambiando la visibilidad:', error);
    throw new Error(error.message || 'No se pudo cambiar la visibilidad.');
  }
}

/** Elimina una petición y sus reacciones. */
export async function deletePrayer(prayerId) {
  requireService(db, 'Firestore');
  try {
    await deleteDoc(doc(db, COLLECTION, prayerId));
    return true;
  } catch (error) {
    console.error('[CL] Error eliminando petición:', error);
    throw new Error(error.message || 'No se pudo eliminar la petición.');
  }
}