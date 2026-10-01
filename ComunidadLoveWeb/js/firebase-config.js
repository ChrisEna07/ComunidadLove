/* ==========================================================================
   CONFIGURACIÓN DE FIREBASE - COMUNIDAD LOVE
   --------------------------------------------------------------------------
   Proyecto: comunidadlove-cbe75   (nº de proyecto: 311051033862)

   Configuración obtenida de Firebase Console > Configuración > Tus aplicaciones
   (app Web "Comunidad Love Web").

   Este proyecto NO usa Cloud Storage (plan Spark sin tarjeta): las imágenes se
   guardan como URL externa o como cadena Base64 comprimida dentro del propio
   documento de Firestore. Por eso no hace falta `storageBucket` y no hay que
   crear un bucket en la consola.

   NOTA DE SEGURIDAD
   -----------------
   La `apiKey` de una app Web de Firebase está pensada para viajar en el
   cliente: no es una credencial secreta y no protege nada por sí sola. La
   seguridad real la dan `firestore.rules` y `authDomain`. Aun así, este archivo
   está en .gitignore para no subirlo por descuido; la versión versionada es
   `firebase-config.example.js`.
   ========================================================================== */

export const firebaseConfig = {
  apiKey: 'AIzaSyDeGyzjhjTB1IHfNZ9VYhXGh6fofOzo9mk',
  authDomain: 'comunidadlove-cbe75.firebaseapp.com',
  projectId: 'comunidadlove-cbe75',
  messagingSenderId: '311051033862',
  appId: '1:311051033862:web:17127d96c610a45b0f5287',
  measurementId: 'G-Q4W377M5M7'
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

export default firebaseConfig;