import { getCountryConfig, getCountryMoneyFormat } from '../config/countryConfig';

/** Países donde el precio de catálogo no muestra decimales (regla comercial). */
export const INTEGER_DISPLAY_COUNTRIES = new Set(['CL', 'AR', 'CO', 'PY']);

export type FormatPriceByCountryOptions = {
  /** Fuente principal para reglas de decimales y símbolo. */
  countryCode?: string | null;
  /** ISO 4217; si falta se toma del país (countryConfig). */
  currency?: string | null;
  /** BCP 47; si falta se toma del país. */
  locale?: string | null;
  /** Incluir símbolo/composición de catálogo (default true). */
  useSymbol?: boolean;
  /** Mostrar código ISO (CLP, COP…) — vistas internas / billing detallado. */
  showCurrencyCode?: boolean;
  /** En monedas con decimales, ocultar ,00 en enteros. */
  trimTrailingZeros?: boolean;
};

const CURRENCY_TO_COUNTRY: Record<string, string> = {
  CLP: 'CL',
  ARS: 'AR',
  COP: 'CO',
  MXN: 'MX',
  PEN: 'PE',
  CRC: 'CR',
  PYG: 'PY',
  BOB: 'BO',
  GTQ: 'GT',
  UYU: 'UY',
  EUR: 'ES',
};

const LOCALE_HINT_TO_COUNTRY: Record<string, string> = {
  'es-CL': 'CL',
  'es-AR': 'AR',
  'es-CO': 'CO',
  'es-MX': 'MX',
  'es-PE': 'PE',
  'es-CR': 'CR',
  'es-PY': 'PY',
  'es-BO': 'BO',
  'es-GT': 'GT',
  'es-UY': 'UY',
  'es-EC': 'EC',
  'es-PA': 'PA',
  'en-US': 'US',
};

/**
 * Inferencia débil por moneda (sin país en BD). Último recurso.
 */
export function inferCountryCodeFromCurrency(currency: string | null | undefined): string | null {
  const c = String(currency || '')
    .trim()
    .toUpperCase();
  return CURRENCY_TO_COUNTRY[c] || null;
}

export function inferCountryCodeFromLocale(locale: string | null | undefined): string | null {
  const loc = String(locale || '').trim();
  return LOCALE_HINT_TO_COUNTRY[loc] || null;
}

/**
 * Prioridad: countryCode explícito → moneda → locale.
 */
export function resolveCountryCodeForFormatting(
  countryCode: string | null | undefined,
  currency: string | null | undefined,
  locale: string | null | undefined,
): string | null {
  const raw = String(countryCode || '').trim();
  if (raw) {
    const cfg = getCountryConfig(raw);
    if (cfg.code) return cfg.code;
  }
  return inferCountryCodeFromCurrency(currency) || inferCountryCodeFromLocale(locale);
}

function usesIntegerDisplay(countryCode: string | null | undefined): boolean {
  if (!countryCode) return false;
  return INTEGER_DISPLAY_COUNTRIES.has(String(countryCode).toUpperCase());
}

/**
 * Formato unificado: Intl.NumberFormat; reglas de decimales por **país** (no solo moneda).
 */
export function formatPriceByCountry(
  amount: number | string,
  options: FormatPriceByCountryOptions = {},
): string {
  const n = Number(amount);
  const value = Number.isFinite(n) ? n : 0;

  const resolvedCountry = resolveCountryCodeForFormatting(
    options.countryCode,
    options.currency,
    options.locale,
  );

  const cfg = getCountryConfig(resolvedCountry);
  const currency = String(options.currency || cfg.currency || 'USD')
    .trim()
    .toUpperCase();
  const locale = String(options.locale || cfg.locale || 'en-US').trim();

  const useSymbol = options.useSymbol !== false;
  const showCode = options.showCurrencyCode === true;
  const integerDisplay = usesIntegerDisplay(resolvedCountry);

  const minF = integerDisplay ? 0 : 2;
  const maxF = integerDisplay ? 0 : 2;
  const rounded = integerDisplay ? Math.round(value) : value;

  if (showCode) {
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        currencyDisplay: 'code',
        minimumFractionDigits: minF,
        maximumFractionDigits: maxF,
      }).format(rounded);
    } catch {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        currencyDisplay: 'code',
        minimumFractionDigits: minF,
        maximumFractionDigits: maxF,
      }).format(rounded);
    }
  }

  // Catálogo / público: sin "COP", "CLP" en string
  if (!useSymbol) {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: minF,
      maximumFractionDigits: maxF,
      useGrouping: true,
    }).format(rounded);
  }

  const money = getCountryMoneyFormat(resolvedCountry);
  const symbol = cfg.symbol || money.symbol || '$';

  // Enteros (CL, AR, CO, PY): "$ 40.000" — solo número + símbolo regional
  if (integerDisplay) {
    const numPart = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      useGrouping: true,
    }).format(Math.round(value));
    if (symbol === '$') {
      return `$ ${numPart}`;
    }
    if (symbol === 'US$') {
      return `US$ ${numPart}`;
    }
    return `${symbol} ${numPart}`;
  }

  // Decimales: MX, US, PE, CR, …
  let numOut = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(rounded);

  if (options.trimTrailingZeros && Number.isInteger(rounded)) {
    numOut = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      useGrouping: true,
    }).format(rounded);
  }

  // USD display US: "$49.90" (sin espacio, estilo en-US)
  if (currency === 'USD' && (resolvedCountry === 'US' || locale === 'en-US')) {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: Number.isInteger(rounded) && options.trimTrailingZeros ? 0 : 2,
        maximumFractionDigits: 2,
      }).format(rounded);
    } catch {
      /* fall through */
    }
  }

  // LATAM con $ (MXN, etc.): "$ 199.90"
  if (symbol === '$' && locale.startsWith('es')) {
    return `$ ${numOut}`;
  }

  if (symbol === 'US$') {
    return `US$${locale.startsWith('en') ? '' : ' '}${numOut}`;
  }

  // PEN S/, CRC ₡, …
  if (symbol.length > 1 || ['S/', '₡', '₲', 'Q', 'Bs'].some((s) => symbol.startsWith(s))) {
    return `${symbol} ${numOut}`;
  }

  return `${symbol}${numOut}`;
}

export type FormatCatalogPriceArgs = {
  countryCode?: string | null;
  currency?: string | null;
  locale?: string | null;
};

/**
 * Precios de catálogo público (sin códigos ISO en el texto).
 * `countryCode` tiene prioridad; si falta, se infiere por moneda/locale.
 */
export function formatCatalogPrice(
  amount: number | string,
  countryCode?: string | null,
  currencyOrOptions?: string | null | FormatCatalogPriceArgs,
): string {
  let currency: string | null | undefined;
  let locale: string | null | undefined;
  let cc = countryCode;

  if (currencyOrOptions && typeof currencyOrOptions === 'object') {
    currency = currencyOrOptions.currency;
    locale = currencyOrOptions.locale;
    cc = countryCode ?? currencyOrOptions.countryCode ?? null;
  } else {
    currency = currencyOrOptions as string | null | undefined;
  }

  return formatPriceByCountry(amount, {
    countryCode: cc,
    currency,
    locale,
    useSymbol: true,
    showCurrencyCode: false,
    trimTrailingZeros: false,
  });
}
