# Guía de configuración y puesta en marcha - Comunidad Love + CLGestión

Este documento describe el proceso completo para levantar el proyecto en Firebase: configurar la autenticación, las reglas de Firestore y crear el primer usuario `superadmin`. El sitio sigue siendo **zero-build** (módulos ES desde CDN, Firebase SDK 10.12.2).

| Dato | Valor |
|---|---|
| Project ID | `comunidadlove-cbe75` |
| Número de proyecto | `311051033862` |
| Dominio de Authentication | `comunidadlove-cbe75.firebaseapp.com` |
| Hosting | `https://comunidadlove-cbe75.web.app` |
| Consola | https://console.firebase.google.com/project/comunidadlove-cbe75 |

> **Sin Cloud Storage.** El proyecto está en el plan Spark (sin tarjeta de crédito), así que **no** hay bucket. Las imágenes se guardan dentro del propio documento de Firestore, ya sea como URL externa o como Base64 comprimida en el navegador. Ver [Imágenes](#7-imágenes-url-externa-o-base64-sin-cloud-storage).

## 1. Requisitos previos

- [Node.js LTS](https://nodejs.org/es/) (v18 o superior recomendado).
- Java 17 o superior, solo si vas a usar los emuladores locales.
- Un proyecto de Firebase (ya creado): `comunidadlove-cbe75`.

## 2. Habilitar Authentication

1. Ve a [Authentication > Sign-in method](https://console.firebase.google.com/project/comunidadlove-cbe75/authentication/providers).
2. Activa **Correo electrónico/Contraseña**.
3. Opcional pero recomendado: en **Configuración**, define una URL de redireccionamiento autorizada si después añades un flujo de verificación por correo.

## 3. Crear la base de datos de Firestore

1. Ve a [Firestore Database](https://console.firebase.google.com/project/comunidadlove-cbe75/firestore).
2. Pulsa **Crear base de datos**.
3. Selecciona **Modo de producción** y la ubicación `southamerica-east1` (la misma que usaría el bucket si lo hubiera).

## 4. Instalar las dependencias del CLI (opcional)

Si solo vas a desplegar desde la consola de Firebase, puedes saltarte este paso. Para usar `deploy` necesitas el CLI:

```bash
npm install -g firebase-tools
firebase --version
```

## 5. Conectar el proyecto con la CLI

```bash
cd ComunidadLoveWeb
npx --yes firebase-tools@^13.35.1 login
npx --yes firebase-tools@^13.35.1 use
```

Comprueba que [`firebase.json`](./firebase.json) y [`firestore.rules`](./firestore.rules) están en la raíz de `ComunidadLoveWeb` y que [`firestore.indexes.json`](./firestore.indexes.json) define los índices que necesites.

## 6. Desplegar reglas e índices

```bash
npx --yes firebase-tools@^13.35.1 deploy --only firestore:rules
npx --yes firebase-tools@^13.35.1 deploy --only firestore:indexes
```

Las reglas están en [`firestore.rules`](./firestore.rules) e incluyen el modelo de **invitación + autoservicio** para evitar que un usuario se autoasigne roles.

## 7. Imágenes: URL externa o Base64 (sin Cloud Storage)

No hay bucket de Storage. El campo de imagen acepta dos formatos:

| Formato | Ejemplo | Cuándo usarlo |
|---|---|---|
| URL externa | `https://ejemplo.com/banner.jpg` | Si la imagen ya está publicada en internet. |
| Base64 embebida | `data:image/webp;base64,UklGR…` | Si solo tienes el archivo en el dispositivo. |

Cuando eliges un archivo, el navegador lo optimiza antes de guardarlo:

- lado mayor reducido a **800 px**,
- recomprimido en **WebP** (o JPEG si el navegador no soporta WebP),
- con un tope de **200 KB** para la cadena `data:` completa.

Si aun así no cabe, el formulario lo avisa y te pide que uses una URL. Un Firestore document admite 1 MiB, así que 200 KB por imagen deja margen de sobra.

El código vive en:

- [`js/lib/image.js`](./js/lib/image.js): compresión, validación y límites.
- [`js/admin/image-input.js`](./js/admin/image-input.js): el control de formulario híbrido.

La validación se aplica **tanto en el formulario como en los servicios** (`services/events.js` y `services/members.js`), así que ningún cliente puede escribir una imagen desmedida.

## 8. Rellenar la configuración del SDK Web

El archivo [`js/firebase-config.js`](./js/firebase-config.js) contiene **placeholders** para que **nunca** subas credenciales reales al repositorio. Complétalo con los datos de tu proyecto:

1. En [Firebase Console > Configuración > General](https://console.firebase.google.com/project/comunidadlove-cbe75/settings/general), baja hasta **Tus aplicaciones**.
2. Pulsa el icono `</>` (Web) y registra la app `Comunidad Love Web`.
3. Copia el objeto `firebaseConfig` que aparece.
4. Abre `ComunidadLoveWeb/js/firebase-config.js` y reemplaza **solo** `apiKey` y `appId`:

```js
export const firebaseConfig = {
  apiKey: 'PEGAR_AQUI_apiKey',                    // ← desde la consola
  authDomain: 'comunidadlove-cbe75.firebaseapp.com',
  projectId: 'comunidadlove-cbe75',
  messagingSenderId: '311051033862',
  appId: '1:311051033862:web:PEGAR_AQUI_appId'     // ← desde la consola
};
```

5. Guarda el archivo. Está **ignorado por Git** ([`.gitignore`](../.gitignore)) para evitar filtrar credenciales.

> También existe [`js/firebase-config.example.js`](./js/firebase-config.example.js) como plantilla de referencia. `isFirebaseConfigured()` detecta los placeholders y muestra un aviso claro en vez de fallar en silencio.

## 9. Crear el primer `superadmin` (sembrado manual obligatorio)

Con el modelo de **invitación + autoservicio**, **nadie puede auto-asignarse un rol**. Por eso debes crear el primer `superadmin` manualmente en dos pasos.

### Paso 9.1: Crear el usuario en Authentication

1. Ve a [Authentication > Usuarios](https://console.firebase.google.com/project/comunidadlove-cbe75/authentication/users).
2. Pulsa **Agregar usuario** con un correo (ej. `admin@comunidadlove.co`) y una contraseña temporal.
3. Anota el **UID** que aparece (ej. `abc123Xyz...`).

### Paso 9.2: Crear el perfil en Firestore `users/{uid}`

1. Ve a [Firestore > users](https://console.firebase.google.com/project/comunidadlove-cbe75/firestore/data/~2Fusers).
2. Pulsa **Crear documento** y pega exactamente el **UID** del paso 9.1 como ID.
3. Añade estos campos:

| Campo | Tipo | Valor |
|---|---|---|
| `uid` | string | UID copiado (ej. `abc123Xyz...`) |
| `email` | string | Correo del usuario (ej. `admin@comunidadlove.co`) |
| `displayName` | string | Nombre completo (ej. `Super Admin`) |
| `role` | string | `superadmin` |
| `isActive` | boolean | `true` |
| `createdAt` | timestamp | Pulsa **Usar valor actual** |

4. Guarda el documento.

Con esto, al iniciar sesión en [`/admin`](./admin/index.html) tendrás **acceso total** al panel.

## 10. Probar en local (opcional: emuladores)

Puedes probar Authentication y Firestore localmente sin afectar los datos de producción.

Requisitos: Java 17 o superior. Con Firebase CLI v13 funciona con Java 17; con v15+ requiere Java 21.

```bash
cd ComunidadLoveWeb
npx --yes firebase-tools@^13.35.1 emulators:start --only auth,firestore
```

El panel de emuladores se abrirá en [http://localhost:4000](http://localhost:4000) por defecto. Los puertos configurados están en [`firebase.json`](./firebase.json).

> **Importante:** para que la web use los emuladores tendrías que conectar el SDK manualmente. En desarrollo local puedes añadir una bandera temporal, pero no es necesario para validar las reglas.

## 11. Despliegue a Firebase Hosting

### 11.1 Login

```bash
cd ComunidadLoveWeb
npx --yes firebase-tools@^13.35.1 login
```

### 11.2 Deploy completo

```bash
npx --yes firebase-tools@^13.35.1 deploy
```

### 11.3 Deploy por partes

```bash
# Solo Hosting
npx --yes firebase-tools@^13.35.1 deploy --only hosting

# Solo reglas
npx --yes firebase-tools@^13.35.1 deploy --only firestore:rules

# Solo índices
npx --yes firebase-tools@^13.35.1 deploy --only firestore:indexes
```

Después del deploy, Hosting te devolverá la URL (ej. `https://comunidadlove-cbe75.web.app` y el alias `https://comunidadlove-cbe75.firebaseapp.com`). El panel está en `/admin/`.

## 12. Primer acceso y gestión de usuarios

1. Abre `https://TU-DOMINIO/admin/`.
2. Inicia sesión con el `superadmin` creado en el paso 9.
3. Ve a **Usuarios y Roles** (`#/usuarios`).
4. Pulsa **Invitar usuario**: introduce correo, nombre y rol (`admin` o `servidor`).
5. Comparte la invitación: la persona debe **crear su cuenta en Firebase Authentication** e **iniciar sesión en `/admin/`**.
6. Al iniciar sesión por primera vez, su perfil queda **Pendiente**. Actívalo desde **Usuarios y Roles** asignándole el rol.
7. Para resetear contraseña, usa **Enviar reset**: Firebase enviará un correo para que el usuario defina su nueva contraseña.
8. Las bajas de acceso son **lógicas** (`isActive: false`). El borrado completo de la cuenta de Authentication se hace desde [Authentication > Usuarios](https://console.firebase.google.com/project/comunidadlove-cbe75/authentication/users).

## 13. Solución de problemas

| Problema | Causa | Solución |
|---|---|---|
| **`auth/email-already-in-use` al invitar** | Ya existe una cuenta en Authentication con ese correo. | Usa ese correo directamente (aparecerá pendiente al iniciar sesión) o bórralo de Auth si es un error. |
| **Perfil "Pendiente" y no puedo activarlo** | El perfil no existe en `users/{uid}`. | Si el usuario ya inició sesión, el perfil se crea con `role: null` e `isActive: false`. Refresca y actívalo desde Usuarios. Si nunca inició sesión, haz el paso 9.2. |
| **"Las imágenes no suben"** | El archivo era demasiado pesado o tenía un formato no admitido. | Usa una imagen más sencilla, o pega una URL externa. El límite es 200 KB por imagen. |
| **La imagen no se ve en la web** | La URL externa está caída o expiró. | El render la oculta automáticamente; reemplázala por otra URL o vuelve a subir el archivo. |
| **No veo "Usuarios y Roles"** | Tu cuenta no es `superadmin`. | Verifica el campo `role` en `users/{tu-uid}`. |
| **Las reglas rechazan escrituras** | UID no coincide o perfil `isActive: false`. | Comprueba que el usuario esté activo y con el rol correcto; revisa los registros en Firebase Console > Firestore. |

## 14. Notas importantes

- **Zero-build:** no se usa Vite, npm ni bundlers. Todo funciona con módulos ES nativos y CDN de Firebase.
- **Sin Storage:** no crees un bucket ni ejecutes `deploy --only storage:rules`. Las imágenes viajan como URL o Base64 dentro de Firestore.
- **Seguridad:** `js/firebase-config.js` **no** debe commitearse con valores reales. El `.gitignore` ya lo protege.
- **Primer superadmin:** siempre manual (ningún usuario se auto-promueve).
- **Invitaciones:** no se envían emails desde la app. El flujo es registro en Auth + activación por `superadmin`.
- **Líderes (`team`)**: se sincroniza automáticamente cuando un usuario con rol `admin` o `superadmin` pasa a activo. Es legible por usuarios activos para el selector de asignación.