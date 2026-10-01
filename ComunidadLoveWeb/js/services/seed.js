/* ==========================================================================
   SERVICIO: SEED Y CONTENIDOS INICIALES (CLGESTIÓN)
   --------------------------------------------------------------------------
   Provee datos por defecto extraídos de la web oficial de Comunidad Love
   (Love Market, Eventos y Horarios, Avisos y Ministerios).
   Se utiliza como fallback cuando las colecciones de Firestore están vacías
   y permite sembrar la base de datos con un solo clic desde el panel admin.
   ========================================================================== */

import {
  collection,
  addDoc,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';
import { db, requireService } from '../firebase.js';
import { logAudit } from './audit.js';

export const DEFAULT_MARKET_PRODUCTS = [
  {
    name: 'Hoodie Love Premium',
    price: 85000,
    badge: 'TOP VENTAS',
    imageUrl: './Assets/MERCHANDISING/01.jpg',
    description: 'Hoodie premium con capucha y bolsillo delantero. Material ultra suave y duradero, estampado en alta definición con el logo de la Comunidad Love. Disponible en todas las tallas.',
    category: 'ropa',
    isActive: true,
    stock: 25
  },
  {
    name: 'Gorra Love Trucker',
    price: 25000,
    badge: '',
    imageUrl: './Assets/MERCHANDISING/02.jpg',
    description: 'Gorra oficial ajustable estilo trucker. Visera semirrecta con bordado en alto relieve de alta calidad de la marca Love. Un accesorio moderno y versátil.',
    category: 'accesorios',
    isActive: true,
    stock: 30
  },
  {
    name: 'Camiseta Love Blanca',
    price: 45000,
    badge: '',
    imageUrl: './Assets/MERCHANDISING/03.jpg',
    description: 'Camiseta oficial color blanco, fabricada con 100% algodón peinado premium. Logo minimalista Love en el pecho. Muy fresca y cómoda para el clima de Cartagena.',
    category: 'ropa',
    isActive: true,
    stock: 40
  },
  {
    name: 'Camiseta Love Negra',
    price: 45000,
    badge: '',
    imageUrl: './Assets/MERCHANDISING/04.jpg',
    description: 'Camiseta oficial color negro, confeccionada con algodón premium de alto gramaje. Logo minimalista Love de excelente calidad. Ideal para lucir en cualquier ocasión de la semana.',
    category: 'ropa',
    isActive: true,
    stock: 40
  }
];

export const DEFAULT_EVENTS = [
  {
    title: 'Domingo Familia',
    category: 'general',
    location: 'Auditorio Principal Comunidad Love',
    description: 'Nuestra gran reunión general de adoración, comunión y enseñanza práctica de la Palabra para toda la familia. Domingos 9:00 AM.',
    bannerUrl: './Assets/somos comunidad love/love comunidad (1).jpeg',
    dateStart: '2026-10-04T09:00:00',
    dateEnd: '2026-10-04T11:30:00',
    isActive: true
  },
  {
    title: 'Miércoles de Series',
    category: 'general',
    location: 'Auditorio Principal Comunidad Love',
    description: 'Un espacio dinámico a mitad de semana dedicado a series temáticas de estudio bíblico con aplicaciones para el día a día. Miércoles 7:00 PM.',
    bannerUrl: './Assets/somos comunidad love/love comunidad (2).jpeg',
    dateStart: '2026-10-07T19:00:00',
    dateEnd: '2026-10-07T21:00:00',
    isActive: true
  },
  {
    title: 'Servicios Especiales del Sábado',
    category: 'general',
    location: 'Auditorio Comunidad Love',
    description: 'Espacios dinámicos y segmentados: Ayuno y Clamor (7:00 AM), Love Woman (1er Sábado 5:00 PM), Love Youth Jóvenes (2do y Último Sábado 6:00 PM) y Parejas (Último Sábado 7:30 PM).',
    bannerUrl: './Assets/somos comunidad love/love comunidad (3).jpeg',
    dateStart: '2026-10-10T17:00:00',
    dateEnd: '2026-10-10T20:30:00',
    isActive: true
  },
  {
    title: 'Love Woman (Mujeres)',
    category: 'mujeres',
    location: 'Auditorio Comunidad Love',
    description: 'Reunión de conexión y edificación espiritual para todas las mujeres. 1er Sábado del mes - 5:00 PM.',
    bannerUrl: './Assets/LoveWoman.png',
    dateStart: '2026-10-03T17:00:00',
    dateEnd: '2026-10-03T19:30:00',
    isActive: true
  },
  {
    title: 'Servicio de Jóvenes (Love Youth)',
    category: 'jovenes',
    location: 'Auditorio Comunidad Love',
    description: 'Música, adoración apasionada, mensaje relevante y comunidad para jóvenes y adolescentes. 2do y Último Sábado - 6:00 PM.',
    bannerUrl: './Assets/Love adora/love adora (5).jpg',
    dateStart: '2026-10-10T18:00:00',
    dateEnd: '2026-10-10T20:30:00',
    isActive: true
  },
  {
    title: 'Mañana de Ayuno y Clamor',
    category: 'adoracion',
    location: 'Auditorio Principal',
    description: 'Tiempo especial de búsqueda e intercesión por las familias, la ciudad y nuestra iglesia. Sábados 7:00 AM.',
    bannerUrl: './Assets/Love adora/love adora (7).jpg',
    dateStart: '2026-10-03T07:00:00',
    dateEnd: '2026-10-03T09:30:00',
    isActive: true
  }
];

export const DEFAULT_ANNOUNCEMENTS = [
  {
    title: 'Ministerio Love Kids: Formando el futuro',
    message: 'Nuestra misión en Love Kids es sembrar principios bíblicos en el corazón de los más pequeños (2 a 11 años) a través de un lenguaje dinámico, lúdico y lleno de amor. Ambiente seguro e interactivo con artes plásticas, juegos y teatro bíblico.',
    priority: 3
  },
  {
    title: 'Love Adora: Adoración y Alabanza',
    message: 'El equipo de Love Adora guía a nuestra congregación a conectar con el corazón de Dios a través de la música contemporánea, devoción genuina y excelencia en cada culto y vigilia.',
    priority: 2
  },
  {
    title: 'Buenas Nuevas y Próximos Bautismos',
    message: 'Inscripciones abiertas para el discipulado de nuevos creyentes y próximos bautismos en agua. Si diste tu paso de fe o deseas afirmar tu compromiso, acércate al módulo pastoral.',
    priority: 1
  }
];

/**
 * Sembrado inicial de datos en Firestore (idempotente).
 * Inserta los registros por defecto en cualquier colección que esté vacía.
 */
export async function seedInitialData(actor) {
  requireService(db, 'Firestore');
  let productsCount = 0;
  let eventsCount = 0;
  let announcementsCount = 0;

  try {
    // 1. Love Market
    const prodSnap = await getDocs(collection(db, 'market_products'));
    if (prodSnap.empty) {
      for (const prod of DEFAULT_MARKET_PRODUCTS) {
        await addDoc(collection(db, 'market_products'), {
          ...prod,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        productsCount++;
      }
    }

    // 2. Eventos y Horarios
    const eventsSnap = await getDocs(collection(db, 'events'));
    if (eventsSnap.empty) {
      for (const evt of DEFAULT_EVENTS) {
        await addDoc(collection(db, 'events'), {
          ...evt,
          dateStart: evt.dateStart ? new Date(evt.dateStart) : new Date(),
          dateEnd: evt.dateEnd ? new Date(evt.dateEnd) : null,
          createdAt: serverTimestamp(),
          updatedByName: actor?.displayName || 'Sistema'
        });
        eventsCount++;
      }
    }

    // 3. Avisos y Ministerios
    const annSnap = await getDocs(collection(db, 'announcements'));
    if (annSnap.empty) {
      for (const ann of DEFAULT_ANNOUNCEMENTS) {
        await addDoc(collection(db, 'announcements'), {
          ...ann,
          publishDate: new Date(),
          expirationDate: null,
          createdAt: serverTimestamp()
        });
        announcementsCount++;
      }
    }

    if (productsCount > 0 || eventsCount > 0 || announcementsCount > 0) {
      await logAudit({
        actor: actor || { role: 'superadmin', displayName: 'Christian Romero' },
        action: 'seed.initial_data',
        module: 'system',
        details: { products: productsCount, events: eventsCount, announcements: announcementsCount }
      });
    }

    return {
      productsCount,
      eventsCount,
      announcementsCount,
      alreadySeeded: productsCount === 0 && eventsCount === 0 && announcementsCount === 0
    };
  } catch (error) {
    console.error('[CL] Error al sembrar datos iniciales:', error);
    throw new Error(error.message || 'Error durante la sincronización de datos iniciales.');
  }
}
