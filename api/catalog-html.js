import { GET as seoGet } from './seo.js';

function buildCatalogRequestUrl(requestUrl) {
  const url = new URL(requestUrl);
  const match = url.pathname.match(/^\/catalogo\/([^/]+)\/?$/i);
  const slugFromPath = match?.[1] ? decodeURIComponent(match[1]) : '';

  if (slugFromPath && !url.searchParams.get('slug')) {
    url.searchParams.set('slug', slugFromPath);
  }
  if (!url.searchParams.get('publicPath')) {
    url.searchParams.set('publicPath', 'catalogo');
  }
  return url.toString();
}

export async function GET(request) {
  const forwardedRequest = new Request(buildCatalogRequestUrl(request.url), request);
  return seoGet(forwardedRequest);
}
