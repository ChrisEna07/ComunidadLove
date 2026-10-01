/* ==========================================================================
   SERVICIO: GALERÍA DINÁMICA (CLGESTIÓN & COMUNIDAD LOVE WEB)
   --------------------------------------------------------------------------
   Categorías admitidas:
   - 'comunidad' (Comunidad y Familia Pastoral)
   - 'ninos'     (Love Kids)
   - 'mujeres'   (Love Woman)
   - 'adoracion' (Love Adora)
   ========================================================================== */

import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import { db, requireService } from '../firebase.js';
import { sanitizeImageValue } from '../lib/image.js';

export const GALLERY_CATEGORIES = [
  { value: 'comunidad', label: 'Comunidad' },
  { value: 'ninos', label: 'Love Kids' },
  { value: 'mujeres', label: 'Love Woman' },
  { value: 'adoracion', label: 'Love Adora' }
];

export const DEFAULT_GALLERY_ITEMS = [
  { id: 'gal-1', title: 'Nuestra Familia Pastoral', category: 'comunidad', imageUrl: './Assets/familia pastoral.jpg' },
  { id: 'gal-2', title: 'Enseñanza Creativa infantil', category: 'ninos', imageUrl: './Assets/love_kids.png' },
  { id: 'gal-3', title: 'Reunión de Conexión de Mujeres', category: 'mujeres', imageUrl: './Assets/LoveWoman.png' },
  { id: 'gal-4', title: 'Tiempos de Adoración en la Presencia', category: 'adoracion', imageUrl: './Assets/Love adora/love adora (5).jpg' },
  { id: 'gal-5', title: 'Reuniones de Conexión', category: 'comunidad', imageUrl: './Assets/somos comunidad love/love comunidad (1).jpeg' },
  { id: 'gal-6', title: 'Celebración Dominical', category: 'comunidad', imageUrl: './Assets/somos comunidad love/love comunidad (2).jpeg' },
  { id: 'gal-7', title: 'Alabanza en Comunidad', category: 'adoracion', imageUrl: './Assets/Love adora/love adora (6).jpg' },
  { id: 'gal-8', title: 'Tarde de Compartir y Palabra', category: 'mujeres', imageUrl: './Assets/somos comunidad love/love comunidad (5).jpeg' },
  { id: 'gal-9', title: 'Tiempos de Familia', category: 'comunidad', imageUrl: './Assets/somos comunidad love/love comunidad (3).jpeg' },
  { id: 'gal-10', title: 'Adoración Matutina', category: 'adoracion', imageUrl: './Assets/Love adora/love adora (7).jpg' },
  { id: 'gal-11', title: 'Comunión y Hermandad', category: 'comunidad', imageUrl: './Assets/somos comunidad love/love comunidad (4).jpeg' },
  { id: 'gal-12', title: 'Espacio Love Kids', category: 'ninos', imageUrl: './Assets/LOVE - KIDS/logo-love-kids.jpg' }
];

export function watchGallery(callback, onError) {
  try {
    const q = query(collection(db, 'gallery_items'), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.empty) {
          callback(DEFAULT_GALLERY_ITEMS);
          return;
        }
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        callback(items);
      },
      (error) => {
        console.warn('[CL] Error en tiempo real de galería:', error);
        if (onError) onError(error);
        callback(DEFAULT_GALLERY_ITEMS);
      }
    );
  } catch (error) {
    console.warn('[CL] No se pudo conectar a galería:', error);
    if (onError) onError(error);
    callback(DEFAULT_GALLERY_ITEMS);
    return () => {};
  }
}

export async function addGalleryItem({ title, category, imageUrl }) {
  requireService(db, 'Firestore');
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) throw new Error('Ingresa un título para la foto.');
  if (!imageUrl) throw new Error('Sube una imagen o pega una dirección URL.');

  const cleanCategory = GALLERY_CATEGORIES.some((c) => c.value === category) ? category : 'comunidad';
  const cleanImage = sanitizeImageValue(imageUrl, { field: 'foto de galería' });

  const docRef = await addDoc(collection(db, 'gallery_items'), {
    title: cleanTitle,
    category: cleanCategory,
    imageUrl: cleanImage,
    createdAt: serverTimestamp()
  });

  return docRef.id;
}

export async function deleteGalleryItem(id) {
  requireService(db, 'Firestore');
  if (!id) throw new Error('ID no válido.');
  await deleteDoc(doc(db, 'gallery_items', id));
  return true;
}
