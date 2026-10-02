/* ==========================================================================
   VISTA: CONSOLA DE DIAGNÓSTICO EN TIEMPO REAL (Exclusiva Super Admin)
   --------------------------------------------------------------------------
   Visor interactivo de eventos, excepciones y monitor de latencia Firestore.
   Incluye diagnóstico explicativo con causas probables, sugerencias,
   categorización de origen y botón directo de Restablecimiento de Fábrica.
   ========================================================================== */

import { getLogs, clearLogs, subscribeLogs, checkSystemStatus, logDiagnostic } from '../../lib/logger.js';
import { escapeHTML, qs, qsa, showToast } from '../../lib/dom.js';
import { pageHeader } from '../ui.js';
import { getState } from '../store.js';
import { openHardResetModal } from '../hard-reset-modal.js';

export function analyzeDiagnosticLog(item) {
  const msg = String(item.message || '');
  const stack = String(item.stack || '');
  const mod = String(item.module || '');
  const combined = `${msg} ${stack} ${mod}`.toLowerCase();

  // 1. Prueba sintética
  if (mod.toLowerCase().includes('testrunner') || combined.includes('sintético') || combined.includes('test error')) {
    return {
      category: 'Prueba Sintética',
      tagColor: '#c084fc',
      tagBg: 'rgba(192, 132, 252, 0.15)',
      icon: 'fa-vial',
      cause: 'Prueba manual disparada por el Super Admin para verificar el interceptor.',
      solution: 'El sistema de captura y registro opera con total normalidad.'
    };
  }

  // 2. Permisos y Reglas Firestore
  if (
    combined.includes('permission-denied') ||
    combined.includes('insufficient permissions') ||
    combined.includes('permission denied') ||
    combined.includes('permisos') ||
    combined.includes('missing or insufficient')
  ) {
    return {
      category: 'Firestore Permisos',
      tagColor: '#f43f5e',
      tagBg: 'rgba(244, 63, 94, 0.15)',
      icon: 'fa-shield-halved',
      cause: 'Intento de lectura/escritura bloqueado por las reglas de seguridad de Firestore (firestore.rules).',
      solution: 'Verifica los permisos asignados a tu rol de usuario en la base de datos o que tu sesión de Authentication no haya expirado.'
    };
  }

  // 3. Red y Conectividad
  if (
    combined.includes('network') ||
    combined.includes('offline') ||
    combined.includes('timeout') ||
    combined.includes('unavailable') ||
    combined.includes('failed to fetch') ||
    combined.includes('sin red')
  ) {
    return {
      category: 'Red / Conectividad',
      tagColor: '#fbbf24',
      tagBg: 'rgba(251, 191, 36, 0.15)',
      icon: 'fa-wifi',
      cause: 'Interrupción o alta latencia al comunicar con los servidores de Firebase / CDN.',
      solution: 'Comprueba la conexión a internet. La aplicación cuenta con persistencia local IndexedDB para seguir funcionando.'
    };
  }

  // 4. Carga de Assets 404
  if (
    combined.includes('404') ||
    combined.includes('failed to load resource') ||
    combined.includes('not found') ||
    combined.includes('err_name_not_resolved') ||
    combined.includes('net::err_file_not_found')
  ) {
    return {
      category: 'Carga de Assets 404',
      tagColor: '#fb923c',
      tagBg: 'rgba(251, 146, 60, 0.15)',
      icon: 'fa-file-circle-xmark',
      cause: 'El navegador intentó descargar una imagen, CSS o recurso estático inexistente (HTTP 404).',
      solution: 'Comprueba la ruta física en la carpeta /Assets o verifica que el enlace público/Google Drive sea accesible.'
    };
  }

  // 5. Sintaxis y Excepción de Ejecución JS
  if (
    combined.includes('syntaxerror') ||
    combined.includes('referenceerror') ||
    combined.includes('typeerror') ||
    combined.includes('rangeerror') ||
    combined.includes('is not defined') ||
    combined.includes('cannot read property') ||
    combined.includes('unexpected token')
  ) {
    return {
      category: 'Sintaxis / Error JS',
      tagColor: '#ef4444',
      tagBg: 'rgba(239, 68, 68, 0.15)',
      icon: 'fa-code',
      cause: 'Excepción de ejecución en el código de la aplicación cliente (variable no definida o tipo inválido).',
      solution: 'Expande el "Stack trace" para localizar el archivo fuente y el número exacto de línea donde ocurrió la falla.'
    };
  }

  // 6. Por defecto según nivel
  if (item.level === 'error') {
    return {
      category: 'Excepción Sistema',
      tagColor: '#f87171',
      tagBg: 'rgba(248, 113, 113, 0.15)',
      icon: 'fa-triangle-exclamation',
      cause: 'Excepción no clasificada registrada durante la ejecución.',
      solution: 'Inspecciona los detalles técnicos y el stack trace para mayor contexto.'
    };
  }

  if (item.level === 'warn') {
    return {
      category: 'Aviso del Sistema',
      tagColor: '#facc15',
      tagBg: 'rgba(250, 204, 21, 0.15)',
      icon: 'fa-circle-exclamation',
      cause: 'Advertencia detectada por un servicio o interceptor.',
      solution: 'Monitorea el comportamiento para asegurar que no degrade la experiencia de usuario.'
    };
  }

  return {
    category: 'Diagnóstico Info',
    tagColor: '#38bdf8',
    tagBg: 'rgba(56, 189, 248, 0.15)',
    icon: 'fa-circle-info',
    cause: 'Registro informativo del sistema.',
    solution: null
  };
}

export function renderConsola(container) {
  let filterLevel = 'all';
  let autoScroll = true;
  let currentStatus = { status: 'checking', label: 'Verificando…', icon: 'fa-circle-notch', latency: null, tone: 'neutral' };
  let statusInterval = null;

  const actor = getState().profile;
  const isSuperAdmin = actor?.role === 'superadmin' || !actor || actor.email === 'christianromerox@gmail.com';

  container.innerHTML = `
    <div class="clg-view clg-view-consola">
      ${pageHeader({
        title: 'Consola Técnica Dev & Diagnóstico',
        subtitle: 'Monitor en tiempo real de excepciones, llamadas a Firestore y salud de la plataforma (Exclusivo Super Admin).',
        actions: `
          <button type="button" class="clg-btn clg-btn-ghost clg-btn-sm" id="btn-ping-status">
            <i class="fas fa-arrows-rotate"></i><span>Medir Latencia</span>
          </button>
          <button type="button" class="clg-btn clg-btn-ghost clg-btn-sm" id="btn-test-error" title="Genera un error sintético para validar la captura">
            <i class="fas fa-bug"></i><span>Test Error</span>
          </button>
          ${
            isSuperAdmin
              ? `
              <button type="button" class="clg-btn clg-btn-danger clg-btn-sm" id="btn-consola-hard-reset" title="Restablecer base de datos a estado de fábrica con respaldo de seguridad">
                <i class="fas fa-triangle-exclamation"></i><span>Restablecer Datos de Fábrica</span>
              </button>
            `
              : ''
          }
        `
      })}

      <!-- Tarjetas de Monitor de Estado -->
      <section class="clg-stats-grid" id="consola-status-cards" style="margin-bottom: 20px;">
        <article class="clg-stat-card" style="border-left: 4px solid var(--clg-primary);">
          <div class="clg-stat-body">
            <span class="clg-stat-label">Estado de Red</span>
            <div class="clg-stat-value" id="status-net-label" style="font-size: 1.25rem; display: flex; align-items: center; gap: 8px;">
              <i class="fas fa-circle-notch fa-spin"></i> Verificando...
            </div>
          </div>
          <div class="clg-stat-icon" style="color: var(--clg-primary);"><i class="fas fa-network-wired"></i></div>
        </article>

        <article class="clg-stat-card" style="border-left: 4px solid var(--clg-success);">
          <div class="clg-stat-body">
            <span class="clg-stat-label">Latencia Firestore</span>
            <div class="clg-stat-value" id="status-latency-val" style="font-size: 1.25rem;">
              -- ms
            </div>
          </div>
          <div class="clg-stat-icon" style="color: var(--clg-success);"><i class="fas fa-bolt"></i></div>
        </article>

        <article class="clg-stat-card" style="border-left: 4px solid var(--clg-danger);">
          <div class="clg-stat-body">
            <span class="clg-stat-label">Excepciones Capturadas</span>
            <div class="clg-stat-value" id="status-error-count" style="font-size: 1.25rem;">
              0
            </div>
          </div>
          <div class="clg-stat-icon" style="color: var(--clg-danger);"><i class="fas fa-triangle-exclamation"></i></div>
        </article>

        <article class="clg-stat-card" style="border-left: 4px solid var(--clg-info);">
          <div class="clg-stat-body">
            <span class="clg-stat-label">Modo de Ejecución</span>
            <div class="clg-stat-value" style="font-size: 1.25rem;">
              PWA / ESM
            </div>
          </div>
          <div class="clg-stat-icon" style="color: var(--clg-info);"><i class="fas fa-microchip"></i></div>
        </article>
      </section>

      <!-- Consola / Terminal Log Viewer -->
      <div class="clg-card" style="padding: 0; overflow: hidden; background: #0b0f19; border: 1px solid #1e293b; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
        <!-- Toolbar de la consola -->
        <div style="background: #111827; padding: 12px 16px; border-bottom: 1px solid #1f2937; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="display: flex; gap: 6px;">
              <span style="width: 12px; height: 12px; border-radius: 50%; background: #ef4444; display: inline-block;"></span>
              <span style="width: 12px; height: 12px; border-radius: 50%; background: #f59e0b; display: inline-block;"></span>
              <span style="width: 12px; height: 12px; border-radius: 50%; background: #10b981; display: inline-block;"></span>
            </div>
            <strong style="color: #94a3b8; font-family: monospace; font-size: 0.9rem; margin-left: 10px;">live_diagnostics_stream.log</strong>
          </div>

          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <div class="clg-tabs" style="margin: 0; background: #1f2937; padding: 2px; border-radius: 6px;">
              <button type="button" class="clg-tab is-active" data-filter-level="all" style="padding: 4px 10px; font-size: 0.78rem;">Todos</button>
              <button type="button" class="clg-tab" data-filter-level="error" style="padding: 4px 10px; font-size: 0.78rem; color: #f87171;">Errores</button>
              <button type="button" class="clg-tab" data-filter-level="warn" style="padding: 4px 10px; font-size: 0.78rem; color: #fbbf24;">Avisos</button>
            </div>

            <button type="button" class="clg-btn clg-btn-sm" id="btn-copy-logs" style="background: #1f2937; color: #cbd5e1; font-size: 0.78rem;">
              <i class="fas fa-copy"></i><span>Copiar Log</span>
            </button>
            <button type="button" class="clg-btn clg-btn-sm" id="btn-clear-logs" style="background: #1f2937; color: #ef4444; font-size: 0.78rem;">
              <i class="fas fa-trash"></i><span>Limpiar</span>
            </button>
          </div>
        </div>

        <!-- Terminal Output -->
        <div id="consola-stream" style="padding: 16px; font-family: 'Consolas', 'Fira Code', monospace; font-size: 0.82rem; line-height: 1.6; max-height: 520px; min-height: 280px; overflow-y: auto; color: #e2e8f0; background: #090d16;">
          <!-- Items renderizados aquí -->
        </div>

        <!-- Terminal Footer -->
        <div style="background: #111827; padding: 8px 16px; border-top: 1px solid #1f2937; display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: #64748b;">
          <div><i class="fas fa-circle" style="color: #10b981; font-size: 0.55rem; vertical-align: middle;"></i> Interceptores de ventana y promesas activos con diagnóstico inteligente.</div>
          <label style="cursor: pointer; display: flex; align-items: center; gap: 6px;">
            <input type="checkbox" id="check-autoscroll" checked>
            <span>Auto-scroll</span>
          </label>
        </div>
      </div>
    </div>
  `;

  const streamHost = qs('#consola-stream', container);
  const statusLabel = qs('#status-net-label', container);
  const latencyVal = qs('#status-latency-val', container);
  const errorCountVal = qs('#status-error-count', container);
  const checkAutoScroll = qs('#check-autoscroll', container);

  async function updateNetworkStatus() {
    statusLabel.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Midiendo…';
    const res = await checkSystemStatus();
    currentStatus = res;

    const iconColor = res.tone === 'success' ? '#10b981' : (res.tone === 'warning' ? '#f59e0b' : '#ef4444');
    statusLabel.innerHTML = `<i class="fas ${res.icon}" style="color: ${iconColor};"></i> <span>${escapeHTML(res.label)}</span>`;
    latencyVal.textContent = res.latency !== null ? `${res.latency} ms` : 'N/A';
    latencyVal.style.color = res.latency && res.latency < 250 ? '#10b981' : (res.latency ? '#f59e0b' : '#ef4444');
  }

  function renderStream(logs) {
    const totalErrors = logs.filter((l) => l.level === 'error').length;
    if (errorCountVal) errorCountVal.textContent = String(totalErrors);

    let filtered = logs;
    if (filterLevel !== 'all') {
      filtered = filtered.filter((l) => l.level === filterLevel);
    }

    if (!filtered.length) {
      streamHost.innerHTML = `
        <div style="padding: 40px 20px; text-align: center; color: #475569;">
          <i class="fas fa-terminal" style="font-size: 2rem; margin-bottom: 10px; display: block; opacity: 0.4;"></i>
          No hay eventos registrados bajo el filtro actual.
        </div>
      `;
      return;
    }

    streamHost.innerHTML = filtered
      .map((item, idx) => {
        const isErr = item.level === 'error';
        const isWarn = item.level === 'warn';
        const levelColor = isErr ? '#ef4444' : (isWarn ? '#f59e0b' : '#38bdf8');
        const levelBadge = isErr ? '[ERROR]' : (isWarn ? '[WARN] ' : '[INFO] ');
        const analysis = analyzeDiagnosticLog(item);

        return `
        <div class="clg-log-row" style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; gap: 6px;" data-log-id="${item.id}">
          <!-- Encabezado de Evento -->
          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <span style="color: #64748b; font-size: 0.76rem;">${escapeHTML(item.timeFormatted || item.timestamp)}</span>
            <span style="color: ${levelColor}; font-weight: 700; font-size: 0.78rem;">${levelBadge}</span>
            
            <span style="display: inline-flex; align-items: center; gap: 5px; background: ${analysis.tagBg}; color: ${analysis.tagColor}; border: 1px solid ${analysis.tagColor}40; border-radius: 4px; padding: 2px 7px; font-size: 0.72rem; font-weight: 600;">
              <i class="fas ${analysis.icon}"></i> ${escapeHTML(analysis.category)}
            </span>

            <span style="color: #c084fc; font-weight: 600; font-size: 0.78rem;">[${escapeHTML(item.module || 'App')}]</span>
            <span style="color: #f1f5f9; flex: 1; word-break: break-word; font-size: 0.82rem;">${escapeHTML(item.message)}</span>
            
            ${
              item.stack
                ? `<button type="button" class="btn-toggle-stack" data-idx="${idx}" style="background: rgba(56,189,248,0.1); border: 1px solid rgba(56,189,248,0.3); border-radius: 4px; padding: 2px 8px; color: #38bdf8; cursor: pointer; font-size: 0.72rem; font-weight: 600;"><i class="fas fa-layer-group"></i> Stack trace</button>`
                : ''
            }
          </div>

          <!-- Caja de Diagnóstico Inteligente (Causa Probable & Sugerencia) -->
          <div style="background: rgba(255,255,255,0.02); border-left: 3px solid ${analysis.tagColor}; padding: 7px 12px; border-radius: 4px; margin-left: 8px; font-size: 0.76rem; color: #cbd5e1; line-height: 1.5;">
            <div><strong style="color: ${analysis.tagColor};">Causa probable:</strong> ${escapeHTML(analysis.cause)}</div>
            ${
              analysis.solution
                ? `<div style="margin-top: 3px; color: #94a3b8;"><strong style="color: #f1f5f9;"><i class="fas fa-lightbulb" style="color: #fbbf24;"></i> Sugerencia:</strong> ${escapeHTML(analysis.solution)}</div>`
                : ''
            }
          </div>

          <!-- Stack Trace Técnico Colapsable -->
          ${
            item.stack
              ? `
            <pre class="clg-log-stack" id="stack-${idx}" style="display: none; margin: 6px 0 2px 8px; padding: 12px; background: #040711; border-left: 3px solid ${levelColor}; border-radius: 6px; color: #94a3b8; font-size: 0.74rem; overflow-x: auto; white-space: pre-wrap; font-family: monospace;">${escapeHTML(item.stack)}</pre>
          `
              : ''
          }
        </div>
      `;
      })
      .join('');

    if (autoScroll && checkAutoScroll?.checked) {
      streamHost.scrollTop = streamHost.scrollHeight;
    }
  }

  // Delegación de clic para ver stack traces
  streamHost.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-toggle-stack');
    if (!btn) return;
    const idx = btn.dataset.idx;
    const pre = qs(`#stack-${idx}`, streamHost);
    if (!pre) return;
    const isHidden = pre.style.display === 'none';
    pre.style.display = isHidden ? 'block' : 'none';
    btn.innerHTML = isHidden
      ? '<i class="fas fa-chevron-up"></i> Ocultar stack'
      : '<i class="fas fa-layer-group"></i> Stack trace';
  });

  // Filtros
  qsa('[data-filter-level]', container).forEach((btn) => {
    btn.addEventListener('click', () => {
      qsa('[data-filter-level]', container).forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      filterLevel = btn.dataset.filterLevel;
      renderStream(getLogs());
    });
  });

  // Función segura de copiado al portapapeles sin errores de selección de nodos ni violación de contexto
  async function copyLogToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const tempInput = document.createElement('textarea');
        tempInput.value = text;
        tempInput.style.position = 'fixed';
        tempInput.style.left = '-9999px';
        tempInput.style.top = '-9999px';
        tempInput.setAttribute('readonly', '');
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
      }
      showToast('Logs de diagnóstico copiados al portapapeles.', 'success');
    } catch (err) {
      console.error('[CL] Error al copiar logs:', err);
      showToast('No se pudo acceder al portapapeles.', 'warning');
    }
  }

  // Copiar Logs
  qs('#btn-copy-logs', container)?.addEventListener('click', async () => {
    const logs = getLogs();
    if (!logs.length) {
      showToast('No hay logs para copiar.', 'info');
      return;
    }
    const text = JSON.stringify(logs, null, 2);
    await copyLogToClipboard(text);
  });

  // Limpiar
  qs('#btn-clear-logs', container)?.addEventListener('click', () => {
    clearLogs();
    showToast('Consola de diagnóstico reiniciada.', 'info');
  });

  // Botón test error sintético
  qs('#btn-test-error', container)?.addEventListener('click', () => {
    logDiagnostic({
      level: 'error',
      module: 'TestRunner',
      message: 'Excepción sintética de prueba generada por el Super Admin.',
      stack: 'Error: Test Error\n    at renderConsola (consola.js:42:15)\n    at router.js:88'
    });
    showToast('Error sintético registrado en consola.', 'info');
  });

  // Botón Hard Reset de Fábrica (Super Admin)
  qs('#btn-consola-hard-reset', container)?.addEventListener('click', () => {
    openHardResetModal(actor);
  });

  // Medir Latencia Manual
  qs('#btn-ping-status', container)?.addEventListener('click', updateNetworkStatus);

  // Auto-medición al cargar y cada 15 segundos
  updateNetworkStatus();
  statusInterval = setInterval(updateNetworkStatus, 15000);

  // Suscripción en vivo al búfer de logs
  const unsubLogs = subscribeLogs(renderStream);

  // Retorno de función de limpieza al navegar fuera de la vista
  return () => {
    unsubLogs();
    if (statusInterval) clearInterval(statusInterval);
  };
}
