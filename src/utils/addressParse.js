/**
 * Desglosa una línea de dirección completa en calle, comuna/ciudad y región.
 * Para Chile (CL): se asume orden común "…, Comuna, Región" con comas.
 */
export function parseAddressByCountry(full, countryCode) {
  const raw = String(full ?? '').trim();
  if (!raw) {
    return { address: '', city: '', region: '' };
  }
  const code = String(countryCode || '').trim().toUpperCase();
  const parts = raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean);

  if (code === 'CL') {
    if (parts.length >= 3) {
      return {
        address: parts.slice(0, -2).join(', '),
        city: parts[parts.length - 2],
        region: parts[parts.length - 1],
      };
    }
    if (parts.length === 2) {
      return { address: parts[0], city: parts[1], region: '' };
    }
    return { address: raw, city: '', region: '' };
  }

  if (parts.length >= 2) {
    return {
      address: parts.slice(0, -1).join(', '),
      city: parts[parts.length - 1],
      region: '',
    };
  }
  return { address: raw, city: '', region: '' };
}

export function normalizeAddressPart(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function addressPartKey(value) {
  return normalizeAddressPart(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function buildFullAddressLine({ address, city, region, country }) {
  const ordered = [address, city, region, country].map(normalizeAddressPart).filter(Boolean);
  const deduped = [];
  const seen = new Set();

  for (const part of ordered) {
    const key = addressPartKey(part);
    if (!key || seen.has(key)) continue;
    if (deduped.some((existing) => {
      const existingKey = addressPartKey(existing);
      return existingKey.includes(key) || key.includes(existingKey);
    })) {
      continue;
    }
    seen.add(key);
    deduped.push(part);
  }

  return deduped.join(', ');
}
