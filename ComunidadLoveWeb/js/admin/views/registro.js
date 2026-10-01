/* ==========================================================================
   VISTA: REGISTRO Y ASISTENCIA (Módulo de Ujieres / Servidores)
   --------------------------------------------------------------------------
   Diseño Mobile-First: pensado para tablet o teléfono en la puerta del templo.
   - Una sola columna, objetivos táctiles grandes y barra de acción fija.
   - El interruptor "Asiste en familia" genera cónyuge e hijos dinámicamente
     y guarda TODOS los registros con un mismo familyId.
   ========================================================================== */

import { createFamily, createMember, CHURCH_ROLES, MEMBER_STATUS } from '../../services/members.js';
import { logAudit } from '../../services/audit.js';
import { can, currentProfile } from '../../lib/auth.js';
import { showToast, qs, qsa, createEl } from '../../lib/dom.js';
import { pageHeader, field, checkboxField, segmentedControl, readForm, markInvalid, clearInvalid, setLoading } from '../ui.js';
import { bindImageInputs, imageInput, prepareImageValue } from '../image-input.js';
import { bindLiveFormValidation } from '../../lib/validation.js';

const FAMILY_TYPE_LABELS = {
  conyuge: 'Cónyuge',
  hijo: 'Hijo/a',
  familiar: 'Otro familiar'
};

export function renderRegistro(container) {
  container.innerHTML = `
    ${pageHeader({
      title: 'Registro y Asistencia',
      subtitle: 'Registra visitantes y familias que llegan a la puerta del templo',
      icon: 'fa-user-plus'
    })}
    <div class="clg-registro">
      <form class="clg-registro-form" id="clg-registro-form" novalidate>
        <section class="clg-block">
          ${segmentedControl({
            name: 'attendanceType',
            value: 'solo',
            options: [
              { value: 'solo', label: 'Asiste solo/a', icon: 'fa-user' },
              { value: 'familiar', label: 'Asiste en familia', icon: 'fa-people-group' }
            ]
          })}
          <input type="hidden" name="attendanceType" value="solo">
        </section>

        <section class="clg-block" id="clg-person-blocks">
          <div class="clg-person-block" data-role="cabeza">
            <header class="clg-person-header">
              <span class="clg-person-badge">1</span>
              <div>
                <h2>Persona que asiste</h2>
                <p>Cabeza de familia o visitante principal</p>
              </div>
            </header>
            ${personFields('cabeza')}
          </div>
        </section>

        <section class="clg-block" id="clg-shared-block" hidden>
          <h2 class="clg-block-title"><i class="fas fa-house-chimney"></i> Datos del hogar</h2>
          <p class="clg-block-hint">Estos datos se comparten con todo el núcleo familiar.</p>
          <div class="clg-grid-2">
            ${field({ name: 'neighborhood', label: 'Barrio', placeholder: 'Ej. Pie de la Popa' })}
            ${field({ name: 'address', label: 'Dirección', placeholder: 'Ej. Cra 12 # 34-56' })}
          </div>
          ${field({ name: 'familyNotes', label: 'Notas del núcleo familiar', type: 'textarea', rows: 2, placeholder: 'Necesidades pastorales, horarios, observaciones…' })}
        </section>

        <section class="clg-block" id="clg-pastoral-block" hidden>
          <h2 class="clg-block-title"><i class="fas fa-church"></i> Seguimiento pastoral</h2>
          <p class="clg-block-hint">Lo completa el equipo que recibe al visitante.</p>
          <div class="clg-grid-2">
            ${field({ name: 'churchRole', label: 'Rol en la iglesia', type: 'select', options: CHURCH_ROLES, value: 'Nuevo Asistente' })}
            ${field({ name: 'status', label: 'Estado de seguimiento', type: 'select', options: MEMBER_STATUS, value: 'nuevo' })}
          </div>
          ${field({ name: 'firstVisitDate', label: 'Primera visita', type: 'date', value: todayISO() })}
          <div class="clg-grid-2">
            ${checkboxField({ name: 'isBaptized', label: 'Bautizado/a' })}
            ${checkboxField({ name: 'wantsDiscipleship', label: 'Desea estilos de discipulado' })}
          </div>
        </section>

        <div class="clg-submit-bar">
          <button type="submit" class="clg-btn clg-btn-primary clg-btn-lg">
            <i class="fas fa-check"></i><span>Guardar registro</span>
          </button>
        </div>
      </form>

      <div class="clg-success-card" id="clg-success" hidden>
        <div class="clg-success-icon"><i class="fas fa-circle-check"></i></div>
        <h2>¡Registro guardado!</h2>
        <p id="clg-success-detail"></p>
        <div class="clg-success-actions">
          <button type="button" class="clg-btn clg-btn-primary" id="clg-new-record">
            <i class="fas fa-plus"></i><span>Registrar otra persona</span>
          </button>
          <button type="button" class="clg-btn clg-btn-ghost" id="clg-go-panel">
            <i class="fas fa-chart-line"></i><span>Ver resumen</span>
          </button>
        </div>
      </div>
    </div>
  `;

  const form = qs('#clg-registro-form', container);
  const personBlocks = qs('#clg-person-blocks', container);
  const sharedBlock = qs('#clg-shared-block', container);
  const pastoralBlock = qs('#clg-pastoral-block', container);
  const successCard = qs('#clg-success', container);
  let counter = 1;

  bindImageInputs(form);
  bindLiveFormValidation(form);

  /* ---- Interruptor solo / familia ---- */
  qsa('.clg-segment', form).forEach((segment) => {
    segment.addEventListener('click', () => {
      const { name, value } = segment.dataset;
      form.querySelector(`input[name="${name}"]`).value = value;
      qsa(`.clg-segment[data-name="${name}"]`, form).forEach((s) => {
        s.classList.toggle('is-active', s === segment);
        s.setAttribute('aria-checked', String(s === segment));
      });
      applyAttendanceMode(value);
    });
  });

  function applyAttendanceMode(mode) {
    const isFamily = mode === 'familiar';
    sharedBlock.hidden = !isFamily;
    pastoralBlock.hidden = !isFamily;
    if (!isFamily) {
      qsa('.clg-person-block[data-extra]', personBlocks).forEach((block) => block.remove());
    } else {
      syncSharedToExtra();
    }
    syncHeadings();
  }

  function syncHeadings() {
    const head = qs('.clg-person-block[data-role="cabeza"] h2', personBlocks);
    if (!head) return;
    head.textContent = form.attendanceType.value === 'familiar' ? 'Cabeza de familia' : 'Persona que asiste';
    const sub = qs('.clg-person-block[data-role="cabeza"] p', personBlocks);
    if (sub) {
      sub.textContent = form.attendanceType.value === 'familiar'
        ? 'Registra primero a quien reporta la familia'
        : 'Visitante o miembro que se presenta';
    }
  }

  /** Propaga barrio / dirección / notas del hogar a cada persona del núcleo. */
  function syncSharedToExtra() {
    const shared = {
      neighborhood: form.neighborhood?.value || '',
      address: form.address?.value || '',
      familyNotes: form.familyNotes?.value || ''
    };
    qsa('.clg-person-block[data-extra]', personBlocks).forEach((block) => {
      Object.entries(shared).forEach(([key, value]) => {
        const input = block.querySelector(`[name$="-${key}"]`);
        if (input && !input.dataset.touched) input.value = value;
      });
    });
  }

  function addRelative(role) {
    counter += 1;
    const block = createEl('div', {
      class: 'clg-person-block clg-person-extra',
      'data-extra': role,
      'data-role': role
    });
    block.innerHTML = `
      <header class="clg-person-header">
        <span class="clg-person-badge">${counter}</span>
        <div>
          <h2>${FAMILY_TYPE_LABELS[role] || role}</h2>
          <p>Se vinculará al mismo núcleo familiar</p>
        </div>
        <button type="button" class="clg-icon-btn clg-icon-btn-ghost" data-remove-relative
                title="Quitar" aria-label="Quitar ${FAMILY_TYPE_LABELS[role] || role}">
          <i class="fas fa-trash-can"></i>
        </button>
      </header>
      ${personFields(role, `p${counter}`)}
    `;
    personBlocks.appendChild(block);
    bindImageInputs(block);
    bindLiveFormValidation(block);
    renumber();
    block.querySelector('[name$="-fullName"]')?.focus();
  }

  function renumber() {
    qsa('.clg-person-block', personBlocks).forEach((block, index) => {
      const badge = block.querySelector('.clg-person-badge');
      if (badge) badge.textContent = String(index + 1);
    });
  }

  /* ---- Botones de núcleo familiar ---- */
  const familyActions = createEl('div', { class: 'clg-family-actions', id: 'clg-family-actions' }, [
    createEl('button', { type: 'button', class: 'clg-btn clg-btn-soft', 'data-add-role': 'conyuge' }, [
      createEl('i', { class: 'fas fa-heart' }),
      createEl('span', { textContent: 'Añadir cónyuge' })
    ]),
    createEl('button', { type: 'button', class: 'clg-btn clg-btn-soft', 'data-add-role': 'hijo' }, [
      createEl('i', { class: 'fas fa-child-reaching' }),
      createEl('span', { textContent: 'Añadir hijo/a' })
    ]),
    createEl('button', { type: 'button', class: 'clg-btn clg-btn-soft', 'data-add-role': 'familiar' }, [
      createEl('i', { class: 'fas fa-user-group' }),
      createEl('span', { textContent: 'Añadir familiar' })
    ])
  ]);
  sharedBlock.appendChild(familyActions);

  familyActions.addEventListener('click', (event) => {
    const button = event.target.closest('[data-add-role]');
    if (button) addRelative(button.dataset.addRole);
  });

  personBlocks.addEventListener('click', (event) => {
    if (event.target.closest('[data-remove-relative]')) {
      const block = event.target.closest('.clg-person-block[data-extra]');
      block?.remove();
      renumber();
    }
  });

  personBlocks.addEventListener('input', (event) => {
    if (event.target.matches('[name$="-neighborhood"], [name$="-address"], [name$="-familyNotes"]')) {
      event.target.dataset.touched = 'true';
      syncSharedToExtra();
    }
  });

  /* ---- Éxito ---- */
  qs('#clg-new-record', container).addEventListener('click', () => {
    form.reset();
    qsa('.clg-person-block[data-extra]', personBlocks).forEach((block) => block.remove());
    counter = 1;
    renumber();
    applyAttendanceMode('solo');
    successCard.hidden = true;
    form.hidden = false;
    form.querySelector('[name="main-fullName"]')?.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  qs('#clg-go-panel', container).addEventListener('click', () => {
    window.location.hash = '#/panel';
  });

  /* ---- Envío ---- */
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearInvalid(form);

    if (!(await canWrite())) {
      markInvalid(form, 'Tu sesión expiró. Vuelve a iniciar sesión.');
      return;
    }

    const isFamily = form.attendanceType.value === 'familiar';
    const shared = {
      neighborhood: form.neighborhood?.value.trim() || '',
      address: form.address?.value.trim() || '',
      familyNotes: form.familyNotes?.value.trim() || '',
      churchRole: form.churchRole?.value || 'Nuevo Asistente',
      status: form.status?.value || 'nuevo',
      firstVisitDate: form.firstVisitDate?.value ? new Date(`${form.firstVisitDate.value}T09:00:00`) : null,
      isBaptized: Boolean(form.isBaptized?.checked),
      assignedLeaderId: form.wantsDiscipleship?.checked ? 'PENDIENTE' : '',
      assignedLeaderName: form.wantsDiscipleship?.checked ? 'Requiere líder' : ''
    };

    const blocks = qsa('.clg-person-block', personBlocks);
    const records = [];

    for (const block of blocks) {
      const role = block.dataset.role || 'cabeza';
      const raw = readForm(block.querySelector('.clg-person-fields'));
      // Los campos llevan prefijo único por bloque (main-, p2-, p3-…). Se normalizan.
      const person = Object.fromEntries(
        Object.entries(raw).map(([key, value]) => [key.replace(/^[^-]+-/, ''), value])
      );
      const cleanName = (person.fullName || '').trim().replace(/\s+/g, ' ');
      if (!cleanName || cleanName.length < 3) {
        markInvalid(form, 'Completa el nombre completo de todas las personas del núcleo (mínimo 3 letras).');
        block.scrollIntoView({ behavior: 'smooth', block: 'center' });
        block.querySelector('[name$="-fullName"]')?.focus();
        return;
      }
      if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/.test(cleanName)) {
        markInvalid(form, `El nombre "${cleanName}" solo puede contener letras y espacios.`);
        block.scrollIntoView({ behavior: 'smooth', block: 'center' });
        block.querySelector('[name$="-fullName"]')?.focus();
        return;
      }
      person.fullName = cleanName;

      if (person.phone) {
        const cleanPhone = person.phone.replace(/\D/g, '');
        if (cleanPhone.length !== 10) {
          markInvalid(form, `El teléfono de "${cleanName}" debe tener estrictamente 10 dígitos numéricos.`);
          block.scrollIntoView({ behavior: 'smooth', block: 'center' });
          block.querySelector('[name$="-phone"]')?.focus();
          return;
        }
        person.phone = cleanPhone;
      }

      if (person.documentId) {
        const cleanDoc = person.documentId.replace(/\D/g, '');
        if (cleanDoc.length < 6 || cleanDoc.length > 15) {
          markInvalid(form, `El documento de "${cleanName}" debe tener entre 6 y 15 dígitos numéricos.`);
          block.scrollIntoView({ behavior: 'smooth', block: 'center' });
          block.querySelector('[name$="-documentId"]')?.focus();
          return;
        }
        person.documentId = cleanDoc;
      }

      if (person.email) {
        const cleanEmail = person.email.trim().toLowerCase();
        if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(cleanEmail)) {
          markInvalid(form, `El correo de "${cleanName}" no tiene un formato válido.`);
          block.scrollIntoView({ behavior: 'smooth', block: 'center' });
          block.querySelector('[name$="-email"]')?.focus();
          return;
        }
        person.email = cleanEmail;
      }

      try {
        person.photoUrl = prepareImageValue(person.photoUrl);
      } catch (error) {
        markInvalid(form, error.message);
        block.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      records.push({
        role,
        data: {
          ...person,
          neighborhood: isFamily ? person.neighborhood || shared.neighborhood : person.neighborhood,
          address: isFamily ? person.address || shared.address : person.address,
          familyNotes: isFamily ? shared.familyNotes : person.familyNotes,
          ...(isFamily ? shared : {}),
          birthDate: person.birthDate || ''
        }
      });
    }

    setLoading(form, true, isFamily ? 'Guardando familia…' : 'Guardando…');
    try {
      const profile = await currentProfile();
      const result = isFamily
        ? await createFamily(records, { authorUid: profile?.uid })
        : await createMember(
            {
              ...records[0].data,
              role: 'cabeza',
              attendanceType: 'solo'
            },
            { authorUid: profile?.uid }
          );

      const names = records.map((r) => r.data.fullName);
      await logAudit({
        actor: profile,
        action: 'members.create',
        module: 'members',
        details: { total: names.length, family: isFamily }
      });

      qs('#clg-success-detail').textContent = isFamily
        ? `Se registró ${names.length} ${names.length === 1 ? 'persona' : 'personas'} en el núcleo ${result.familyId}.`
        : `Registro guardado: ${names[0]}.`;

      form.hidden = true;
      successCard.hidden = false;
      showToast(isFamily ? 'Núcleo familiar guardado.' : 'Registro guardado.', 'success');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      console.warn('[CL] Error en el registro:', error);
      markInvalid(form, error.message || 'No se pudo guardar el registro.');
    } finally {
      setLoading(form, false);
    }
  });

  return () => {};
}

function personFields(role, prefix = 'main') {
  return `
    <div class="clg-person-fields" data-role="${role}">
      ${field({ keyPrefix: prefix, name: 'fullName', label: 'Nombre completo', placeholder: 'Ej: María Fernanda Gómez', required: true, autocomplete: 'name' })}
      <div class="clg-grid-2">
        ${field({ keyPrefix: prefix, name: 'documentId', label: 'Cédula / Documento', placeholder: 'Ej: 1.098.765.432' })}
        ${field({ keyPrefix: prefix, name: 'phone', label: 'Teléfono (WhatsApp)', type: 'tel', placeholder: 'Ej: 3001234567', autocomplete: 'tel' })}
      </div>
      <div class="clg-grid-2">
        ${field({ keyPrefix: prefix, name: 'email', label: 'Correo electrónico', type: 'email', placeholder: 'nombre@correo.com', autocomplete: 'email' })}
        ${field({ keyPrefix: prefix, name: 'birthDate', label: 'Fecha de nacimiento', type: 'date', max: todayISO(), hint: 'Opcional. Habilita los cumpleaños automáticos.' })}
      </div>
      ${imageInput({
        keyPrefix: prefix,
        name: 'photoUrl',
        label: 'Foto (opcional)',
        hint: 'Pega una URL o sube el archivo: lo reducimos a 800 px y lo comprimimos aquí.'
      })}
      ${
        prefix !== 'main'
          ? `<div class="clg-grid-2">
               ${field({ keyPrefix: prefix, name: 'neighborhood', label: 'Barrio' })}
               ${field({ keyPrefix: prefix, name: 'address', label: 'Dirección' })}
             </div>`
          : ''
      }
    </div>
  `;
}

let canWriteCache = null;
let canWriteCheckedAt = 0;

async function canWrite() {
  const now = Date.now();
  if (canWriteCache !== null && now - canWriteCheckedAt < 30000) return canWriteCache;
  const profile = await currentProfile();
  canWriteCache = can(profile?.role, 'members.write');
  canWriteCheckedAt = now;
  return canWriteCache;
}

function todayISO() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
