/* ==========================================================================
   LIBRERÍA DE FECHAS
   Manejo de Timestamps de Firestore, formato en español y lógica de
   cumpleaños (mes/día) usada por el módulo de seguimiento.
   ========================================================================== */

export const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const MONTH_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const FOLLOWUP_TYPES = ['llamada', 'visita', 'mensaje', 'consejería'];

/** Convierte Timestamp de Firestore, Date, ISO o número en un Date válido (o null). */
export function toDate(value) {
  try {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === 'object' && typeof value.toDate === 'function') return value.toDate();
    if (typeof value === 'object' && typeof value.seconds === 'number') return new Date(value.seconds * 1000);
    if (typeof value === 'number') return new Date(value);
    if (typeof value === 'string') {
      // `new Date('2026-10-01')` se interpreta como UTC y se corre un día en
      // zonas con offset negativo. Se reconstruye como fecha local.
      const dateOnly = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (dateOnly) {
        return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
      }
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch (error) {
    console.warn('[CL] Fecha no interpretable:', value, error);
    return null;
  }
}

/** Retorna SIEMPRE una instancia Date válida (nunca null, nunca NaN), con fallback a new Date(). */
export function parseDate(value) {
  if (!value) return new Date();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? new Date() : value;
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    try {
      const d = value.toDate();
      if (d instanceof Date && !Number.isNaN(d.getTime())) return d;
    } catch {}
  }
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }
  const parsed = toDate(value);
  return (parsed && !Number.isNaN(parsed.getTime())) ? parsed : new Date();
}

export function pad(value) {
  return String(value).padStart(2, '0');
}

export function toISODate(date) {
  const d = toDate(date);
  if (!d) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDate(value) {
  const d = toDate(value);
  if (!d) return '—';
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatLongDate(value) {
  const d = toDate(value);
  if (!d) return '—';
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()} de ${MONTH_NAMES[d.getMonth()]} de ${d.getFullYear()}`;
}

export function formatTime(value) {
  const d = toDate(value);
  if (!d) return '';
  const suffix = d.getHours() >= 12 ? 'PM' : 'AM';
  const hour12 = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
  return `${hour12}:${pad(d.getMinutes())} ${suffix}`;
}

export function formatDateTime(value) {
  const d = toDate(value);
  if (!d) return '—';
  return `${formatDate(d)} · ${formatTime(d)}`;
}

/** Texto corto para el calendario: "Hoy", "Mañana" o la fecha larga. */
export function smartDate(value) {
  const d = toDate(value);
  if (!d) return '—';
  const today = startOfDay(new Date());
  const target = startOfDay(d);
  const diffDays = Math.round((target - today) / 86400000);
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Mañana';
  if (diffDays === -1) return 'Ayer';
  return formatLongDate(d);
}

export function startOfDay(date) {
  const d = new Date(toDate(date) || new Date());
  d.setHours(0, 0, 0, 0);
  return d;
}

export function sameDay(a, b) {
  const da = toDate(a);
  const db = toDate(b);
  if (!da || !db) return false;
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

export function daysUntil(value) {
  const target = toDate(value);
  if (!target) return null;
  return Math.round((startOfDay(target) - startOfDay(new Date())) / 86400000);
}

/* --------------------------------------------------------------------------
   CUMPLEAÑOS
   -------------------------------------------------------------------------- */

/** Extrae { year, month, day } de un birthDate tolerando YYYY-MM-DD, DD/MM/YYYY, ISO o Date. */
export function parseBirthDate(birthDate) {
  if (!birthDate) return null;
  if (typeof birthDate === 'object' && typeof birthDate.toDate === 'function') {
    try {
      const d = birthDate.toDate();
      return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
    } catch {}
  }
  const str = String(birthDate).trim();
  // YYYY-MM-DD o YYYY/MM/DD o YYYY-MM-DDTHH:mm:ss
  let match = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (match) {
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  }
  // DD/MM/YYYY o DD-MM-YYYY
  match = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (match) {
    return { year: Number(match[3]), month: Number(match[2]), day: Number(match[1]) };
  }
  const d = new Date(birthDate);
  if (!Number.isNaN(d.getTime())) {
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }
  return null;
}

export function ageFrom(birthDate, reference = new Date()) {
  const parsed = parseBirthDate(birthDate);
  if (!parsed) return null;
  const ref = toDate(reference) || new Date();
  let age = ref.getFullYear() - parsed.year;
  const beforeBirthday =
    ref.getMonth() + 1 < parsed.month || (ref.getMonth() + 1 === parsed.month && ref.getDate() < parsed.day);
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

/** Calcula cuántos días faltan para el próximo cumpleaños, resolviendo el 29-feb. */
export function daysToBirthday(birthDate, reference = new Date()) {
  const parsed = parseBirthDate(birthDate);
  if (!parsed) return null;
  const ref = toDate(reference) || new Date();
  const today = startOfDay(ref);
  const year = today.getFullYear();

  for (const candidateYear of [year, year + 1]) {
    const maxDay = new Date(candidateYear, parsed.month, 0).getDate();
    const birthday = new Date(candidateYear, parsed.month - 1, Math.min(parsed.day, maxDay));
    birthday.setHours(0, 0, 0, 0);
    const diff = Math.round((birthday - today) / 86400000);
    if (diff >= 0 && diff < 366) return diff;
  }
  return null;
}

/**
 * Filtra miembros por cumpleaños.
 * mode: 'hoy' | 'semana' | 'mes'
 */
export function filterBirthdays(members, mode = 'mes') {
  const horizon = mode === 'hoy' ? 0 : mode === 'semana' ? 6 : 31;
  return (members || [])
    .map((member) => ({ member, days: daysToBirthday(member.birthDate) }))
    .filter((entry) => entry.days !== null && entry.days <= horizon)
    .sort((a, b) => a.days - b.days);
}

export function birthdayLabel(days) {
  if (days === null || days === undefined) return 'Sin fecha';
  if (days === 0) return '¡Cumple hoy!';
  if (days === 1) return 'Cumple mañana';
  return `En ${days} días`;
}
