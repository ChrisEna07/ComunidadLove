/* ==========================================================================
   SERVICIO: USUARIOS DEL SISTEMA
   --------------------------------------------------------------------------
   El SDK Web de Firebase no puede crear, cambiar ni borrar la contraseña de
   usuarios distintos al que está conectado, y crear una cuenta con
   `createUserWithEmailAndPassword` cerraría la sesión del superadmin. Por eso
   el alta de una persona tiene DOS partes, y el panel las separa:

     1. REGISTRO (`createUserAccount`)
        El admin da de alta el perfil en Firestore con nombre, correo, rol y
        funciones delegadas. El perfil nace `isActive: false`: la cuenta de
        Authentication aún no existe y no puede iniciar sesión hasta que se
        cree. No se envía ningún correo: el alta es un registro de datos, no
        una invitación con correo.

     2. ACCESO
        La persona crea su cuenta en Firebase Authentication (consola o flujo
        de registro) e inicia sesión. En el primer inicio, `registerOwnProfile`
        encuentra el perfil que ya existe y lo conserva con su rol.

     El restablecimiento de contraseña sí usa `sendPasswordResetEmail`, que
     funciona desde el cliente para cualquier cuenta existente.

   Las reglas de Firestore impiden que un usuario se autoasigne un rol: la
   creación del perfil propio exige `role == null` e `isActive == false`.
   ========================================================================== */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth, db, requireService } from '../firebase.js';
import { ROLES, sanitizePermissions, canGrantRole } from '../lib/roles.js';

const USERS = 'users';
const TEAM = 'team';

/** Sólo los roles de liderazgo pueden recibir miembros asignados. */
const isLeaderRole = (role) => role === 'admin' || role === 'superadmin';

/* --------------------------------------------------------------------------
   PERFILES
   -------------------------------------------------------------------------- */

function decorate(id, data) {
  const role = ROLES.includes(data.role) ? data.role : null;
  return {
    id,
    uid: data.uid || id,
    email: data.email || '',
    displayName: data.displayName || '',
    role,
    permissions: sanitizePermissions(data.permissions),
    isActive: data.isActive === true,
    isPending: !role || data.isActive !== true,
    createdAt: data.createdAt,
    lastLoginAt: data.lastLoginAt,
    updatedAt: data.updatedAt
  };
}

export function watchUsers(callback, onError) {
  try {
    return onSnapshot(
      collection(db, USERS),
      (snapshot) => {
        const users = snapshot.docs.map((d) => decorate(d.id, d.data()));
        users.sort((a, b) => String(a.displayName || a.email).localeCompare(String(b.displayName || b.email)));
        callback(users);
      },
      (error) => {
        console.warn('[CL] Error en tiempo real de usuarios:', error);
        if (onError) onError(error);
        callback([]);
      }
    );
  } catch (error) {
    console.warn('[CL] No se pudo suscribir a usuarios:', error);
    if (onError) onError(error);
    callback([]);
    return () => {};
  }
}

/**
 * Crea el perfil propio la primera vez que alguien inicia sesión.
 * Las reglas exigen `role: null` e `isActive: false`, así que el rol sólo
 * puede concederlo un administrador.
 */
/**
 * Perfil propio del usuario al iniciar sesión.
 *
 * Busca en `users/{uid}` porque ésa es la ruta en la que `createUserAccount()`
 * guarda el alta (flujo UID primero). Si el administrador ya le asignó rol,
 * funciones y estado, aquí se conservan intactos y la persona entra con acceso
 * completo desde el primer intento.
 *
 * Si la ruta está vacía significa que nadie le creó perfil: se registra uno
 * pendiente e inactivo, que es lo que ve un usuario que se anotó por su cuenta
 * o al que se le borró el perfil. Las reglas de Firestore permiten este
 * `setDoc` porque es su propia ruta y exige `role == null` e `isActive == false`.
 */
export async function registerOwnProfile(user) {
  if (!user?.uid) return null;
  const profileRef = doc(db, USERS, user.uid);

  // No se sobrescribe un perfil existente: podría tener rol y estado
  // asignados por un administrador mientras el usuario iniciaba sesión.
  const existing = await getDoc(profileRef);
  if (existing.exists()) return { ...existing.data(), id: existing.id };

  await setDoc(profileRef, {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    role: null,
    permissions: [],
    isActive: false,
    createdAt: serverTimestamp()
  });
  return { uid: user.uid, role: null, isActive: false, pending: true };
}

/**
 * Da de alta un usuario ("Agregar usuario").
 *
 * El flujo es **UID primero**: la cuenta de Authentication se crea antes en la
 * consola de Firebase (Authentication → Agregar usuario) y el administrador
 * pega aquí su UID.
 *
 * El motivo es que el perfil se guarda en `users/{uid}`, exactamente la misma
 * ruta que usa `registerOwnProfile()` al iniciar sesión. Así, la primera vez
 * que la persona entra ya encuentra su perfil y conserva el rol, las funciones
 * delegadas y el estado que le asignó el administrador. Con un ID aleatorio en
 * cambio, el login creaba un segundo perfil pendiente y el rol nunca se
 * aplicaba, y las reglas de Firestore no permiten a un usuario inactivo
 * localizar el documento ajeno por correo para reclamarlo.
 *
 * No envía correo ni crea la cuenta: el SDK web no puede hacerlo sin cerrar la
 * sesión del administrador. El perfil nace inactivo salvo que `activate` venga
 * marcado.
 */
export async function createUserAccount(
  { fullName, email, role, permissions = [], activate = false, uid },
  actorRole
) {
  requireService(db, 'Firestore');
  const cleanUid = String(uid || '').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName = String(fullName || '').trim();

  if (!cleanName) throw new Error('Escribe el nombre del usuario.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error('Ingresa un correo válido.');
  if (!ROLES.includes(role)) throw new Error('Selecciona un rol válido.');
  if (!canGrantRole(actorRole, role)) throw new Error('No puedes asignar ese rol.');
  if (!cleanUid) throw new Error('Pega el UID de la cuenta de Authentication.');
  // Un UID de Firebase es alfanumérico y no lleva espacios ni signos raros.
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(cleanUid)) {
    throw new Error('El UID no tiene un formato válido. Cópialo desde la consola de Firebase.');
  }

  // El nombre se guarda en `displayName` (el campo que ya leen el resto de
  // vistas) y además en `fullName`, que es el nombre que pedía el listado.
  const payload = {
    uid: cleanUid,
    email: cleanEmail,
    displayName: cleanName,
    fullName: cleanName,
    role,
    permissions: sanitizePermissions(permissions),
    isActive: activate === true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try {
    const ref = doc(db, USERS, cleanUid);
    const existing = await getDoc(ref);

    if (existing.exists()) {
      // El mismo UID ya estaba dado de alta: se actualiza en lugar de duplicar,
      // conservando el `createdAt` original.
      const created = existing.data().createdAt;
      const { createdAt, ...patch } = payload;
      if (created) patch.createdAt = created;
      await updateDoc(ref, patch);
      await syncTeamEntry({
        uid: cleanUid,
        email: cleanEmail,
        displayName: cleanName,
        role,
        isActive: payload.isActive
      });
      return { id: cleanUid, created: false };
    }

    // Aviso: se revisa que el correo no esté en otro perfil, porque la persona
    // podría iniciar sesión con otra cuenta y quedarse con un perfil pendiente.
    const all = await getDocs(collection(db, USERS));
    const duplicated = all.docs.find(
      (d) =>
        d.id !== cleanUid && String(d.data().email || '').toLowerCase() === cleanEmail
    );
    if (duplicated) {
      throw new Error(
        `Ese correo ya está registrado con otro UID. Elimina el perfil anterior o reutiliza su UID.`
      );
    }

    await setDoc(ref, payload);
    await syncTeamEntry({
      uid: cleanUid,
      email: cleanEmail,
      displayName: cleanName,
      role,
      isActive: payload.isActive
    });
    return { id: cleanUid, created: true };
  } catch (error) {
    console.error('[CL] Error creando usuario:', error);
    if (error.message && !error.code) throw error;
    throw new Error(error.message || 'No se pudo registrar el usuario.');
  }
}

/**
 * Actualiza un perfil. Acepta nombre, rol, funciones delegadas y estado.
 * `permissions: []` limpia la delegación; `undefined` la deja intacta.
 */
export async function updateUserAccount(uid, changes, profile = {}, actorRole = null) {
  requireService(db, 'Firestore');
  if (!uid) throw new Error('Usuario no válido.');

  const payload = { updatedAt: serverTimestamp() };

  if (changes.displayName !== undefined) {
    const clean = String(changes.displayName).trim();
    if (!clean) throw new Error('El nombre no puede quedar vacío.');
    payload.displayName = clean;
    payload.fullName = clean;
  }

  if (changes.role !== undefined) {
    if (!ROLES.includes(changes.role)) throw new Error('Rol no válido.');
    if (changes.role === 'superadmin') {
      if (profile.role !== 'superadmin') {
        throw new Error('El rol Super Admin no se puede delegar ni conceder.');
      }
      payload.role = 'superadmin';
    } else {
      if (actorRole && !canGrantRole(actorRole, changes.role)) {
        throw new Error('No tienes permiso para asignar ese rol.');
      }
      payload.role = changes.role;
    }
  }

  if (changes.permissions !== undefined) {
    payload.permissions = sanitizePermissions(changes.permissions);
  }

  if (changes.isActive !== undefined) {
    // El Super Admin siempre se mantiene activo
    payload.isActive = profile.role === 'superadmin' ? true : changes.isActive === true;
  }

  try {
    await updateDoc(doc(db, USERS, uid), payload);
    await syncTeamEntry({
      uid,
      email: profile.email || '',
      displayName: changes.displayName ?? profile.displayName ?? '',
      role: changes.role ?? profile.role ?? null,
      isActive: changes.isActive ?? profile.isActive ?? true
    });
    return true;
  } catch (error) {
    console.error('[CL] Error actualizando usuario:', error);
    throw new Error(error.message || 'No se pudo actualizar el usuario. Revisa las reglas de Firestore.');
  }
}

/** Baja lógica: conserva el historial y revoca el acceso de inmediato. */
export async function deactivateUserAccount(uid, profile = {}) {
  return updateUserAccount(uid, { isActive: false }, profile);
}

export async function reactivateUserAccount(uid, role, profile = {}) {
  return updateUserAccount(uid, { isActive: true, role }, profile);
}

/** Elimina el perfil de Firestore. La cuenta de Auth se borra en la consola. */
export async function deleteUserProfile(uid) {
  requireService(db, 'Firestore');
  try {
    await deleteDoc(doc(db, USERS, uid));
    return true;
  } catch (error) {
    console.error('[CL] Error eliminando perfil:', error);
    throw new Error('No se pudo eliminar el perfil.');
  }
}

/* --------------------------------------------------------------------------
   EQUIPO PASTORAL (asignación de líderes)
   --------------------------------------------------------------------------
   `users` sólo la puede leer un superadmin, pero cualquier servidor o admin
   necesita ver la lista de líderes para asignar miembros. `team` expone
   únicamente nombre, correo y rol: lo mínimo para ese selector.
   -------------------------------------------------------------------------- */

async function syncTeamEntry({ uid, email, displayName, role, isActive }) {
  const ref = doc(db, TEAM, uid);
  if (!isLeaderRole(role) || isActive === false) {
    await deleteDoc(ref).catch(() => {});
    return;
  }
  await setDoc(
    ref,
    { uid, displayName: String(displayName || '').trim(), email: email || '', role, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export function watchTeam(callback, onError) {
  try {
    return onSnapshot(
      collection(db, TEAM),
      (snapshot) => {
        const team = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        team.sort((a, b) => String(a.displayName || a.email).localeCompare(String(b.displayName || b.email)));
        callback(team);
      },
      (error) => {
        console.warn('[CL] Error en tiempo real del equipo:', error);
        if (onError) onError(error);
        callback([]);
      }
    );
  } catch (error) {
    console.warn('[CL] No se pudo suscribir al equipo:', error);
    if (onError) onError(error);
    callback([]);
    return () => {};
  }
}

/* --------------------------------------------------------------------------
   CONTRASEÑAS
   -------------------------------------------------------------------------- */

const RESET_ERRORS = {
  'auth/missing-email': 'Ingresa el correo del usuario.',
  'auth/invalid-email': 'El correo no tiene un formato válido.',
  'auth/user-not-found': 'No existe una cuenta con ese correo en Authentication.',
  'auth/missing-password': 'Falta la contraseña.',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
  'auth/network-request-failed': 'Sin conexión con el servidor.'
};

/**
 * Envía el correo de restablecimiento. Funciona desde el navegador para
 * cualquier cuenta: la contraseña la define el propio usuario.
 */
export async function sendPasswordReset(email) {
  const instance = requireService(auth, 'Firebase Auth');
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) throw new Error('Ingresa el correo del usuario.');

  try {
    await sendPasswordResetEmail(instance, cleanEmail);
    return true;
  } catch (error) {
    console.error('[CL] Error enviando restablecimiento:', error);
    throw new Error(RESET_ERRORS[error.code] || 'No se pudo enviar el correo de restablecimiento.');
  }
}
