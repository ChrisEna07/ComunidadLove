/* ==========================================================================
   SERVICIO: EVENTOS
   Colección: events
   Se evita el índice compuesto (where + orderBy) consultando por un único
   campo y ordenando en el cliente, para no depender de índices manuales.
   ========================================================================== */

import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  updateDoc
} from 'firebase/firestore';
import { db, requireService } from '../firebase.js';
import { sanitizeImageValue } from '../lib/image.js';
import { toDate } from '../lib/dates.js';

export const EVENT_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'jovenes', label: 'Jóvenes' },
  { value: 'ninos', label: 'Niños' },
  { value: 'matrimonios', label: 'Matrimonios' },
  { value: 'mujeres', label: 'Mujeres' },
  { value: 'adoracion', label: 'Adoración' },
  { value: 'retiros', label: 'Retiros' },
  { value: 'conferences', label: 'Conferencias' }
];

export const CATEGORY_LABELS = EVENT_CATEGORIES.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

const COLLECTION = 'events';

function decorate(id, data) {
  return {
    id,
    title: data.title || 'Sin título',
    description: data.description || '',
    dateStart: toDate(data.dateStart),
    dateEnd: toDate(data.dateEnd),
    location: data.location || '',
    bannerUrl: data.bannerUrl || '',
    category: data.category || 'general',
    isActive: data.isActive !== false,
    createdAt: toDate(data.createdAt),
    updatedByName: data.updatedByName || ''
  };
}

function sortByDate(list) {
  return list.sort((a, b) => {
    const da = a.dateStart ? a.dateStart.getTime() : Number.MAX_SAFE_INTEGER;
    const db2 = b.dateStart ? b.dateStart.getTime() : Number.MAX_SAFE_INTEGER;
    return da - db2;
  });
}

export async function listEvents({ onlyActive = false } = {}) {
  try {
    const constraints = onlyActive ? [where('isActive', '==', true)] : [orderBy('dateStart', 'desc')];
    const snapshot = await getDocs(query(collection(db, COLLECTION), ...constraints));
    return sortByDate(snapshot.docs.map((d) => decorate(d.id, d.data())));
  } catch (error) {
    console.warn('[CL] No se pudieron listar los eventos:', error);
    return [];
  }
}

export function watchEvents(callback, onError) {
  try {
    return onSnapshot(
      query(collection(db, COLLECTION), orderBy('dateStart', 'desc')),
      (snapshot) => {
        const all = snapshot.docs.map((d) => decorate(d.id, d.data()));
        callback({ all, active: sortByDate(all.filter((e) => e.isActive)) });
      },
      (error) => {
        console.warn('[CL] Error en tiempo real de eventos:', error);
        if (onError) onError(error);
        callback({ all: [], active: [] });
      }
    );
  } catch (error) {
    console.warn('[CL] No se pudo suscribir a eventos:', error);
    if (onError) onError(error);
    callback({ all: [], active: [] });
    return () => {};
  }
}

export function upcomingEvents(active, limit = 3) {
  const now = Date.now();
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  return (active || [])
    .filter((event) => {
      if (!event.dateStart) return true;
      return event.dateStart.getTime() >= Math.min(now, todayEnd.getTime() - 86400000);
    })
    .slice(0, limit);
}

export function eventsOnDay(events, date) {
  const target = new Date(date);
  const y = target.getFullYear();
  const m = target.getMonth();
  const d = target.getDate();
  return (events || []).filter((event) => {
    const start = event.dateStart;
    if (!start) return false;
    const end = event.dateEnd || start;
    const startTime = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
    const endTime = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
    const targetTime = new Date(y, m, d).getTime();
    return targetTime >= startTime && targetTime <= endTime;
  });
}

function toFirestorePayload(data) {
  const payload = {
    title: (data.title || '').trim(),
    description: (data.description || '').trim(),
    dateStart: data.dateStart || null,
    dateEnd: data.dateEnd || data.dateStart || null,
    location: (data.location || '').trim(),
    bannerUrl: sanitizeImageValue(data.bannerUrl, { field: 'imagen del evento' }),
    category: data.category || 'general',
    isActive: data.isActive !== false
  };
  if (!payload.title) throw new Error('El título del evento es obligatorio.');
  if (!payload.dateStart) throw new Error('La fecha de inicio es obligatoria.');
  return payload;
}

export async function createEvent(data, authorName) {
  requireService(db, 'Firestore');
  try {
    const ref = await addDoc(collection(db, COLLECTION), {
      ...toFirestorePayload(data),
      createdAt: serverTimestamp(),
      updatedByName: authorName || ''
    });
    return ref.id;
  } catch (error) {
    console.error('[CL] Error creando evento:', error);
    throw new Error(error.message || 'No se pudo crear el evento.');
  }
}

export async function updateEvent(id, data, authorName) {
  requireService(db, 'Firestore');
  try {
    await setDoc(
      doc(db, COLLECTION, id),
      { ...toFirestorePayload(data), updatedAt: serverTimestamp(), updatedByName: authorName || '' },
      { merge: true }
    );
    return true;
  } catch (error) {
    console.error('[CL] Error actualizando evento:', error);
    throw new Error(error.message || 'No se pudo actualizar el evento.');
  }
}

export async function setEventActive(id, isActive, authorName) {
  requireService(db, 'Firestore');
  try {
    await updateDoc(doc(db, COLLECTION, id), { isActive, updatedAt: serverTimestamp(), updatedByName: authorName || '' });
    return true;
  } catch (error) {
    console.error('[CL] Error cambiando el estado del evento:', error);
    throw new Error('No se pudo cambiar el estado del evento.');
  }
}

export async function deleteEvent(id) {
  requireService(db, 'Firestore');
  try {
    await deleteDoc(doc(db, COLLECTION, id));
    return true;
  } catch (error) {
    console.error('[CL] Error eliminando evento:', error);
    throw new Error('No se pudo eliminar el evento.');
  }
}
