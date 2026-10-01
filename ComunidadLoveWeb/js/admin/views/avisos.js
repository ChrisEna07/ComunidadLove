/* ==========================================================================
   VISTA: CMS DE AVISOS (solo admin y superadmin)
   ========================================================================== */

import { createAnnouncement, updateAnnouncement, deleteAnnouncement, isAnnouncementVisible } from '../../services/announcements.js';
import { logAudit } from '../../services/audit.js';
import {
  escapeHTML,
  qs,
  showToast,
  confirmDialog
} from '../../lib/dom.js';
import { formatDate, formatTime, daysUntil } from '../../lib/dates.js';
import { subscribe, getState } from '../store.js';
import { pageHeader, card, emptyState, tag, iconButton, field, drawer, markInvalid, clearInvalid, setLoading, readForm } from '../ui.js';

const PRIORITIES = [
  { value: '2', label: 'Importante' },
  { value: '1', label: 'Nuevo' },
  { value: '0', label: 'Informativo' }
];

function priorityLabel(value) {
  return PRIORITIES.find((p) => p.value === String(value))?.label || 'Informativo';
}

export function renderAvisos(container) {
  container.innerHTML = `
    ${pageHeader({
      title: 'Avisos y Anuncios',
      subtitle: 'Publica comunicados en la sección de avisos de la web',
      icon: 'fa-bullhorn',
      actions: `<button class="clg-btn clg-btn-primary" type="button" data-action="new">
                  <i class="fas fa-plus"></i><span>Nuevo aviso</span>
                </button>`
    })}
    <div id="clg-avisos-body">
      <div class="clg-table-skeleton">
        ${Array.from({ length: 3 }, () => '<div class="clg-skeleton-row"></div>').join('')}
      </div>
    </div>
    <div id="clg-avisos-drawer"></div>
  `;

  const body = qs('#clg-avisos-body', container);
  const drawerHost = qs('#clg-avisos-drawer', container);

  qs('[data-action="new"]', container).addEventListener('click', () => openForm(null, drawerHost));

  const unsubscribe = subscribe(['announcements', 'ready'], (state) => {
    if (!state.ready) return;
    const list = state.announcements;

    body.innerHTML = card({
      title: `${list.length} ${list.length === 1 ? 'aviso' : 'avisos'}`,
      subtitle: `${list.filter((a) => isAnnouncementVisible(a)).length} visibles en la web ahora`,
      body: list.length
        ? `<ul class="clg-announcement-list">${list.map(renderItem).join('')}</ul>`
        : emptyState({
            icon: 'fa-bullhorn',
            title: 'Sin avisos publicados',
            message: 'Crea el primer aviso para informar a la comunidad.'
          })
    });

    body.querySelectorAll('[data-action="edit"]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = state.announcements.find((a) => a.id === button.dataset.item);
        openForm(item, drawerHost);
      });
    });

    body.querySelectorAll('[data-action="delete"]').forEach((button) => {
      button.addEventListener('click', async () => {
        const item = state.announcements.find((a) => a.id === button.dataset.item);
        if (!item) return;
        const ok = await confirmDialog({
          title: `Eliminar "${item.title}"`,
          message: 'El aviso desaparecerá de la web. Esta acción no se puede deshacer.',
          confirmText: 'Sí, eliminar',
          danger: true
        });
        if (!ok) return;
        try {
          await deleteAnnouncement(item.id);
          await logAudit({
            actor: getState().profile,
            action: 'settings.update',
            module: 'settings',
            details: { announcement: item.title, deleted: true }
          });
          showToast('Aviso eliminado.', 'success');
        } catch (error) {
          showToast(error.message, 'error');
        }
      });
    });
  });

  return () => {
    unsubscribe();
    if (drawerHost) drawerHost.innerHTML = '';
  };
}

function renderItem(item) {
  const visible = isAnnouncementVisible(item);
  const expiresIn = daysUntil(item.expirationDate);
  return `
    <li class="clg-announcement-item${visible ? '' : ' is-hidden-public'}" data-item="${escapeHTML(item.id)}">
      <div class="clg-announcement-main">
        <div class="clg-announcement-head">
          <h3>${escapeHTML(item.title)}</h3>
          ${tag(priorityLabel(item.priority), item.priority >= 2 ? 'danger' : item.priority === 1 ? 'primary' : 'neutral')}
          ${tag(visible ? 'Visible' : 'Oculto', visible ? 'news' : 'neutral')}
        </div>
        <p>${escapeHTML(item.message)}</p>
        <div class="clg-announcement-meta">
          <span><i class="far fa-calendar"></i> Publica: ${escapeHTML(formatDate(item.publishDate))}${item.publishDate ? ` ${escapeHTML(formatTime(item.publishDate))}` : ''}</span>
          ${
            item.expirationDate
              ? `<span><i class="far fa-calendar-xmark"></i> Expira: ${escapeHTML(formatDate(item.expirationDate))}${
                  visible && expiresIn !== null && expiresIn >= 0 ? ` (en ${expiresIn} d)` : ''
                }</span>`
              : '<span><i class="fas fa-infinity"></i> Sin expiración</span>'
          }
        </div>
      </div>
      <div class="clg-row-actions">
        ${iconButton({ icon: 'fa-pen', label: 'Editar', action: 'edit', data: { item: item.id } })}
        ${iconButton({ icon: 'fa-trash-can', label: 'Eliminar', action: 'delete', data: { item: item.id }, variant: 'danger' })}
      </div>
    </li>
  `;
}

function openForm(item, drawerHost) {
  const isEdit = Boolean(item);

  drawerHost.innerHTML = drawer({
    id: 'clg-announcement-drawer',
    title: isEdit ? 'Editar aviso' : 'Nuevo aviso',
    body: `
      <form class="clg-form" id="clg-announcement-form" novalidate>
        ${field({ keyPrefix: 'an', name: 'title', label: 'Título', value: item?.title || '', placeholder: 'Ej: Convocatoria al encuentro de jóvenes', required: true })}

        ${field({ keyPrefix: 'an', name: 'message', label: 'Mensaje', type: 'textarea', rows: 6, value: item?.message || '', placeholder: 'Escribe el comunicado completo…', required: true })}

        <div class="clg-grid-2">
          ${field({ keyPrefix: 'an', name: 'publishDate', label: 'Fecha de publicación', type: 'datetime-local', value: toLocalInput(item?.publishDate || new Date()) })}
          ${field({ keyPrefix: 'an', name: 'expirationDate', label: 'Fecha de expiración', type: 'datetime-local', value: toLocalInput(item?.expirationDate), hint: 'Opcional. El aviso se oculta al cumplirse.' })}
        </div>

        ${field({
          keyPrefix: 'an',
          name: 'priority',
          label: 'Prioridad',
          type: 'select',
          options: PRIORITIES,
          value: String(item?.priority ?? 0)
        })}
      </form>
    `,
    footer: `
      <button class="clg-btn clg-btn-ghost" type="button" data-close-drawer="clg-announcement-drawer">Cancelar</button>
      <button class="clg-btn clg-btn-primary" type="submit" form="clg-announcement-form">
        <i class="fas fa-check"></i><span>${isEdit ? 'Guardar cambios' : 'Publicar aviso'}</span>
      </button>
    `
  });

  const drawerEl = qs('#clg-announcement-drawer', drawerHost);
  drawerEl.classList.add('is-open');
  qs('[data-drawer-overlay="clg-announcement-drawer"]', drawerHost).classList.add('is-open');
  document.body.classList.add('clg-lock');

  const close = () => {
    drawerEl.classList.remove('is-open');
    qs('[data-drawer-overlay="clg-announcement-drawer"]', drawerHost).classList.remove('is-open');
    document.body.classList.remove('clg-lock');
    setTimeout(() => {
      drawerHost.innerHTML = '';
    }, 260);
  };
  qs('[data-close-drawer="clg-announcement-drawer"]', drawerHost)?.addEventListener('click', close);
  qs('[data-drawer-overlay="clg-announcement-drawer"]', drawerHost)?.addEventListener('click', close);

  const form = qs('#clg-announcement-form', drawerHost);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearInvalid(form);
    const data = readForm(form);

    const payload = {
      title: data['an-title'],
      message: data['an-message'],
      publishDate: data['an-publishDate'] ? new Date(data['an-publishDate']) : new Date(),
      expirationDate: data['an-expirationDate'] ? new Date(data['an-expirationDate']) : null,
      priority: Number(data['an-priority']) || 0
    };

    if (!payload.title || !payload.message) {
      markInvalid(form, 'El título y el mensaje son obligatorios.');
      return;
    }
    if (payload.expirationDate && payload.expirationDate < payload.publishDate) {
      markInvalid(form, 'La expiración no puede ser anterior a la publicación.');
      return;
    }

    setLoading(form, true, isEdit ? 'Guardando…' : 'Publicando…');
    try {
      if (isEdit) {
        await updateAnnouncement(item.id, payload);
        await logAudit({
          actor: getState().profile,
          action: 'settings.update',
          module: 'settings',
          details: { announcement: payload.title }
        });
        showToast('Aviso actualizado.', 'success');
      } else {
        await createAnnouncement(payload);
        await logAudit({
          actor: getState().profile,
          action: 'settings.update',
          module: 'settings',
          details: { announcement: payload.title, created: true }
        });
        showToast('Aviso publicado.', 'success');
      }
      close();
    } catch (error) {
      markInvalid(form, error.message);
    } finally {
      setLoading(form, false);
    }
  });
}

function toLocalInput(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
