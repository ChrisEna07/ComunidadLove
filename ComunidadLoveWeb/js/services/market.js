/* ==========================================================================
   SERVICIO: LOVE MARKET (market_products)
   --------------------------------------------------------------------------
   Catálogo dinámico para la sección pública. Sigue el mismo patrón que
   `events.js`: listener en tiempo real, ordenación en el cliente para no
   depender de índices compuestos, e imágenes híbridas (URL o Base64 ≤200 KB)
   porque el proyecto no usa Cloud Storage.
   ========================================================================== */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import { db, requireService } from '../firebase.js';
import { sanitizeImageValue } from '../lib/image.js';
import { toDate } from '../lib/dates.js';

const COLLECTION = 'market_products';

export const MARKET_CATEGORIES = [
  { value: 'ropa', label: 'Ropa' },
  { value: 'accesorios', label: 'Accesorios' },
  { value: 'decoracion', label: 'Decoración' },
  { value: 'libros', label: 'Libros y devocionales' },
  { value: 'otros', label: 'Otros' }
];

export const CATEGORY_LABELS = MARKET_CATEGORIES.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

/** Etiquetas rápidas para el campo `badge`. */
export const MARKET_BADGES = ['TOP VENTAS', 'NUEVO', 'POCA EXISTENCIA', 'PROMO', ''];

function decorate(id, data) {
  return {
    id,
    name: data.name || 'Sin nombre',
    price: typeof data.price === 'number' ? data.price : Number(data.price) || 0,
    category: data.category || 'otros',
    description: data.description || '',
    badge: data.badge || '',
    imageUrl: data.imageUrl || '',
    isActive: data.isActive !== false,
    stock: typeof data.stock === 'number' ? data.stock : Number(data.stock) || 0,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt)
  };
}

function byName(a, b) {
  return String(a.name).localeCompare(String(b.name), 'es');
}

/** Suscripción en tiempo real. Devuelve `{ all, active }`. */
export function watchProducts(callback, onError) {
  try {
    return onSnapshot(
      query(collection(db, COLLECTION), orderBy('name', 'asc')),
      (snapshot) => {
        const all = snapshot.docs.map((d) => decorate(d.id, d.data()));
        callback({ all, active: all.filter((p) => p.isActive).sort(byName) });
      },
      (error) => {
        console.warn('[CL] Error en tiempo real de productos:', error);
        if (onError) onError(error);
        callback({ all: [], active: [] });
      }
    );
  } catch (error) {
    console.warn('[CL] No se pudo suscriber a los productos:', error);
    if (onError) onError(error);
    callback({ all: [], active: [] });
    return () => {};
  }
}

/** Sólo los publicados. Lo usa la web pública. */
export function watchActiveProducts(callback, onError) {
  try {
    return onSnapshot(
      query(collection(db, COLLECTION), where('isActive', '==', true)),
      (snapshot) => {
        callback(snapshot.docs.map((d) => decorate(d.id, d.data())).sort(byName));
      },
      (error) => {
        console.warn('[CL] Error en tiempo real de productos publicados:', error);
        if (onError) onError(error);
        callback([]);
      }
    );
  } catch (error) {
    console.warn('[CL] No se pudo suscribir a los productos publicados:', error);
    if (onError) onError(error);
    callback([]);
    return () => {};
  }
}

/* --------------------------------------------------------------------------
   PRECIO
   --------------------------------------------------------------------------
   En Firestore el precio es un NÚMERO en pesos enteros (85000), nunca
   "$85.000": el formato con puntos es solo de presentación. Así se pueden
   ordenar y filtrar sin parsear cadenas.
   -------------------------------------------------------------------------- */

/** "$85.000 COP" | "85000" | 85000 -> 85000 */
export function parsePrice(raw) {
  if (typeof raw === 'number') return Math.max(0, Math.round(raw));
  const digits = String(raw ?? '').replace(/[^\d]/g, '');
  const value = Number.parseInt(digits, 10);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** 85000 -> "$85.000" */
export function formatPrice(value) {
  const n = Math.max(0, Math.round(Number(value) || 0));
  return `$${n.toLocaleString('es-CO')}`;
}

/** Etiqueta completa para la web pública. */
export function formatPriceCOP(value) {
  return `${formatPrice(value)} COP`;
}

function toPayload(data) {
  const name = String(data.name || '').trim();
  if (!name) throw new Error('El nombre del producto es obligatorio.');

  const price = parsePrice(data.price);
  if (price <= 0) throw new Error('El precio debe ser mayor que cero.');

  const stock = Number.parseInt(data.stock, 10);
  const payload = {
    name,
    price,
    category: data.category || 'otros',
    description: String(data.description || '').trim(),
    badge: String(data.badge || '').trim(),
    imageUrl: sanitizeImageValue(data.imageUrl, { field: 'foto del producto' }),
    isActive: data.isActive !== false,
    stock: Number.isFinite(stock) ? Math.max(0, stock) : 0
  };

  if (!MARKET_CATEGORIES.some((c) => c.value === payload.category)) {
    payload.category = 'otros';
  }
  if (payload.badge && !MARKET_BADGES.includes(payload.badge)) {
    payload.badge = payload.badge.toUpperCase().slice(0, 24);
  }
  return payload;
}

export async function createProduct(data) {
  requireService(db, 'Firestore');
  try {
    const ref = await addDoc(collection(db, COLLECTION), {
      ...toPayload(data),
      createdAt: serverTimestamp()
    });
    return ref.id;
  } catch (error) {
    console.error('[CL] Error creando producto:', error);
    throw new Error(error.message || 'No se pudo crear el producto.');
  }
}

export async function updateProduct(id, data) {
  requireService(db, 'Firestore');
  try {
    await setDoc(
      doc(db, COLLECTION, id),
      { ...toPayload(data), updatedAt: serverTimestamp() },
      { merge: true }
    );
    return true;
  } catch (error) {
    console.error('[CL] Error actualizando producto:', error);
    throw new Error(error.message || 'No se pudo actualizar el producto.');
  }
}

/** Publicar o pausar sin reescribir el resto del documento. */
export async function setProductActive(id, isActive) {
  requireService(db, 'Firestore');
  try {
    await updateDoc(doc(db, COLLECTION, id), {
      isActive,
      updatedAt: serverTimestamp()
    });
    return true;
  } catch (error) {
    console.error('[CL] Error cambiando el estado del producto:', error);
    throw new Error(error.message || 'No se pudo cambiar el estado del producto.');
  }
}

export async function deleteProduct(id) {
  requireService(db, 'Firestore');
  try {
    await deleteDoc(doc(db, COLLECTION, id));
    return true;
  } catch (error) {
    console.error('[CL] Error eliminando producto:', error);
    throw new Error(error.message || 'No se pudo eliminar el producto.');
  }
}