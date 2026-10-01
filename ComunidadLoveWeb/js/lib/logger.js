/* ==========================================================================
   MÓDULO DE DIAGNÓSTICO Y CONSOLA TÉCNICA (CLGESTIÓN)
   --------------------------------------------------------------------------
   Intercepta globalmente excepciones, promesas rechazadas y advertencias
   del sistema para inspección en tiempo real por el Super Admin.
   ========================================================================== */

import { db } from '../firebase.js';
import { doc, getDoc } from 'firebase/firestore';

const MAX_LOGS = 200;
const STORAGE_KEY = 'cl_diagnostic_logs';

const listeners = new Set();
let logBuffer = [];

// Cargar logs previos de la sesión
try {
  const saved = sessionStorage.getItem(STORAGE_KEY);
  if (saved) {
    logBuffer = JSON.parse(saved);
  }
} catch {}

function notifyListeners() {
  const currentLogs = [...logBuffer];
  listeners.forEach((fn) => {
    try {
      fn(currentLogs);
    } catch {}
  });
}

function persistLogs() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(logBuffer.slice(-MAX_LOGS)));
  } catch {}
}

export function logDiagnostic({ level = 'error', module = 'Sistema', message = '', stack = '', details = null }) {
  const entry = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    timeFormatted: new Date().toLocaleTimeString('es-CO', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }),
    level, // 'error' | 'warn' | 'info'
    module,
    message: String(message || 'Error no especificado'),
    stack: stack ? String(stack) : null,
    details
  };

  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOGS) {
    logBuffer = logBuffer.slice(-MAX_LOGS);
  }

  persistLogs();
  notifyListeners();
  return entry;
}

export function getLogs() {
  return [...logBuffer];
}

export function clearLogs() {
  logBuffer = [];
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
  notifyListeners();
}

export function subscribeLogs(fn) {
  listeners.add(fn);
  fn([...logBuffer]);
  return () => listeners.delete(fn);
}

// Medición de latencia y estado de Firestore
export async function checkSystemStatus() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      status: 'offline',
      tone: 'danger',
      label: 'Sin red',
      icon: 'fa-wifi-slash',
      latency: null
    };
  }

  const start = performance.now();
  try {
    const probePromise = getDoc(doc(db, 'site_settings', 'main'));
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout de red')), 4000)
    );
    await Promise.race([probePromise, timeoutPromise]);
    const end = performance.now();
    const latency = Math.round(end - start);

    return {
      status: 'online',
      tone: 'success',
      label: 'Conectado',
      icon: 'fa-circle-check',
      latency
    };
  } catch (err) {
    return {
      status: 'local',
      tone: 'warning',
      label: 'Trabajando local',
      icon: 'fa-database',
      latency: null,
      error: err.message
    };
  }
}

// Interceptores Globales Automáticos
let initialized = false;

export function initGlobalErrorCapture() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  window.addEventListener('error', (event) => {
    const filename = event.filename ? event.filename.split('/').pop() : 'desconocido';
    logDiagnostic({
      level: 'error',
      module: filename,
      message: event.message || 'Error no controlado',
      stack: event.error?.stack || `Línea: ${event.lineno}:${event.colno}`,
      details: {
        lineno: event.lineno,
        colno: event.colno,
        filename: event.filename
      }
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = (reason && (reason.message || reason.name)) || String(reason || 'Promesa rechazada sin control');
    const stack = (reason && reason.stack) || '';
    
    // Identificar módulo probable si es Firestore
    let mod = 'Async';
    if (msg.includes('firestore') || msg.includes('permission') || msg.includes('FirebaseError')) {
      mod = 'Firestore';
    } else if (msg.includes('auth')) {
      mod = 'Auth';
    }

    logDiagnostic({
      level: 'error',
      module: mod,
      message: msg,
      stack,
      details: reason
    });
  });

  // Interceptar advertencias clave de Firestore o imports
  const originalWarn = console.warn;
  console.warn = (...args) => {
    originalWarn.apply(console, args);
    const firstStr = String(args[0] || '');
    if (firstStr.startsWith('[CL]') || firstStr.includes('Firestore') || firstStr.includes('Firebase')) {
      logDiagnostic({
        level: 'warn',
        module: 'Advertencia CL',
        message: args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
      });
    }
  };
}
