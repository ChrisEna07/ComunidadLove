/* ==========================================================================
   VISTA: MURO DE CLAMOR (panel)
   --------------------------------------------------------------------------
   El equipo ve TODAS las peticiones, incluidas las privadas. El visitante
   ya no puede responder: esa tarea es del equipo, desde aquí.

   Cada respuesta sale con insignia verificada según el rol de quien responde
   (pastor, webmaster o servidor) y queda fechada.

   Filtros: texto, estado (abierta / atendida / archivada) y visibilidad.
   ========================================================================== */

import {
  REACTIONS,
  PRAYER_STATUSES,
  responseBadge,
  statusLabel,
  statusTone,
  addPrayerReply,
  setPrayerStatus,
  setPrayerVisibility,
  deletePrayer
} from '../../services/prayers.js';
import { logAudit } from '../../services/audit.js';
import { escapeHTML, qs, showToast, confirmDialog } from '../../lib/dom.js';
import { smartDate, formatDateTime } from '../../lib/dates.js';
import { contienePalabrasObscenas } from '../../lib/text.js';
import { subscribe, getState } from '../store.js';
import {
  pageHeader,
  emptyState,
  statCard,
  tag,
  field,
  drawer,
  markInvalid,
  clearInvalid,
  setLoading,
  readForm
} from '../ui.js';

export function renderOracion(container) {
  const me = getState().profile || {};
  const myBadge = responseBadge(me.role);

  container.innerHTML = `
    ${pageHeader({
      title: 'Muro de Clamor',
      subtitle: 'Responde las peticiones de oración con tu insignia verificada',
      icon: 'fa-hands-praying'
    })}
    <div class="clg-stats-grid" id="clg-prayers-stats"></div>
    <div class="clg-tabs" id="clg-prayers-tabs" role="tablist">
      <button type="button" class="clg-tab is-active" data-tab-type="all">
        <i class="fas fa-list"></i>
        <span>Todas</span>
        <span class="clg-tab-badge" id="clg-tab-count-all">0</span>
      </button>
      <button type="button" class="clg-tab" data-tab-type="peticion">
        <i class="fas fa-hands-praying"></i>
        <span>Peticiones de Oración</span>
        <span class="clg-tab-badge" id="clg-tab-count-peticion">0</span>
      </button>
      <button type="button" class="clg-tab" data-tab-type="inquietud">
        <i class="fas fa-circle-question"></i>
        <span>Inquietudes y Preguntas</span>
        <span class="clg-tab-badge" id="clg-tab-count-inquietud">0</span>
      </button>
    </div>
    <div class="clg-toolbar" id="clg-prayers-toolbar"></div>
    <div id="clg-prayers-body">
      <div class="clg-table-skeleton">
        ${Array.from({ length: 3 }, () => '<div class="clg-skeleton-row"></div>').join('')}
      </div>
    </div>
    <div id="clg-prayers-drawer"></div>
  `;

  const statsHost = qs('#clg-prayers-stats', container);
  const toolbar = qs('#clg-prayers-toolbar', container);
  const body = qs('#clg-prayers-body', container);
  const drawerHost = qs('#clg-prayers-drawer', container);
  const tabsContainer = qs('#clg-prayers-tabs', container);

  const filters = { text: '', status: '', type: 'all' };

  tabsContainer?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-tab-type]');
    if (!btn) return;
    tabsContainer.querySelectorAll('.clg-tab').forEach((t) => t.classList.remove('is-active'));
    btn.classList.add('is-active');
    filters.type = btn.dataset.tabType;
    paint(getState().prayers || []);
  });

  toolbar.innerHTML = `
    <form class="clg-filters" id="clg-prayers-filters" novalidate>
      ${field({
        name: 'text',
        label: 'Buscar',
        placeholder: 'Nombre o texto de la petición…',
        icon: 'fa-magnifying-glass'
      })}
      ${field({
        name: 'status',
        label: 'Estado',
        options: [{ value: '', label: 'Todas' }].concat(
          PRAYER_STATUSES.map((s) => ({ value: s.value, label: s.label }))
        ),
        value: ''
      })}
      <div class="clg-filters-actions">
        <span class="clg-my-badge">
          <i class="fas ${escapeHTML(myBadge.icon)}"></i>
          Tus respuestas llevan la insignia "${escapeHTML(myBadge.label)}"
        </span>
      </div>
    </form>
  `;

  const form = qs('#clg-prayers-filters', toolbar);
  form.addEventListener('input', (event) => {
    if (!event.target.name) return;
    filters[event.target.name] = event.target.value;
    paint(getState().prayers || []);
  });

  const off = subscribe(['prayers', 'ready'], (state) => paint(state.prayers || [], state.ready));

  function paint(list, isReady = true) {
    const prayers = list || [];
    const open = prayers.filter((p) => p.status === 'abierta').length;
    const reactions = prayers.reduce((sum, p) => {
      const cardTotal = typeof p.totalReactions === 'number'
        ? p.totalReactions
        : (p.reactions ? Object.values(p.reactions).reduce((a, b) => a + (Number(b) || 0), 0) : 0);
      return sum + cardTotal;
    }, 0);

    const countAll = prayers.length;
    const countPeticiones = prayers.filter((p) => (p.type || '').toLowerCase() !== 'inquietud').length;
    const countInquietudes = prayers.filter((p) => (p.type || '').toLowerCase() === 'inquietud').length;

    const bAll = qs('#clg-tab-count-all', container);
    const bPet = qs('#clg-tab-count-peticion', container);
    const bInq = qs('#clg-tab-count-inquietud', container);
    if (bAll) bAll.textContent = countAll;
    if (bPet) bPet.textContent = countPeticiones;
    if (bInq) bInq.textContent = countInquietudes;

    statsHost.innerHTML = `
      ${statCard({ label: 'Peticiones', value: String(prayers.length), icon: 'fa-envelope-open-text', tone: 'primary' })}
      ${statCard({ label: 'Abiertas', value: String(open), icon: 'fa-door-open', tone: 'news' })}
      ${statCard({ label: 'Atendidas', value: String(answered), icon: 'fa-check-double', tone: 'success' })}
      ${statCard({ label: 'Reacciones', value: String(reactions), icon: 'fa-heart', tone: 'info' })}
    `;

    const filtered = applyFilters(prayers, filters);

    if (!prayers.length && isReady) {
      body.innerHTML = emptyState({
        icon: 'fa-hands-praying',
        title: 'No hay peticiones todavía',
        message: 'Las peticiones que envíen los visitantes aparecerán aquí automáticamente.'
      });
      return;
    }
    if (!filtered.length) {
      body.innerHTML = emptyState({
        icon: 'fa-filter-circle-xmark',
        title: 'Sin coincidencias',
        message: 'Prueba con otro filtro o limpia la búsqueda.'
      });
      return;
    }

    body.innerHTML = filtered.map(renderCard).join('');
  }

  container.addEventListener('click', async (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;
    const action = trigger.dataset.action;
    const id = trigger.dataset.id;

    if (action === 'reply') {
      const prayer = (getState().prayers || []).find((p) => p.id === id);
      if (prayer) openReplyDrawer({ prayer, me, myBadge });
    }

    if (action === 'status') {
      const prayer = (getState().prayers || []).find((p) => p.id === id);
      if (!prayer) return;
      // Alterna entre "atendida" y "abierta".
      const next = prayer.status === 'atendida' ? 'abierta' : 'atendida';
      try {
        await setPrayerStatus(prayer.id, next);
        await logAudit({
          actor: me,
          action: 'prayers.status',
          module: 'prayers',
          details: { from: prayer.status, to: next }
        });
        showToast(`Marcada como ${statusLabel(next)}`, 'success');
      } catch (error) {
        showToast(error.message || 'No se pudo cambiar el estado.', 'danger');
      }
    }

    if (action === 'visibility') {
      const prayer = (getState().prayers || []).find((p) => p.id === id);
      if (!prayer) return;
      const next = !prayer.isPublic;
      try {
        await setPrayerVisibility(prayer.id, next);
        await logAudit({
          actor: me,
          action: 'prayers.visibility',
          module: 'prayers',
          details: { public: next }
        });
        showToast(next ? 'Visible en el muro público' : 'Oculta del muro público', 'success');
      } catch (error) {
        showToast(error.message || 'No se pudo cambiar la visibilidad.', 'danger');
      }
    }

    if (action === 'delete') {
      const prayer = (getState().prayers || []).find((p) => p.id === id);
      if (!prayer) return;
      const ok = await confirmDialog({
        title: 'Eliminar petición',
        message: `Se eliminará la petición de ${prayer.name} y todas sus reacciones. No se puede deshacer.`,
        confirmText: 'Eliminar',
        danger: true
      });
      if (!ok) return;
      try {
        await deletePrayer(prayer.id);
        await logAudit({
          actor: me,
          action: 'prayers.delete',
          module: 'prayers',
          details: { author: prayer.name }
        });
        showToast('Petición eliminada', 'success');
      } catch (error) {
        showToast(error.message || 'No se pudo eliminar.', 'danger');
      }
    }
  });

  /* --------------------------------------------------------------------
     DRAWER: RESPONDER
     -------------------------------------------------------------------- */
  function openReplyDrawer({ prayer, me: actor, myBadge: badge }) {
    drawerHost.innerHTML = drawer({
      id: 'clg-reply-drawer',
      title: 'Responder a la petición',
      body: `
        <div class="clg-prayer-quote">
          <strong>${escapeHTML(prayer.name)}</strong>
          <small>${escapeHTML(formatDateTime(prayer.createdAt))}</small>
          <p>${escapeHTML(prayer.text)}</p>
        </div>

        <form id="clg-reply-form" class="clg-form" novalidate>
          <div class="clg-form-error" hidden></div>

          <div class="clg-security-note clg-security-note-info">
            <i class="fas ${escapeHTML(badge.icon)}"></i>
            <span>
              Se publicará con la insignia verificada
              <strong>"${escapeHTML(badge.label)}"</strong> a nombre de
              <strong>${escapeHTML(actor.displayName || 'Equipo Love')}</strong>.
              El texto es público y lo leerán todos los visitantes.
            </span>
          </div>

          ${field({
            name: 'text',
            label: 'Respuesta pastoral',
            type: 'textarea',
            rows: 5,
            required: true,
            placeholder: 'Escribe un mensaje de ánimo, oración o orientación…'
          })}
        </form>

        ${prayer.replies.length ? renderReplies(prayer.replies) : ''}
      `,
      footer: `
        <div class="clg-drawer-actions">
          <button type="button" class="clg-btn clg-btn-ghost" data-close-drawer="clg-reply-drawer">Cancelar</button>
          <button type="submit" form="clg-reply-form" class="clg-btn clg-btn-primary">
            <i class="fas fa-paper-plane"></i><span>Publicar respuesta</span>
          </button>
        </div>`
    });

    const replyForm = qs('#clg-reply-form', drawerHost);
    const overlay = drawerHost.querySelector('.clg-drawer-overlay');
    overlay?.classList.add('is-open');
    qs('#clg-reply-drawer', drawerHost)?.classList.add('is-open');

    replyForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearInvalid(replyForm);
      const data = readForm(replyForm);
      if (!data.text) return markInvalid(replyForm, 'Escribe la respuesta.');

      setLoading(replyForm, true, 'Publicando…');
      try {
        await addPrayerReply(prayer.id, {
          text: data.text,
          role: actor.role,
          authorName: actor.displayName
        });
        await logAudit({
          actor,
          action: 'prayers.reply',
          module: 'prayers',
          details: { author: prayer.name }
        });
        showToast('Respuesta publicada', 'success');
        closeDrawer();
      } catch (error) {
        markInvalid(replyForm, error.message || 'No se pudo publicar la respuesta.');
        setLoading(replyForm, false);
      }
    });

    function closeDrawer() {
      overlay?.classList.remove('is-open');
      qs('#clg-reply-drawer', drawerHost)?.classList.remove('is-open');
      setTimeout(() => {
        drawerHost.innerHTML = '';
      }, 200);
    }

    drawerHost.querySelectorAll('[data-close-drawer]').forEach((btn) => {
      btn.addEventListener('click', closeDrawer);
    });
  }

  return () => off();
}

/* --------------------------------------------------------------------------
   RENDER
   -------------------------------------------------------------------------- */

function applyFilters(prayers, filters) {
  const text = String(filters.text || '').trim().toLowerCase();
  const selectedType = filters.type || 'all';

  return prayers.filter((p) => {
    if (selectedType === 'peticion' && (p.type || '').toLowerCase() === 'inquietud') return false;
    if (selectedType === 'inquietud' && (p.type || '').toLowerCase() !== 'inquietud') return false;
    if (filters.status && p.status !== filters.status) return false;
    if (!text) return true;
    return `${p.name} ${p.text}`.toLowerCase().includes(text);
  });
}

function renderCard(prayer) {
  const reactionChips = REACTIONS.map(
    (r) => `
    <span class="clg-reaction-chip" title="${escapeHTML(r.label)}">
      <span aria-hidden="true">${r.emoji}</span>${prayer.reactions[r.kind] || 0}
    </span>`
  ).join('');

  const answered = prayer.replies.length > 0;

  return `
    <article class="clg-prayer-card${answered ? ' is-answered' : ''}" data-id="${prayer.id}">
      <header class="clg-prayer-head">
        <div class="clg-user-cell">
          <span class="clg-avatar clg-avatar-sm">${escapeHTML(initialsOf(prayer.name))}</span>
          <div>
            <strong>${escapeHTML(prayer.name)}</strong>
            <small>${escapeHTML(smartDate(prayer.createdAt))}</small>
          </div>
        </div>
        <div class="clg-prayer-tags">
          ${tag(prayer.type === 'inquietud' ? 'Inquietud' : 'Petición', 'neutral')}
          ${tag(statusLabel(prayer.status), statusTone(prayer.status))}
          ${!prayer.isPublic ? tag('Privada', 'warning') : ''}
          ${(contienePalabrasObscenas(prayer.text) || contienePalabrasObscenas(prayer.name)) ? tag('Alerta Moderación', 'danger') : ''}
        </div>
      </header>

      <p class="clg-prayer-text">${escapeHTML(prayer.text)}</p>

      <div class="clg-prayer-reactions">${reactionChips}</div>

      ${
        answered
          ? `<div class="clg-prayer-answer">
               <div class="clg-prayer-answer-head">
                 <i class="fas fa-circle-check"></i>
                 <strong>${escapeHTML(prayer.replies[prayer.replies.length - 1].badgeLabel || 'Equipo Love')}</strong>
                 <small>${escapeHTML(formatDateTime(prayer.replies[prayer.replies.length - 1].createdAt))}</small>
               </div>
               <p>${escapeHTML(prayer.replies[prayer.replies.length - 1].text)}</p>
             </div>`
          : ''
      }

      <footer class="clg-prayer-actions">
        <button type="button" class="clg-btn clg-btn-primary clg-btn-sm" data-action="reply" data-id="${prayer.id}">
          <i class="fas fa-reply"></i><span>Responder</span>
        </button>
        <button type="button" class="clg-btn clg-btn-ghost clg-btn-sm" data-action="status" data-id="${prayer.id}">
          <i class="fas ${prayer.status === 'atendida' ? 'fa-rotate-left' : 'fa-check'}"></i>
          <span>${prayer.status === 'atendida' ? 'Reabrir' : 'Marcar atendida'}</span>
        </button>
        <button type="button" class="clg-btn clg-btn-ghost clg-btn-sm" data-action="visibility" data-id="${prayer.id}">
          <i class="fas ${prayer.isPublic ? 'fa-eye-slash' : 'fa-eye'}"></i>
          <span>${prayer.isPublic ? 'Ocultar del muro' : 'Mostrar en el muro'}</span>
        </button>
        <button type="button" class="clg-btn clg-btn-danger-soft" data-action="delete" data-id="${prayer.id}">
          <i class="fas fa-trash"></i><span>Eliminar</span>
        </button>
      </footer>
    </article>
  `;
}

function renderReplies(replies) {
  return `
    <div class="clg-replies">
      <h4>Respuestas publicadas (${replies.length})</h4>
      ${replies
        .map(
          (reply) => `
        <div class="clg-reply">
          <div class="clg-reply-head">
            <i class="fas fa-circle-check"></i>
            <strong>${escapeHTML(reply.badgeLabel || 'Equipo Love')}</strong>
            <small>${escapeHTML(formatDateTime(reply.createdAt))}</small>
          </div>
          <p>${escapeHTML(reply.text)}</p>
        </div>`
        )
        .join('')}
    </div>
  `;
}

function initialsOf(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase();
}