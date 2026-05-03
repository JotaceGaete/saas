function getFileBaseName(fileName = 'upload') {
  return String(fileName).replace(/\.[^.]+$/, '') || 'upload';
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo procesar la imagen'));
    };

    img.src = objectUrl;
  });
}

async function renderVariantFromImage(file, img, variant, { force = false } = {}) {
  const keepOriginalPng = variant.keepPng === true && file.type === 'image/png';
  const preferredMime = keepOriginalPng ? 'image/png' : variant.outputMime;
  const preferredExtension = keepOriginalPng ? 'png' : variant.extension;

  const originalWidth = img.naturalWidth || 0;
  const originalHeight = img.naturalHeight || 0;
  if (!originalWidth || !originalHeight) return file;

  const longSide = Math.max(originalWidth, originalHeight);
  const ratio = longSide > variant.maxLongSide ? variant.maxLongSide / longSide : 1;
  const width = Math.max(1, Math.round(originalWidth * ratio));
  const height = Math.max(1, Math.round(originalHeight * ratio));

  const shouldReencode =
    force ||
    width !== originalWidth ||
    height !== originalHeight ||
    String(file.type || '').toLowerCase() !== preferredMime;

  if (!shouldReencode) return file;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: keepOriginalPng });
  if (!ctx) return file;

  if (!keepOriginalPng) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(img, 0, 0, width, height);

  let blob = await canvasToBlob(canvas, preferredMime, variant.quality);
  let outputMime = preferredMime;
  let outputExtension = preferredExtension;

  if (!blob && preferredMime === 'image/webp') {
    blob = await canvasToBlob(canvas, 'image/jpeg', variant.quality);
    outputMime = 'image/jpeg';
    outputExtension = 'jpg';
  }

  if (!blob) return file;

  const nextFile = new File([blob], `${getFileBaseName(file.name)}.${outputExtension}`, { type: outputMime });
  return !force && nextFile.size >= file.size ? file : nextFile;
}

const IMAGE_UPLOAD_VARIANTS = {
  cover: {
    maxLongSide: 1200,
    quality: 0.8,
    outputMime: 'image/webp',
    extension: 'webp',
    keepPng: false,
  },
  logo: {
    maxLongSide: 512,
    quality: 0.9,
    outputMime: 'image/webp',
    extension: 'webp',
    keepPng: true,
  },
  product: {
    maxLongSide: 1200,
    quality: 0.8,
    outputMime: 'image/webp',
    extension: 'webp',
    keepPng: false,
  },
};

export const PRODUCT_MAIN_IMAGE_VARIANT = {
  maxLongSide: 1200,
  quality: 0.8,
  outputMime: 'image/webp',
  extension: 'webp',
  keepPng: false,
};

export const PRODUCT_CARD_THUMBNAIL_VARIANT = {
  maxLongSide: 420,
  quality: 0.7,
  outputMime: 'image/webp',
  extension: 'webp',
  keepPng: false,
};

/**
 * Redimensiona y comprime una imagen antes de subirla a R2.
 *
 * Reglas:
 * - Productos y portadas se convierten a WebP cuando el navegador lo soporta.
 * - El lado mas largo se limita para evitar subidas sobredimensionadas.
 * - Dibujar en canvas elimina metadata del archivo resultante.
 * - Logos PNG pueden conservar su transparencia original.
 *
 * @param {File} file
 * @param {'logo'|'cover'|'product'} type
 * @returns {Promise<File>}
 */
export async function compressImageForUpload(file, type) {
  if (!(file instanceof File) && !(file instanceof Blob)) return file;
  const img = await loadImageFromFile(file);
  const variant = IMAGE_UPLOAD_VARIANTS[type] ?? IMAGE_UPLOAD_VARIANTS.product;
  return renderVariantFromImage(file, img, variant);
}

/**
 * Genera los dos assets persistidos del producto:
 * - main: para modal/detalle
 * - thumbnail: para cards/listados mobile
 *
 * @param {File} file
 * @returns {Promise<{mainFile: File, thumbnailFile: File}>}
 */
export async function generateProductImageUploadSet(file) {
  if (!(file instanceof File) && !(file instanceof Blob)) {
    throw new Error('Selecciona una imagen valida antes de subir.');
  }

  const img = await loadImageFromFile(file);
  const mainFile = await renderVariantFromImage(file, img, PRODUCT_MAIN_IMAGE_VARIANT, { force: true });
  const thumbnailFile = await renderVariantFromImage(file, img, PRODUCT_CARD_THUMBNAIL_VARIANT, { force: true });

  return {
    mainFile,
    thumbnailFile,
  };
}

/**
 * Convierte imagenes AVIF a JPEG para entornos donde no conviene mantener ese formato.
 * @param {File} file
 * @returns {Promise<File>} Mismo archivo si no requiere conversion, o nuevo File en JPEG
 */
export function convertUnsupportedImageToJpeg(file) {
  const type = (file?.type || '').toLowerCase();
  if (type !== 'image/avif') return Promise.resolve(file);

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const name = file.name.replace(/\.(avif|webp)$/i, '.jpg');
          resolve(new File([blob], name, { type: 'image/jpeg' }));
        },
        'image/jpeg',
        0.92
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo procesar la imagen'));
    };
    img.src = url;
  });
}
