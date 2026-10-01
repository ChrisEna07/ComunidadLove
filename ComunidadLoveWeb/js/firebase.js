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
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

let firebaseConfig = null;
let isConfigured = false;

// 1. Intentar cargar js/firebase-config.js (ignorado en git) de forma tolerante a 404
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
  // En Vercel o clones sin el archivo, se captura el 404 aquí sin quebrar el módulo
  console.info('[CL] Archivo js/firebase-config.js no presente en el servidor. Verificando alternativas...');
}

// 2. Fallback: window.__FIREBASE_CONFIG__ (inyectado por scripts o servidor)
if (!isConfigured && typeof window !== 'undefined' && window.__FIREBASE_CONFIG__) {
  firebaseConfig = window.__FIREBASE_CONFIG__;
  isConfigured = Boolean(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);
}

// 3. Fallback: localStorage (permite conectar Firebase en Vercel directamente desde la interfaz)
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

// 4. Fallback: firebase-config.example.js (archivo de plantilla versionado en el repositorio)
if (!isConfigured) {
  try {
    const exampleMod = await import('./firebase-config.example.js');
    if (exampleMod && exampleMod.firebaseConfig) {
      if (!firebaseConfig) firebaseConfig = exampleMod.firebaseConfig;
    }
  } catch {}
}

export const configError = (() => {
  if (isConfigured) return null;
  return 'Configuración de Firebase no encontrada: el archivo js/firebase-config.js no está presente en el servidor o contiene valores de plantilla.';
})();

export const firebaseReady = isConfigured;

let app = null;
let db = null;
let auth = null;

if (firebaseReady && firebaseConfig) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
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
