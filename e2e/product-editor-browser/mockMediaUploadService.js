export const appendCacheBust = (url) => url;
export const getProductImageMaxBytes = () => 10 * 1024 * 1024;
export const validateProductImageFile = () => '';
export async function uploadToMediaService(file) { return { url: `data:${file.type};base64,dGh1bWI=` }; }
