/* ==========================================================================
   SERVICIO: MIEMBROS Y NÚCLEOS FAMILIARES
   Colección: members
   ========================================================================== */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  arrayUnion,
  increment
} from 'firebase/firestore';
import { db, requireService } from '../firebase.js';
import { toDate, filterBirthdays, parseBirthDate } from '../lib/dates.js';
import { normalizeText } from '../lib/dom.js';
import { sanitizeImageValue } from '../lib/image.js';

const COLLECTION = 'members';

export const ATTENDANCE_TYPES = [
  { value: 'solo', label: 'Asiste solo/a' },
  { value: 'familiar', label: 'Asiste en familia' }
];

export const FAMILY_ROLES = [
  { value: 'cabeza', label: 'Cabeza de familia' },
  { value: 'conyuge', label: 'Cónyuge' },
  { value: 'hijo', label: 'Hijo/a' },
  { value: 'familiar', label: 'Otro familiar' }
];

export const CHURCH_ROLES = [
  'Nuevo Asistente',
  'Miembro Activo',
  'Líder',
  'Servidor',
  'Músico',
  'Diácono'
];

export const MEMBER_STATUS = [
  { value: 'nuevo', label: 'Nuevo' },
  { value: 'en_consolidacion', label: 'En consolidación' },
  { value: 'activo', label: 'Activo' },
  { value: 'inactivo', label: 'Inactivo' }
];

export const STATUS_LABELS = MEMBER_STATUS.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

function decorate(id, data) {
  const birth = parseBirthDate(data.birthDate);
  return {
    id,
    fullName: data.fullName || 'Sin nombre',
    documentId: data.documentId || '',
    phone: data.phone || '',
    email: data.email || '',
    photoUrl: data.photoUrl || '',
    birthDate: data.birthDate || '',
    birthMonth: Number.isFinite(data.birthMonth) ? data.birthMonth : birth ? birth.month : null,
    birthDay: Number.isFinite(data.birthDay) ? data.birthDay : birth ? birth.day : null,
    address: data.address || '',
    neighborhood: data.neighborhood || '',
    attendanceType: data.attendanceType || 'solo',
    familyId: data.familyId || '',
    familyRole: data.familyRole || 'cabeza',
    familyNotes: data.familyNotes || '',
    churchRole: data.churchRole || 'Nuevo Asistente',
    firstVisitDate: toDate(data.firstVisitDate),
    status: data.status || 'nuevo',
    isBaptized: data.isBaptized === true,
    assignedLeaderId: data.assignedLeaderId || '',
    assignedLeaderName: data.assignedLeaderName || '',
    prayerRequests: data.prayerRequests || '',
    ministry: data.ministry || 'general',
    attendances: Array.isArray(data.attendances) ? data.attendances : [],
    attendanceCount: Number(data.attendanceCount) || (Array.isArray(data.attendances) ? data.attendances.length : 0),
    lastAttendance: data.lastAttendance || '',
    createdAt: toDate(data.createdAt),
    createdBy: data.createdBy || ''
  };
}

export function watchMembers(callback, onError) {
  try {
    return onSnapshot(
      query(collection(db, COLLECTION), orderBy('fullName')),
      (snapshot) => callback(snapshot.docs.map((d) => decorate(d.id, d.data()))),
      (error) => {
        console.warn('[CL] Error en tiempo real de miembros:', error);
        if (onError) onError(error);
        callback([]);
      }
    );
  } catch (error) {
    console.warn('[CL] No se pudo suscribir a miembros:', error);
    if (onError) onError(error);
    callback([]);
    return () => {};
  }
}

export function watchPublicBirthdays(callback, onError) {
  try {
    return onSnapshot(
      collection(db, COLLECTION),
      (snapshot) => {
        const list = snapshot.docs
          .map((d) => {
            const data = d.data();
            if (data.status === 'inactivo') return null;
            const birth = parseBirthDate(data.birthDate);
            const rawM = data.birthMonth ?? (birth ? birth.month : null);
            const rawD = data.birthDay ?? (birth ? birth.day : null);
            const m = Number(rawM);
            const day = Number(rawD);
            if (!Number.isFinite(m) || !Number.isFinite(day) || m < 1 || m > 12 || day < 1 || day > 31) return null;
            return {
              id: d.id,
              fullName: data.fullName || 'Miembro Love',
              birthDate: data.birthDate || '',
              birthMonth: m,
              birthDay: day
            };
          })
          .filter(Boolean);
        callback(list);
      },
      (error) => {
        console.warn('[CL] Error en tiempo real de cumpleaños:', error);
        if (onError) onError(error);
        callback([]);
      }
    );
  } catch (error) {
    console.warn('[CL] No se pudo suscribir a cumpleaños:', error);
    if (onError) onError(error);
    callback([]);
    return () => {};
  }
}

export async function getMembers() {
  try {
    const snapshot = await getDocs(query(collection(db, COLLECTION), orderBy('fullName')));
    return snapshot.docs.map((d) => decorate(d.id, d.data()));
  } catch (error) {
    console.warn('[CL] No se pudieron listar los miembros:', error);
    return [];
  }
}

export function searchMembers(members, term) {
  const needle = normalizeText(term);
  if (!needle) return members || [];
  return (members || []).filter((member) =>
    [member.fullName, member.documentId, member.phone, member.email, member.neighborhood]
      .map(normalizeText)
      .some((field) => field.includes(needle))
  );
}

export function birthdaysThis(members, mode = 'mes') {
  return filterBirthdays(members, mode);
}

export function familyGroups(members) {
  const groups = new Map();
  (members || [])
    .filter((m) => m.attendanceType === 'familiar' && m.familyId)
    .forEach((member) => {
      if (!groups.has(member.familyId)) groups.set(member.familyId, []);
      groups.get(member.familyId).push(member);
    });
  return groups;
}

/* --------------------------------------------------------------------------
   ALTA
   -------------------------------------------------------------------------- */

export function buildMember(input, context = {}) {
  const fullName = (input.fullName || '').trim().replace(/\s+/g, ' ');
  if (fullName.length < 3) throw new Error('Ingresa el nombre completo de la persona.');
  if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/.test(fullName)) {
    throw new Error(`El nombre "${fullName}" solo puede contener letras y espacios.`);
  }

  const cleanPhone = (input.phone || '').toString().trim().replace(/\D/g, '');
  if (cleanPhone && cleanPhone.length !== 10) {
    throw new Error(`El teléfono de ${fullName} debe tener estrictamente 10 dígitos numéricos.`);
  }

  const cleanDoc = (input.documentId || '').toString().trim().replace(/\D/g, '');
  if (cleanDoc && (cleanDoc.length < 6 || cleanDoc.length > 15)) {
    throw new Error(`El documento de ${fullName} debe tener entre 6 y 15 dígitos numéricos.`);
  }

  const birth = parseBirthDate(input.birthDate);
  const email = (input.email || '').trim().toLowerCase();
  if (email && !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
    throw new Error(`El correo de ${fullName} no es válido.`);
  }

  return {
    fullName,
    documentId: cleanDoc,
    phone: cleanPhone,
    email,
    // URL externa o Base64 comprimida (ver lib/image.js). El servicio la
    // valida para que ningún cliente pueda escribir una imagen desmedida.
    photoUrl: sanitizeImageValue(input.photoUrl, { field: 'foto del miembro' }),
    birthDate: birth ? input.birthDate : '',
    birthMonth: birth ? birth.month : null,
    birthDay: birth ? birth.day : null,
    address: (input.address || '').trim(),
    neighborhood: (input.neighborhood || '').trim(),
    attendanceType: input.attendanceType === 'familiar' ? 'familiar' : 'solo',
    familyRole: FAMILY_ROLES.some((r) => r.value === input.familyRole) ? input.familyRole : 'cabeza',
    familyNotes: (input.familyNotes || '').trim(),
    churchRole: CHURCH_ROLES.includes(input.churchRole) ? input.churchRole : 'Nuevo Asistente',
    firstVisitDate: input.firstVisitDate || null,
    status: MEMBER_STATUS.some((s) => s.value === input.status) ? input.status : 'nuevo',
    isBaptized: input.isBaptized === true,
    assignedLeaderId: input.assignedLeaderId || '',
    assignedLeaderName: input.assignedLeaderName || '',
    prayerRequests: (input.prayerRequests || '').trim(),
    ministry: input.ministry || 'general',
    attendances: Array.isArray(input.attendances) ? input.attendances : [],
    attendanceCount: Number(input.attendanceCount) || (Array.isArray(input.attendances) ? input.attendances.length : 0),
    lastAttendance: input.lastAttendance || '',
    createdAt: serverTimestamp(),
    createdBy: context.authorUid || ''
  };
}

function newFamilyId() {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `FAM-${Date.now().toString(36).toUpperCase()}-${random}`;
}

/**
 * Registra un núcleo familiar completo con un solo familyId compartido.
 * records: [{ data, role }]  → el primero se marca como 'cabeza'.
 */
export async function createFamily(records, context = {}) {
  requireService(db, 'Firestore');
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('Debes registrar al menos la persona que asiste.');
  }
  const familyId = newFamilyId();
  const batch = writeBatch(db);
  const created = [];

  records.forEach((record, index) => {
    const payload = buildMember({ ...record.data, attendanceType: 'familiar' }, context);
    payload.familyId = familyId;
    payload.familyRole = index === 0 ? 'cabeza' : FAMILY_ROLES.some((r) => r.value === record.role) ? record.role : 'familiar';
    const ref = doc(collection(db, COLLECTION));
    batch.set(ref, payload);
    created.push(ref.id);
  });

  try {
    await batch.commit();
    return { familyId, memberIds: created };
  } catch (error) {
    console.error('[CL] Error registrando la familia:', error);
    throw new Error(error.message || 'No se pudo guardar el registro familiar.');
  }
}

export async function createMember(data, context = {}) {
  requireService(db, 'Firestore');
  const payload = buildMember(data, context);
  if (payload.attendanceType === 'familiar') {
    const { familyId, memberIds } = await createFamily([{ data, role: 'cabeza' }], context);
    return { familyId, memberIds };
  }
  try {
    const ref = await addDoc(collection(db, COLLECTION), payload);
    return { memberIds: [ref.id], familyId: '' };
  } catch (error) {
    console.error('[CL] Error creando miembro:', error);
    throw new Error(error.message || 'No se pudo guardar el registro.');
  }
}

export async function updateMember(id, data, authorUid) {
  requireService(db, 'Firestore');
  const birth = parseBirthDate(data.birthDate);
  try {
    await updateDoc(doc(db, COLLECTION, id), {
      fullName: (data.fullName || '').trim(),
      documentId: (data.documentId || '').trim(),
      phone: (data.phone || '').trim(),
      email: (data.email || '').trim(),
      photoUrl: sanitizeImageValue(data.photoUrl, { field: 'foto del miembro' }),
      birthDate: birth ? data.birthDate : '',
      birthMonth: birth ? birth.month : null,
      birthDay: birth ? birth.day : null,
      address: (data.address || '').trim(),
      neighborhood: (data.neighborhood || '').trim(),
      attendanceType: data.attendanceType === 'familiar' ? 'familiar' : 'solo',
      familyRole: data.familyRole || 'cabeza',
      familyNotes: (data.familyNotes || '').trim(),
      churchRole: data.churchRole || 'Nuevo Asistente',
      firstVisitDate: data.firstVisitDate || null,
      status: data.status || 'nuevo',
      isBaptized: data.isBaptized === true,
      assignedLeaderId: data.assignedLeaderId || '',
      assignedLeaderName: (data.assignedLeaderName || '').trim(),
      prayerRequests: (data.prayerRequests || '').trim(),
      ministry: data.ministry || 'general',
      updatedAt: serverTimestamp(),
      updatedBy: authorUid || ''
    });
    return true;
  } catch (error) {
    console.error('[CL] Error actualizando miembro:', error);
    throw new Error(error.message || 'No se pudo actualizar el miembro.');
  }
}

/** Actualiza el líder de seguimiento de todo el núcleo familiar. */
export async function assignLeaderFamily(familyId, leaderId, leaderName) {
  requireService(db, 'Firestore');
  if (!familyId) throw new Error('El miembro no tiene núcleo familiar asignado.');
  try {
    const snapshot = await getDocs(query(collection(db, COLLECTION)));
    const batch = writeBatch(db);
    let touched = 0;
    snapshot.docs.forEach((d) => {
      if (d.data().familyId === familyId) {
        batch.update(d.ref, { assignedLeaderId: leaderId || '', assignedLeaderName: leaderName || '' });
        touched += 1;
      }
    });
    if (!touched) throw new Error('No se encontraron miembros en ese núcleo.');
    await batch.commit();
    return touched;
  } catch (error) {
    console.error('[CL] Error asignando líder:', error);
    throw new Error(error.message || 'No se pudo asignar el líder.');
  }
}

export async function deleteMember(id) {
  requireService(db, 'Firestore');
  try {
    await deleteDoc(doc(db, COLLECTION, id));
    return true;
  } catch (error) {
    console.error('[CL] Error eliminando miembro:', error);
    throw new Error('No se pudo eliminar el miembro.');
  }
}

export const MEMBER_CSV_COLUMNS = [
  ['fullName', 'Nombre completo'],
  ['documentId', 'Documento'],
  ['phone', 'Teléfono'],
  ['email', 'Correo'],
  ['birthDate', 'Fecha de nacimiento'],
  ['neighborhood', 'Barrio'],
  ['address', 'Dirección'],
  ['attendanceType', 'Asiste'],
  ['churchRole', 'Rol eclesiástico'],
  ['status', 'Estado'],
  ['isBaptized', 'Bautizado'],
  ['assignedLeaderName', 'Líder asignado'],
  ['firstVisitDate', 'Primera visita']
];

export function membersToCSV(members) {
  return [
    MEMBER_CSV_COLUMNS.map(([, label]) => label),
    ...(members || []).map((member) =>
      MEMBER_CSV_COLUMNS.map(([key]) => {
        const value = member[key];
        if (value instanceof Date) return toDate(value)?.toLocaleDateString('es-CO') || '';
        if (typeof value === 'boolean') return value ? 'Sí' : 'No';
        return value ?? '';
      })
    )
  ];
}

/* --------------------------------------------------------------------------
   GESTIÓN DE ASISTENCIA, FIDELIZACIÓN Y ALERTAS PASTORALES
   -------------------------------------------------------------------------- */
export const MINISTRY_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: 'general', label: 'General' },
  { value: 'kids', label: 'Kids' },
  { value: 'adora', label: 'Adora' },
  { value: 'mujeres', label: 'Mujeres' },
  { value: 'jovenes', label: 'Jóvenes' },
  { value: 'servidores', label: 'Servidores' }
];

export async function recordAttendance(memberId, { serviceName = 'Servicio Presencial Love', date = null, authorName = 'Servidor' } = {}) {
  requireService(db, 'Firestore');
  const today = date || new Date().toISOString().slice(0, 10);
  const attItem = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    date: today,
    service: serviceName,
    registeredBy: authorName,
    timestamp: new Date().toISOString()
  };
  const memberRef = doc(db, COLLECTION, memberId);
  await updateDoc(memberRef, {
    attendances: arrayUnion(attItem),
    lastAttendance: today,
    attendanceCount: increment(1)
  });
  return attItem;
}

export async function upgradeMemberStatus(memberId, newStatus = 'activo', authorUid = '') {
  requireService(db, 'Firestore');
  const memberRef = doc(db, COLLECTION, memberId);
  await updateDoc(memberRef, {
    status: newStatus,
    churchRole: newStatus === 'activo' ? 'Miembro Activo' : 'Nuevo Asistente',
    updatedAt: serverTimestamp(),
    updatedBy: authorUid || ''
  });
  return true;
}

export function isCandidateForRegularMember(member) {
  if (!member || (member.status !== 'nuevo' && member.status !== 'en_consolidacion')) return false;
  const attendances = Array.isArray(member.attendances) ? member.attendances : [];
  const now = Date.now();
  const sixtyDaysAgo = now - 60 * 24 * 60 * 60 * 1000;
  const recentCount = attendances.filter((att) => {
    const attTime = new Date(att.date || att.timestamp).getTime();
    return !isNaN(attTime) && attTime >= sixtyDaysAgo;
  }).length;
  return recentCount >= 4;
}

export function getAbsenteeMembers(members, threshold = 3) {
  const now = Date.now();
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
  const thresholdMs = threshold * oneWeekMs;

  return (members || []).filter((m) => {
    if (m.status !== 'activo' && m.churchRole !== 'Miembro Activo') return false;
    if (!m.lastAttendance) {
      const created = m.createdAt ? new Date(m.createdAt).getTime() : 0;
      return created > 0 && (now - created) >= thresholdMs;
    }
    const lastTime = new Date(m.lastAttendance).getTime();
    return !isNaN(lastTime) && (now - lastTime) >= thresholdMs;
  });
}

