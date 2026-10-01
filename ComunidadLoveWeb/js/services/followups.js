/* ==========================================================================
   SERVICIO: BITÁCORA DE SEGUIMIENTO
   Subcolección: members/{memberId}/followups
   ========================================================================== */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp
} from 'firebase/firestore';
import { db, requireService } from '../firebase.js';
import { toDate } from '../lib/dates.js';

export const FOLLOWUP_TYPE_LABELS = {
  llamada: 'Llamada',
  visita: 'Visita',
  mensaje: 'Mensaje',
  consejería: 'Consejería'
};

export const FOLLOWUP_TYPE_ICONS = {
  llamada: 'fa-phone',
  visita: 'fa-house-chimney-user',
  mensaje: 'fa-comment-dots',
  consejería: 'fa-hands-praying'
};

function decorate(id, data) {
  return {
    id,
    date: toDate(data.date),
    authorUid: data.authorUid || '',
    authorName: data.authorName || '',
    type: data.type || 'llamada',
    notes: data.notes || '',
    nextActionDate: toDate(data.nextActionDate)
  };
}

export function watchFollowups(memberId, callback, onError) {
  if (!memberId) return () => {};
  try {
    return onSnapshot(
      query(collection(db, 'members', memberId, 'followups'), orderBy('date', 'desc')),
      (snapshot) => callback(snapshot.docs.map((d) => decorate(d.id, d.data()))),
      (error) => {
        console.warn('[CL] Error en tiempo real de seguimientos:', error);
        if (onError) onError(error);
        callback([]);
      }
    );
  } catch (error) {
    console.warn('[CL] No se pudo suscribir a la bitácora:', error);
    if (onError) onError(error);
    callback([]);
    return () => {};
  }
}

export async function addFollowup(memberId, data, author) {
  requireService(db, 'Firestore');
  if (!memberId) throw new Error('No se puede registrar seguimiento sin un miembro seleccionado.');
  if (!FOLLOWUP_TYPE_LABELS[data.type]) throw new Error('Selecciona un tipo de seguimiento válido.');
  const notes = (data.notes || '').trim();
  if (notes.length < 5) throw new Error('Escribe una nota breve del seguimiento.');

  try {
    await addDoc(collection(db, 'members', memberId, 'followups'), {
      date: data.date || serverTimestamp(),
      authorUid: author?.uid || '',
      authorName: author?.displayName || '',
      type: data.type,
      notes,
      nextActionDate: data.nextActionDate || null
    });
    return true;
  } catch (error) {
    console.error('[CL] Error guardando seguimiento:', error);
    throw new Error(error.message || 'No se pudo guardar el seguimiento.');
  }
}

export async function deleteFollowup(memberId, followupId) {
  requireService(db, 'Firestore');
  try {
    await deleteDoc(doc(db, 'members', memberId, 'followups', followupId));
    return true;
  } catch (error) {
    console.error('[CL] Error eliminando seguimiento:', error);
    throw new Error('No se pudo eliminar el registro de seguimiento.');
  }
}
