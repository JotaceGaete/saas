import { updateProduct } from './waBusinessService';

function getMediaServiceBaseUrl() {
  const baseUrl = String(import.meta.env.VITE_MEDIA_SERVICE_URL || '').trim().replace(/\/$/, '');
  if (!baseUrl) {
    throw new Error('Falta configurar VITE_MEDIA_SERVICE_URL para usar video.');
  }
  return baseUrl;
}

export const uploadProductVideo = async (file, businessId, productId) => {
  const mediaServiceBaseUrl = getMediaServiceBaseUrl();
  const form = new FormData();
  form.append('file', file);
  form.append('businessId', businessId);
  form.append('productId', productId);
  const res = await fetch(`${mediaServiceBaseUrl}/upload-video`, { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || 'Error al subir el video');
  return data;
};

export const deleteRemoteMedia = async (paths) => {
  const filtered = (paths || []).filter(Boolean);
  if (!filtered.length) return;
  const mediaServiceBaseUrl = getMediaServiceBaseUrl();
  const res = await fetch(`${mediaServiceBaseUrl}/delete-media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: filtered }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || 'Error al eliminar el media remoto');
  return data;
};

export const replaceProductVideo = async ({ file, product, businessId }) => {
  const uploaded = await uploadProductVideo(file, businessId, product.id);
  const { error } = await updateProduct(product.id, {
    videoUrl: uploaded.video_url,
    videoThumbnailUrl: uploaded.thumbnail_url,
    videoPath: uploaded.video_path,
    videoThumbnailPath: uploaded.thumbnail_path,
  });
  if (error) throw new Error(error.message || 'Error al guardar el video en la base de datos');
  const oldPaths = [product.videoPath, product.videoThumbnailPath].filter(Boolean);
  if (oldPaths.length) {
    deleteRemoteMedia(oldPaths).catch(() => {});
  }
  return uploaded;
};

export const removeProductVideo = async (productId, product) => {
  const paths = [product.videoPath, product.videoThumbnailPath].filter(Boolean);
  if (paths.length) await deleteRemoteMedia(paths);
  const { error } = await updateProduct(productId, {
    videoUrl: null,
    videoThumbnailUrl: null,
    videoPath: null,
    videoThumbnailPath: null,
  });
  if (error) throw new Error(error.message || 'Error al limpiar el video en la base de datos');
};
