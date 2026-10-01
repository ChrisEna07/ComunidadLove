/* ==========================================================================
   MODO OFFLINE Y SOPORTE PWA (CLGESTIÓN & COMUNIDAD LOVE)
   --------------------------------------------------------------------------
   - Registro de Service Worker (sw.js) y Web App Manifest.
   - Banner de conectividad flotante (offline/online).
   - Manejo de instalación PWA ("Instalar App Localmente").
   ========================================================================== */

let deferredInstallPrompt = null;
const installListeners = new Set();
let isPwaInitialized = false;

export function initPWA() {
  if (isPwaInitialized || typeof window === 'undefined') return;
  isPwaInitialized = true;

  // 1. Registro del Service Worker
  if ('serviceWorker' in navigator) {
    const swPath = window.location.pathname.includes('/admin/') ? '../sw.js' : './sw.js';
    navigator.serviceWorker
      .register(swPath)
      .then((reg) => {
        console.info('[PWA] Service Worker registrado con alcance:', reg.scope);
      })
      .catch((err) => {
        console.warn('[PWA] Fallo al registrar Service Worker:', err);
      });
  }

  // 2. Captura del evento de instalación
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    installListeners.forEach((fn) => {
      try {
        fn(true);
      } catch {}
    });
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    installListeners.forEach((fn) => {
      try {
        fn(false);
      } catch {}
    });
    console.info('[PWA] Aplicación instalada exitosamente.');
  });

  // 3. Montar Banner Flotante de Conectividad
  setupConnectivityBanner();
}

export function canInstallPWA() {
  return Boolean(deferredInstallPrompt);
}

export async function installPWAApp() {
  if (!deferredInstallPrompt) {
    return false;
  }
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  return outcome === 'accepted';
}

export function onPWAInstallAvailable(fn) {
  installListeners.add(fn);
  if (deferredInstallPrompt) fn(true);
  return () => installListeners.delete(fn);
}

function setupConnectivityBanner() {
  let chip = document.getElementById('clg-connectivity-chip');
  if (!chip) {
    chip = document.createElement('aside');
    chip.id = 'clg-connectivity-chip';
    chip.setAttribute('aria-live', 'polite');
    chip.style.position = 'fixed';
    chip.style.top = '14px';
    chip.style.right = '16px';
    chip.style.zIndex = '999999';
    chip.style.padding = '8px 16px';
    chip.style.borderRadius = '30px';
    chip.style.fontSize = '0.82rem';
    chip.style.fontWeight = '600';
    chip.style.display = 'none';
    chip.style.alignItems = 'center';
    chip.style.gap = '8px';
    chip.style.boxShadow = '0 6px 20px rgba(0,0,0,0.35)';
    chip.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
    chip.style.backdropFilter = 'blur(6px)';
    document.body.appendChild(chip);
  }

  let onlineTimer = null;

  function showOffline() {
    if (onlineTimer) clearTimeout(onlineTimer);
    chip.style.display = 'inline-flex';
    chip.style.background = 'rgba(239, 68, 68, 0.95)';
    chip.style.color = '#ffffff';
    chip.style.border = '1px solid #f87171';
    chip.innerHTML = '<i class="fas fa-triangle-exclamation"></i> <span>⚠️ Trabajando sin conexión. Los cambios se guardarán localmente.</span>';
    chip.style.transform = 'translateY(0) scale(1)';
    chip.style.opacity = '1';
  }

  function showOnline() {
    chip.style.display = 'inline-flex';
    chip.style.background = 'rgba(16, 185, 129, 0.95)';
    chip.style.color = '#ffffff';
    chip.style.border = '1px solid #34d399';
    chip.innerHTML = '<i class="fas fa-circle-check"></i> <span>✓ Conexión restablecida y sincronizada</span>';
    chip.style.transform = 'translateY(0) scale(1)';
    chip.style.opacity = '1';

    onlineTimer = setTimeout(() => {
      chip.style.opacity = '0';
      chip.style.transform = 'translateY(-10px) scale(0.95)';
      setTimeout(() => {
        chip.style.display = 'none';
      }, 300);
    }, 4000);
  }

  window.addEventListener('offline', showOffline);
  window.addEventListener('online', showOnline);

  if (!navigator.onLine) {
    showOffline();
  }
}
