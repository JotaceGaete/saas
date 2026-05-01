function getFileBaseName(fileName = 'upload') {
  return String(fileName).replace(/\.[^.]+$/, '') || 'upload';
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
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
export function compressImageForUpload(file, type) {
  if (!(file instanceof File) && !(file instanceof Blob)) return Promise.resolve(file);

  const variant = IMAGE_UPLOAD_VARIANTS[type] ?? IMAGE_UPLOAD_VARIANTS.product;
  const keepOriginalPng = variant.keepPng === true && file.type === 'image/png';
  const preferredMime = keepOriginalPng ? 'image/png' : variant.outputMime;
  const preferredExtension = keepOriginalPng ? 'png' : variant.extension;

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = async () => {
      URL.revokeObjectURL(objectUrl);

      const originalWidth = img.naturalWidth || 0;
      const originalHeight = img.naturalHeight || 0;
      if (!originalWidth || !originalHeight) {
        resolve(file);
        return;
      }

      const longSide = Math.max(originalWidth, originalHeight);
      const ratio = longSide > variant.maxLongSide ? variant.maxLongSide / longSide : 1;
      const width = Math.max(1, Math.round(originalWidth * ratio));
      const height = Math.max(1, Math.round(originalHeight * ratio));

      const shouldReencode =
        width !== originalWidth ||
        height !== originalHeight ||
        String(file.type || '').toLowerCase() !== preferredMime;

      if (!shouldReencode) {
        resolve(file);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: keepOriginalPng });
      if (!ctx) {
        resolve(file);
        return;
      }

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

      if (!blob) {
        resolve(file);
        return;
      }

      const nextFile = new File([blob], `${getFileBaseName(file.name)}.${outputExtension}`, { type: outputMime });
      resolve(nextFile.size < file.size ? nextFile : file);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
  });
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
