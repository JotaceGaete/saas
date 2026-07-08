// Pura lógica de decisión para useUnsavedChangesGuard: dado un click sobre un <a href>,
// decide si debe interceptarse (mostrar el diálogo de confirmación) o dejarse pasar tal
// cual (links externos, target=_blank, descargas, clicks con teclas modificadoras, etc).
// Sin dependencias de React ni del DOM real — se le pasan los datos ya extraídos del
// evento/anchor para poder testear con objetos planos.

export function resolveGuardedDestination({
  href,
  target,
  hasDownload = false,
  button = 0,
  metaKey = false,
  ctrlKey = false,
  shiftKey = false,
  altKey = false,
  currentHref,
}) {
  if (button !== 0 || metaKey || ctrlKey || shiftKey || altKey) return null;
  if (!href || href.startsWith('#') || target === '_blank' || hasDownload) return null;

  let url;
  let current;
  try {
    url = new URL(href, currentHref);
    current = new URL(currentHref);
  } catch {
    return null;
  }
  if (url.origin !== current.origin) return null;

  return { pathname: url.pathname, search: url.search, hash: url.hash };
}
