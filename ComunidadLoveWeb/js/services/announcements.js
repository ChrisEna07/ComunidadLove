/* ==========================================================================
   SERVICIO: ANUNCIOS Y AVISOS
   Colecciones soportadas: announcements y notices
   Se filtran y ordenan en cliente tolerante a esquemas.
   ========================================================================== */

import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc
} from 'firebase/firestore';
import { db, requireService } from '../firebase.js';
import { toDate, parseDate } from '../lib/dates.js';

const COLLECTION = 'announcements';

function decorate(id, data) {
  const content = data.content || data.message || data.contenido || data.description || '';
  const title = data.title || data.titulo || 'Aviso';
  const badge = data.badge || (Number(data.priority) >= 2 ? 'Importante' : Number(data.priority) === 1 ? 'Nuevo' : '');
  const publishDate = data.publishDate || data.date || data.fecha || data.createdAt ? parseDate(data.publishDate || data.date || data.fecha || data.createdAt) : new Date();
  const expirationDate = data.expirationDate ? parseDate(data.expirationDate) : null;
  const priority = Number.isFinite(data.priority)
    ? Number(data.priority)
    : (String(badge).toLowerCase().includes('import') ? 2 : badge ? 1 : 0);

  return {
    id,
    title,
    message: content,
    content,
    badge,
    publishDate,
    expirationDate,
    priority,
    createdAt: data.createdAt ? parseDate(data.createdAt) : publishDate
  };
}

export function isAnnouncementVisible(announcement, reference = new Date()) {
  const now = (toDate(reference) || new Date()).getTime();
  if (announcement.expirationDate && parseDate(announcement.expirationDate).getTime() < now) return false;
  return true;
}

export function sortAnnouncements(list) {
  return [...(list || [])].sort((a, b) => {
    if (b.priority !== a.priority) return (b.priority || 0) - (a.priority || 0);
    const da = a.publishDate ? parseDate(a.publishDate).getTime() : 0;
    const db2 = b.publishDate ? parseDate(b.publishDate).getTime() : 0;
    return db2 - da;
  });
}

export function watchAnnouncements(callback, onError) {
  let annMap = new Map();
  let notMap = new Map();

  function notify() {
    const combined = new Map();
    annMap.forEach((v, k) => combined.set(k, v));
    notMap.forEach((v, k) => combined.set(k, v));
    const sorted = sortAnnouncements(Array.from(combined.values()));
    callback(sorted);
  }

  let unsubAnn = () => {};
  let unsubNot = () => {};

  try {
    unsubAnn = onSnapshot(
      collection(db, COLLECTION),
      (snapshot) => {
        annMap.clear();
        snapshot.docs.forEach((d) => annMap.set(d.id, decorate(d.id, d.data())));
        notify();
      },
      (error) => {
        console.warn('[CL] Error en tiempo real de announcements:', error);
        if (onError) onError(error);
        notify();
      }
    );
  } catch (error) {
    console.warn('[CL] No se pudo conectar a announcements:', error);
    if (onError) onError(error);
    notify();
  }

  try {
    unsubNot = onSnapshot(
      collection(db, 'notices'),
      (snapshot) => {
        notMap.clear();
        snapshot.docs.forEach((d) => notMap.set(d.id, decorate(d.id, d.data())));
        notify();
      },
      () => {}
    );
  } catch {}

  return () => {
    try { unsubAnn(); } catch {}
    try { unsubNot(); } catch {}
  };
}

function toPayload(data) {
  const payload = {
    title: (data.title || '').trim(),
    message: (data.message || '').trim(),
    publishDate: data.publishDate || null,
    expirationDate: data.expirationDate || null,
    priority: Number(data.priority) || 0
  };
  if (!payload.title) throw new Error('El título del aviso es obligatorio.');
  if (!payload.message) throw new Error('El mensaje del aviso es obligatorio.');
  if (payload.expirationDate && payload.publishDate && payload.expirationDate < payload.publishDate) {
    throw new Error('La fecha de expiración no puede ser anterior a la de publicación.');
  }
  return payload;
}

export async function createAnnouncement(data) {
  requireService(db, 'Firestore');
  try {
    const ref = await addDoc(collection(db, COLLECTION), { ...toPayload(data), createdAt: serverTimestamp() });
    return ref.id;
  } catch (error) {
    console.error('[CL] Error creando aviso:', error);
    throw new Error(error.message || 'No se pudo crear el aviso.');
  }
}

export async function updateAnnouncement(id, data) {
  requireService(db, 'Firestore');
  try {
    await setDoc(doc(db, COLLECTION, id), { ...toPayload(data), updatedAt: serverTimestamp() }, { merge: true });
    return true;
  } catch (error) {
    console.error('[CL] Error actualizando aviso:', error);
    throw new Error(error.message || 'No se pudo actualizar el aviso.');
  }
}

export async function deleteAnnouncement(id) {
  requireService(db, 'Firestore');
  try {
    await deleteDoc(doc(db, COLLECTION, id));
    return true;
  } catch (error) {
    console.error('[CL] Error eliminando aviso:', error);
    throw new Error('No se pudo eliminar el aviso.');
  }
}
