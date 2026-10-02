/* ==========================================================================
   VISTA: SEGUIMIENTO DE MIEMBROS (Pastores y Admin)
   --------------------------------------------------------------------------
   - Tabla con búsqueda por nombre, cédula, teléfono o correo
   - Filtros: cumpleaños hoy / semana / mes
   - Enlace directo a WhatsApp con saludo de cumpleaños
   - Ficha individual con bitácora de seguimientos
   ========================================================================== */

import {
  searchMembers,
  birthdaysThis,
  updateMember,
  deleteMember,
  assignLeaderFamily,
  membersToCSV,
  getAbsenteeMembers,
  CHURCH_ROLES,
  MEMBER_STATUS,
  STATUS_LABELS
} from '../../services/members.js';
import { watchFollowups, addFollowup, deleteFollowup, FOLLOWUP_TYPE_LABELS, FOLLOWUP_TYPE_ICONS } from '../../services/followups.js';
import { logAudit } from '../../services/audit.js';
import { can } from '../../lib/auth.js';
import {
  escapeHTML,
  qs,
  qsa,
  showToast,
  confirmDialog,
  formatPhoneCO,
  whatsappLink,
  birthdayWhatsappMessage,
  downloadCSV,
  debounce
} from '../../lib/dom.js';
import {
  formatDate,
  formatDateTime,
  ageFrom,
  birthdayLabel,
  daysToBirthday,
  toISODate,
  toIsoDateString
} from '../../lib/dates.js';
import { subscribe, leaders } from '../store.js';
import { bindImageInputs, imageInput, prepareImageValue } from '../image-input.js';
import { bindLiveFormValidation } from '../../lib/validation.js';
import { pageHeader, card, table, emptyState, tag, iconButton, field, drawer, markInvalid, clearInvalid, setLoading, readForm } from '../ui.js';
import { memberAvatar } from './panel.js';

const FILTERS = [
  { value: 'todos', label: 'Todos', icon: 'fa-users' },
  { value: 'hoy', label: 'Cumple hoy', icon: 'fa-cake-candles' },
  { value: 'semana', label: 'Cumple esta semana', icon: 'fa-calendar-week' },
  { value: 'mes', label: 'Cumple este mes', icon: 'fa-calendar' },
  { value: 'inasistencia', label: 'Alerta Pastoral (3+ ausencias)', icon: 'fa-triangle-exclamation' }
];

let filterMode = 'todos';
let searchTerm = '';
let followupUnsub = null;

export function renderSeguimiento(container, { params }) {
  container.innerHTML = `
    ${pageHeader({
      title: 'Seguimiento de Miembros',
      subtitle: 'Busca, felicita y registra el acompañamiento pastoral',
      icon: 'fa-address-book'
    })}
    <div id="clg-seg-toolbar" class="clg-toolbar">
      <div class="clg-search">
        <i class="fas fa-magnifying-glass"></i>
        <input type="search" id="clg-seg-search" placeholder="Buscar por nombre, cédula, teléfono o correo…"
               aria-label="Buscar miembros" autocomplete="off">
      </div>
      <div class="clg-filters" id="clg-seg-filters">
        ${FILTERS.map(
          (filter) => `
          <button type="button" class="clg-chip${filter.value === filterMode ? ' is-active' : ''}"
                  data-filter="${filter.value}">
            <i class="fas ${filter.icon}"></i><span>${escapeHTML(filter.label)}</span>
            <em data-count="${filter.value}">0</em>
          </button>`
        ).join('')}
      </div>
    </div>
    <div id="clg-seg-body">
      <div class="clg-table-skeleton">
        ${Array.from({ length: 6 }, () => '<div class="clg-skeleton-row"></div>').join('')}
      </div>
    </div>
    <div id="clg-seg-drawer"></div>
  `;

  const body = qs('#clg-seg-body', container);
  const searchInput = qs('#clg-seg-search', container);
  const drawerHost = qs('#clg-seg-drawer', container);

  qs('#clg-seg-filters', container).addEventListener('click', (event) => {
    const chip = event.target.closest('[data-filter]');
    if (!chip) return;
    filterMode = chip.dataset.filter;
    qsa('.clg-chip', container).forEach((c) => c.classList.toggle('is-active', c === chip));
    render();
  });

  searchInput.addEventListener(
    'input',
    debounce((event) => {
      searchTerm = event.target.value;
      render();
    }, 200)
  );

  function currentList(state) {
    let base = state.members;
    if (filterMode === 'inasistencia') {
      base = getAbsenteeMembers(state.members, 3);
    } else if (filterMode !== 'todos') {
      base = birthdaysThis(state.members, filterMode).map((e) => e.member);
    }
    return searchMembers(base, searchTerm);
  }

  let dataUnsubscribe = null;

  function render() {
    if (dataUnsubscribe) {
      dataUnsubscribe();
      dataUnsubscribe = null;
    }
    dataUnsubscribe = subscribe(['members', 'ready', 'profile'], (state) => {
      if (!state.ready) return;
      const absentees = getAbsenteeMembers(state.members, 3);
      const absenteesSet = new Set(absentees.map((m) => m.id));
      const list = currentList(state);
      const role = state.profile?.role;

      qs('[data-count="todos"]', container).textContent = state.members.length;
      qs('[data-count="hoy"]', container).textContent = birthdaysThis(state.members, 'hoy').length;
      qs('[data-count="semana"]', container).textContent = birthdaysThis(state.members, 'semana').length;
      qs('[data-count="mes"]', container).textContent = birthdaysThis(state.members, 'mes').length;
      const inasistCountEl = qs('[data-count="inasistencia"]', container);
      if (inasistCountEl) inasistCountEl.textContent = absentees.length;

      body.innerHTML = card({
        title: `${list.length} ${list.length === 1 ? 'miembro' : 'miembros'}`,
        subtitle:
          filterMode === 'todos' ? 'Listado completo de la comunidad' : FILTERS.find((f) => f.value === filterMode)?.label,
        body: renderTable(list, role, absenteesSet),
        footer: can(role, 'reports.export') && list.length
          ? `<button class="clg-btn clg-btn-ghost" type="button" data-action="export">
               <i class="fas fa-file-csv"></i><span>Exportar CSV</span>
             </button>`
          : ''
      });

      body.querySelector('[data-action="export"]')?.addEventListener('click', () => {
        downloadCSV('miembros-comunidad-love.csv', membersToCSV(list));
        showToast('Archivo CSV generado.', 'success');
      });

      body.querySelectorAll('tr[data-open-member]').forEach((row) => {
        row.addEventListener('click', (event) => {
          if (event.target.closest('a')) return;
          openMember(row.dataset.openMember, state, drawerHost, container);
        });
      });
    });
  }

  render();

  const requested = params?.get('member');
  let pendingUnsubscribe = null;
  const cleanups = [() => {
    if (dataUnsubscribe) {
      dataUnsubscribe();
      dataUnsubscribe = null;
    }
    if (followupUnsub) {
      followupUnsub();
      followupUnsub = null;
    }
  }];

  if (requested) {
    let handled = false;
    pendingUnsubscribe = subscribe(['members', 'ready'], (state) => {
      if (handled || !state.ready) return;
      handled = true;
      if (pendingUnsubscribe) pendingUnsubscribe();
      const member = state.members.find((m) => m.id === requested);
      if (member) openMember(requested, state, drawerHost, container);
    });
    cleanups.push(() => {
      if (pendingUnsubscribe) pendingUnsubscribe();
    });
  }

  return () => cleanups.forEach((fn) => fn());
}

function renderTable(list, role, absenteesSet = new Set()) {
  if (!list.length) {
    return emptyState({
      icon: 'fa-user-slash',
      title: 'Sin resultados',
      message: searchTerm
        ? `Ningún miembro coincide con "${searchTerm}".`
        : 'No hay miembros que cumplan este filtro.'
    });
  }

  return table({
    head: ['Miembro', 'Contacto', 'Cumpleaños', 'Rol', 'Estado', 'Líder', 'Acciones'],
    rows: list.map((member) => {
      const days = daysToBirthday(member.birthDate);
      const age = ageFrom(member.birthDate);
      const isAbsentee = absenteesSet.has(member.id);
      const waMsg = isAbsentee
        ? `Hola ${member.fullName}, te extrañamos en Comunidad Love. Esperamos que todo esté muy bien y poder verte pronto en nuestros servicios. ¡Te mandamos un abrazo!`
        : birthdayWhatsappMessage(member.fullName);

      return `
        <tr data-open-member="${escapeHTML(member.id)}" tabindex="0" role="button">
          <td>
            <div class="clg-cell-person">
              ${memberAvatar(member)}
              <div>
                <strong>${escapeHTML(member.fullName)}</strong>
                <span>${escapeHTML(member.documentId || 'Sin documento')}${member.neighborhood ? ` · ${escapeHTML(member.neighborhood)}` : ''}</span>
              </div>
            </div>
          </td>
          <td>
            <div class="clg-cell-contact">
              <span>${escapeHTML(formatPhoneCO(member.phone) || 'Sin teléfono')}</span>
              <span class="clg-cell-muted">${escapeHTML(member.email || '')}</span>
            </div>
          </td>
          <td>
            ${
              member.birthDate
                ? `<span class="clg-bday${days === 0 ? ' is-today' : ''}">${escapeHTML(birthdayLabel(days))}</span>
                   <span class="clg-cell-muted">${escapeHTML(formatDate(member.birthDate))}${age !== null ? ` · ${age} años` : ''}</span>`
                : '<span class="clg-cell-muted">Sin fecha</span>'
            }
          </td>
          <td>${tag(member.churchRole, 'neutral')}</td>
          <td>
            ${tag(STATUS_LABELS[member.status] || member.status, statusTone(member.status))}
            ${isAbsentee ? `<span class="clg-tag clg-tag-danger" style="margin-top: 4px; display: inline-flex; align-items: center; gap: 4px; font-size: 0.72rem;" title="Alerta Pastoral: 3 o más servicios sin registrar asistencia"><i class="fas fa-triangle-exclamation"></i> 3+ Ausencias</span>` : ''}
          </td>
          <td><span class="clg-cell-muted">${escapeHTML(member.assignedLeaderName || 'Sin asignar')}</span></td>
          <td>
            <div class="clg-row-actions">
              ${
                member.phone
                  ? `<a class="clg-icon-btn clg-icon-btn-whatsapp" target="_blank" rel="noopener" title="${isAbsentee ? 'Contacto Pastoral WhatsApp' : 'WhatsApp'}"
                       href="${escapeHTML(whatsappLink(member.phone, waMsg))}">
                       <i class="fab fa-whatsapp"></i>
                     </a>`
                  : ''
              }
              ${iconButton({ icon: 'fa-book-open', label: 'Ver ficha', action: 'view' })}
            </div>
          </td>
        </tr>
      `;
    })
  });
}

function statusTone(status) {
  return { activo: 'news', en_consolidacion: 'warning', nuevo: 'primary', inactivo: 'danger' }[status] || 'neutral';
}

/* --------------------------------------------------------------------------
   FICHA DEL MIEMBRO + BITÁCORA
   -------------------------------------------------------------------------- */
function openMember(memberId, state, drawerHost, container) {
  if (followupUnsub) {
    followupUnsub();
    followupUnsub = null;
  }
  const member = state.members.find((m) => m.id === memberId);
  if (!member) return;

  const role = state.profile?.role;
  const canWrite = can(role, 'members.write');
  const canDelete = can(role, 'members.delete');
  const canAssign = can(role, 'content.write');
  const leaderOptions = [{ value: '', label: 'Sin líder asignado' }].concat(
    leaders().map((user) => ({ value: user.id, label: user.displayName || user.email }))
  );

  drawerHost.innerHTML = drawer({
    id: 'clg-member-drawer',
    title: member.fullName,
    body: `
      <div class="clg-drawer-profile">
        ${memberAvatar(member, 'clg-avatar-lg')}
        <div class="clg-drawer-identity">
          <h3>${escapeHTML(member.fullName)}</h3>
          <p>${escapeHTML(member.churchRole)} · ${escapeHTML(STATUS_LABELS[member.status] || member.status)}</p>
          <div class="clg-drawer-badges">
            ${tag(member.attendanceType === 'familiar' ? 'Asiste en familia' : 'Asiste solo/a', 'primary')}
            ${member.isBaptized ? tag('Bautizado/a', 'news') : tag('Sin bautismo', 'neutral')}
            ${member.familyId ? tag(member.familyId, 'neutral') : ''}
          </div>
        </div>
      </div>

      <div class="clg-drawer-actions">
        ${
          member.phone
            ? `<a class="clg-btn clg-btn-whatsapp" target="_blank" rel="noopener"
                 href="${escapeHTML(whatsappLink(member.phone, `Hola ${member.fullName}, te escribimos desde Comunidad Love. ¿Cómo estás?`))}">
                 <i class="fab fa-whatsapp"></i><span>WhatsApp</span>
               </a>`
            : ''
        }
        <a class="clg-btn clg-btn-ghost" href="tel:${escapeHTML(member.phone)}">
          <i class="fas fa-phone"></i><span>Llamar</span>
        </a>
        <a class="clg-btn clg-btn-ghost" href="mailto:${escapeHTML(member.email)}">
          <i class="fas fa-envelope"></i><span>Correo</span>
        </a>
      </div>

      <section class="clg-drawer-section">
        <h4>Datos de contacto</h4>
        <dl class="clg-deflist">
          <div><dt>Documento</dt><dd>${escapeHTML(member.documentId || '—')}</dd></div>
          <div><dt>Teléfono</dt><dd>${escapeHTML(formatPhoneCO(member.phone) || '—')}</dd></div>
          <div><dt>Correo</dt><dd>${escapeHTML(member.email || '—')}</dd></div>
          <div><dt>Barrio</dt><dd>${escapeHTML(member.neighborhood || '—')}</dd></div>
          <div><dt>Dirección</dt><dd>${escapeHTML(member.address || '—')}</dd></div>
          <div><dt>Fecha de nacimiento</dt><dd>${escapeHTML(formatDate(member.birthDate))}</dd></div>
          <div><dt>Primera visita</dt><dd>${escapeHTML(formatDate(member.firstVisitDate))}</dd></div>
          <div><dt>Registrado</dt><dd>${escapeHTML(formatDate(member.createdAt))}</dd></div>
        </dl>
      </section>

      ${
        member.prayerRequests || member.familyNotes
          ? `<section class="clg-drawer-section">
               <h4>Notas y peticiones</h4>
               ${member.prayerRequests ? `<p class="clg-note clg-note-prayer"><i class="fas fa-hands-praying"></i> ${escapeHTML(member.prayerRequests)}</p>` : ''}
               ${member.familyNotes ? `<p class="clg-note"><i class="fas fa-house"></i> ${escapeHTML(member.familyNotes)}</p>` : ''}
             </section>`
          : ''
      }

      <section class="clg-drawer-section">
        <h4>Seguimiento pastoral</h4>
        ${
          canWrite
            ? `<form class="clg-form clg-followup-form" id="clg-followup-form">
                 <div class="clg-grid-2">
                   ${field({
                     keyPrefix: 'fu',
                     name: 'type',
                     label: 'Tipo',
                     type: 'select',
                     options: Object.entries(FOLLOWUP_TYPE_LABELS).map(([value, label]) => ({ value, label })),
                     value: 'llamada'
                   })}
                    ${field({ keyPrefix: 'fu', name: 'date', label: 'Fecha', type: 'date', value: toISODate(new Date()) })}
                 </div>
                 ${field({
                   keyPrefix: 'fu',
                   name: 'notes',
                   label: 'Notas del seguimiento',
                   type: 'textarea',
                   rows: 3,
                   placeholder: 'Ej: Se contactó por teléfono, Hunter pidió oración por su mamá.',
                   required: true
                 })}
                 ${field({ keyPrefix: 'fu', name: 'nextActionDate', label: 'Próxima acción', type: 'date' })}
                 <button type="submit" class="clg-btn clg-btn-primary">
                   <i class="fas fa-plus"></i><span>Registrar seguimiento</span>
                 </button>
               </form>`
            : '<p class="clg-cell-muted">Tu rol no permite registrar seguimientos.</p>'
        }
        <div id="clg-followup-list" class="clg-timeline">
          <div class="clg-skeleton-line"></div>
          <div class="clg-skeleton-line"></div>
        </div>
      </section>

      ${
        canWrite
          ? `<section class="clg-drawer-section">
               <h4>Actualizar estado y líder</h4>
               <form class="clg-form" id="clg-member-form">
                 <div class="clg-grid-2">
                   ${field({ keyPrefix: 'ed', name: 'status', label: 'Estado', type: 'select', options: MEMBER_STATUS, value: member.status })}
                   ${field({ keyPrefix: 'ed', name: 'churchRole', label: 'Rol en la iglesia', type: 'select', options: CHURCH_ROLES, value: member.churchRole })}
                 </div>
${imageInput({
                    keyPrefix: 'ed',
                    name: 'photoUrl',
                    label: 'Foto',
                    value: member.photoUrl || '',
                    hint: 'URL externa o archivo comprimido (máx. 200 KB).',
                    compact: true
                  })}
                  ${
                    canAssign
                     ? field({
                        keyPrefix: 'ed',
                        name: 'assignedLeaderId',
                        label: 'Líder de seguimiento',
                        type: 'select',
                        options: leaderOptions,
                        value: member.assignedLeaderId || ''
                      })
                    : ''
                 }
                 <div class="clg-drawer-buttons">
                   <button type="submit" class="clg-btn clg-btn-primary"><i class="fas fa-save"></i><span>Guardar cambios</span></button>
                   ${canDelete ? `<button type="button" class="clg-btn clg-btn-danger-soft" data-action="delete-member"><i class="fas fa-trash-can"></i><span>Eliminar miembro</span></button>` : ''}
                 </div>
               </form>
             </section>`
          : ''
      }
    `,
    footer: `
      <button class="clg-btn clg-btn-ghost" type="button" data-close-drawer="clg-member-drawer">Cerrar</button>
    `
  });

  const drawerEl = qs('#clg-member-drawer', drawerHost);
  drawerEl.classList.add('is-open');
  qs('[data-drawer-overlay="clg-member-drawer"]', drawerHost).classList.add('is-open');
  document.body.classList.add('clg-lock');

  bindDrawerClose(drawerHost);
  bindImageInputs(drawerHost);
  bindLiveFormValidation(drawerHost);

  /* --- Bitácora --- */
  const listHost = qs('#clg-followup-list', drawerHost);
  if (listHost) {
    followupUnsub = watchFollowups(
      memberId,
      (entries) => {
        listHost.innerHTML = entries.length
          ? `<ul class="clg-timeline-list">${entries.map(renderFollowup).join('')}</ul>`
          : '<p class="clg-cell-muted">Sin seguimientos registrados todavía.</p>';
        listHost.querySelectorAll('[data-delete-followup]').forEach((button) => {
          button.addEventListener('click', async () => {
            const ok = await confirmDialog({
              title: 'Eliminar seguimiento',
              message: 'Esta acción no se puede deshacer.',
              confirmText: 'Eliminar',
              danger: true
            });
            if (!ok) return;
            try {
              await deleteFollowup(memberId, button.dataset.deleteFollowup);
              showToast('Seguimiento eliminado.', 'success');
            } catch (error) {
              showToast(error.message, 'error');
            }
          });
        });
      },
      () => {
        listHost.innerHTML = '<p class="clg-cell-muted">No se pudo cargar la bitácora.</p>';
      }
    );
  }

  /* --- Alta de seguimiento --- */
  qs('#clg-followup-form', drawerHost)?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    clearInvalid(form);
    const data = readForm(form);
    setLoading(form, true, 'Guardando…');
    try {
      const author = {
        uid: state.session?.user?.uid || '',
        displayName: state.profile?.displayName || state.session?.user?.email || ''
      };
      await addFollowup(
        memberId,
        {
          type: data['fu-type'],
          date: data['fu-date'] ? new Date(`${data['fu-date']}T09:00:00`) : null,
          notes: data['fu-notes'],
          nextActionDate: data['fu-nextActionDate'] ? new Date(`${data['fu-nextActionDate']}T09:00:00`) : null
        },
        author
      );
      form.reset();
      showToast('Seguimiento registrado.', 'success');
    } catch (error) {
      markInvalid(form, error.message);
    } finally {
      setLoading(form, false);
    }
  });

  /* --- Edición del miembro --- */
  qs('#clg-member-form', drawerHost)?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    clearInvalid(form);
    const data = readForm(form);
    setLoading(form, true, 'Guardando…');
    try {
      const leader = leaders().find((user) => user.id === data['ed-assignedLeaderId']);
      const updated = {
        ...member,
        status: data['ed-status'],
        churchRole: data['ed-churchRole'],
        photoUrl: prepareImageValue(data['ed-photoUrl']),
        assignedLeaderId: data['ed-assignedLeaderId'] || '',
        assignedLeaderName: leader ? leader.displayName || leader.email : ''
      };
      await updateMember(memberId, updated, state.session?.user?.uid || '');

      await logAudit({
        actor: state.profile,
        action: 'members.update',
        module: 'members',
        details: {
          member: member.fullName,
          status: updated.status,
          leaderChanged: data['ed-assignedLeaderId'] !== member.assignedLeaderId
        }
      });

      if (canAssign && member.familyId && data['ed-assignedLeaderId'] !== member.assignedLeaderId) {
        await assignLeaderFamily(member.familyId, data['ed-assignedLeaderId'] || '', leader?.displayName || leader?.email || '');
      }
      showToast('Datos actualizados.', 'success');
    } catch (error) {
      markInvalid(form, error.message);
    } finally {
      setLoading(form, false);
    }
  });

  /* --- Borrado --- */
  qs('[data-action="delete-member"]', drawerHost)?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: `Eliminar a ${member.fullName}`,
      message: `Se borrará el registro y su bitácora de seguimiento. Esta acción no se puede deshacer.`,
      confirmText: 'Sí, eliminar',
      danger: true
    });
    if (!ok) return;
    try {
      await deleteMember(memberId);
      await logAudit({
        actor: state.profile,
        action: 'members.delete',
        module: 'members',
        details: { member: member.fullName, familyId: member.familyId || '' }
      });
      showToast('Miembro eliminado.', 'success');
      closeDrawer(drawerHost);
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

function renderFollowup(entry) {
  return `
    <li class="clg-timeline-item">
      <span class="clg-timeline-icon"><i class="fas ${FOLLOWUP_TYPE_ICONS[entry.type] || 'fa-circle'}"></i></span>
      <div class="clg-timeline-body">
        <header>
          <strong>${escapeHTML(FOLLOWUP_TYPE_LABELS[entry.type] || entry.type)}</strong>
          <span>${escapeHTML(formatDateTime(entry.date))}</span>
        </header>
        <p>${escapeHTML(entry.notes)}</p>
        <footer>
          <span><i class="fas fa-user"></i> ${escapeHTML(entry.authorName || 'Sin autor')}</span>
          ${entry.nextActionDate ? `<span class="clg-next-action"><i class="fas fa-forward"></i> Próxima: ${escapeHTML(formatDate(entry.nextActionDate))}</span>` : ''}
          <button type="button" class="clg-link-btn clg-link-danger" data-delete-followup="${escapeHTML(entry.id)}">Eliminar</button>
        </footer>
      </div>
    </li>
  `;
}

export function bindDrawerClose(root) {
  root.querySelectorAll('[data-close-drawer]').forEach((button) => {
    button.addEventListener('click', () => closeDrawer(root));
  });
  root.querySelectorAll('[data-drawer-overlay]').forEach((overlay) => {
    overlay.addEventListener('click', () => closeDrawer(root));
  });
}

export function closeDrawer(root) {
  const drawerEl = root.querySelector('.clg-drawer');
  const overlay = root.querySelector('.clg-drawer-overlay');
  drawerEl?.classList.remove('is-open');
  overlay?.classList.remove('is-open');
  document.body.classList.remove('clg-lock');
  setTimeout(() => {
    root.innerHTML = '';
  }, 260);
  if (followupUnsub) {
    followupUnsub();
    followupUnsub = null;
  }
}
