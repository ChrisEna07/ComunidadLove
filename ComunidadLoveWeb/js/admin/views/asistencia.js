/* ==========================================================================
   VISTA: REGISTRO Y ASISTENCIA INTELIGENTE (Ujieres, Servidores y Pastores)
   --------------------------------------------------------------------------
   - Búsqueda ultrarrápida por Cédula, Nombre, Apellido o Teléfono.
   - Confirmación de asistencia en 1 clic ("Está Aquí / Confirmar Asistencia").
   - Modal con Código QR dinámico para auto-registro de nuevos visitantes.
   - Detección de candidatos a Miembros Regulares (algoritmo de fidelización: 4+ visitas en 60 días).
   - Filtro por ministerios (Todos, General, Kids, Adora, Mujeres, Jóvenes, Servidores).
   - Banner de alerta de servicio activo hoy.
   - Tooltips pedagógicos (?) para orientación sin fricción.
   ========================================================================== */

import { subscribe, getState } from '../store.js';
import {
  recordAttendance,
  createMember,
  createFamily,
  upgradeMemberStatus,
  isCandidateForRegularMember,
  searchMembers,
  birthdaysThis,
  CHURCH_ROLES,
  MEMBER_STATUS
} from '../../services/members.js';
import { can, roleLabel } from '../../lib/auth.js';
import {
  escapeHTML,
  qs,
  qsa,
  showToast,
  formatPhoneCO,
  whatsappLink,
  debounce
} from '../../lib/dom.js';
import { pageHeader, card, tag, emptyState, field, checkboxField, readForm, setLoading } from '../ui.js';
import { memberAvatar } from './panel.js';
import { navigate } from '../router.js';

const MINISTRY_TABS = [
  { value: 'todos', label: 'Todos', icon: 'fa-users' },
  { value: 'general', label: 'General', icon: 'fa-church' },
  { value: 'kids', label: 'Kids', icon: 'fa-child' },
  { value: 'adora', label: 'Adora', icon: 'fa-guitar' },
  { value: 'mujeres', label: 'Mujeres', icon: 'fa-venus' },
  { value: 'jovenes', label: 'Jóvenes', icon: 'fa-bolt' },
  { value: 'servidores', label: 'Servidores', icon: 'fa-hands-holding' }
];

const DAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function renderAsistencia(container, { params } = {}) {
  const initialTab = params?.get('tab') || 'todos';
  let activeMinistry = initialTab === 'cumpleanos' ? 'todos' : initialTab;
  let isBirthdayFilter = initialTab === 'cumpleanos';
  let searchTerm = '';
  let activeTodayService = null;

  container.innerHTML = `
    ${pageHeader({
      title: 'Mesa de Registro y Asistencia',
      subtitle: 'Búsqueda rápida, confirmación de asistencia en 1 clic y auto-registro QR',
      icon: 'fa-user-check',
      actions: `
        <button type="button" class="clg-btn clg-btn-secondary" id="btn-open-qr" title="Muestra el código QR para que los visitantes se registren desde su celular">
          <i class="fas fa-qrcode"></i><span>📱 Código QR de Registro</span>
        </button>
        <button type="button" class="clg-btn clg-btn-primary" id="btn-quick-new" title="Registra manualmente a una nueva persona o familia">
          <i class="fas fa-user-plus"></i><span>+ Nuevo Visitante</span>
        </button>
      `
    })}

    <div id="clg-service-banner-host"></div>

    <div class="clg-card" style="margin-bottom: 20px; padding: 18px 20px; background: #ffffff; border-radius: var(--clg-radius, 16px); border: 1px solid var(--clg-line, #e2e8f0);">
      <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 260px; position: relative;">
          <i class="fas fa-magnifying-glass" style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--clg-muted, #94a3b8); font-size: 1rem;"></i>
          <input type="search" id="clg-att-search" placeholder="Buscar por Cédula, Nombre, Apellido o Teléfono/WhatsApp…" 
                 style="width: 100%; box-sizing: border-box; padding: 12px 14px 12px 42px; border: 1.5px solid #cbd5e1; border-radius: 12px; font-size: 0.95rem; outline: none; transition: border-color 0.15s;" 
                 autocomplete="off" aria-label="Buscar persona">
        </div>
        <span class="clg-tooltip-icon" title="Busca reactivamente por documento, nombre o celular. Si la persona no existe, podrás registrarla al instante.">?</span>
      </div>

      <div class="clg-tabs" id="clg-ministry-tabs" style="margin-top: 16px; margin-bottom: 0;">
        ${MINISTRY_TABS.map((tab) => `
          <button type="button" class="clg-tab ${!isBirthdayFilter && tab.value === activeMinistry ? 'is-active' : ''}" data-ministry="${tab.value}">
            <i class="fas ${tab.icon}"></i><span>${tab.label}</span>
            <span class="clg-tab-badge" data-min-badge="${tab.value}">0</span>
          </button>
        `).join('')}
        <button type="button" class="clg-tab ${isBirthdayFilter ? 'is-active' : ''}" data-ministry="cumpleanos">
          <i class="fas fa-cake-candles"></i><span>Cumpleañeros</span>
          <span class="clg-tab-badge" data-min-badge="cumpleanos">0</span>
        </button>
      </div>
    </div>

    <div id="clg-asistencia-body">
      <div class="clg-table-skeleton">
        <div class="clg-skeleton-row"></div>
        <div class="clg-skeleton-row"></div>
        <div class="clg-skeleton-row"></div>
      </div>
    </div>

    <div id="clg-asistencia-modal-host"></div>
  `;

  const bannerHost = qs('#clg-service-banner-host', container);
  const body = qs('#clg-asistencia-body', container);
  const searchInput = qs('#clg-att-search', container);
  const modalHost = qs('#clg-asistencia-modal-host', container);

  // Botón QR en la cabecera
  qs('#btn-open-qr', container)?.addEventListener('click', () => {
    openQRModal(modalHost);
  });

  // Botón Nuevo Visitante
  qs('#btn-quick-new', container)?.addEventListener('click', () => {
    openQuickRegisterModal(modalHost, searchTerm, activeMinistry);
  });

  // Pestañas de Ministerio
  qs('#clg-ministry-tabs', container)?.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('[data-ministry]');
    if (!tabBtn) return;
    const val = tabBtn.dataset.ministry;
    if (val === 'cumpleanos') {
      isBirthdayFilter = true;
    } else {
      isBirthdayFilter = false;
      activeMinistry = val;
    }
    qsa('#clg-ministry-tabs .clg-tab', container).forEach((t) => t.classList.remove('is-active'));
    tabBtn.classList.add('is-active');
    render();
  });

  // Barra de búsqueda con debounce suave
  searchInput?.addEventListener('input', debounce((e) => {
    searchTerm = e.target.value.trim();
    render();
  }, 120));

  let unsubscribe = null;

  function detectTodayService(settings, events) {
    const todayIndex = new Date().getDay();
    const todayName = DAYS_ES[todayIndex].toLowerCase();
    const todayDateISO = new Date().toISOString().slice(0, 10);

    // 1. Buscar en servicios fijos semanales
    const hours = Array.isArray(settings?.serviceHours) ? settings.serviceHours : (Array.isArray(settings?.services) ? settings.services : []);
    const matchingHour = hours.find((h) => {
      const d = (h.day || '').toLowerCase();
      return d.includes(todayName);
    });

    if (matchingHour) {
      return {
        type: 'servicio',
        title: matchingHour.label || 'Servicio General',
        day: matchingHour.day,
        time: matchingHour.time,
        description: matchingHour.description
      };
    }

    // 2. Buscar en eventos de hoy
    const matchingEvent = (events || []).find((ev) => {
      return ev.dateStart && ev.dateStart.startsWith(todayDateISO);
    });

    if (matchingEvent) {
      return {
        type: 'evento',
        title: matchingEvent.title,
        day: DAYS_ES[todayIndex],
        time: matchingEvent.timeStart || 'Hoy',
        description: matchingEvent.location || 'Templo Love'
      };
    }

    return null;
  }

  function render() {
    const state = getState();
    if (!state.ready) return;

    const members = state.members || [];
    const settings = state.settings || {};
    const events = state.activeEvents || [];
    const currentUser = state.profile || {};

    // 1. Alerta de servicio activo hoy
    activeTodayService = detectTodayService(settings, events);
    if (activeTodayService) {
      bannerHost.innerHTML = `
        <div class="clg-active-service-banner">
          <div class="clg-active-service-banner-text">
            <span class="clg-active-service-banner-icon"><i class="fas fa-bell"></i></span>
            <div>
              <strong>🔔 Hoy hay servicio programado:</strong> ${escapeHTML(activeTodayService.day)} · ${escapeHTML(activeTodayService.time)} (${escapeHTML(activeTodayService.title)}).
              <div style="font-size: 0.82rem; font-weight: normal; color: #7c2d12; margin-top: 2px;">Mesa de asistencia y registro abierta para servidores.</div>
            </div>
          </div>
          <span class="clg-tag clg-tag-primary" style="font-weight: 700;">En Curso</span>
        </div>
      `;
    } else {
      bannerHost.innerHTML = '';
    }

    // 2. Conteo de badges en pestañas
    const weekBirthdays = birthdaysThis(members, 'semana');
    const badgeCumple = qs('[data-min-badge="cumpleanos"]', container);
    if (badgeCumple) badgeCumple.textContent = weekBirthdays.length;

    MINISTRY_TABS.forEach((tab) => {
      const badge = qs(`[data-min-badge="${tab.value}"]`, container);
      if (!badge) return;
      if (tab.value === 'todos') {
        badge.textContent = members.length;
      } else {
        const count = members.filter((m) => (m.ministry || 'general').toLowerCase() === tab.value.toLowerCase()).length;
        badge.textContent = count;
      }
    });

    // 3. Filtrar lista por ministerio y búsqueda
    let filtered = members;
    if (isBirthdayFilter) {
      filtered = weekBirthdays.map((e) => e.member);
    } else if (activeMinistry !== 'todos') {
      filtered = filtered.filter((m) => (m.ministry || 'general').toLowerCase() === activeMinistry.toLowerCase());
    }

    if (searchTerm) {
      filtered = searchMembers(filtered, searchTerm);
    }

    // 4. Renderizar contenido
    if (!filtered.length) {
      if (searchTerm) {
        body.innerHTML = `
          <div class="clg-card" style="padding: 32px 24px; text-align: center; background: #ffffff; border-radius: var(--clg-radius, 16px); border: 2px dashed #fcd34d;">
            <div style="font-size: 2.5rem; color: #f59e0b; margin-bottom: 12px;"><i class="fas fa-user-question"></i></div>
            <h3 style="margin: 0; font-size: 1.25rem; color: var(--clg-secondary);">Persona no registrada. ¿Es su primera vez?</h3>
            <p style="margin: 8px 0 20px 0; font-size: 0.92rem; color: var(--clg-muted); max-width: 480px; margin-left: auto; margin-right: auto;">
              No se encontró a nadie con el criterio "<strong>${escapeHTML(searchTerm)}</strong>". Puedes registrarlo como nuevo visitante en 10 segundos.
            </p>
            <button type="button" class="clg-btn clg-btn-primary clg-btn-lg" id="btn-empty-register">
              <i class="fas fa-user-plus"></i><span>+ Registrar como Nuevo Visitante</span>
            </button>
          </div>
        `;
        body.querySelector('#btn-empty-register')?.addEventListener('click', () => {
          openQuickRegisterModal(modalHost, searchTerm, activeMinistry);
        });
      } else {
        body.innerHTML = emptyState({
          icon: 'fa-users',
          title: 'Sin personas en esta sección',
          message: 'No hay miembros asociados a este ministerio o filtro seleccionado.'
        });
      }
      return;
    }

    // Renderizado de lista de tarjetas táctiles
    const todayISO = new Date().toISOString().slice(0, 10);

    body.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <span style="font-size: 0.88rem; color: var(--clg-muted);">
          Mostrando <strong>${filtered.length}</strong> ${filtered.length === 1 ? 'persona' : 'personas'}
        </span>
      </div>

      <div class="clg-attendance-list">
        ${filtered.map((member) => {
          const isCand = isCandidateForRegularMember(member);
          const attendances = Array.isArray(member.attendances) ? member.attendances : [];
          const attendedToday = attendances.some((a) => (a.date || a.timestamp || '').startsWith(todayISO));
          const totalAtt = member.attendanceCount || attendances.length;

          return `
            <div class="clg-attendance-card" data-member-id="${member.id}">
              <div style="display: flex; gap: 14px; align-items: center; flex: 1; min-width: 0;">
                ${memberAvatar(member, 'clg-avatar-md')}
                <div style="flex: 1; min-width: 0;">
                  <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <strong style="font-size: 1.05rem; color: var(--clg-secondary);">${escapeHTML(member.fullName)}</strong>
                    ${isCand ? `<span class="clg-candidate-badge"><i class="fas fa-sparkles"></i> ✨ Candidato a Miembro Regular</span>` : ''}
                    <span class="clg-tag clg-tag-info" style="font-size: 0.72rem; text-transform: capitalize;">${escapeHTML(member.ministry || 'General')}</span>
                  </div>
                  
                  <div style="display: flex; gap: 10px; font-size: 0.82rem; color: var(--clg-muted); margin-top: 4px; flex-wrap: wrap;">
                    <span><i class="far fa-id-card"></i> ${escapeHTML(member.documentId || 'Sin documento')}</span>
                    ${member.phone ? `<span><i class="fas fa-phone"></i> ${escapeHTML(formatPhoneCO(member.phone))}</span>` : ''}
                    ${member.neighborhood ? `<span><i class="fas fa-location-dot"></i> ${escapeHTML(member.neighborhood)}</span>` : ''}
                    <span><i class="fas fa-calendar-check"></i> Asistencias: <strong>${totalAtt}</strong></span>
                  </div>
                </div>
              </div>

              <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: flex-end;">
                ${isCand && can(currentUser.role, 'members.write') ? `
                  <button type="button" class="clg-btn clg-btn-soft clg-btn-sm" data-action="promote" data-id="${member.id}" title="Promueve a este asistente con 4+ visitas a Miembro Regular Activo">
                    <i class="fas fa-star" style="color: #f59e0b;"></i><span>Promover a Miembro Regular</span>
                  </button>
                ` : ''}

                ${attendedToday ? `
                  <button type="button" class="clg-btn clg-btn-ghost clg-btn-sm" disabled style="background: rgba(16, 172, 132, 0.12); color: #0d9488; border-color: transparent; cursor: default;">
                    <i class="fas fa-circle-check"></i><span>✅ Asistencia Registrada Hoy</span>
                  </button>
                ` : `
                  <button type="button" class="clg-btn clg-btn-primary" data-action="checkin" data-id="${member.id}" style="padding: 10px 18px; font-weight: 700;">
                    <i class="fas fa-check"></i><span>✅ Está Aquí / Confirmar Asistencia</span>
                  </button>
                `}

                <button type="button" class="clg-icon-btn clg-icon-btn-ghost" data-action="view-member" data-id="${member.id}" title="Ver ficha completa">
                  <i class="fas fa-chevron-right"></i>
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Delegación de eventos para toma de asistencia y promoción
    body.querySelectorAll('[data-action="checkin"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const memberId = btn.dataset.id;
        const svcTitle = activeTodayService ? `${activeTodayService.title} (${activeTodayService.time})` : 'Servicio Presencial Love';
        
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando…';

        try {
          await recordAttendance(memberId, {
            serviceName: svcTitle,
            authorName: currentUser.displayName || currentUser.fullName || 'Servidor'
          });
          showToast('¡Asistencia confirmada exitosamente!', 'success');
        } catch (err) {
          showToast(err.message || 'Error al registrar asistencia.', 'danger');
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-check"></i><span>✅ Está Aquí / Confirmar Asistencia</span>';
        }
      });
    });

    body.querySelectorAll('[data-action="promote"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const memberId = btn.dataset.id;
        btn.disabled = true;
        try {
          await upgradeMemberStatus(memberId, 'activo', currentUser.uid);
          showToast('¡Miembro promovido a Estado Activo!', 'success');
        } catch (err) {
          showToast(err.message || 'Error al actualizar estatus.', 'danger');
          btn.disabled = false;
        }
      });
    });

    body.querySelectorAll('[data-action="view-member"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        navigate(`seguimiento?member=${encodeURIComponent(btn.dataset.id)}`);
      });
    });
  }

  unsubscribe = subscribe(['members', 'settings', 'activeEvents', 'ready'], () => {
    render();
  });

  return () => {
    if (unsubscribe) unsubscribe();
  };
}

/* --------------------------------------------------------------------------
   MODAL DE CÓDIGO QR PARA AUTO-REGISTRO
   -------------------------------------------------------------------------- */
function openQRModal(host) {
  const registerUrl = 'https://comunidad-love.vercel.app/#/registro-asistencia';
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(registerUrl)}`;

  const modal = document.createElement('div');
  modal.className = 'clg-modal-overlay';
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(6px);
    z-index: 99999; display: flex; align-items: center; justify-content: center;
    padding: 16px; box-sizing: border-box;
  `;

  modal.innerHTML = `
    <div style="background: #ffffff; color: #1e293b; max-width: 440px; width: 100%; border-radius: 20px; padding: 28px 24px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); text-align: center; position: relative;">
      <button type="button" class="clg-modal-close" style="position: absolute; top: 16px; right: 16px; background: #f1f5f9; border: none; width: 34px; height: 34px; border-radius: 50%; font-size: 1.1rem; color: #64748b; cursor: pointer;">✕</button>
      
      <div style="width: 52px; height: 52px; border-radius: 14px; background: rgba(255, 107, 74, 0.12); color: #ff6b4a; display: inline-flex; align-items: center; justify-content: center; font-size: 1.6rem; margin-bottom: 12px;">
        <i class="fas fa-qrcode"></i>
      </div>

      <h2 style="margin: 0; font-size: 1.3rem; color: #0f172a;">Código QR de Auto-Registro</h2>
      <p style="margin: 6px 0 16px 0; font-size: 0.86rem; color: #64748b; line-height: 1.4;">
        Muestra este código al visitante para que lo escanee con su teléfono y complete su asistencia en segundos.
      </p>

      <div style="padding: 16px; background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 16px; display: inline-block; margin-bottom: 16px;">
        <img src="${qrApiUrl}" alt="Código QR Auto-Registro" style="width: 220px; height: 220px; display: block; border-radius: 8px;" loading="lazy">
      </div>

      <div style="background: #f1f5f9; border-radius: 10px; padding: 8px 12px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
        <span style="font-size: 0.78rem; color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHTML(registerUrl)}</span>
        <button type="button" id="btn-copy-qr-link" class="clg-btn clg-btn-ghost clg-btn-sm" style="flex-shrink: 0;">
          <i class="fas fa-copy"></i><span>Copiar</span>
        </button>
      </div>

      <div style="display: flex; gap: 10px; justify-content: center;">
        <a href="${registerUrl}" target="_blank" rel="noopener" class="clg-btn clg-btn-soft">
          <i class="fas fa-external-link-alt"></i><span>Probar Enlace</span>
        </a>
        <button type="button" class="clg-btn clg-btn-secondary" id="btn-close-qr-bottom">
          Cerrar
        </button>
      </div>
    </div>
  `;

  host.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('.clg-modal-close')?.addEventListener('click', close);
  modal.querySelector('#btn-close-qr-bottom')?.addEventListener('click', close);

  modal.querySelector('#btn-copy-qr-link')?.addEventListener('click', async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(registerUrl);
      } else {
        const ta = document.createElement('textarea');
        ta.value = registerUrl;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      showToast('Enlace copiado al portapapeles', 'success');
    } catch {
      showToast('No se pudo copiar el enlace', 'warning');
    }
  });
}

/* --------------------------------------------------------------------------
   MODAL DE REGISTRO RÁPIDO DE NUEVO VISITANTE
   -------------------------------------------------------------------------- */
function openQuickRegisterModal(host, term = '', defaultMinistry = 'general') {
  const isDoc = /^\d{6,15}$/.test(term.replace(/\D/g, ''));
  const isPhone = /^\d{10}$/.test(term.replace(/\D/g, ''));

  const initialDoc = isDoc ? term.replace(/\D/g, '') : '';
  const initialPhone = isPhone ? term.replace(/\D/g, '') : '';
  const initialName = (!isDoc && !isPhone) ? term : '';

  const modal = document.createElement('div');
  modal.className = 'clg-modal-overlay';
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(6px);
    z-index: 99999; display: flex; align-items: center; justify-content: center;
    padding: 16px; box-sizing: border-box; overflow-y: auto;
  `;

  modal.innerHTML = `
    <div style="background: #ffffff; color: #1e293b; max-width: 500px; width: 100%; border-radius: 20px; padding: 26px 24px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); position: relative;">
      <button type="button" class="clg-modal-close" style="position: absolute; top: 16px; right: 16px; background: #f1f5f9; border: none; width: 34px; height: 34px; border-radius: 50%; font-size: 1.1rem; color: #64748b; cursor: pointer;">✕</button>
      
      <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 18px;">
        <div style="width: 44px; height: 44px; border-radius: 12px; background: rgba(255, 107, 74, 0.12); color: #ff6b4a; display: inline-flex; align-items: center; justify-content: center; font-size: 1.3rem;">
          <i class="fas fa-user-plus"></i>
        </div>
        <div>
          <h2 style="margin: 0; font-size: 1.25rem; color: #0f172a;">Registrar Nuevo Visitante</h2>
          <p style="margin: 2px 0 0 0; font-size: 0.84rem; color: #64748b;">Mesa de recepción y toma de asistencia inmediata</p>
        </div>
      </div>

      <form id="clg-quick-reg-form" style="display: flex; flex-direction: column; gap: 14px;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <label style="font-size: 0.82rem; font-weight: 600; color: #334155;">Nombre Completo *</label>
            <span class="clg-tooltip-icon" title="Escribe el nombre y apellido del visitante para identificarlo en las listas de consolidación.">?</span>
          </div>
          <input type="text" name="fullName" value="${escapeHTML(initialName)}" required placeholder="Ej: Camilo Pérez" style="width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.92rem; outline: none;">
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <label style="font-size: 0.82rem; font-weight: 600; color: #334155;">Documento (Cédula)</label>
              <span class="clg-tooltip-icon" title="Cédula de ciudadanía o tarjeta de identidad (6 a 15 dígitos numéricos).">?</span>
            </div>
            <input type="tel" name="documentId" value="${escapeHTML(initialDoc)}" placeholder="Ej: 1047123456" style="width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.92rem; outline: none;">
          </div>
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <label style="font-size: 0.82rem; font-weight: 600; color: #334155;">Celular / WhatsApp *</label>
              <span class="clg-tooltip-icon" title="Número de WhatsApp a 10 dígitos para enviarle saludos y acompañamiento pastoral.">?</span>
            </div>
            <input type="tel" name="phone" value="${escapeHTML(initialPhone)}" required placeholder="3001234567" maxlength="10" style="width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.92rem; outline: none;">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <label style="font-size: 0.82rem; font-weight: 600; color: #334155;">Ministerio / Espacio</label>
              <span class="clg-tooltip-icon" title="Permite asignar al visitante al ministerio correspondiente (General, Kids, Adora, etc.).">?</span>
            </div>
            <select name="ministry" style="width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.92rem; outline: none; background: #fff;">
              <option value="general" ${defaultMinistry === 'general' ? 'selected' : ''}>General / Congregación</option>
              <option value="kids" ${defaultMinistry === 'kids' ? 'selected' : ''}>Love Kids</option>
              <option value="adora" ${defaultMinistry === 'adora' ? 'selected' : ''}>Love Adora</option>
              <option value="mujeres" ${defaultMinistry === 'mujeres' ? 'selected' : ''}>Love Woman</option>
              <option value="jovenes" ${defaultMinistry === 'jovenes' ? 'selected' : ''}>Jóvenes</option>
              <option value="servidores" ${defaultMinistry === 'servidores' ? 'selected' : ''}>Servidores</option>
            </select>
          </div>
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <label style="font-size: 0.82rem; font-weight: 600; color: #334155;">Barrio / Sector</label>
              <span class="clg-tooltip-icon" title="Barrio de residencia en Cartagena.">?</span>
            </div>
            <input type="text" name="neighborhood" placeholder="Ej: Pie de la Popa" style="width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.92rem; outline: none;">
          </div>
        </div>

        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 10px;">
          <button type="button" class="clg-btn clg-btn-ghost" id="btn-cancel-quick-reg">Cancelar</button>
          <button type="submit" class="clg-btn clg-btn-primary" id="btn-submit-quick-reg">
            <i class="fas fa-check"></i><span>Guardar y Confirmar Asistencia</span>
          </button>
        </div>
      </form>
    </div>
  `;

  host.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('.clg-modal-close')?.addEventListener('click', close);
  modal.querySelector('#btn-cancel-quick-reg')?.addEventListener('click', close);

  const form = modal.querySelector('#clg-quick-reg-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = modal.querySelector('#btn-submit-quick-reg');
    const fd = new FormData(form);

    const fullName = (fd.get('fullName') || '').toString().trim();
    const documentId = (fd.get('documentId') || '').toString().trim();
    const phone = (fd.get('phone') || '').toString().trim();
    const ministry = (fd.get('ministry') || 'general').toString();
    const neighborhood = (fd.get('neighborhood') || '').toString().trim();

    if (!fullName) {
      showToast('Ingresa el nombre de la persona.', 'warning');
      return;
    }
    if (phone && phone.replace(/\D/g, '').length !== 10) {
      showToast('El teléfono debe tener estrictamente 10 dígitos numéricos.', 'warning');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…';

    try {
      const today = new Date().toISOString().slice(0, 10);
      const state = getState();
      const currentUser = state.profile || {};

      await createMember({
        fullName,
        documentId,
        phone,
        ministry,
        neighborhood,
        status: 'nuevo',
        churchRole: 'Nuevo Asistente',
        firstVisitDate: today,
        attendanceType: 'solo',
        attendances: [{
          date: today,
          service: 'Servicio Presencial Love',
          registeredBy: currentUser.displayName || 'Servidor',
          timestamp: new Date().toISOString()
        }],
        lastAttendance: today,
        attendanceCount: 1
      }, { authorUid: currentUser.uid });

      showToast(`¡${fullName} registrado/a y asistencia confirmada!`, 'success');
      close();
    } catch (err) {
      showToast(err.message || 'Error al guardar.', 'danger');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-check"></i><span>Guardar y Confirmar Asistencia</span>';
    }
  });
}
