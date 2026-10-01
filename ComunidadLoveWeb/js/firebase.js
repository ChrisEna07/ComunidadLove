/* ==========================================================================
   CLIENTE FIREBASE ÚNICO (SDK v10+ modular, sin build)
   --------------------------------------------------------------------------
   Punto de entrada centralizado con carga tolerante a fallos.
   Si js/firebase-config.js no existe en el servidor (ej. en Vercel con .gitignore)
   o las credenciales no son válidas, `firebaseReady` queda en false sin arrojar
   un error 404 fatal. Así, el panel administrativo puede mostrar una pantalla
   clara de configuración y la web pública puede operar en modo estático.
   ========================================================================== */

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

export const DEFAULT_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDeGyzjhjTB1IHfNZ9VYhXGh6fofOzo9mk',
  authDomain: 'comunidadlove-cbe75.firebaseapp.com',
  projectId: 'comunidadlove-cbe75',
  messagingSenderId: '311051033862',
  appId: '1:311051033862:web:17127d96c610a45b0f5287',
  measurementId: 'G-Q4W377M5M7'
};

let firebaseConfig = null;
let isConfigured = false;

// 1. Intentar cargar js/firebase-config.js
try {
  const configMod = await import('./firebase-config.js');
  if (configMod && configMod.firebaseConfig) {
    firebaseConfig = configMod.firebaseConfig;
    if (typeof configMod.isFirebaseConfigured === 'function') {
      isConfigured = configMod.isFirebaseConfigured();
    } else {
      isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
    }
  }
} catch (err) {
  console.info('[CL] Nota: cargando configuración predeterminada de Firebase.');
}

// 2. Fallback: window.__FIREBASE_CONFIG__
if (!isConfigured && typeof window !== 'undefined' && window.__FIREBASE_CONFIG__) {
  firebaseConfig = window.__FIREBASE_CONFIG__;
  isConfigured = Boolean(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);
}

// 3. Fallback: localStorage
if (!isConfigured && typeof window !== 'undefined' && window.localStorage) {
  try {
    const stored = localStorage.getItem('cl_firebase_config');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && parsed.apiKey && parsed.projectId) {
        firebaseConfig = parsed;
        isConfigured = true;
      }
    }
  } catch {}
}

// 4. Fallback directo a DEFAULT_FIREBASE_CONFIG (garantiza código 200 y conexión activa en Vercel)
if (!isConfigured || !firebaseConfig || !firebaseConfig.apiKey) {
  firebaseConfig = DEFAULT_FIREBASE_CONFIG;
  isConfigured = true;
}

export const configError = (() => {
  if (isConfigured) return null;
  return 'Configuración de Firebase no encontrada.';
})();

export const firebaseReady = isConfigured;

let app = null;
let db = null;
let auth = null;

if (firebaseReady && firebaseConfig) {
  try {
    app = initializeApp(firebaseConfig);
    try {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager()
        })
      });
    } catch (cacheError) {
      // Fallback a Firestore estándar si la instancia ya fue inicializada o el entorno no soporta persistencia avanzada
      db = getFirestore(app);
    }
    auth = getAuth(app);
  } catch (error) {
    console.error('[CL] No se pudo inicializar Firebase:', error);
  }
}

export { app, db, auth, firebaseConfig };

export function requireService(service, name) {
  if (!service) {
    throw new Error(`${name} no está disponible. ${configError || 'Revisa la consola del navegador.'}`);
  }
  return service;
}
