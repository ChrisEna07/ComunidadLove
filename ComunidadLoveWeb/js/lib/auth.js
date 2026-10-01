/* ==========================================================================
   AUTENTICACIÓN Y CONTROL DE ROLES (RBAC)
   --------------------------------------------------------------------------
   La jerarquía y el catálogo de funciones viven en `roles.js`. Aquí sólo se
   resuelve el perfil del usuario conectado y se propaga su lista de
   `permissions` para que `can()` pueda evaluar la delegación.
   ========================================================================== */

import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  updatePassword as fbUpdatePassword
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import { registerOwnProfile } from '../services/users.js';
import { sanitizePermissions } from './roles.js';

export {
  ROLES,
  ROLE_LABELS,
  ROLE_TONES,
  ROLE_DESCRIPTION,
  HIDDEN_ROLES,
  PERMISSIONS,
  PERMISSION_CATALOG,
  PERMISSION_KEYS,
  PERMISSION_BY_KEY,
  roleLabel,
  rankOf,
  can,
  hasAnyRole,
  isValidRole,
  sanitizePermissions,
  delegatedPermissions,
  sensitiveDelegations,
  describePermissions,
  canGrantRole,
  grantableRoles
} from './roles.js';

export async function fetchUserProfile(uid) {
  if (!uid) return null;
  try {
    const snapshot = await getDoc(doc(db, 'users', uid));
    if (!snapshot.exists()) {
      return { uid, email: '', displayName: '', role: null, permissions: [], isActive: false, missing: true };
    }
    const data = snapshot.data();
    return {
      uid,
      id: snapshot.id,
      ...data,
      // Las funciones delegadas se sanean al leer: un documento con claves
      // desconocidas no debe conceder acceso a nada inventado.
      permissions: sanitizePermissions(data.permissions)
    };
  } catch (error) {
    console.warn('[CL] No se pudo leer el perfil del usuario:', error);
    return { uid, role: null, permissions: [], isActive: true, error: true };
  }
}

/**
 * Resuelve el perfil del usuario conectado. Si es su primera vez, crea su
 * propio perfil en estado pendiente: el rol sólo puede asignarlo un superadmin.
 */
async function resolveProfile(user) {
  const profile = await fetchUserProfile(user.uid);
  if (profile && profile.missing) {
    try {
      const created = await registerOwnProfile(user);
      return { ...created, id: user.uid, uid: user.uid };
    } catch (error) {
      console.warn('[CL] No se pudo crear el perfil propio:', error);
      return { ...profile, error: true };
    }
  }
  return profile;
}

export async function signIn(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const profile = await resolveProfile(credential.user);

  if (profile && profile.error) {
    await firebaseSignOut(auth);
    throw new Error('No pudimos verificar tu cuenta. Inténtalo de nuevo en unos segundos.');
  }
  if (profile && profile.isActive === false) {
    await firebaseSignOut(auth);
    throw new Error('Tu cuenta todavía no ha sido activada. Contacta al Super Admin.');
  }
  // Sin rol todavía se permite entrar: la vista de "cuenta pendiente" explica
  // el siguiente paso en lugar de dejar al usuario en un callejón sin salida.
  return { user: credential.user, profile };
}

export function signOut() {
  return firebaseSignOut(auth);
}

export function sendReset(email) {
  return sendPasswordResetEmail(auth, email);
}

export function updateDisplayName(displayName) {
  const user = auth?.currentUser;
  if (!user) return Promise.reject(new Error('No hay sesión activa.'));
  return updateProfile(user, { displayName });
}

export function updateUserPassword(newPassword) {
  const user = auth?.currentUser;
  if (!user) return Promise.reject(new Error('No hay sesión activa.'));
  return fbUpdatePassword(user, newPassword);
}

/**
 * Escucha los cambios de sesión y resuelve el perfil con rol.
 * Firma: (session) => void  donde session = { user, profile } | null
 */
export function watchSession(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback(null);
      return;
    }
    callback({ user, profile: null, pending: true });
    const profile = await resolveProfile(user);
    callback({ user, profile, pending: false });
  });
}

export async function currentProfile() {
  const user = auth?.currentUser;
  if (!user) return null;
  return fetchUserProfile(user.uid);
}
