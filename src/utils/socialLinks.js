function cleanValue(value) {
  return String(value ?? '').trim();
}

function removeTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function withImplicitHttps(value) {
  if (/^www\./i.test(value)) return `https://${value}`;
  return value;
}

function toUrlOrNull(value) {
  const cleaned = withImplicitHttps(cleanValue(value));
  if (!cleaned) return null;
  try {
    return new URL(cleaned);
  } catch {
    return null;
  }
}

export function normalizeSocialUrl(value, baseUrl) {
  const raw = cleanValue(value);
  if (!raw) return null;

  const parsed = toUrlOrNull(raw);
  if (parsed) return removeTrailingSlash(parsed.toString());

  const handle = raw.replace(/^@+/, '').trim();
  return handle ? `${removeTrailingSlash(baseUrl)}/${handle}` : null;
}

export function extractTikTokHandle(value) {
  const raw = cleanValue(value);
  if (!raw) return null;

  const parsed = toUrlOrNull(raw);
  let candidate = raw;

  if (parsed) {
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    if (!host.endsWith('tiktok.com')) return null;

    const parts = parsed.pathname
      .split('/')
      .map((part) => part.trim())
      .filter(Boolean);

    const directHandle = parts.find((part) => part.startsWith('@'));
    if (directHandle) candidate = directHandle;
    else if (parts.length === 1 && !['404', 'tag', 'music', 'discover'].includes(parts[0].toLowerCase())) candidate = parts[0];
    else return null;
  }

  const normalized = candidate.replace(/^@+/, '').trim();
  if (!normalized) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(normalized)) return null;
  return normalized;
}

export function normalizeTikTokUrl(value) {
  const handle = extractTikTokHandle(value);
  return handle ? `https://www.tiktok.com/@${handle}` : null;
}
