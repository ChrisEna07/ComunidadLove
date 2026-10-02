/* ==========================================================================
   SERVICIO: CONFIGURACIÓN DEL SITIO
   Documento: site_settings/general
   ========================================================================== */

import { doc, getDoc, onSnapshot, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db, requireService } from '../firebase.js';

export const SETTINGS_DOC_ID = 'general';

export const DEFAULT_SERVICE_HOURS = [
  {
    day: 'Domingos',
    time: '9:00 AM',
    label: 'Domingo Familia',
    description: 'Nuestra gran reunión general de adoración, comunión y enseñanza práctica de la Palabra para toda la familia.'
  },
  {
    day: 'Miércoles',
    time: '7:00 PM',
    label: 'Miércoles de Series',
    description: 'Un espacio dinámico a mitad de semana dedicado a series temáticas de estudio bíblico con aplicaciones para el día a día.'
  },
  {
    day: 'Sábados',
    time: 'Especiales del mes',
    label: 'Servicios Especiales del Sábado',
    description: '1er sábado Love Woman 5:00 PM · 2do y último sábado Love Youth 6:00 PM · último sábado Servicio de Parejas 7:30 PM.'
  }
];

/** Réplica del contenido estático actual, usada como fallback sin conexión. */
export const DEFAULT_SETTINGS = {
  streamingUrl: 'https://www.youtube.com/embed/kItYRbhPrI0?si=NyhHZn0I3-HAKyvC',
  streamingChannelUrl: 'https://youtube.com/@comunidadcristianalove?si=SVu02G2wBtLYnAYw',
  serviceHours: DEFAULT_SERVICE_HOURS,
  bannerAlert: { show: false, message: '', type: 'info' },
  contactPhone: '+57 300 123 4567',
  contactEmail: 'contacto@comunidadlove.co',
  address: 'Avenida Pedro de Heredia, Sector Pie de la Popa, Cartagena, Colombia',
  socialLinks: {
    instagram: 'https://www.instagram.com/comunidadcristianalove?igsh=OXdsaDhtenoweDc=',
    facebook: 'https://www.facebook.com/share/1996TDazq1/?mibextid=wwXIfr',
    youtube: 'https://youtube.com/@comunidadcristianalove?si=SVu02G2wBtLYnAYw'
  }
};

function mergeSettings(data) {
  const base = structuredClone(DEFAULT_SETTINGS);
  if (!data) return base;
  return {
    ...base,
    ...data,
    bannerAlert: { ...base.bannerAlert, ...(data.bannerAlert || {}) },
    socialLinks: { ...base.socialLinks, ...(data.socialLinks || {}) },
    serviceHours: Array.isArray(data.serviceHours)
      ? data.serviceHours
      : (Array.isArray(data.services) ? data.services : base.serviceHours)
  };
}

export async function getSettings() {
  try {
    const snapshot = await getDoc(doc(db, 'site_settings', SETTINGS_DOC_ID));
    return mergeSettings(snapshot.exists() ? snapshot.data() : null);
  } catch (error) {
    console.warn('[CL] No se pudo leer site_settings/general:', error);
    return mergeSettings(null);
  }
}

/**
 * Suscripción en tiempo real a la configuración del sitio.
 * `callback(settings, exists)` recibe `exists=false` mientras el documento
 * `site_settings/general` no se haya creado, lo que permite al portal público
 * conservar su contenido estático original como respaldo.
 */
export function watchSettings(callback, onError) {
  try {
    return onSnapshot(
      doc(db, 'site_settings', SETTINGS_DOC_ID),
      (snapshot) => callback(mergeSettings(snapshot.exists() ? snapshot.data() : null), snapshot.exists()),
      (error) => {
        console.warn('[CL] Error en tiempo real de site_settings:', error);
        if (onError) onError(error);
        callback(mergeSettings(null), false);
      }
    );
  } catch (error) {
    console.warn('[CL] No se pudo suscribir a site_settings:', error);
    if (onError) onError(error);
    callback(mergeSettings(null), false);
    return () => {};
  }
}

export async function saveSettings(partial) {
  requireService(db, 'Firestore');
  const ref = doc(db, 'site_settings', SETTINGS_DOC_ID);
  const clean = stripEmpty(partial);
  if (Array.isArray(partial.serviceHours)) {
    clean.serviceHours = partial.serviceHours;
    clean.services = partial.serviceHours;
  }
  try {
    await setDoc(
      ref,
      { ...clean, updatedAt: serverTimestamp(), updatedBy: SETTINGS_DOC_ID },
      { merge: true }
    );
    return true;
  } catch (error) {
    console.error('[CL] Error guardando site_settings:', error);
    throw new Error('No se pudieron guardar los ajustes. Revisa tus permisos.');
  }
}

export async function patchSettings(partial) {
  requireService(db, 'Firestore');
  try {
    await updateDoc(doc(db, 'site_settings', SETTINGS_DOC_ID), stripEmpty(partial));
    return true;
  } catch (error) {
    console.error('[CL] Error actualizando site_settings:', error);
    throw new Error('No se pudieron actualizar los ajustes.');
  }
}

function stripEmpty(obj) {
  const out = {};
  Object.entries(obj || {}).forEach(([key, value]) => {
    if (value === '' || value === undefined) return;
    out[key] = value;
  });
  return out;
}
