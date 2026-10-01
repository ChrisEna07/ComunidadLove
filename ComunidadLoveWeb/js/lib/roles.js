/* ==========================================================================
   ROLES Y PERMISOS (RBAC) — módulo puro, sin dependencias
   --------------------------------------------------------------------------
   Modelo en dos capas:

   1. ROL (jerarquía). Decide el nivel base de acceso:
        superadmin > admin > webmaster > servidor
      - superadmin : único (Christian Romero). Control total, incluida la
                     auditoría y la concesión del propio rol superadmin.
      - admin      : Pastor. Acceso TOTAL a módulos y configuraciones, igual
                     que el superadmin. Única diferencia: no puede crear ni
                     delegar el rol `superadmin`.
      - webmaster  : Encargado de la web. Contenido público (eventos, avisos,
                     mercado, oración). SIN datos sensibles de miembros ni
                     finanzas salvo que se le deleguen explícitamente.
      - servidor   : registro, asistencia y bitácora de miembros.

   2. FUNCIONES DELEGADAS ( granulares). Viven en `users/{uid}.permissions`
      como array de claves del catálogo. Permiten abrir módulos concretos a un
      rol menor sin tocar su rol base.

   `can()` acepta tanto un rol suelto ("admin") como un perfil completo
   ({ role, permissions }), de modo que los mismos call sites sirven para
   navegación por rol y para navegación con delegación.
   ========================================================================== */

export const ROLES = ['superadmin', 'admin', 'webmaster', 'servidor'];

export const ROLE_LABELS = {
  superadmin: 'Super Admin',
  admin: 'Pastor / Admin',
  webmaster: 'Webmaster',
  servidor: 'Servidor'
};

export const ROLE_TONES = {
  superadmin: 'danger',
  admin: 'primary',
  webmaster: 'info',
  servidor: 'news'
};

/** Descripción usada en la vista de roles. El Super Admin NO se delega ni se documenta aquí. */
export const ROLE_DESCRIPTION = {
  admin: 'Control y acceso total a módulos y configuraciones del sistema.',
  webmaster:
    'Gestión de contenidos públicos de la web (Eventos, Avisos, Love Market, Ministerios, Peticiones de Oración). Sin acceso a datos sensibles de miembros ni finanzas.',
  servidor: 'Registro de asistentes, toma de asistencia, consulta de cumpleaños y bitácora de seguimiento.'
};

/** El rol `superadmin` no se delega ni se documenta en la vista de roles. */
export const HIDDEN_ROLES = ['superadmin'];

const RANK = { superadmin: 4, admin: 3, webmaster: 2, servidor: 1 };

/* --------------------------------------------------------------------------
   CATÁLOGO DE FUNCIONES GRANULARES
   --------------------------------------------------------------------------
   `minRole` es el nivel jerárquico mínimo que ya incluye la función.
   `sensitive` marca las que exponen datos privados o financieros: al
   delegarlas a un rol menor hay que pedir confirmación explícita.
   -------------------------------------------------------------------------- */
export const PERMISSION_CATALOG = [
  {
    key: 'members.read',
    label: 'Consultar miembros',
    module: 'Miembros',
    description: 'Ver el listado y las fichas de los miembros de la congregación.',
    minRole: 'servidor',
    sensitive: true,
    icon: 'fa-address-book'
  },
  {
    key: 'members.write',
    label: 'Registrar y editar miembros',
    module: 'Miembros',
    description: 'Crear fichas, registrar asistencia y actualizar datos personales.',
    minRole: 'servidor',
    sensitive: true,
    icon: 'fa-user-plus'
  },
  {
    key: 'members.delete',
    label: 'Eliminar miembros',
    module: 'Miembros',
    description: 'Borrar permanentemente una ficha de miembro.',
    minRole: 'admin',
    sensitive: true,
    icon: 'fa-user-slash'
  },
  {
    key: 'events.manage',
    label: 'Gestionar eventos',
    module: 'Eventos',
    description: 'Crear, editar, publicar y pausar eventos y galerías.',
    minRole: 'webmaster',
    sensitive: false,
    icon: 'fa-calendar-days'
  },
  {
    key: 'content.write',
    label: 'Editar contenido del sitio',
    module: 'Contenido',
    description: 'Avisos, testimonios, ministerios y ajustes de la web pública.',
    minRole: 'webmaster',
    sensitive: false,
    icon: 'fa-sliders'
  },
  {
    key: 'market.manage',
    label: 'Gestionar Love Market',
    module: 'Love Market',
    description: 'Alta, edición, precios, fotos y publicación de productos.',
    minRole: 'webmaster',
    sensitive: true,
    icon: 'fa-store'
  },
  {
    key: 'prayers.reply',
    label: 'Responder peticiones de oración',
    module: 'Oración',
    description: 'Publicar respuestas verificadas en el Muro de Clamor.',
    minRole: 'webmaster',
    sensitive: false,
    icon: 'fa-hands-praying'
  },
  {
    key: 'audit.view',
    label: 'Ver auditoría',
    module: 'Auditoría',
    description: 'Consultar el registro de acciones del equipo.',
    minRole: 'admin',
    sensitive: true,
    icon: 'fa-clipboard-list'
  }
];

/** Claves del catálogo, para validar incoming sin repetir literales. */
export const PERMISSION_KEYS = PERMISSION_CATALOG.map((item) => item.key);

export const PERMISSION_BY_KEY = PERMISSION_CATALOG.reduce((acc, item) => {
  acc[item.key] = item;
  return acc;
}, {});

/**
 * Funciones heredadas del modelo por jerarquía. Se conservan porque el router,
 * el sidebar y varias vistas las consultan por rol.
 * Nota: `users.manage` lo tienen admin y superadmin, pero asignar el rol
 * `superadmin` sigue siendo exclusivo del superadmin (ver `canGrantRole`).
 */
export const PERMISSIONS = {
  'content.write': 'webmaster',
  'members.write': 'servidor',
  'members.read': 'servidor',
  'members.delete': 'admin',
  'followups.write': 'servidor',
  'events.manage': 'webmaster',
  'market.manage': 'webmaster',
  'prayers.reply': 'webmaster',
  'audit.view': 'admin',
  'users.manage': 'admin',
  'reports.export': 'admin'
};

export function roleLabel(role) {
  return ROLE_LABELS[role] || 'Sin rol';
}

export function rankOf(role) {
  return RANK[role] || 0;
}

export function normalizePermKey(key) {
  return String(key || '').replace(':', '.');
}

/** Normaliza el "sujeto" de una comprobación a `{ role, permissions }`. */
function toSubject(subject) {
  if (typeof subject === 'string') return { role: subject, permissions: [] };
  if (!subject || typeof subject !== 'object') return { role: null, permissions: [] };
  const raw = Array.isArray(subject.permissions) ? subject.permissions : [];
  return {
    role: subject.role || null,
    permissions: raw.map(normalizePermKey).filter((key) => PERMISSION_KEYS.includes(key))
  };
}

/** Funciones delegadas explícitamente a ese usuario. */
export function delegatedPermissions(subject) {
  return toSubject(subject).permissions;
}

/**
 * Comprueba una función. Acepta rol ("admin") o perfil ({ role, permissions }).
 * - Si el rol ya cubre la función por jerarquía, siempre concede.
 * - Si no, concede sólo si la función fue delegada explícitamente.
 */
export function can(subject, action) {
  const normAction = normalizePermKey(action);
  const { role, permissions } = toSubject(subject);
  const rank = rankOf(role);
  if (!rank) return false;

  // El superadmin y el pastor tienen acceso total a módulos y configuraciones.
  if (role === 'superadmin' || role === 'admin') return true;

  const minRole = PERMISSIONS[normAction];
  if (minRole && rank >= rankOf(minRole)) return true;

  return permissions.includes(normAction);
}

/** Igual que `can` pero devuelve `false` si no hay ningún rol asignado. */
export function hasAnyRole(subject) {
  return rankOf(toSubject(subject).role) > 0;
}

/**
 * ¿Puede este administrador conceder `targetRole`?
 * El rol `superadmin` es único e intransferible: nadie puede crearlo ni delegarlo.
 * El resto de roles ('admin', 'webmaster', 'servidor') los concede admin o superadmin.
 */
export function canGrantRole(actorRole, targetRole) {
  if (!isValidRole(targetRole)) return false;
  if (targetRole === 'superadmin') return false; // El Super Admin NO es delegable
  return actorRole === 'superadmin' || actorRole === 'admin';
}

/** Roles que `actorRole` puede asignar, para pintar el selector. NUNCA incluye superadmin. */
export function grantableRoles(actorRole) {
  if (actorRole !== 'superadmin' && actorRole !== 'admin') return [];
  return ['admin', 'webmaster', 'servidor'];
}

export function isValidRole(role) {
  return ROLES.includes(role);
}

/** Normaliza un array de funcionesDelegadas, descarta claves inexistentes. */
export function sanitizePermissions(list) {
  if (!Array.isArray(list)) return [];
  return Array.from(new Set(list.map(normalizePermKey).filter((key) => PERMISSION_KEYS.includes(key))));
}

/**
 * Funciones que un usuario NO tiene por rol pero que se le han delegado.
 * Es la lista que dispara la advertencia de seguridad al guardar.
 */
export function sensitiveDelegations(subject) {
  const { role, permissions } = toSubject(subject);
  if (role === 'superadmin' || role === 'admin') return [];
  return permissions
    .map((key) => PERMISSION_BY_KEY[key])
    .filter((item) => item && item.sensitive);
}

/** Descripción legible de las funciones delegadas. */
export function describePermissions(subject) {
  const keys = delegatedPermissions(subject);
  if (!keys.length) return 'Sin funciones delegadas.';
  return keys.map((key) => PERMISSION_BY_KEY[key]?.label || key).join(', ');
}