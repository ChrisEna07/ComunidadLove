/* ==========================================================================
   VISTA: PANEL RESUMEN (Dashboard)
   ========================================================================== */

import { subscribe, getState } from '../store.js';
import { navigate } from '../router.js';
import { can, roleLabel } from '../../lib/auth.js';
import { pageHeader, statCard, card, emptyState, tag, button } from '../ui.js';
import { escapeHTML, formatPhoneCO, whatsappLink, birthdayWhatsappMessage, downloadCSV } from '../../lib/dom.js';
import { birthdaysThis } from '../../services/members.js';
import { formatDate as _formatDate, smartDate, birthdayLabel, daysUntil, parseDate } from '../../lib/dates.js';
import { seedInitialData } from '../../services/seed.js';
import { showToast, confirmDialog } from '../../lib/dom.js';

export function renderPanel(container) {
  const profile = getState().profile || {};

  const actions = [
    button({ label: 'Sincronizar datos de la Web', icon: 'fa-cloud-arrow-down', variant: 'ghost', action: 'seed-data' }),
    can(profile.role, 'members.write')
      ? button({ label: 'Registrar asistencia', icon: 'fa-user-plus', action: 'go-registro' })
      : '',
    can(profile.role, 'content.write')
      ? button({ label: 'Nuevo evento', icon: 'fa-calendar-plus', variant: 'ghost', action: 'go-eventos' })
      : ''
  ].join('');

  container.innerHTML = `
    ${pageHeader({
      title: `Hola, ${profile.displayName || 'bienvenido'}`,
      subtitle: `Sesión activa como ${roleLabel(profile.role)}`,
      icon: 'fa-gauge-high',
      actions
    })}
    <div id="clg-panel-body">
      <div class="clg-stats-grid">
        <div class="clg-stat-skeleton"></div>
        <div class="clg-stat-skeleton"></div>
        <div class="clg-stat-skeleton"></div>
        <div class="clg-stat-skeleton"></div>
      </div>
    </div>
  `;

  container.querySelector('[data-action="go-registro"]')?.addEventListener('click', () => navigate('registro'));
  container.querySelector('[data-action="go-eventos"]')?.addEventListener('click', () => navigate('eventos'));
  container.querySelector('[data-action="seed-data"]')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Sincronizar datos iniciales',
      message: '¿Deseas guardar los datos oficiales de la web (Eventos, Love Market y Avisos) en Firestore para que queden editables?',
      confirmText: 'Sincronizar ahora'
    });
    if (!ok) return;
    try {
      showToast('Sincronizando contenidos...', 'info');
      const res = await seedInitialData(getState().profile);
      if (res.alreadySeeded) {
        showToast('Las colecciones ya contienen datos en Firestore.', 'info');
      } else {
        showToast(`Datos sembrados: ${res.productsCount} productos, ${res.eventsCount} eventos, ${res.announcementsCount} avisos.`, 'success');
      }
    } catch (err) {
      showToast(err.message || 'Error al sembrar datos.', 'error');
    }
  });

  const body = container.querySelector('#clg-panel-body');

  const unsubscribe = subscribe(['members', 'activeEvents', 'announcements', 'ready'], (state) => {
    if (!state.ready) return;

    const { members, activeEvents, announcements, profile: liveProfile } = state;
    const todayBirthdays = birthdaysThis(members, 'hoy');
    const weekBirthdays = birthdaysThis(members, 'semana');
    const newMembers = members.filter((m) => m.status === 'nuevo');
    const nextEvent = activeEvents.find((e) => e.dateStart && daysUntil(e.dateStart) >= 0);

    const isAdmin = can(liveProfile.role, 'reports.export');

    body.innerHTML = `
      <div class="clg-stats-grid">
        ${statCard({
          label: 'Miembros registrados',
          value: members.length,
          icon: 'fa-users',
          tone: 'primary',
          hint: `${newMembers.length} en seguimiento nuevo`,
          action: 'go-members'
        })}
        ${statCard({
          label: 'Cumpleaños de la semana',
          value: weekBirthdays.length,
          icon: 'fa-cake-candles',
          tone: 'woman',
          hint: todayBirthdays.length ? `${todayBirthdays.length} hoy` : 'Ninguno hoy',
          action: 'go-birthdays'
        })}
        ${statCard({
          label: 'Eventos activos',
          value: activeEvents.length,
          icon: 'fa-calendar-check',
          tone: 'news',
          hint: nextEvent ? `Próximo: ${smartDate(nextEvent.dateStart)}` : 'Sin eventos programados',
          action: 'go-eventos'
        })}
        ${statCard({
          label: 'Avisos publicados',
          value: announcements.length,
          icon: 'fa-bullhorn',
          tone: 'adora',
          hint: `${announcements.filter((a) => a.priority >= 2).length} marcados importantes`,
          action: 'go-avisos'
        })}
      </div>

      <div class="clg-panel-grid">
        ${card({
          title: 'Cumpleaños de esta semana',
          subtitle: 'Envía un mensaje directo por WhatsApp',
          body: renderBirthdays(weekBirthdays),
          footer: weekBirthdays.length
            ? `<button class="clg-btn clg-btn-ghost" type="button" data-action="export-birthdays">
                 <i class="fas fa-file-arrow-down"></i><span>Exportar lista</span>
               </button>`
            : ''
        })}

        ${card({
          title: 'Próximos eventos',
          subtitle: 'Publicados en el sitio web',
          body: renderNextEvents(activeEvents),
          footer: can(liveProfile.role, 'content.write')
            ? `<button class="clg-btn clg-btn-ghost" type="button" data-action="go-eventos">
                   <i class="fas fa-arrow-right"></i><span>Gestionar eventos</span>
                 </button>`
            : ''
        })}
      </div>

      ${newMembers.length ? card({
        title: 'Requieren seguimiento',
        subtitle: 'Miembros con estado "Nuevo" sin consolidarse',
        body: renderNewMembers(newMembers),
        className: 'clg-card-accent'
      }) : ''}
    `;

    bindPanelActions(body, weekBirthdays, isAdmin);
  });

  return unsubscribe;
}

function renderBirthdays(entries) {
  if (!entries.length) {
    return emptyState({
      icon: 'fa-cake-candles',
      title: 'Sin cumpleaños esta semana',
      message: 'Ningún miembro cumple años en los próximos 7 días.'
    });
  }
  return `
    <ul class="clg-birthday-list">
      ${entries
        .map(
          ({ member, days }) => `
        <li class="clg-birthday-item">
          ${memberAvatar(member)}
          <div class="clg-birthday-info">
            <strong>${escapeHTML(member.fullName)}</strong>
            <span>${escapeHTML(birthdayLabel(days))}${member.phone ? ` · ${escapeHTML(formatPhoneCO(member.phone))}` : ''}</span>
          </div>
          <div class="clg-birthday-actions">
            ${member.phone
              ? `<a class="clg-icon-btn clg-icon-btn-whatsapp" target="_blank" rel="noopener"
                     href="${escapeHTML(whatsappLink(member.phone, birthdayWhatsappMessage(member.fullName)))}"
                     title="Felicitar por WhatsApp" aria-label="Felicitar por WhatsApp">
                   <i class="fab fa-whatsapp"></i>
                 </a>`
              : ''}
            <button class="clg-icon-btn clg-icon-btn-ghost" type="button" data-member="${escapeHTML(member.id)}"
                    title="Ver ficha" aria-label="Ver ficha">
              <i class="fas fa-chevron-right"></i>
            </button>
          </div>
        </li>`
        )
        .join('')}
    </ul>
  `;
}

function renderNextEvents(events) {
  const list = events.filter((e) => e.dateStart && daysUntil(e.dateStart) >= 0).slice(0, 5);
  if (!list.length) {
    return emptyState({
      icon: 'fa-calendar-xmark',
      title: 'Sin eventos programados',
      message: 'Publica el primer evento para que aparezca en la web.'
    });
  }
  return `
    <ul class="clg-event-list">
      ${list
        .map(
          (event) => {
            const dStart = parseDate(event.dateStart);
            return `
        <li class="clg-event-item">
          <div class="clg-event-date">
            <span>${escapeHTML(dStart.getDate())}</span>
            <small>${escapeHTML(dStart.toLocaleDateString('es-CO', { month: 'short' }))}</small>
          </div>
          <div class="clg-event-info">
            <strong>${escapeHTML(event.title)}</strong>
            <span>${escapeHTML(smartDate(dStart))}${event.location ? ` · ${escapeHTML(event.location)}` : ''}</span>
          </div>
          ${tag(daysUntil(dStart) === 0 ? 'Hoy' : `En ${daysUntil(dStart)} d`, 'news')}
        </li>`;
          }
        )
        .join('')}
    </ul>
  `;
}

function renderNewMembers(members) {
  return `
    <ul class="clg-simple-list">
      ${members
        .slice(0, 6)
        .map(
          (member) => `
        <li class="clg-simple-item">
          ${memberAvatar(member)}
          <div class="clg-birthday-info">
            <strong>${escapeHTML(member.fullName)}</strong>
            <span>${escapeHTML(member.churchRole)}${member.neighborhood ? ` · ${escapeHTML(member.neighborhood)}` : ''}</span>
          </div>
          <button class="clg-icon-btn clg-icon-btn-ghost" type="button" data-member="${escapeHTML(member.id)}"
                  title="Ver ficha" aria-label="Ver ficha"><i class="fas fa-chevron-right"></i></button>
        </li>`
        )
        .join('')}
    </ul>
  `;
}

function bindPanelActions(body, weekBirthdays, isAdmin) {
  body.querySelector('[data-action="go-eventos"]')?.addEventListener('click', () => navigate('eventos'));
  body.querySelector('[data-action="export-birthdays"]')?.addEventListener('click', () => {
    downloadCSV(
      'cumpleanos-semana.csv',
      [
        ['Nombre', 'Teléfono', 'Correo', 'Días para cumpleaños', 'Barrio'],
        ...weekBirthdays.map(({ member, days }) => [
          member.fullName,
          formatPhoneCO(member.phone),
          member.email,
          days,
          member.neighborhood
        ])
      ]
    );
  });
  body.querySelectorAll('[data-stat-action]').forEach((el) => {
    el.addEventListener('click', () => {
      const act = el.dataset.statAction;
      if (act === 'go-members') navigate('asistencia');
      else if (act === 'go-birthdays') navigate('asistencia?tab=cumpleanos');
      else if (act === 'go-eventos') navigate('eventos');
      else if (act === 'go-avisos') navigate('avisos');
    });
  });
  body.querySelectorAll('[data-member]').forEach((button) => {
    button.addEventListener('click', () => navigate(`seguimiento?member=${encodeURIComponent(button.dataset.member)}`));
  });
}

export function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || '')
    .join('')
    .toUpperCase();
}

/**
 * Avatar con foto si el miembro tiene `photoUrl` (URL externa o Base64) y, si no,
 * cae en las iniciales. La foto vive dentro del documento, sin Cloud Storage.
 */
export function memberAvatar(member, extraClass = 'clg-avatar-sm') {
  const name = member?.fullName || '';
  const photo = member?.photoUrl || '';
  if (photo) {
    return `<span class="clg-avatar ${extraClass} clg-avatar-photo">
      <img src="${escapeHTML(photo)}" alt="${escapeHTML(name)}" loading="lazy" decoding="async">
    </span>`;
  }
  return `<span class="clg-avatar ${extraClass}">${escapeHTML(initials(name))}</span>`;
}
