/* ==========================================================================
   VISTA: CMS DE EVENTOS (solo admin y superadmin)
   ========================================================================== */

import {
  createEvent,
  updateEvent,
  setEventActive,
  deleteEvent,
  EVENT_CATEGORIES,
  CATEGORY_LABELS
} from '../../services/events.js';
import { logAudit } from '../../services/audit.js';
import { can } from '../../lib/auth.js';
import {
  escapeHTML,
  qs,
  showToast,
  confirmDialog
} from '../../lib/dom.js';
import { formatDateTime, daysUntil } from '../../lib/dates.js';
import { bindImageInputs, imageInput, prepareImageValue } from '../image-input.js';
import { subscribe, getState } from '../store.js';
import { pageHeader, card, emptyState, tag, iconButton, field, drawer, markInvalid, clearInvalid, setLoading, readForm } from '../ui.js';

export function renderEventos(container) {
  container.innerHTML = `
    ${pageHeader({
      title: 'Gestión de Eventos',
      subtitle: 'Crea, publica y pausa los eventos que aparecen en la web',
      icon: 'fa-calendar-days',
      actions: `<button class="clg-btn clg-btn-primary" type="button" data-action="new">
                  <i class="fas fa-plus"></i><span>Nuevo evento</span>
                </button>`
    })}
    <div id="clg-events-body">
      <div class="clg-table-skeleton">
        ${Array.from({ length: 4 }, () => '<div class="clg-skeleton-row"></div>').join('')}
      </div>
    </div>
    <div id="clg-events-drawer"></div>
  `;

  const body = qs('#clg-events-body', container);
  const drawerHost = qs('#clg-events-drawer', container);
  const newButton = qs('[data-action="new"]', container);

  newButton.addEventListener('click', () => openForm(null, container, drawerHost));

  const unsubscribe = subscribe(['events', 'ready', 'profile'], (state) => {
    if (!state.ready) return;
    const editable = can(state.profile?.role, 'content.write');

    // Los servidores consultan eventos, pero no los crean ni los editan.
    newButton.hidden = !editable;

    if (!editable) {
      body.innerHTML = card({
        title: 'Eventos publicados',
        body: renderList(state.events, false)
      });
      return;
    }

    const active = state.events.filter((e) => e.isActive).length;
    body.innerHTML = card({
      title: `${state.events.length} ${state.events.length === 1 ? 'evento' : 'eventos'}`,
      subtitle: `${active} activos · ${state.events.length - active} pausados`,
      body: renderList(state.events, true)
    });

    bindListActions(body, container, drawerHost, state);
  });

  return () => {
    unsubscribe();
    if (drawerHost) drawerHost.innerHTML = '';
  };
}

function renderList(events, editable) {
  if (!events.length) {
    return emptyState({
      icon: 'fa-calendar-plus',
      title: 'Aún no hay eventos',
      message: 'Crea el primer evento para que aparezca en la web y en el calendario.'
    });
  }
  return `
    <div class="clg-event-cards">
      ${events
        .map((event) => {
          const countdown = daysUntil(event.dateStart);
          return `
          <article class="clg-event-card${event.isActive ? '' : ' is-paused'}" data-event="${escapeHTML(event.id)}">
            <div class="clg-event-card-banner">
              ${
                event.bannerUrl
                  ? `<img src="${escapeHTML(event.bannerUrl)}" alt="${escapeHTML(event.title)}" loading="lazy" decoding="async" data-img-fallback="hide">`
                  : '<div class="clg-event-card-placeholder"><i class="fas fa-image"></i></div>'
              }
              <span class="clg-event-card-state">${tag(event.isActive ? 'Publicado' : 'Pausado', event.isActive ? 'news' : 'neutral')}</span>
            </div>
            <div class="clg-event-card-body">
              <div class="clg-event-card-tags">
                ${tag(CATEGORY_LABELS[event.category] || 'General', 'primary')}
                ${
                  event.isActive && countdown !== null && countdown >= 0
                    ? tag(countdown === 0 ? '¡Hoy!' : `En ${countdown} días`, countdown === 0 ? 'danger' : 'warning')
                    : ''
                }
              </div>
              <h3>${escapeHTML(event.title)}</h3>
              <p>${escapeHTML(event.description || 'Sin descripción.')}</p>
              <dl class="clg-event-card-meta">
                <div><dt><i class="far fa-calendar"></i> Inicio</dt><dd>${escapeHTML(formatDateTime(event.dateStart))}</dd></div>
                ${event.dateEnd && event.dateEnd.getTime() !== event.dateStart?.getTime() ? `<div><dt><i class="far fa-calendar-check"></i> Fin</dt><dd>${escapeHTML(formatDateTime(event.dateEnd))}</dd></div>` : ''}
                ${event.location ? `<div><dt><i class="fas fa-location-dot"></i> Lugar</dt><dd>${escapeHTML(event.location)}</dd></div>` : ''}
                <div><dt><i class="fas fa-user-pen"></i> Editor</dt><dd>${escapeHTML(event.updatedByName || '—')}</dd></div>
              </dl>
            </div>
            ${
              editable
                ? `<footer class="clg-event-card-footer">
                     ${iconButton({ icon: 'fa-pen', label: 'Editar', action: 'edit', data: { event: event.id } })}
                     ${iconButton({
                       icon: event.isActive ? 'fa-pause' : 'fa-play',
                       label: event.isActive ? 'Pausar' : 'Publicar',
                       action: 'toggle',
                       data: { event: event.id }
                     })}
                     ${iconButton({ icon: 'fa-trash-can', label: 'Eliminar', action: 'delete', data: { event: event.id }, variant: 'danger' })}
                   </footer>`
                : ''
            }
          </article>
        `;
        })
        .join('')}
    </div>
  `;
}

function bindListActions(body, container, drawerHost, state) {
  body.querySelectorAll('[data-action="edit"]').forEach((button) => {
    button.addEventListener('click', () => {
      const event = state.events.find((e) => e.id === button.dataset.event);
      openForm(event, container, drawerHost);
    });
  });

  body.querySelectorAll('[data-action="toggle"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const event = state.events.find((e) => e.id === button.dataset.event);
      if (!event) return;
      try {
        await setEventActive(event.id, !event.isActive, state.profile?.displayName || state.session?.user?.email || '');
        await logAudit({
          actor: state.profile,
          action: 'events.update',
          module: 'events',
          details: { event: event.title, published: !event.isActive }
        });
        showToast(event.isActive ? 'Evento pausado.' : 'Evento publicado.', 'success');
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  });

  body.querySelectorAll('[data-action="delete"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const event = state.events.find((e) => e.id === button.dataset.event);
      if (!event) return;
      const ok = await confirmDialog({
        title: `Eliminar "${event.title}"`,
        message: 'El evento desaparecerá de la web y del calendario. Esta acción no se puede deshacer.',
        confirmText: 'Sí, eliminar',
        danger: true
      });
      if (!ok) return;
      try {
        await deleteEvent(event.id);
        await logAudit({
          actor: state.profile,
          action: 'events.delete',
          module: 'events',
          details: { event: event.title }
        });
        showToast('Evento eliminado.', 'success');
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  });
}

/* --------------------------------------------------------------------------
   FORMULARIO DE EVENTO
   -------------------------------------------------------------------------- */
function openForm(event, container, drawerHost) {
  const isEdit = Boolean(event);

  drawerHost.innerHTML = drawer({
    id: 'clg-event-drawer',
    title: isEdit ? 'Editar evento' : 'Nuevo evento',
    body: `
      <form class="clg-form" id="clg-event-form" novalidate>
        ${field({ keyPrefix: 'ev', name: 'title', label: 'Título del evento', value: event?.title || '', placeholder: 'Ej: Noche de Alabanza', required: true })}

        ${field({ keyPrefix: 'ev', name: 'description', label: 'Descripción', type: 'textarea', rows: 4, value: event?.description || '', placeholder: 'Cuéntale a la comunidad de qué se trata…' })}

        <div class="clg-grid-2">
          ${field({ keyPrefix: 'ev', name: 'dateStart', label: 'Fecha y hora de inicio', type: 'datetime-local', value: toLocalInput(event?.dateStart), required: true })}
          ${field({ keyPrefix: 'ev', name: 'dateEnd', label: 'Fecha y hora de fin', type: 'datetime-local', value: toLocalInput(event?.dateEnd) })}
        </div>

        <div class="clg-grid-2">
          ${field({ keyPrefix: 'ev', name: 'location', label: 'Lugar', value: event?.location || '', placeholder: 'Ej: Templo central, Cartagena' })}
          ${field({ keyPrefix: 'ev', name: 'category', label: 'Categoría', type: 'select', options: EVENT_CATEGORIES, value: event?.category || 'general' })}
        </div>

        ${imageInput({
          keyPrefix: 'ev',
          name: 'bannerUrl',
          label: 'Imagen del evento',
          value: event?.bannerUrl || '',
          hint: 'Sin Storage en el plan gratuito: pega una URL o sube el archivo y lo optimizamos aquí.'
        })}

        <label class="clg-check" for="clg-ev-isActive">
          <input id="clg-ev-isActive" type="checkbox" name="ev-isActive"${event ? (event.isActive ? ' checked' : '') : ' checked'}>
          <span class="clg-check-box"><i class="fas fa-check"></i></span>
          <span class="clg-check-text">
            Publicar inmediatamente
            <small>Si lo desactivas, el evento queda oculto en la web pero se conserva aquí.</small>
          </span>
        </label>
      </form>
    `,
    footer: `
      <button class="clg-btn clg-btn-ghost" type="button" data-close-drawer="clg-event-drawer">Cancelar</button>
      <button class="clg-btn clg-btn-primary" type="submit" form="clg-event-form">
        <i class="fas fa-check"></i><span>${isEdit ? 'Guardar cambios' : 'Crear evento'}</span>
      </button>
    `
  });

  const drawerEl = qs('#clg-event-drawer', drawerHost);
  drawerEl.classList.add('is-open');
  qs('[data-drawer-overlay="clg-event-drawer"]', drawerHost).classList.add('is-open');
  document.body.classList.add('clg-lock');

  const closeBtn = drawerHost.querySelector('[data-close-drawer]');
  closeBtn?.addEventListener('click', () => {
    drawerEl.classList.remove('is-open');
    qs('[data-drawer-overlay="clg-event-drawer"]', drawerHost).classList.remove('is-open');
    document.body.classList.remove('clg-lock');
    setTimeout(() => {
      drawerHost.innerHTML = '';
    }, 260);
  });
  qs('[data-drawer-overlay="clg-event-drawer"]', drawerHost)?.addEventListener('click', () => closeBtn.click());

  const form = qs('#clg-event-form', drawerHost);
  bindImageInputs(form);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearInvalid(form);
    const data = readForm(form);

    if (!data['ev-title']) {
      markInvalid(form, 'El título del evento es obligatorio.');
      return;
    }
    if (!data['ev-dateStart']) {
      markInvalid(form, 'Indica la fecha y hora de inicio.');
      return;
    }

    let bannerUrl = '';
    try {
      bannerUrl = prepareImageValue(data['ev-bannerUrl']);
    } catch (error) {
      markInvalid(form, error.message);
      return;
    }

    const payload = {
      title: data['ev-title'],
      description: data['ev-description'],
      dateStart: new Date(data['ev-dateStart']),
      dateEnd: data['ev-dateEnd'] ? new Date(data['ev-dateEnd']) : null,
      location: data['ev-location'],
      category: data['ev-category'],
      bannerUrl,
      isActive: Boolean(data['ev-isActive'])
    };

    setLoading(form, true, isEdit ? 'Guardando…' : 'Creando…');
    try {
const author = getState().profile?.displayName || getState().session?.user?.email || '';
      if (isEdit) {
        await updateEvent(event.id, payload, author);
        await logAudit({
          actor: getState().profile,
          action: 'events.update',
          module: 'events',
          details: { event: payload.title, published: payload.isActive }
        });
        showToast('Evento actualizado.', 'success');
      } else {
        await createEvent(payload, author);
        await logAudit({
          actor: getState().profile,
          action: 'events.create',
          module: 'events',
          details: { event: payload.title }
        });
        showToast('Evento creado.', 'success');
      }
      closeBtn.click();
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
