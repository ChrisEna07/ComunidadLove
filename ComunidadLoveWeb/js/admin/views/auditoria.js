/* ==========================================================================
   VISTA: AUDITORÍA DEL SISTEMA
   --------------------------------------------------------------------------
   Muestra quién hizo qué, cuándo y sobre qué módulo. Sólo la ven el
   superadmin, el pastor o quien tenga delegada la función `audit.view`
   (el router y `store.js` ya filtran el acceso).

   Las acciones del superadmin no se registran por diseño, así que este
   registro refleja el trabajo del resto del equipo.

   Filtros: texto libre, módulo y acción. El botón "Exportar" genera un CSV
   local con lo que hay en pantalla, sin subir nada a ningún servidor.
   ========================================================================== */

import {
  AUDIT_MODULES,
  AUDIT_MODULE_LABELS,
  auditActionTone
} from '../../services/audit.js';
import { escapeHTML, qs, showToast } from '../../lib/dom.js';
import { smartDate, formatDateTime, toDate, sameDay } from '../../lib/dates.js';
import { subscribe, getState } from '../store.js';
import {
  pageHeader,
  emptyState,
  statCard,
  tag,
  field
} from '../ui.js';

const ACTION_LABELS = {
  'members.create': 'Registró un miembro',
  'members.update': 'Editó un miembro',
  'members.delete': 'Eliminó un miembro',
  'members.attendance': 'Registró asistencia',
  'events.create': 'Creó un evento',
  'events.update': 'Editó un evento',
  'events.delete': 'Eliminó un evento',
  'market.create': 'Creó un producto',
  'market.update': 'Editó un producto',
  'market.delete': 'Eliminó un producto',
  'market.toggle': 'Cambió el estado de un producto',
  'prayers.create': 'Respondió una petición',
  'prayers.reply': 'Respondió una petición',
  'prayers.status': 'Cambió el estado de una petición',
  'prayers.visibility': 'Cambió la visibilidad de una petición',
  'prayers.delete': 'Eliminó una petición',
  'users.create': 'Registró un usuario',
  'users.update': 'Editó un usuario',
  'users.deactivate': 'Desactivó un usuario',
  'users.reactivate': 'Reactivó un usuario',
  'users.delete': 'Eliminó un usuario',
  'users.role.change': 'Cambió un rol',
  'users.password.reset': 'Envió restablecimiento de contraseña',
  'settings.update': 'Actualizó los ajustes'
};

function actionLabel(action) {
  return ACTION_LABELS[action] || action || 'Acción';
}

export function renderAuditoria(container) {
  container.innerHTML = `
    ${pageHeader({
      title: 'Auditoría',
      subtitle: 'Registro de las acciones realizadas por el equipo',
      icon: 'fa-clipboard-list'
    })}
    <div class="clg-stats-grid" id="clg-audit-stats"></div>
    <div class="clg-toolbar" id="clg-audit-toolbar"></div>
    <div id="clg-audit-body">
      <div class="clg-table-skeleton">
        ${Array.from({ length: 4 }, () => '<div class="clg-skeleton-row"></div>').join('')}
      </div>
    </div>
  `;

  const statsHost = qs('#clg-audit-stats', container);
  const toolbar = qs('#clg-audit-toolbar', container);
  const body = qs('#clg-audit-body', container);

  const filters = { text: '', module: '', action: '' };

  toolbar.innerHTML = `
    <form class="clg-filters" id="clg-audit-filters" novalidate>
      ${field({
        name: 'text',
        label: 'Buscar',
        placeholder: 'Correo, nombre o detalle…',
        icon: 'fa-magnifying-glass'
      })}
      ${field({
        name: 'module',
        label: 'Módulo',
        options: [{ value: '', label: 'Todos los módulos' }].concat(
          AUDIT_MODULES.map((m) => ({ value: m, label: AUDIT_MODULE_LABELS[m] || m }))
        ),
        value: ''
      })}
      ${field({
        name: 'action',
        label: 'Acción',
        options: [{ value: '', label: 'Todas las acciones' }],
        value: ''
      })}
      <div class="clg-filters-actions">
        <button type="button" class="clg-btn clg-btn-ghost" data-action="export">
          <i class="fas fa-file-csv"></i><span>Exportar CSV</span>
        </button>
      </div>
    </form>
  `;

  const form = qs('#clg-audit-filters', toolbar);
  form.addEventListener('input', (event) => {
    const name = event.target.name;
    if (!name) return;
    filters[name] = event.target.value;
    paint();
  });

  // El filtro de acciones se arma con las acciones presentes en el registro.
  const actionSelect = qs('#clg-action', form);

  let lastRendered = [];

  const off = subscribe(['auditLogs', 'ready'], (state) => {
    const logs = state.auditLogs || [];
    syncActionOptions(actionSelect, logs);
    paint(logs);
  });

  function paint(override) {
    const logs = override || getState().auditLogs || [];
    lastRendered = logs;

    const todayCount = logs.filter((log) => sameDay(toDate(log.timestamp), new Date())).length;
    const actors = new Set(logs.map((log) => log.userEmail || log.userId).filter(Boolean)).size;

    statsHost.innerHTML = `
      ${statCard({
        label: 'Acciones registradas',
        value: String(logs.length),
        icon: 'fa-list-check',
        tone: 'primary'
      })}
      ${statCard({
        label: 'Hoy',
        value: String(todayCount),
        icon: 'fa-calendar-day',
        tone: 'news'
      })}
      ${statCard({
        label: 'Personas',
        value: String(actors),
        icon: 'fa-users',
        tone: 'info'
      })}
      ${statCard({
        label: 'Módulos',
        value: String(new Set(logs.map((l) => l.module)).size),
        icon: 'fa-layer-group',
        tone: 'neutral'
      })}
    `;

    const filtered = applyFilters(logs, filters);

    if (!filtered.length) {
      body.innerHTML = logs.length
        ? emptyState({
            icon: 'fa-filter-circle-xmark',
            title: 'Sin coincidencias',
            message: 'Prueba con otros filtros o limpia la búsqueda.'
          })
        : emptyState({
            icon: 'fa-clipboard-list',
            title: 'Todavía no hay acciones registradas',
            message: 'Aquí aparecerán los cambios que haga el equipo en el sistema.'
          });
      return;
    }

    body.innerHTML = renderTable(filtered);
  }

  /* --------------------------------------------------------------------
     EXPORTAR CSV
     -------------------------------------------------------------------- */
  form.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action="export"]');
    if (!btn) return;

    const rows = applyFilters(lastRendered, filters);
    if (!rows.length) {
      showToast('No hay registros para exportar.', 'danger');
      return;
    }
    exportCsv(rows);
    showToast(`${rows.length} registro(s) exportados`, 'success');
  });

  container.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action="refresh"]');
    if (!btn) return;
    showToast('El registro se actualiza solo en tiempo real.', 'info');
  });

  return () => off();
}

/* --------------------------------------------------------------------------
   FILTROS Y RENDER
   -------------------------------------------------------------------------- */

function syncActionOptions(select, logs) {
  if (!select) return;
  const current = select.value;
  const actions = Array.from(new Set(logs.map((l) => l.action).filter(Boolean))).sort();
  select.innerHTML =
    `<option value="">Todas las acciones</option>` +
    actions
      .map(
        (a) =>
          `<option value="${escapeHTML(a)}"${a === current ? ' selected' : ''}>${escapeHTML(actionLabel(a))}</option>`
      )
      .join('');
}

function applyFilters(logs, filters) {
  const text = String(filters.text || '').trim().toLowerCase();
  return logs.filter((log) => {
    if (filters.module && log.module !== filters.module) return false;
    if (filters.action && log.action !== filters.action) return false;
    if (!text) return true;
    const haystack = [
      log.userEmail,
      log.userName,
      log.action,
      log.module,
      describeDetails(log.details)
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(text);
  });
}

/** Los detalles se guardan como objeto; se aplanan a texto para buscar. */
function describeDetails(details) {
  if (!details || typeof details !== 'object') return '';
  return Object.entries(details)
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
    .join(' | ');
}

function renderTable(logs) {
  const rows = logs
    .map(
      (log) => `
      <tr>
        <td data-label="Cuándo">
          <span class="clg-audit-time">${escapeHTML(formatDateTime(log.timestamp))}</span>
          <small class="clg-muted">${escapeHTML(smartDate(log.timestamp))}</small>
        </td>
        <td data-label="Quién">
          <strong>${escapeHTML(log.userName || 'Sin nombre')}</strong>
          <small class="clg-muted">${escapeHTML(log.userEmail || log.userId || '—')}</small>
        </td>
        <td data-label="Acción">
          ${tag(actionLabel(log.action), auditActionTone(log.action))}
        </td>
        <td data-label="Módulo">${escapeHTML(AUDIT_MODULE_LABELS[log.module] || log.module)}</td>
        <td data-label="Detalles">
          <span class="clg-audit-details">${escapeHTML(describeDetails(log.details) || '—')}</span>
        </td>
      </tr>`
    )
    .join('');

  return `
    <div class="clg-table-scroll">
      <table class="clg-table">
        <thead>
          <tr>
            <th>Cuándo</th>
            <th>Quién</th>
            <th>Acción</th>
            <th>Módulo</th>
            <th>Detalles</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

/* --------------------------------------------------------------------------
   CSV
   -------------------------------------------------------------------------- */

function csvCell(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function exportCsv(rows) {
  const header = ['Fecha y hora', 'Usuario', 'Correo', 'UID', 'Acción', 'Módulo', 'Detalles'];
  const lines = [header.map(csvCell).join(',')];

  rows.forEach((log) => {
    const when = log.timestamp?.toDate ? log.timestamp.toDate() : log.timestamp;
    lines.push(
      [
        when instanceof Date ? when.toISOString() : '',
        log.userName || '',
        log.userEmail || '',
        log.userId || '',
        log.action || '',
        log.module || '',
        typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details || '')
      ]
        .map(csvCell)
        .join(',')
    );
  });

  // BOM para que Excel abra los acentos correctamente.
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `auditoria-love-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}