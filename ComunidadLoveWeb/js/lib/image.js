/* ==========================================================================
   IMÁGENES: COMPRESIÓN EN EL NAVEGADOR Y ALMACENAMIENTO EN FIRESTORE
   --------------------------------------------------------------------------
   El proyecto usa el plan Spark (sin tarjeta de crédito), así que no se
   dispone de Cloud Storage. En su lugar las imágenes viajan en dos formatos:

     1. URL externa  → https://…  (tal cual la pega el usuario)
     2. Archivo local → data:image/webp;base64,…  (subido y comprimido aquí)

   Para no agotar el límite de 1 MiB por documento de Firestore, la imagen
   local se redimensiona a 800 px como máximo y se recomprime hasta pesar
   menos de 200 KB en Base64.
   ========================================================================== */

export const IMAGE_LIMITS = {
  /** Lado mayor máximo tras escalar. */
  maxDimension: 800,
  /** Calidad inicial del encoder. */
  quality: 0.7,
  /** Tope del tamaño de la cadena `data:` completa, en bytes. */
  maxDataUrlBytes: 200 * 1024,
  /** Tope del archivo original que acepta el navegador. */
  maxInputBytes: 12 * 1024 * 1024
};

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/bmp'];

/** Escala objetivo → calidad. Se prueba en orden hasta que quepa en el tope. */
const CANDIDATES = [
  [800, 0.72],
  [800, 0.6],
  [640, 0.62],
  [560, 0.55],
  [480, 0.5],
  [384, 0.45],
  [288, 0.4],
  [192, 0.35]
];

/* --------------------------------------------------------------------------
   UTILIDADES DE FORMATO
   -------------------------------------------------------------------------- */

/** ¿El valor es una imagen embebida en Base64? */
export function isDataUrl(value) {
  return /^data:image\//i.test(String(value || '').trim());
}

/** ¿El valor es una URL http(s) utilizable en `src`? */
export function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

/**
 * Las cadenas `data:` son ASCII puro, así que su longitud en caracteres
 * equivale a su tamaño en bytes.
 */
export function dataUrlBytes(value) {
  return String(value || '').length;
}

/** Texto corto para mostrar junto a una imagen ya guardada. */
export function describeImageSource(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'Sin imagen';
  if (isDataUrl(raw)) return `Imagen embebida · ${Math.round(dataUrlBytes(raw) / 1024)} KB`;
  if (isHttpUrl(raw)) return 'Imagen externa';
  return 'Formato no reconocido';
}

/**
 * Error de validación con mensaje para el usuario. Los launched desde la
 * compresión se propagan sin envolverse en un texto genérico.
 */
export class ImageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImageError';
  }
}

/**
 * Convierte enlaces compartidos de Google Drive a URLs de imagen directas.
 */
export function normalizeImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  const driveMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || trimmed.match(/id=([a-zA-Z0-9_-]+)/);
  if (driveMatch && driveMatch[1]) {
    return `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w1000`;
  }
  return trimmed;
}

/**
 * Normaliza rutas relativas de Assets para que resuelvan tanto en raíz (/)
 * como dentro del subdirectorio (/admin/).
 */
export function resolveAssetUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (/^(\.\/)?Assets\//i.test(trimmed)) {
    if (typeof window !== 'undefined' && window.location && window.location.pathname.includes('/admin')) {
      return trimmed.replace(/^(\.\/)?Assets\//i, '../Assets/');
    }
    return trimmed.replace(/^(\.\/)?Assets\//i, './Assets/');
  }
  return trimmed;
}

/**
 * Valida un valor destined a Firestore, sin depender del navegador.
 * Es la barrera que se ejecuta en los servicios: aunque alguien escriba
 * directamente contra Firestore desde otro cliente, el documento no crece.
 *
 * @param {string} value
 * @param {{ maxDataUrlBytes?: number, field?: string }} [options]
 * @returns {string} valor limpio ('' si no hay imagen)
 */
export function sanitizeImageValue(value, options = {}) {
  const maxBytes = options.maxDataUrlBytes || IMAGE_LIMITS.maxDataUrlBytes;
  const label = options.field ? ` de ${options.field}` : '';
  let raw = String(value || '').trim();

  if (!raw) return '';

  if (isDataUrl(raw)) {
    if (!/^data:image\/(webp|jpe?g|png|gif);base64,[a-z0-9+/=\s]+$/i.test(raw)) {
      throw new ImageError(`La imagen${label} tiene un formato Base64 no admitido.`);
    }
    const bytes = dataUrlBytes(raw);
    if (bytes > maxBytes) {
      const limit = Math.round(maxBytes / 1024);
      throw new ImageError(
        `La imagen${label} ocupa ${Math.round(bytes / 1024)} KB y el máximo es ${limit} KB. ` +
          'Reduce el tamaño o pega una URL.'
      );
    }
    return raw;
  }

  // Normalizar URLs de Google Drive antes de persistir
  if (isHttpUrl(raw)) {
    raw = normalizeImageUrl(raw);
  } else {
    throw new ImageError(
      `La imagen${label} debe ser una dirección que empiece por http:// o https://.`
    );
  }

  // Una URL falsa gigante también rompería el documento: mismo tope.
  if (raw.length > 2048) {
    throw new ImageError(`La dirección${label} es demasiado larga (máximo 2048 caracteres).`);
  }
  return raw;
}

/* --------------------------------------------------------------------------
   RESILIENCIA DE RENDER
   --------------------------------------------------------------------------
   Una URL externa puede caerse o expirar. El evento `error` no se propaga en
   el DOM, así que se captura a nivel de documento y se usa `data-img-fallback`
   para retirarla con elegancia, sin necesidad de handlers inline.
   -------------------------------------------------------------------------- */

let fallbackInstalled = false;

export function installImageFallback(root = document) {
  if (fallbackInstalled || !root || typeof root.addEventListener !== 'function') return;
  fallbackInstalled = true;

  root.addEventListener(
    'error',
    (event) => {
      const image = event.target;
      if (!image || image.tagName !== 'IMG') return;

      // Auto-recuperación de 404 por ruta relativa en /admin/
      if (image.src && image.src.includes('/admin/Assets/') && !image.dataset.retriedAsset) {
        image.dataset.retriedAsset = '1';
        image.src = image.src.replace('/admin/Assets/', '/Assets/');
        return;
      }

      const mode = image.dataset ? image.dataset.imgFallback : '';
      if (!mode) return;

      if (mode === 'preview') {
        const box = image.closest('.clg-image-preview');
        if (box) box.classList.add('is-broken');
      }
      image.remove();
    },
    true
  );
}

/** ¿El navegador puede codificar a WebP? */
function supportsWebp() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
}

/* --------------------------------------------------------------------------
   DECODIFICACIÓN
   -------------------------------------------------------------------------- */

function loadViaImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('El navegador no pudo leer esa imagen.'));
    };
    image.src = url;
  });
}

async function decode(file) {
  // createImageBitmap respeta la orientación EXIF: sin esto, las fotos
  // tomadas con el móvil en vertical saldrían rotadas.
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (error) {
      console.warn('[CL] createImageBitmap falló, se usa <img>:', error);
    }
  }
  return loadViaImageElement(file);
}

function release(source) {
  if (source && typeof source.close === 'function') source.close();
}

/* --------------------------------------------------------------------------
   CODIFICACIÓN
   -------------------------------------------------------------------------- */

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo procesar el archivo de imagen.'));
    reader.readAsDataURL(blob);
  });
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mime, quality);
  });
}

function targetSize(width, height, maxSide) {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width: Math.max(1, width), height: Math.max(1, height) };
  const ratio = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio))
  };
}

/* --------------------------------------------------------------------------
   API PÚBLICA
   -------------------------------------------------------------------------- */

/**
 * Valida el blob final y lo convierte a `data:`. Rechaza con un mensaje claro
 * si, aun comprimido, no cabe dentro del tope.
 */
async function finish(blob, mime, size, originalBytes, maxBytes, report) {
  const estimated = Math.round((blob.size * 4) / 3) + 32;
  if (estimated > maxBytes) {
    throw new ImageError(
      `La imagen sigue pesando ${Math.round(blob.size / 1024)} KB. ` +
        'Elige una imagen más sencilla o pega una URL.'
    );
  }
  const dataUrl = await blobToDataUrl(blob);
  if (dataUrlBytes(dataUrl) > maxBytes) {
    throw new ImageError(
      `La imagen comprimida ocupa ${Math.round(dataUrlBytes(dataUrl) / 1024)} KB y ` +
        `el máximo es ${Math.round(maxBytes / 1024)} KB. Usa una URL.`
    );
  }
  report(100);
  return {
    dataUrl,
    width: size.width,
    height: size.height,
    mime,
    bytes: dataUrlBytes(dataUrl),
    originalBytes
  };
}

/**
 * Comprime una imagen del dispositivo y devuelve un `data:` listo para Firestore.
 * Lanza Error con un mensaje legible si no es posible llegar al tope de 200 KB.
 *
 * @param {File} file
 * @param {{ onProgress?: (percent:number) => void, maxDimension?:number,
 *           maxDataUrlBytes?:number }} [options]
 * @returns {Promise<{ dataUrl:string, width:number, height:number,
 *                     mime:string, bytes:number, originalBytes:number }>}
 */
export async function compressImageFile(file, options = {}) {
  const maxDimension = options.maxDimension || IMAGE_LIMITS.maxDimension;
  const maxBytes = options.maxDataUrlBytes || IMAGE_LIMITS.maxDataUrlBytes;
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  const report = (percent) => onProgress && onProgress(percent);

  if (!file) throw new Error('Selecciona una imagen.');
  if (!ACCEPTED_TYPES.includes(String(file.type || '').toLowerCase())) {
    throw new Error('Formato no permitido. Usa JPG, PNG, WEBP, AVIF o GIF.');
  }
  if (file.size > IMAGE_LIMITS.maxInputBytes) {
    const mb = Math.round(IMAGE_LIMITS.maxInputBytes / (1024 * 1024));
    throw new Error(`La imagen supera los ${mb} MB. Optimízala e inténtalo de nuevo.`);
  }

  report(8);
  const source = await decode(file);
  const sourceWidth = source.width || source.naturalWidth || 0;
  const sourceHeight = source.height || source.naturalHeight || 0;

  if (!sourceWidth || !sourceHeight) {
    release(source);
    throw new Error('No pudimos obtener las dimensiones de la imagen.');
  }

  const preferredMime = supportsWebp() ? 'image/webp' : 'image/jpeg';
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    release(source);
    throw new Error('Este navegador no permite comprimir imágenes.');
  }

  let best = null;

  try {
    for (let index = 0; index < CANDIDATES.length; index += 1) {
      const [maxSide, quality] = CANDIDATES[index];
      const size = targetSize(sourceWidth, sourceHeight, Math.min(maxSide, maxDimension));
      canvas.width = size.width;
      canvas.height = size.height;

      // Fondo blanco: sin esto, las zonas transparentes se vuelven negras al
      // convertir a JPEG o WebP.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size.width, size.height);
      context.drawImage(source, 0, 0, size.width, size.height);

      let blob = await canvasToBlob(canvas, preferredMime, quality);
      let mime = preferredMime;

      if (!blob || blob.type !== preferredMime) {
        // El navegador no admite el códec pedido: cae a JPEG.
        mime = 'image/jpeg';
        blob = await canvasToBlob(canvas, mime, quality);
      }
      if (!blob) continue;

      if (!best || blob.size < best.size) best = { size, blob, mime };

      report(Math.round(15 + (index / CANDIDATES.length) * 80));

      // El data URL crece ~33 % respecto al binario: se comprueba el binario
      // con margen antes de construir la cadena.
      if (blob.size <= maxBytes * 0.72) {
        return await finish(blob, mime, size, file.size, maxBytes, report);
      }
    }

    if (best) return await finish(best.blob, best.mime, best.size, file.size, maxBytes, report);

    throw new Error('No se pudo comprimir la imagen.');
  } catch (error) {
    // Los mensajes de `finish` ya son accionables ("sigue pesando X KB…"), así
    // que se propagan tal cual en vez de ocultarlos tras un texto genérico.
    if (error instanceof ImageError) throw error;
    console.error('[CL] Error comprimiendo la imagen:', error);
    throw new Error('Hubo un problema al comprimir la imagen. Prueba con otra o pega una URL.');
  } finally {
    release(source);
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Alias de compatibilidad para clientes de la web pública.
 */
export { compressImageFile as compressFileToDataUrl };