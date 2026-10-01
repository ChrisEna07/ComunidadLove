/* ==========================================================================
   VISTA: GESTIÓN DE USUARIOS Y ROLES
   --------------------------------------------------------------------------
   Accesible para Pastores (admin) y Superadmin. Ninguna tarjeta de superadmin
   se muestra: es una sola cuenta, la del propietario, y el rol se oculta
   incluso en el selector de roles para no orientar a un usuario sobre él.

   Dos flujos:
   - "Agregar usuario": registra el perfil (nombre, correo, rol, funciones).
     El SDK Web no puede crear la cuenta de Authentication sin cerrar la
     sesión de quien administra, así que el perfil nace inactivo hasta que esa
     persona cree su cuenta e inicie sesión por primera vez.
   - "Editar": cambia nombre completo, rol, funciones delegadas y estado.
   ========================================================================== */

import {
  createUserAccount,
  updateUserAccount,
  deactivateUserAccount,
  reactivateUserAccount,
  deleteUserProfile,
  sendPasswordReset
} from '../../services/users.js';
import { logAudit } from '../../services/audit.js';
import {
  ROLES,
  ROLE_LABELS,
  ROLE_TONES,
  ROLE_DESCRIPTION,
  roleLabel,
  canGrantRole,
  grantableRoles,
  PERMISSION_CATALOG,
  delegatedPermissions,
  sensitiveDelegations,
  describePermissions,
  can
} from '../../lib/roles.js';
import { escapeHTML, qs, showToast, confirmDialog } from '../../lib/dom.js';
import { smartDate } from '../../lib/dates.js';
import { bindLiveFormValidation } from '../../lib/validation.js';
import { subscribe, getState } from '../store.js';
import {
  pageHeader,
  emptyState,
  tag,
  iconButton,
  field,
  drawer,
  markInvalid,
  clearInvalid,
  setLoading,
  readForm
} from '../ui.js';
import { initials } from './panel.js';

export function renderUsuarios(container) {
  const me = getState().profile || {};
  const canManage = can(me, 'users.manage');
  const canGrantAdmin = canGrantRole(me.role, 'superadmin');

  container.innerHTML = `
    ${pageHeader({
      title: 'Usuarios y Roles',
      subtitle: 'Registra al equipo, asigna roles y controla quién accede al sistema',
      icon: 'fa-users-gear',
      actions: canManage
        ? `<button class="clg-btn clg-btn-primary" type="button" data-action="add-user">
             <i class="fas fa-user-plus"></i><span>Agregar usuario</span>
           </button>`
        : ''
    })}
    <div id="clg-users-body">
      <div class="clg-table-skeleton">
        ${Array.from({ length: 3 }, () => '<div class="clg-skeleton-row"></div>').join('')}
      </div>
    </div>
    <div id="clg-users-drawer"></div>
  `;

  const body = qs('#clg-users-body', container);
  const drawerHost = qs('#clg-users-drawer', container);
  const buttons = container.querySelectorAll('[data-action]');

  const off = subscribe(['users', 'profile'], (state) => {
    const delegableUsers = (state.users || []).filter((u) => u.role !== 'superadmin');
    if (delegableUsers.length === 0 && state.ready) {
      body.innerHTML = emptyState({
        icon: 'fa-user-group',
        title: 'Aún no hay usuarios registrados',
        message: 'Agrega al primer miembro del equipo para que pueda acceder al panel.',
        action: ''
      });
    } else if (delegableUsers.length) {
      body.innerHTML = renderTable(delegableUsers, me, canManage);
    }

    // El botón sólo existe si quien mira puede administrar; se conserva el
    // foco si el drawer está abierto para no cerrarlo al re-renderizar.
    buttons.forEach((b) => {
      b.hidden = b.dataset.action !== 'add-user' || !canManage;
    });
  });

  container.addEventListener('click', async (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;

    const action = trigger.dataset.action;
    const uid = trigger.dataset.uid;

    if (action === 'add-user') {
      openDrawer({ user: null, me, canManage, canGrantAdmin });
    }

    if (action === 'edit') {
      const user = getState().users.find((u) => u.uid === uid);
      if (user) openDrawer({ user, me, canManage, canGrantAdmin });
    }

    if (action === 'deactivate') {
      const user = getState().users.find((u) => u.uid === uid);
      if (!user) return;
      const ok = await confirmDialog({
        title: 'Desactivar usuario',
        message: `¿Desactivar el acceso de ${user.displayName}? Su sesión se revocará pero conservará sus datos.`,
        confirmText: 'Desactivar',
        danger: true
      });
      if (!ok) return;
      try {
        await deactivateUserAccount(user.uid);
        await logAudit({
          actor: me,
          action: 'users.deactivate',
          module: 'users',
          details: { target: user.email }
        });
        showToast('Usuario desactivado', 'success');
      } catch (error) {
        showToast(error.message || 'No se pudo desactivar.', 'danger');
      }
    }

    if (action === 'reactivate') {
      const user = getState().users.find((u) => u.uid === uid);
      if (!user) return;
      try {
        await reactivateUserAccount(user.uid);
        await logAudit({
          actor: me,
          action: 'users.reactivate',
          module: 'users',
          details: { target: user.email }
        });
        showToast('Usuario reactivado', 'success');
      } catch (error) {
        showToast(error.message || 'No se pudo reactivar.', 'danger');
      }
    }

    if (action === 'reset') {
      const user = getState().users.find((u) => u.uid === uid);
      if (!user?.email) {
        showToast('Ese usuario no tiene correo registrado.', 'danger');
        return;
      }
      const ok = await confirmDialog({
        title: 'Restablecer contraseña',
        message: `Se enviará un correo a ${user.email} para que defina una nueva contraseña.`,
        confirmText: 'Enviar correo'
      });
      if (!ok) return;
      try {
        await sendPasswordReset(user.email);
        await logAudit({
          actor: me,
          action: 'users.password.reset',
          module: 'users',
          details: { target: user.email }
        });
        showToast('Correo de restablecimiento enviado', 'success');
      } catch (error) {
        showToast(error.message || 'No se pudo enviar el correo.', 'danger');
      }
    }

    if (action === 'delete') {
      const user = getState().users.find((u) => u.uid === uid);
      if (!user) return;
      const ok = await confirmDialog({
        title: 'Eliminar usuario',
        message: `Se eliminará permanentemente el perfil de ${user.displayName}. Esta acción no se puede deshacer.`,
        confirmText: 'Eliminar',
        danger: true
      });
      if (!ok) return;
      try {
        await deleteUserProfile(user.uid, user.role);
        await logAudit({
          actor: me,
          action: 'users.delete',
          module: 'users',
          details: { target: user.email, role: user.role }
        });
        showToast('Usuario eliminado', 'success');
      } catch (error) {
        showToast(error.message || 'No se pudo eliminar.', 'danger');
      }
    }
  });

  /* --------------------------------------------------------------------
     DRAWER: alta / edición
     -------------------------------------------------------------------- */
  function openDrawer({ user, me: actor, canManage: manage, canGrantAdmin: grantAdmin }) {
    const isEdit = Boolean(user);
    const uid = user?.uid || '';
    const currentRole = user?.role || 'admin';
    const isSuperAdminEdit = isEdit && currentRole === 'superadmin';

    // Para el formulario: SÓLO roles delegables ('admin', 'webmaster', 'servidor').
    // El Super Admin NO es delegable y NO aparece como opción en el select ni en las tarjetas.
    const delegableRoles = ['admin', 'webmaster', 'servidor'];
    const roleOptions = delegableRoles.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

    const roleCards = delegableRoles
      .map(
        (r) => `
        <div class="clg-role-card" data-role-card="${r}">
          <div class="clg-role-card-head">
            ${tag(ROLE_LABELS[r], ROLE_TONES[r])}
          </div>
          <p>${escapeHTML(ROLE_DESCRIPTION[r] || '')}</p>
        </div>`
      )
      .join('');

    const permissionFields = PERMISSION_CATALOG.map(
      (perm) => `
      <label class="clg-check clg-perm-check" for="clg-perm-${perm.key}">
        <input id="clg-perm-${perm.key}" type="checkbox" name="permissions" value="${perm.key}"
               ${user?.permissions?.includes(perm.key) ? 'checked' : ''}
               ${isEdit && ['admin', 'superadmin'].includes(currentRole) ? 'disabled' : ''}>
        <span class="clg-check-box"><i class="fas fa-check"></i></span>
        <span class="clg-check-text">
          ${escapeHTML(perm.label)}
          <small>${escapeHTML(perm.description)}</small>
        </span>
      </label>`
    ).join('');

    const fullAccessNote = ['admin', 'superadmin'].includes(currentRole)
      ? `<div class="clg-security-note clg-security-note-info">
           <i class="fas fa-circle-info"></i>
           <span>Este rol tiene acceso total a todos los módulos y configuraciones del sistema.</span>
         </div>`
      : '';

    const drawerBodyContent = isSuperAdminEdit
      ? `
        <form id="clg-user-form" class="clg-form" novalidate>
          <div class="clg-form-error" hidden></div>

          ${field({
            name: 'displayName',
            label: 'Nombre completo (Super Admin)',
            value: user?.displayName || user?.fullName || 'Christian Romero',
            required: true,
            placeholder: 'Tu nombre completo',
            icon: 'fa-user'
          })}

          ${field({
            name: 'email',
            label: 'Correo electrónico',
            type: 'email',
            value: user?.email || '',
            required: false,
            disabled: true,
            icon: 'fa-envelope',
            hint: 'El correo del Super Admin no se puede cambiar desde el panel.'
          })}

          <div class="clg-field">
            <label>Rol</label>
            <div style="padding: 6px 0;">
              ${tag('Super Admin', 'danger')}
              <small class="clg-muted" style="margin-left: 8px;">(Propietario del sistema - Rol exclusivo)</small>
            </div>
            <input type="hidden" name="role" value="superadmin">
          </div>

          <div class="clg-security-note clg-security-note-info">
            <i class="fas fa-crown"></i>
            <span>El Super Admin tiene control y acceso total permanente a todos los módulos, auditoría y configuraciones del sistema.</span>
          </div>

          <div class="clg-field">
            <label>Estado de la cuenta</label>
            <div style="padding: 4px 0;">
              ${tag('Cuenta activa permanente', 'success')}
            </div>
            <input type="hidden" name="isActive" value="on">
          </div>
        </form>
      `
      : `
        <form id="clg-user-form" class="clg-form" novalidate>
          <div class="clg-form-error" hidden></div>

          ${field({
            name: 'displayName',
            label: 'Nombre completo',
            value: user?.displayName || user?.fullName || '',
            required: true,
            placeholder: 'Ej. Andrea Morales',
            icon: 'fa-user'
          })}

          ${field({
            name: 'email',
            label: 'Correo electrónico',
            type: 'email',
            value: user?.email || '',
            required: isEdit ? false : true,
            placeholder: 'persona@correo.com',
            icon: 'fa-envelope',
            hint: isEdit
              ? 'El correo no se puede cambiar una vez registrado.'
              : 'Se usará para crear la cuenta en Firebase Authentication. No se envía ningún correo automático.'
          })}

          ${isEdit
            ? ''
            : field({
                name: 'password',
                label: 'Contraseña provisional',
                type: 'text',
                value: 'Love' + Math.floor(100000 + Math.random() * 900000) + '*',
                required: true,
                placeholder: 'Ej: Amor2026*',
                icon: 'fa-lock',
                hint: 'La cuenta se creará en Firebase Authentication directamente con esta contraseña.'
              })}

          ${field({
            name: 'role',
            label: 'Rol',
            options: roleOptions.length ? roleOptions : [{ value: currentRole, label: ROLE_LABELS[currentRole] }],
            value: currentRole,
            icon: 'fa-shield-halved'
          })}

          <div class="clg-role-cards">${roleCards}</div>

          <div class="clg-field">
            <label>Funciones delegadas</label>
            <small class="clg-hint">
              Marca las funciones extra que podrá además de las de su rol.
              Sólo aplican a roles sin acceso total.
            </small>
            <div class="clg-perm-grid">${permissionFields}</div>
          </div>

          ${fullAccessNote}

          <div class="clg-security-note clg-security-note-info">
            <i class="fas fa-circle-check"></i>
            <span>
              <strong>Alta nativa en un solo paso:</strong> la cuenta se registra automáticamente en Firebase
              Authentication con la contraseña indicada y se vincula de inmediato con su rol y funciones en Firestore.
            </span>
          </div>

          <label class="clg-check" for="clg-user-active">
            <input id="clg-user-active" type="checkbox" name="isActive" ${
              user?.isActive !== false ? 'checked' : ''
            }>
            <span class="clg-check-box"><i class="fas fa-check"></i></span>
            <span class="clg-check-text">
              Cuenta activa
              <small>${
                isEdit
                  ? 'Si se desactiva, no podrá iniciar sesión.'
                  : 'La cuenta de Authentication ya existe, así que puede activarse desde el primer momento.'
              }</small>
            </span>
          </label>
        </form>
      `;

    const drawerHtml = drawer({
      id: 'clg-user-drawer',
      title: isSuperAdminEdit ? 'Editar mi perfil' : (isEdit ? 'Editar usuario' : 'Agregar usuario'),
      body: drawerBodyContent,
      footer: `
        <div class="clg-drawer-actions">
          <button type="button" class="clg-btn clg-btn-ghost" data-close-drawer="clg-user-drawer">
            Cancelar
          </button>
          <button type="submit" form="clg-user-form" class="clg-btn clg-btn-primary" ${manage ? '' : 'disabled'}>
            <i class="fas fa-check"></i><span>${isEdit ? 'Guardar cambios' : 'Registrar usuario'}</span>
          </button>
        </div>`
    });

    drawerHost.innerHTML = drawerHtml;

    const form = qs('#clg-user-form', drawerHost);
    const overlay = drawerHost.querySelector('.clg-drawer-overlay');
    overlay?.classList.add('is-open');
    qs('#clg-user-drawer', drawerHost)?.classList.add('is-open');

    // Enlazar validación en tiempo real y máscaras de entrada
    bindLiveFormValidation(form);

    // Al cambiar de rol se recalcula si las funciones delegadas aplican.
    const roleSelect = qs('#clg-role', form);
    const syncRoleState = () => {
      const selected = roleSelect?.value;
      const fullAccess = ['admin', 'superadmin'].includes(selected);
      form.querySelectorAll('input[name="permissions"]').forEach((cb) => {
        cb.disabled = fullAccess;
        if (fullAccess) cb.checked = false;
      });
      const note = form.querySelector('.clg-security-note-info');
      if (note) note.hidden = !fullAccess;
    };
    roleSelect?.addEventListener('change', syncRoleState);
    if (!isSuperAdminEdit) {
      syncRoleState();
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearInvalid(form);

      const data = readForm(form);
      const selectedPermissions = form.querySelectorAll('input[name="permissions"]:checked');
      const permissions = Array.from(selectedPermissions).map((cb) => cb.value);

      const cleanName = (data.displayName || '').trim().replace(/\s+/g, ' ');
      if (!cleanName || cleanName.length < 3) {
        markInvalid(form, 'Escribe el nombre completo del usuario (mínimo 3 letras).');
        return;
      }
      if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/.test(cleanName)) {
        markInvalid(form, 'El nombre solo puede contener letras y espacios.');
        return;
      }

      const cleanEmail = (data.email || '').trim().toLowerCase();
      if (!isEdit) {
        if (!cleanEmail || !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(cleanEmail)) {
          markInvalid(form, 'Ingresa un correo electrónico válido (ej. usuario@dominio.com).');
          return;
        }
        if (!data.password || data.password.length < 6) {
          markInvalid(form, 'La contraseña provisional debe tener al menos 6 caracteres.');
          return;
        }
      }

      const role = isSuperAdminEdit ? 'superadmin' : (data.role || currentRole);

      // Advertencia de Privacidad según directiva:
      // Si un Pastor intenta delegar un permiso sensible a un rol menor, confirmación explícita.
      if (!isSuperAdminEdit) {
        const risky = sensitiveDelegations({ role, permissions });
        if (risky.length) {
          setLoading(form, false);
          const ok = await confirmDialog({
            title: 'Advertencia de Privacidad',
            message:
              'Advertencia de Privacidad: Estás por otorgar acceso a datos personales de los miembros de la congregación a este rol. ¿Deseas continuar?',
            confirmText: 'Continuar',
            cancelText: 'Cancelar',
            danger: true
          });
          if (!ok) return;
        }
      }

      setLoading(form, true, isEdit ? 'Guardando…' : 'Registrando…');

      try {
        if (isEdit) {
          await updateUserAccount(
            uid,
            {
              displayName: data.displayName,
              role,
              permissions: isSuperAdminEdit ? [] : permissions,
              isActive: isSuperAdminEdit ? true : Boolean(data.isActive)
            },
            user,
            actor.role
          );
          await logAudit({
            actor,
            action: 'users.update',
            module: 'users',
            details: { target: user.email, role, permissions: permissions.length }
          });
          showToast(isSuperAdminEdit ? 'Perfil actualizado' : 'Usuario actualizado', 'success');
        } else {
          const result = await createUserAccount(
            {
              fullName: data.displayName,
              email: data.email,
              role,
              permissions,
              activate: Boolean(data.isActive),
              password: data.password || '',
              sendResetEmail: false
            },
            actor.role
          );
          await logAudit({
            actor,
            action: 'users.create',
            module: 'users',
            details: { target: data.email, role }
          });
          showToast(
            result.created ? 'Usuario registrado y cuenta creada' : 'Perfil actualizado',
            'success'
          );
        }
        closeDrawer();
      } catch (error) {
        markInvalid(form, error.message || 'No se pudo guardar el usuario.');
        setLoading(form, false);
      }
    });

    function closeDrawer() {
      overlay?.classList.remove('is-open');
      qs('#clg-user-drawer', drawerHost)?.classList.remove('is-open');
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
   LISTADO
   -------------------------------------------------------------------------- */

function renderTable(users, me, canManage) {
  const rows = users
    .map((u) => {
      const isSuper = u.role === 'superadmin';
      const granted = delegatedPermissions(u);
      const label = granted.length ? describePermissions(u) : null;

      const roleTag = u.role
        ? tag(ROLE_LABELS[u.role] || u.role, ROLE_TONES[u.role] || 'neutral')
        : tag('Sin rol', 'neutral');

      const statusTag = u.isActive
        ? tag('Activo', 'success')
        : tag('Pendiente', 'warning');

      const actions = [];
      if (canManage) {
        if (isSuper) {
          // Sólo el propio Super Admin puede editar su perfil
          if (me.role === 'superadmin' || me.uid === u.uid) {
            actions.push(
              iconButton({
                icon: 'fa-user-pen',
                label: `Editar mi perfil (${u.displayName || 'Christian Romero'})`,
                action: 'edit',
                data: `data-uid="${u.uid}"`
              })
            );
          }
        } else {
          actions.push(
            iconButton({
              icon: 'fa-pen',
              label: `Editar ${u.displayName}`,
              action: 'edit',
              data: `data-uid="${u.uid}"`
            })
          );
          if (u.isActive) {
            actions.push(
              iconButton({
                icon: 'fa-user-slash',
                label: `Desactivar ${u.displayName}`,
                action: 'deactivate',
                data: `data-uid="${u.uid}"`
              })
            );
          } else {
            actions.push(
              iconButton({
                icon: 'fa-user-check',
                label: `Reactivar ${u.displayName}`,
                action: 'reactivate',
                data: `data-uid="${u.uid}"`
              })
            );
          }
          actions.push(
            iconButton({
              icon: 'fa-key',
              label: `Restablecer contraseña de ${u.displayName}`,
              action: 'reset',
              data: `data-uid="${u.uid}"`
            })
          );
          if (u.uid !== me.uid) {
            actions.push(
              iconButton({
                icon: 'fa-trash',
                label: `Eliminar ${u.displayName}`,
                action: 'delete',
                data: `data-uid="${u.uid}"`
              })
            );
          }
        }
      }

      const displayName = u.displayName || (isSuper ? 'Christian Romero' : 'Sin nombre');

      return `
        <tr data-uid="${u.uid}">
          <td data-label="Usuario">
            <div class="clg-user-cell">
              <span class="clg-avatar clg-avatar-sm">${escapeHTML(initials(displayName))}</span>
              <div>
                <strong>${escapeHTML(displayName)}</strong>
                ${u.email ? `<small>${escapeHTML(u.email)}</small>` : ''}
              </div>
            </div>
          </td>
          <td data-label="Rol">${roleTag}</td>
          <td data-label="Estado">${statusTag}</td>
          <td data-label="Funciones extra">
            ${isSuper
              ? '<span class="clg-tag clg-tag-primary">Control total</span>'
              : (label
                ? `<span class="clg-perm-summary">${escapeHTML(label)}</span>`
                : '<small class="clg-muted">Ninguna</small>')}
          </td>
          <td data-label="Alta">${u.createdAt ? smartDate(u.createdAt) : '<small class="clg-muted">—</small>'}</td>
          <td data-label="Acciones"><div class="clg-row-actions">${actions.join('')}</div></td>
        </tr>
      `;
    })
    .join('');

  return `
    <div class="clg-table-scroll">
      <table class="clg-table">
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Rol</th>
            <th>Estado</th>
            <th>Funciones extra</th>
            <th>Alta</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="6" class="clg-table-empty">Sin registros.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}