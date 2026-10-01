# SYSTEM PROMPT & ARCHITECTURAL INSTRUCTIONS

**Proyecto:** Comunidad Love - Web Institucional & Sistema Integral de Gestión (CLGestión)  
**Autor / Super Admin:** Christian Romero (ChrizDev)  
**Ruta local del workspace:** `E:\aplicativos ChrizDev\CLGestion By Christian Romero\ComunidadLove\ComunidadLoveWeb`  
**Referencia en producción:** `https://comunidad-love.vercel.app/#`

---

## 1. MISIÓN Y ALCANCE GENERAL

Transformar la landing page estática existente en una plataforma web dinámica, escalable y robusta conectada a **Firebase**, preservando al 100% la identidad visual, tipografías, componentes y paleta de colores de la versión actual. 

El proyecto debe operar bajo dos grandes frentes:
1. **Portal Público Dinámico:** La web institucional (`/` e index existente) debe consumir en tiempo real sus secciones clave desde Cloud Firestore (tiempos y horarios de eventos, anuncios, transmisiones en vivo, módulos informativos y ministerios).
2. **CLGestión (Portal Administrativo / Dashboard):** Una interfaz de gestión moderna, privada y modular (accesible bajo `/admin` o sección dedicada) protegida por autenticación y basada en roles de usuario.

---

## 2. LINEAMIENTOS DE DISEÑO E IDENTIDAD VISUAL

Al crear nuevos componentes, vistas administrativas, formularios o modales, **DEBES ceñirte estrictamente al diseño actual de la web**:

* **Paleta de Colores y Estilos:**
  * Revisa los archivos CSS/Tailwind existentes en este repositorio y extrae exactamente las variables de color (fondos oscuros/claros, acentos dorados/azules/rojos de la marca Comunidad Love, gradientes y colores de bordes).
  * El nuevo panel administrativo debe mantener una apariencia cohesiva: diseño limpio, soporte para modo oscuro/claro coherente con la web, tarjetas con bordes redondeados (`rounded-xl` / `rounded-2xl`), sombras suaves y botones con el mismo estilo y estados *hover/focus* del portal principal.
* **Componentes Responsivos:**
  * El formulario de registro de asistentes y miembros debe tener diseño **Mobile-First**, pensado para ser utilizado cómodamente en tablets o teléfonos móviles por ujieres/servidores en la puerta del templo.
* **No sobreescribir estilos globales:**
  * Encapsula los estilos del panel de administración para no romper los estilos ni los scripts de la landing page existente.

---

## 3. ARQUITECTURA DE USUARIOS Y CONTROL DE ROLES (RBAC)

El sistema debe implementar 3 niveles jerárquicos de acceso con Firebase Authentication y Cloud Firestore:

| Rol | Usuario / Perfil | Alcance y Permisos |
| :--- | :--- | :--- |
| **`superadmin`** | Christian Romero | Control total de la plataforma. Puede crear y editar usuarios, asignar roles, auditar cambios, borrar registros y administrar todas las colecciones. |
| **`admin`** | Pastores y Líderes Principales | Gestión de contenidos web (eventos, avisos, testimonios), acceso a reportes eclesiásticos, visualización y exportación de miembros, asignación de líderes de seguimiento. |
| **`servidor`** | Ujieres y Equipo de Recepción | Acceso exclusivo al **Módulo de Registro y Asistencia**: registrar nuevos visitantes/familias, consultar cumpleaños de la semana y actualizar datos de contacto. No pueden modificar la web ni eliminar miembros. |

---

## 4. MODELO DE DATOS EN CLOUD FIRESTORE

Implementa las siguientes colecciones respetando esta estructura de datos:

### A. Colecciones de la Web Pública
* `events/`
  * `id`: string (doc ID)
  * `title`: string
  * `description`: string
  * `dateStart`: Timestamp
  * `dateEnd`: Timestamp
  * `location`: string
  * `bannerUrl`: string
  * `category`: string ('general', 'jovenes', 'ninos', 'matrimonios', etc.)
  * `isActive`: boolean
  * `createdAt`: Timestamp
  * `updatedBy`: string (User UID)

* `site_settings/general`
  * `streamingUrl`: string (Enlace de YouTube o transmisión activa)
  * `serviceHours`: array de objetos `[{ day: "Domingo", time: "10:00 AM", label: "Culto Principal" }]`
  * `bannerAlert`: object `{ show: boolean, message: string, type: 'info'|'warning' }`
  * `contactPhone`: string
  * `socialLinks`: object `{ instagram, facebook, youtube }`

* `announcements/`
  * `id`: string
  * `title`: string
  * `message`: string
  * `publishDate`: Timestamp
  * `expirationDate`: Timestamp
  * `priority`: number

### B. Colecciones del Sistema de Gestión (CLGestión)
* `members/`
  * `id`: string
  * **Datos Personales:**
    * `fullName`: string
    * `documentId`: string (cédula o documento)
    * `phone`: string (con código de país, listo para enlace a WhatsApp)
    * `email`: string
    * `birthDate`: string (`YYYY-MM-DD` para indexación de cumpleaños)
    * `birthMonth`: number (1 - 12, para queries rápidas de cumpleaños del mes)
    * `birthDay`: number (1 - 31)
    * `address`: string
    * `neighborhood`: string
  * **Estructura Familiar:**
    * `attendanceType`: `'solo' | 'familiar'`
    * `familyId`: string (ID compartido para miembros del mismo núcleo)
    * `familyRole`: `'cabeza' | 'conyuge' | 'hijo' | 'familiar'`
    * `familyNotes`: string
  * **Información Eclesiástica y Seguimiento:**
    * `churchRole`: string ('Nuevo Asistente', 'Miembro Activo', 'Líder', 'Servidor', 'Músico', 'Diácono')
    * `firstVisitDate`: Timestamp o string
    * `status`: `'nuevo' | 'en_consolidacion' | 'activo' | 'inactivo'`
    * `isBaptized`: boolean
    * `assignedLeaderId`: string
    * `assignedLeaderName`: string
    * `prayerRequests`: string
    * `createdAt`: Timestamp
    * `createdBy`: string (UID del servidor que registró)

* `members/{memberId}/followups/` (Subcolección de bitácora)
  * `date`: Timestamp
  * `authorUid`: string
  * `authorName`: string
  * `type`: `'llamada' | 'visita' | 'mensaje' | 'consejería'`
  * `notes`: string
  * `nextActionDate`: Timestamp

* `users/`
  * `uid`: string (ID de Firebase Auth)
  * `email`: string
  * `displayName`: string
  * `role`: `'superadmin' | 'admin' | 'servidor'`
  * `isActive`: boolean

---

## 5. REGLAS DE SEGURIDAD (FIRESTORE RULES)

Genera el archivo `firestore.rules` con este estándar de seguridad:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function getRole() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role;
    }

    function isSuperAdmin() {
      return request.auth != null && getRole() == 'superadmin';
    }

    function isAdmin() {
      return request.auth != null && (getRole() == 'admin' || isSuperAdmin());
    }

    function isServidor() {
      return request.auth != null && (getRole() == 'servidor' || isAdmin());
    }

    // Contenido web visible
    match /events/{docId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /site_settings/{docId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /announcements/{docId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    // Gestión de miembros
    match /members/{memberId} {
      allow read, create, update: if isServidor();
      allow delete: if isAdmin();

      match /followups/{followId} {
        allow read, write: if isServidor();
      }
    }

    // Gestión de usuarios del sistema
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if isSuperAdmin();
    }
  }
}
```

---

## 6. MÓDULOS OBLIGATORIOS A CONSTRUIR

1. **Integración Firebase Client:**
   * Archivo de configuración centralizado (`firebase-config.js` o `src/services/firebase.js`) usando Firebase SDK v10+ modular (`initializeApp`, `getFirestore`, `getAuth`, `getStorage`).
2. **Sincronización de la Landing Page:**
   * Sustituir los elementos hardcodeados en el HTML de eventos y avisos por funciones asíncronas con skeletons de carga para que lean desde Firestore en tiempo real.
3. **Formulario de Registro Rápido (Mobile & Desktop):**
   * Vista optimizada para Ujieres/Servidores con validaciones ágiles.
   * Switch dinámico: Si se marca "Asiste en Familia", permitir añadir dinámicamente cónyuge e hijos generando y vinculando automáticamente el `familyId`.
   * Botón de confirmación visual instantánea tras el guardado.
4. **Dashboard de Seguimiento (Pastores & Admin):**
   * Tabla interactiva de miembros con búsqueda por nombre, cédula o teléfono.
   * Filtro rápido: "Cumpleañeros del Mes / de la Semana" con botón directo a `https://wa.me/{telefono}?text=Feliz%20cumpleaños...`.
   * Vista de ficha individual de miembro con historial de seguimientos (bitácora de llamadas/visitas).
5. **Panel CMS de Eventos y Contenidos:**
   * CRUD para crear, pausar, editar y eliminar eventos y horarios con carga de imágenes a Firebase Storage.

---

## 7. PAUTAS DE EJECUCIÓN PARA EL ASISTENTE / IDE

* Examina primero la estructura de carpetas actual de `ComunidadLoveWeb` para reutilizar las librerías o frameworks ya instalados (Bootstrap, Tailwind, Vanilla JS, Vite, etc.).
* No elimines código ni clases CSS existentes que afecten la estética actual.
* Crea código limpio, modular, bien documentado y con manejo robusto de excepciones (bloques `try/catch` en cada interacción con Firebase).