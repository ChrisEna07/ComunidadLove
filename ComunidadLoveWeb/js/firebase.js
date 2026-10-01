/* ==========================================================================
   CLIENTE FIREBASE ÚNICO (SDK v10+ modular, sin build)
   --------------------------------------------------------------------------
   Punto de entrada centralizado. Si la configuración sigue con placeholders
   o la red falla, `firebaseReady` queda en false y toda la aplicación
   degrada con elegancia: la landing conserva su contenido estático actual.
   ========================================================================== */

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';

export const configError = (() => {
  if (isFirebaseConfigured()) return null;
  return 'Firebase sin configurar: completa js/firebase-config.js con los datos de tu proyecto.';
})();

export const firebaseReady = configError === null;

let app = null;
let db = null;
let auth = null;

if (firebaseReady) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
  } catch (error) {
    console.error('[CL] No se pudo inicializar Firebase:', error);
  }
}

export { app, db, auth };

export function requireService(service, name) {
  if (!service) {
    throw new Error(`${name} no está disponible. ${configError || 'Revisa la consola del navegador.'}`);
  }
  return service;
}
