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
