/* ==========================================================================
   SERVICIO: ANUNCIOS
   Colección: announcements
   Se filtran por fecha de publicación y expiración en el cliente.
   ========================================================================== */

import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc
} from 'firebase/firestore';
import { db, requireService } from '../firebase.js';
import { toDate } from '../lib/dates.js';

const COLLECTION = 'announcements';

function decorate(id, data) {
  return {
    id,
    title: data.title || '',
    message: data.message || '',
    publishDate: toDate(data.publishDate),
    expirationDate: toDate(data.expirationDate),
    priority: Number.isFinite(data.priority) ? data.priority : 0,
    createdAt: toDate(data.createdAt)
  };
}

export function isAnnouncementVisible(announcement, reference = new Date()) {
  const now = (toDate(reference) || new Date()).getTime();
  if (announcement.publishDate && announcement.publishDate.getTime() > now) return false;
  if (announcement.expirationDate && announcement.expirationDate.getTime() < now) return false;
  return true;
}

export function sortAnnouncements(list) {
  return [...(list || [])].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const da = a.publishDate ? a.publishDate.getTime() : 0;
    const db2 = b.publishDate ? b.publishDate.getTime() : 0;
    return db2 - da;
  });
}

export function watchAnnouncements(callback, onError) {
  try {
    return onSnapshot(
      query(collection(db, COLLECTION), orderBy('priority', 'desc')),
      (snapshot) => callback(sortAnnouncements(snapshot.docs.map((d) => decorate(d.id, d.data())))),
      (error) => {
        console.warn('[CL] Error en tiempo real de anuncios:', error);
        if (onError) onError(error);
        callback([]);
      }
    );
  } catch (error) {
    console.warn('[CL] No se pudo suscribir a anuncios:', error);
    if (onError) onError(error);
    callback([]);
    return () => {};
  }
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
