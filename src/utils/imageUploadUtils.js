/**
 * Redimensiona y comprime una imagen antes de subirla a R2.
 *
 * Criterios de seguridad:
 * - Si el archivo ya es pequeño (bajo el umbral), se devuelve sin tocar.
 * - Si el canvas falla o el resultado es más grande que el original, se devuelve el original.
 * - Logos PNG conservan canal alfa (no se convierten a JPEG).
 * - No modifica el formato si no hay necesidad.
 *
 * @param {File} file
 * @param {'logo'|'cover'|'product'} type
 * @returns {Promise<File>}
 */
export function compressImageForUpload(file, type) {
  const SKIP_BYTES = { cover: 300_000, logo: 100_000, product: 200_000 };
  const MAX_PX    = { cover: { w: 1600, h: 900 }, logo: { w: 512, h: 512 }, product: { w: 1000, h: 1000 } };
  const QUALITY   = { cover: 0.85, logo: 0.90, product: 0.85 };

  const skipBytes = SKIP_BYTES[type] ?? SKIP_BYTES.product;
  if (!file || file.size <= skipBytes) return Promise.resolve(file);

  const { w: maxW, h: maxH } = MAX_PX[type] ?? MAX_PX.product;
  // Logos PNG pueden tener transparencia — mantener PNG. Todo lo demás → JPEG.
  const keepPng = type === 'logo' && file.type === 'image/png';
  const outputMime = keepPng ? 'image/png' : 'image/jpeg';
  const quality = QUALITY[type] ?? 0.85;

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let w = img.naturalWidth;
      let h = img.naturalHeight;

      // Si ya entra en los límites, no hace falta canvas.
      if (w <= maxW && h <= maxH) { resolve(file); return; }

      const ratio = Math.min(maxW / w, maxH / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);

      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }

      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          // Si el blob es nulo o más grande que el original, conservar original.
          if (!blob || blob.size >= file.size) { resolve(file); return; }
          const ext  = outputMime === 'image/png' ? 'png' : 'jpg';
          const name = file.name.replace(/\.[^.]+$/, `.${ext}`);
          resolve(new File([blob], name, { type: outputMime }));
        },
        outputMime,
        quality,
      );
    };

    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}

/**
 * Convierte imágenes AVIF (y opcionalmente WebP) a JPEG para subida a storage
 * que no acepta esos formatos (ej. Supabase Storage).
 * @param {File} file
 * @returns {Promise<File>} Mismo archivo si no requiere conversión, o nuevo File en JPEG
 */
export function convertUnsupportedImageToJpeg(file) {
  const type = (file?.type || '').toLowerCase();
  if (type !== 'image/avif' && type !== 'image/webp') return Promise.resolve(file);

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
