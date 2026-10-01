/* ==========================================================================
   PLANTILLA DE CONFIGURACIÓN DE FIREBASE (versionada, sin credenciales)
   --------------------------------------------------------------------------
   1. Copia este archivo como `js/firebase-config.js` en la misma carpeta.
   2. Pega ahí los valores de Firebase Console.
   3. `js/firebase-config.js` está en .gitignore, así que tus credenciales
      reales nunca se suben al repositorio.

   Valores de referencia del proyecto Comunidad Love (nº 311051033862):
     projectId         → comunidadlove-cbe75
     authDomain        → comunidadlove-cbe75.firebaseapp.com
     messagingSenderId → 311051033862

   NO hace falta `storageBucket`: el proyecto usa el plan Spark (sin tarjeta) y
   no se usa Cloud Storage. Las imágenes se guardan como URL externa o como
   Base64 comprimida dentro del documento de Firestore.

   `apiKey` y `appId` los genera la consola al registrar la app web.
   ========================================================================== */

export const firebaseConfig = {
  apiKey: 'PEGAR_AQUI_apiKey',
  authDomain: 'TU_PROYECTO.firebaseapp.com',
  projectId: 'TU_PROYECTO',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:PEGAR_AQUI_appId'
};

/**
 * Un valor sigue siendo un placeholder si conserva los marcadores de la
 * plantilla o un tramo largo de ceros de ejemplo. Se comprueba sin anclas
 * porque los marcadores pueden aparecer embebidos, por ejemplo dentro del
 * `appId` con formato 1:<proyecto>:web:<hash>.
 */
const PLACEHOLDER_PATTERN = /PEGAR_AQUI|TU_PROYECTO|REEMPLAZAR|:0{4,}|0{8,}/;

export function isFirebaseConfigured() {
  const required = ['apiKey', 'authDomain', 'projectId', 'messagingSenderId', 'appId'];
  return required.every((key) => {
    const value = firebaseConfig[key];
    return typeof value === 'string' && value.trim() !== '' && !PLACEHOLDER_PATTERN.test(value.trim());
  });
}