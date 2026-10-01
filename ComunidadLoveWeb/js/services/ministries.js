/* ==========================================================================
   SERVICIO: MINISTERIOS CMS (CLGESTIÓN & COMUNIDAD LOVE WEB)
   --------------------------------------------------------------------------
   Permite administrar los 5 ministerios oficiales de la iglesia:
   - Love Kids (Espacio Infantil)
   - Love Woman (Espacio de Mujeres)
   - Love Adora (Ministerio de Alabanza)
   - Love Buenas Nuevas (Evangelismo & Acción Social)
   - Nuestra Comunidad (Familia Pastoral y Comunidad)
   ========================================================================== */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db, requireService } from '../firebase.js';
import { sanitizeImageValue } from '../lib/image.js';

export const DEFAULT_MINISTRIES = [
  {
    id: 'kids',
    name: 'Love Kids',
    title: 'Love Kids',
    badge: 'Espacio Infantil',
    description: 'Nuestra misión en Love Kids es sembrar principios bíblicos en el corazón de los más pequeños (de 2 a 11 años) a través de un lenguaje dinámico, lúdico y lleno de amor. Diseñamos un ambiente seguro e interactivo donde aprenden mediante juegos, artes plásticas y obras teatrales adaptadas a su edad.',
    imageUrl: './Assets/love_kids.png',
    quote: '',
    videoUrl: '',
    stats: {}
  },
  {
    id: 'woman',
    name: 'Love Woman',
    title: 'Love Woman',
    badge: 'Espacio de Mujeres',
    description: 'Un ministerio diseñado especialmente para las mujeres de Cartagena. Buscamos inspirar, conectar y equipar a cada mujer para que descubra su verdadero valor e identidad en Dios. Realizamos congresos, talleres de emprendimiento, estudios de la palabra y hermosos círculos de oración y consejería.',
    imageUrl: './Assets/LoveWoman.png',
    quote: '"Mujer virtuosa, ¿quién la hallará? Porque su estima sobrepasa largamente a la de las piedras preciosas." - Proverbios 31:10',
    videoUrl: '',
    stats: {}
  },
  {
    id: 'adora',
    name: 'Love Adora',
    title: 'Love Adora',
    badge: 'Ministerio de Alabanza',
    description: 'Integrado por músicos, cantantes y técnicos dedicados a guiar a la congregación en una adoración íntima y apasionada. Creemos que la música es un canal maravilloso para conectarnos con el cielo. Trabajamos constantemente en la excelencia musical y en la preparación espiritual para cada servicio dominical.',
    imageUrl: './Assets/Love adora/love adora (1).jpg',
    videoUrl: 'https://www.youtube.com/embed/tvDVh0S5Umc?si=CswgsEWaTjXi3ukT',
    quote: '',
    gallery: [
      './Assets/Love adora/love adora (1).jpg',
      './Assets/Love adora/love adora (2).jpg',
      './Assets/Love adora/love adora (3).jpg',
      './Assets/Love adora/love adora (4).jpg'
    ],
    stats: {}
  },
  {
    id: 'buenas-nuevas',
    name: 'Love Buenas Nuevas',
    title: 'Love Buenas Nuevas',
    badge: 'Evangelismo & Acción Social',
    description: 'Nuestra pasión es llevar el mensaje de salvación a cada rincón de Cartagena. A través de visitas a hospitales, cárceles, comedores comunitarios y evangelismo en las calles, compartimos las buenas nuevas y el amor práctico de Jesús con quienes más lo necesitan.',
    imageUrl: './Assets/somos comunidad love/love comunidad (6).jpeg',
    quote: '',
    videoUrl: '',
    stats: {
      homes: '500+',
      zones: '15+',
      volunteers: '80+'
    }
  },
  {
    id: 'comunidad',
    name: 'Nuestra Comunidad',
    title: 'Nuestra Comunidad',
    badge: 'Familia Pastoral',
    description: 'Comunidad Love es liderada por los pastores James y Zuleima Andrade, quienes han dedicado sus vidas al servicio del ministerio en Colombia. Junto a sus amados hijos, Aron, Aitana y Ariadna Andrade Ruiz, conforman un equipo familiar enfocado en consolidar hogares saludables y guiar a la comunidad cartagenera hacia una fe práctica y llena de amor.',
    imageUrl: './Assets/familia pastoral.jpg',
    quote: '"Nuestra visión es ver a Cartagena transformada por el amor de Dios, restaurando una familia a la vez. Creemos que cada vida tiene un valor incalculable para el Padre."',
    videoUrl: '',
    stats: {}
  }
];

export function watchMinistries(callback, onError) {
  try {
    return onSnapshot(
      collection(db, 'ministries'),
      (snapshot) => {
        if (snapshot.empty) {
          callback(DEFAULT_MINISTRIES);
          return;
        }
        const map = new Map(snapshot.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
        const merged = DEFAULT_MINISTRIES.map((def) => map.get(def.id) || def);
        callback(merged);
      },
      (error) => {
        console.warn('[CL] Error en tiempo real de ministerios:', error);
        if (onError) onError(error);
        callback(DEFAULT_MINISTRIES);
      }
    );
  } catch (error) {
    console.warn('[CL] No se pudo conectar a ministerios:', error);
    if (onError) onError(error);
    callback(DEFAULT_MINISTRIES);
    return () => {};
  }
}

export async function updateMinistry(id, patch) {
  requireService(db, 'Firestore');
  const cleanId = String(id || '').trim().toLowerCase();
  if (!cleanId) throw new Error('ID de ministerio no válido.');

  const data = { ...patch };
  if (data.name && !data.title) {
    data.title = data.name;
  } else if (data.title && !data.name) {
    data.name = data.title;
  }

  if (data.imageUrl) {
    data.imageUrl = sanitizeImageValue(data.imageUrl, { field: 'imagen del ministerio' });
  }

  if (Array.isArray(data.gallery)) {
    data.gallery = data.gallery.map((img, idx) =>
      sanitizeImageValue(img, { field: `foto ${idx + 1} del collage` })
    );
  }

  const ref = doc(db, 'ministries', cleanId);
  await setDoc(ref, {
    ...data,
    id: cleanId,
    updatedAt: serverTimestamp()
  }, { merge: true });

  return true;
}
