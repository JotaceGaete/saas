import { supabase } from '../lib/supabase';
import { compressImageForUpload, generateProductImageUploadSet } from '../utils/imageUploadUtils';
import { getValidToken } from '../lib/auth/getValidToken';
import { getPlanLimits } from '../constants/plans';
import { getTrialEndDateFrom } from '../constants/trial';
import { getMarketCodeByCountry } from '../lib/market/routing';
import { getCountryConfig, COUNTRY_CODES } from '../config/countryConfig';
import { normalizeSocialUrl as normalizeSharedSocialUrl, normalizeTikTokUrl } from '../utils/socialLinks';
import { uploadToMediaService } from './mediaUploadService';
import { trackLoopsEvent } from './loopsClient';

const TRACKING_AUTH_FAILURE_COOLDOWN_MS = 10 * 60 * 1000;
const trackingAuthFailureCache = new Map();
const trackingInflight = new Set();
const serviceWarningCache = new Map();
const FIRST_PRODUCT_EVENT_PREFIX = 'walinka:first_product_created:';

function logServiceWarningOnce(key, message, extra = undefined) {
  if (serviceWarningCache.get(key)) return;
  serviceWarningCache.set(key, true);
  if (extra !== undefined) {
    console.warn(message, extra);
    return;
  }
  console.warn(message);
}

function shouldSkipTrackingByRecentAuthFailure(key) {
  const until = trackingAuthFailureCache.get(key) ?? 0;
  return until > Date.now();
}

function markTrackingAuthFailure(key) {
  trackingAuthFailureCache.set(key, Date.now() + TRACKING_AUTH_FAILURE_COOLDOWN_MS);
}

// Helpers

/** Normaliza teléfono a solo dígitos para comparación (conflict-safe en wa_customers). */
const normalizePhone = (phone) => {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  return digits || null;
};

/** E.164: solo dígitos tras + (evita espacios y separadores locales). */
/**
 * Normaliza un valor de red social a URL completa.
 * Acepta username (con o sin @) o URL completa.
 * Devuelve null si el valor está vacío.
 */
function normalizeSocialUrl(value, baseUrl) {
  const v = String(value ?? '').trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v.replace(/\/$/, '');
  // handle → username (quitar @ si viene)
  const handle = v.replace(/^@/, '').trim();
  return handle ? `${baseUrl}/${handle}` : null;
}

function normalizeWhatsappForStorage(value) {
  if (value === undefined || value === null) return value;
  const t = String(value).trim();
  if (!t) return '';
  const digits = t.replace(/\D/g, '');
  if (!digits) return '';
  return `+${digits}`;
}

const SUPPORTED_COUNTRY_CODES = new Set(['AR', 'BO', 'BR', 'CL', 'CO', 'CR', 'EC', 'GT', 'MX', 'PA', 'PE', 'PY', 'UY']);

function normalizeCountryCode(value, currencyHint, options = {}) {
  const raw = (value || '').toString().trim().toUpperCase();
  if (SUPPORTED_COUNTRY_CODES.has(raw)) return raw;

  const aliases = {
    ARGENTINA: 'AR',
    CHILE: 'CL',
    BOLIVIA: 'BO',
    BRASIL: 'BR',
    BRAZIL: 'BR',
    COLOMBIA: 'CO',
    'COSTA RICA': 'CR',
    ECUADOR: 'EC',
    GUATEMALA: 'GT',
    MEXICO: 'MX',
    PANAMA: 'PA',
    PARAGUAY: 'PY',
    PERU: 'PE',
    URUGUAY: 'UY',
  };

  const normalizedAlias = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
  if (aliases[normalizedAlias]) return aliases[normalizedAlias];

  return options.allowNull ? null : 'US';
}

/** Solo columna country_code explícita; para routing multi-dominio sin inferir por moneda. */
function routingCountryCodeFromRow(row) {
  const raw = row?.country_code;
  if (raw == null || String(raw).trim() === '') return null;
  const c = String(raw).trim().toUpperCase();
  return COUNTRY_CODES.includes(c) ? c : null;
}

/**
 * Plan efectivo para límites y seguridad.
 * Reglas (en orden):
 *   1. Si plan_expires_at está vigente → plan de pago activo.
 *   2. Si trial_expires_at está vigente → trial activo.
 *   3. Si ambos son null (plan asignado por admin sin vencimiento) → válido.
 *   4. En cualquier otro caso → 'starter'.
 * @param {string} planSlug
 * @param {string|null} planExpiresAt
 * @param {string|null} [trialExpiresAt]
 */
export function getEffectivePlanSlug(planSlug, planExpiresAt, trialExpiresAt = null) {
  const slug = planSlug || 'starter';
  if (!['pro', 'business'].includes(slug)) return slug;

  const now = new Date();

  // Plan de pago activo
  if (planExpiresAt) {
    const exp = new Date(planExpiresAt);
    if (!isNaN(exp.getTime()) && exp > now) return slug;
  }

  // Trial activo
  if (trialExpiresAt) {
    const trialExp = new Date(trialExpiresAt);
    if (!isNaN(trialExp.getTime()) && trialExp > now) return slug;
  }

  // Sin ningún vencimiento configurado → plan admin legacy, válido
  if (!planExpiresAt && !trialExpiresAt) return slug;

  return 'starter';
}

function normalizePlanSlug(planSlug) {
  const slug = (planSlug || '').toString().trim().toLowerCase();
  if (slug === 'full') return 'business';
  if (slug === 'pro') return 'pro';
  if (slug === 'business') return 'business';
  return 'starter';
}

/**
 * Devuelve el plan activo para validaciones de límites.
 * Fuente de verdad: subscription.plan_slug.
 * scheduled_plan_slug sólo representa un cambio futuro.
 *
 * @param {object} subscription
 * @returns {'starter'|'pro'|'business'}
 */
export function getActivePlan(subscription = {}) {
  const planSlug = normalizePlanSlug(subscription?.plan_slug ?? subscription?.planSlug);
  return planSlug;
}

async function validateCountryUpdateAllowed({ businessId, userId }) {
  const [{ data: businessRow, error: businessErr }, { count, error: ordersErr }] = await Promise.all([
    supabase
      .from('wa_businesses')
      .select('plan_slug, plan_expires_at, trial_expires_at, plan_started_at, country_code')
      .eq('id', businessId)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('wa_orders')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId),
  ]);

  if (businessErr) return { allowed: false, message: businessErr.message || 'No se pudo validar el negocio.' };
  if (ordersErr) return { allowed: false, message: ordersErr.message || 'No se pudo validar pedidos del negocio.' };
  if (!businessRow) return { allowed: false, message: 'No se encontró el negocio.' };

  const hasPersistedCountry =
    businessRow?.country_code != null && String(businessRow.country_code).trim() !== '';
  if (!hasPersistedCountry) {
    return { allowed: true, message: null };
  }

  const now = new Date();
  const planSlug = String(businessRow?.plan_slug || '').trim().toLowerCase();
  const planExpiresAt = businessRow?.plan_expires_at ? new Date(businessRow.plan_expires_at) : null;
  const hasActiveSubscription =
    (planSlug === 'pro' || planSlug === 'business') &&
    planExpiresAt instanceof Date &&
    !Number.isNaN(planExpiresAt.getTime()) &&
    planExpiresAt > now;
  const hasOrders = (count || 0) > 0;
  const trialStarted = Boolean(businessRow?.plan_started_at || businessRow?.trial_expires_at);

  if (hasActiveSubscription || hasOrders || trialStarted) {
    return {
      allowed: false,
      message: 'No se puede cambiar el país: hay suscripción activa, pedidos o el trial ya comenzó.',
    };
  }
  return { allowed: true, message: null };
}

function getProductLimitByPlan(planSlug) {
  return getPlanLimits(normalizePlanSlug(planSlug)).maxProducts;
}

const generateSlug = async (name) => {
  const base = name?.toLowerCase()?.replace(/[^a-z0-9\s-]/g, '')?.replace(/\s+/g, '-')?.replace(/-+/g, '-')?.trim();
  let slug = base;
  let counter = 0;
  while (true) {
    const { data } = await supabase?.from('wa_businesses')?.select('id')?.eq('slug', slug)?.maybeSingle();
    if (!data) break;
    counter++;
    slug = `${base}-${counter}`;
  }
  return slug;
};

/**
 * @param {string} businessId
 * @param {{ force?: boolean }} [opts]
 *   force=true  → re-commit shareImageUrl → og_image_url even if og_image_url already exists
 *   force=false → Edge Function will skip if og_image_url already matches shareImageUrl (default)
 */
async function triggerOgImageGeneration(businessId, { force = false } = {}) {
  console.log('[waBusinessService] triggerOgImageGeneration called', { businessId, force });

  if (!businessId) return;
  const supabaseUrl = (import.meta.env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
  const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '';

  if (!supabaseUrl || !anonKey) {
    console.warn('[waBusinessService] triggerOgImageGeneration missing config', { supabaseUrlPresent: !!supabaseUrl, anonKeyPresent: !!anonKey });
    return;
  }

  const safeToken = (t) => {
    if (!t || typeof t !== 'string') return null;
    if (!t.includes('.')) return '(non-jwt)';
    return `${t.slice(0, 10)}...${t.slice(-8)}`;
  };

  try {
    // Fire-and-forget: no await, so UI won't be blocked.
    const sessionPromise = supabase?.auth?.getSession?.();
    if (!sessionPromise || typeof sessionPromise.then !== 'function') {
      console.warn('[waBusinessService] triggerOgImageGeneration: getSession() not available/invalid');
      return;
    }

    sessionPromise.then(({ data: sessionData }) => {
      const session = sessionData?.session ?? null;
      const token = session?.access_token ?? null;
      console.log('[waBusinessService] OG session snapshot', {
        hasSession: !!session,
        hasRefreshToken: !!session?.refresh_token,
        tokenPreview: safeToken(token),
        tokenLength: token?.length ?? 0,
      });

      const tokenLooksValid = typeof token === 'string' && token.includes('.');
      const proceedWithToken = (resolvedToken) => {
        if (!resolvedToken) {
          console.warn('[waBusinessService] OG generation: no token after refresh attempt');
          return;
        }

        console.log('[waBusinessService] calling generate-og-image', {
          endpoint: `${supabaseUrl}/functions/v1/generate-og-image`,
          businessId,
          tokenPreview: safeToken(resolvedToken),
        });

        return fetch(`${supabaseUrl}/functions/v1/generate-og-image`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${resolvedToken}`,
            apikey: anonKey,
          },
          body: JSON.stringify({ businessId, force }),
        })
          .then((res) => {
            const status = res.status;
            console.log('[waBusinessService] OG generation HTTP', { status });

            return res.text()
              .then((text) => {
                try {
                  const json = text ? JSON.parse(text) : null;
                  console.log('[waBusinessService] OG generation result', { status, json });
                } catch {
                  console.log('[waBusinessService] OG generation result (non-JSON)', { status, text: text?.slice(0, 500) });
                }
              })
              .catch(() => {
                console.log('[waBusinessService] OG generation result (no body)', { status });
              });
          })
          .catch((err) => {
            console.error('[waBusinessService] OG generation fetch failed', { message: err?.message || err });
          });
      };

      if (tokenLooksValid) return proceedWithToken(token);

      // Token ausente/invalid -> intentar refresh
      if (typeof supabase?.auth?.refreshSession !== 'function') {
        console.warn('[waBusinessService] OG generation: refreshSession not available');
        return proceedWithToken(token);
      }

      console.warn('[waBusinessService] OG generation: token invalid/absent, attempting refreshSession');
      return supabase.auth.refreshSession()
        .then(({ data: refreshData }) => {
          const refreshedSession = refreshData?.session ?? null;
          const refreshedToken = refreshedSession?.access_token ?? null;
          console.log('[waBusinessService] OG refresh snapshot', {
            hasRefreshedSession: !!refreshedSession,
            hasRefreshToken: !!refreshedSession?.refresh_token,
            tokenPreview: safeToken(refreshedToken),
            tokenLength: refreshedToken?.length ?? 0,
          });
          return proceedWithToken(refreshedToken);
        })
        .catch((err) => {
          console.error('[waBusinessService] OG refreshSession failed', { message: err?.message || err });
          return proceedWithToken(token);
        });
      })
      .catch((err) => {
        console.error('[waBusinessService] triggerOgImageGeneration failed to get session', { message: err?.message || err });
      });
  } catch (err) {
    console.error('[waBusinessService] triggerOgImageGeneration error', { message: err?.message || err });
  }
}

const mapBusinessFromDb = (row) => {
  const designSettings = row?.design_settings || null;
  const rubroRow = Array.isArray(row?.wa_rubros) ? row.wa_rubros?.[0] : row?.wa_rubros;
  return {
  id: row?.id,
  userId: row?.user_id,
  name: row?.name,
  description: row?.description,
  whatsapp: row?.whatsapp,
  email: row?.email,
  address: row?.address,
  city: row?.city,
  region: row?.region,
  country: row?.country,
  /** ISO solo si existe columna country_code; no inferir desde moneda (evitaba “Chile” por CLP). */
  countryCode: routingCountryCodeFromRow(row) || null,
  /**
   * Valor crudo de `wa_businesses.country_code` (única fuente para onboarding/guard).
   * No inferir desde moneda ni desde `country` legacy.
   */
  countryCodeDb:
    row?.country_code != null && String(row.country_code).trim() !== ''
      ? String(row.country_code).trim().toUpperCase()
      : null,
  /** Código ISO persistido en BD; usar para redirección de dominio (no inferir CL desde CLP). */
  routingCountryCode: routingCountryCodeFromRow(row),
  marketCode: getMarketCodeByCountry(routingCountryCodeFromRow(row)),
  // Legacy: dominios por mercado (cl/ar/go). Todo vive en go.ventalink.app.
  defaultDomain: 'https://go.ventalink.app',
  currency: row?.currency,
  logoUrl: row?.logo_url || designSettings?.logoUrl || null,
  coverImageUrl: designSettings?.headerImageUrl || designSettings?.coverImageUrl || row?.cover_image_url || null,
  lat: row?.lat != null ? parseFloat(row.lat) : null,
  lng: row?.lng != null ? parseFloat(row.lng) : null,
  ogImageUrl: row?.og_image_url || null,
  slug: row?.slug,
  isActive: row?.is_active,
  rubroId: row?.rubro_id || null,
  rubroName: rubroRow?.name ?? row?.rubro_name ?? null,
  rubroSlug: rubroRow?.slug ?? row?.rubro_slug ?? null,
  seoFamilyKey: row?.seo_family_key ?? null,
  seoContentOverride: row?.seo_content_override ?? null,
  seoContentAi: row?.seo_content_ai ?? null,
  instagramUrl: row?.instagram_url || null,
  tiktokUrl: normalizeTikTokUrl(row?.tiktok_url),
  facebookUrl: row?.facebook_url || null,
  printLegend: row?.print_legend || null,
  print_legend: row?.print_legend || null,
  ticketLogoUrl: row?.ticket_logo_url || null,
  designSettings,
  orderMessageTemplate: row?.order_message_template || null,
  planSlug: row?.plan_slug || 'starter',
  planExpiresAt: row?.plan_expires_at ?? null,
  trialExpiresAt: row?.trial_expires_at ?? null,
  scheduledPlanSlug: row?.scheduled_plan_slug ?? null,
  scheduledChangeAt: row?.scheduled_change_at ?? null,
  businessMode: row?.business_mode ?? 'store',
  documentTitleType: row?.document_title_type || 'cotizacion',
  createdAt: row?.created_at,
  updatedAt: row?.updated_at,
};
};

const mapProductFromDb = (row) => {
  const imagesArray = Array.isArray(row?.images) ? row.images : (row?.image_url ? [row.image_url] : []);
  const status = row?.status ?? (row?.is_active ? 'active' : 'inactive');
  return {
    id: row?.id,
    businessId: row?.business_id,
    name: row?.name,
    slug: row?.slug || null,
    publicCode: row?.public_code ?? null,
    sku:        row?.sku        ?? null,
    barcode:    row?.barcode    ?? null,
    description: row?.description,
    price: parseFloat(row?.price),
    imageUrl: row?.image_url || imagesArray?.[0] || null,
    thumbnailUrl: row?.thumbnail_url || null,
    thumbnailPath: row?.thumbnail_path || null,
    images: imagesArray,
    isActive: row?.is_active ?? (status === 'active'),
    isDraft: row?.is_draft === true,
    status,
    sortOrder: row?.sort_order,
    category: row?.category || null,
    hasOptions: row?.has_options || false,
    optionsDescription: row?.options_description || null,
    longDescription: row?.long_description || null,
    featured: row?.featured ?? false,
    isMainFeatured: row?.is_main_featured ?? false,
    onSale: row?.on_sale ?? false,
    compareAtPrice: (() => { const v = parseFloat(row?.compare_at_price); return (row?.compare_at_price != null && !isNaN(v)) ? v : null; })(),
    videoUrl: row?.video_url || null,
    videoThumbnailUrl: row?.video_thumbnail_url || null,
    videoPath: row?.video_path || null,
    videoThumbnailPath: row?.video_thumbnail_path || null,
    cardImageUrl: row?.card_image_url || row?.thumbnail_url || row?.image_url || null,
    cardImagePath: row?.card_image_path || row?.thumbnail_path || null,
    addOns: Array.isArray(row?.add_ons) ? row.add_ons : [],
    isSoldOut: row?.is_sold_out === true,
    showPrice: row?.show_price !== false,
    showInPos: row?.show_in_pos === true,
    posSortOrder: row?.pos_sort_order ?? 0,
    comboConfig:
      row?.combo_config && typeof row.combo_config === 'object' && !Array.isArray(row.combo_config)
        ? row.combo_config
        : null,
    createdAt: row?.created_at,
    updatedAt: row?.updated_at,
  };
};

export function slugifyProductName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'producto';
}

function assignFallbackProductSlugs(products = []) {
  const used = new Map();
  return (Array.isArray(products) ? products : []).map((product) => {
    const persistedSlug = String(product?.slug || '').trim();
    if (persistedSlug) {
      used.set(persistedSlug, Math.max(used.get(persistedSlug) || 0, 1));
      return { ...product, _slugSource: 'persisted', _generatedSlug: slugifyProductName(product?.name) };
    }

    const baseSlug = slugifyProductName(product?.name);
    const nextCount = (used.get(baseSlug) || 0) + 1;
    used.set(baseSlug, nextCount);
    const fallbackSlug = nextCount === 1 ? baseSlug : `${baseSlug}-${nextCount}`;
    return { ...product, slug: fallbackSlug, _slugSource: 'generated', _generatedSlug: fallbackSlug };
  });
}

function shouldLogPublicProductSlugDebug() {
  if (import.meta.env?.DEV) return true;
  if (typeof window === 'undefined') return false;
  const host = String(window.location?.hostname || '').toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  if (host.endsWith('.localhost') || host.endsWith('.vercel.app')) return true;
  try {
    return window.localStorage?.getItem('wa_public_product_debug') === '1';
  } catch {
    return false;
  }
}

function logPublicProductSlugDebug(step, payload = {}) {
  if (!shouldLogPublicProductSlugDebug()) return;
  console.debug(`[public-product-slug] ${step}`, payload);
}

async function clearMainFeaturedForBusiness(businessId, excludeProductId = null) {
  if (!businessId) return { error: null };

  let query = supabase
    ?.from('wa_products')
    ?.update({ is_main_featured: false })
    ?.eq('business_id', businessId)
    ?.eq('is_main_featured', true);

  if (excludeProductId) {
    query = query?.neq('id', excludeProductId);
  }

  const { error } = await query;
  return { error: error || null };
}

const ORDER_STATUS_VALID = ['pedido', 'en_preparacion', 'enviado', 'entregado', 'cancelado'];
const PAYMENT_STATUS_VALID = ['pendiente', 'pagado', 'anulado'];

/** ISO entre comillas para filtros `.or()` de PostgREST (evita romper el parser con `.` en timestamps). */
function quoteIsoForOrFilter(iso) {
  return `"${String(iso).replace(/"/g, '\\"')}"`;
}

/**
 * Instante de reconocimiento de ingreso: `paid_at` si existe; si no, `updated_at` (respaldo legacy / trigger no aplicado).
 * Tras migración + trigger, los pagados deberían tener siempre `paid_at`.
 */
function orderRevenueTimestamp(row) {
  if (row?.paid_at) {
    const t = new Date(row.paid_at);
    if (!Number.isNaN(t.getTime())) return t;
  }
  if (row?.updated_at) {
    const t = new Date(row.updated_at);
    if (!Number.isNaN(t.getTime())) return t;
  }
  return null;
}

/** yyyy-mm-dd en calendario local (misma noción de "hoy" que la UI en el navegador). */
function localCalendarDateKey(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Mapea fila `wa_orders` (+ items) al shape usado en la app. Exportado para merges incrementales (realtime). */
export const mapOrderFromDb = (row) => ({
  id: row?.id,
  businessId: row?.business_id,
  customerName: row?.customer_name,
  customerPhone: row?.customer_phone,
  customerEmail: row?.customer_email ?? null,
  serviceType: row?.service_type ?? null,
  tableReference: row?.table_reference ?? null,
  deliveryAddress: row?.delivery_address ?? null,
  totalAmount: parseFloat(row?.total_amount),
  subtotal: row?.subtotal != null ? parseFloat(row?.subtotal) : null,
  currency: row?.currency ?? 'USD',
  status: ORDER_STATUS_VALID.includes(row?.order_status) ? row?.order_status : 'pedido',
  paymentStatus: PAYMENT_STATUS_VALID.includes(row?.payment_status) ? row?.payment_status : 'pendiente',
  /** Oculto del tablero; visible en Historial. */
  isArchived: row?.is_archived === true,
  /** Momento en que pasó a entregado. Si es null en filas antiguas, la UI puede mostrar hora vía `createdAt` pero no duración “Entregado en …”. */
  deliveredAt: row?.delivered_at ?? null,
  /** Momento en que pasó a enviado. */
  sentAt: row?.sent_at ?? null,
  /** Cobro efectivo (BD, trigger). Es la única fecha válida para métricas de ingreso; el cliente no la escribe. */
  paidAt: row?.paid_at ?? null,
  customerId: row?.customer_id ?? null,
  notes: row?.notes,
  internalNotes: row?.internal_notes,
  items: (row?.wa_order_items || [])?.map(item => ({
    id: item?.id,
    orderId: item?.order_id,
    productId: item?.product_id,
    productName: item?.product_name,
    productPrice: parseFloat(item?.product_price),
    quantity: item?.quantity,
    subtotal: parseFloat(item?.subtotal),
    selectedOptions: item?.selected_options ?? [],
  })),
  createdAt: row?.created_at,
  updatedAt: row?.updated_at,
});

// wa_businesses

export const getMyBusiness = async () => {
  const { data: { session } } = await supabase?.auth?.getSession();
  const user = session?.user;
  if (!user) {
    console.warn('[waBusinessService] getMyBusiness: no authenticated user in session');
    return { data: null, error: { message: 'Usuario no autenticado' } };
  }
  console.log('[waBusinessService] getMyBusiness: fetching for user_id =', user?.id);

  // Orden + limit defensivo: si el usuario tiene filas duplicadas en wa_businesses
  // (PGRST116 con .maybeSingle()), esta consulta devuelve la más antigua sin explotar.
  // Diagnóstico de duplicados: supabase/diagnostics/wa_businesses_duplicates.sql
  const { data, error } = await supabase
    ?.from('wa_businesses')
    ?.select('*')
    ?.eq('user_id', user?.id)
    ?.order('created_at', { ascending: true })
    ?.limit(1)
    ?.maybeSingle();

  if (error) {
    if (error?.code === 'PGRST116') {
      console.warn('[waBusinessService] getMyBusiness: PGRST116 — posibles duplicados en wa_businesses para user_id', user?.id);
    } else {
      console.error('[waBusinessService] getMyBusiness error:', error);
    }
    return { data: null, error };
  }
  console.log('[waBusinessService] getMyBusiness result:', data ? `found id=${data?.id}` : 'not found');
  const mapped = data ? mapBusinessFromDb(data) : null;
  if (typeof window !== 'undefined') {
    console.info('[BUSINESS_RUNTIME_COUNTRY]', {
      id: data?.id ?? null,
      country_code_raw: data?.country_code ?? null,
      countryCodeDb: mapped?.countryCodeDb ?? null,
      countryCode_inferred: mapped?.countryCode ?? null,
      country_legacy: data?.country ?? null,
      currency: data?.currency ?? null,
      routingCountryCode: mapped?.routingCountryCode ?? null,
    });
  }
  return { data: mapped, error: null };
};

export const getBusinessByIdForAdmin = async (businessId) => {
  if (!businessId) return { data: null, error: { message: 'businessId required' } };
  const { data, error } = await supabase
    ?.from('wa_businesses')
    ?.select('*')
    ?.eq('id', businessId)
    ?.maybeSingle();
  if (error) return { data: null, error };
  return { data: data ? mapBusinessFromDb(data) : null, error: null };
};

export const getBusinessBySlug = async (slug) => {
  const { data, error } = await supabase
    ?.from('wa_businesses')
    ?.select('*, wa_rubros(name, slug)')
    ?.eq('slug', slug)
    ?.eq('is_active', true)
    ?.maybeSingle();
  if (error) return { data: null, error };
  return { data: data ? mapBusinessFromDb(data) : null, error: null };
};

export const createBusiness = async (businessData) => {
  const { data: { user } } = await supabase?.auth?.getUser();
  if (!user) return { data: null, error: { message: 'Usuario no autenticado' } };
  let slug = await generateSlug(businessData?.name);
  const trialEnd = getTrialEndDateFrom().toISOString();
  console.info('[VTLK_NEUTRAL_CREATE]', {
    event: 'create_business_skip_country',
    note: 'País/moneda se definen solo en Configuración (country_code)',
  });
  const { data, error } = await supabase?.from('wa_businesses')?.insert({
      user_id: user?.id,
      name: businessData?.name,
      description: businessData?.description || null,
      whatsapp: businessData?.whatsapp || '',
      email: businessData?.email || null,
      address: businessData?.address || null,
      city: businessData?.city || null,
      region: businessData?.region || null,
      country: null,
      country_code: null,
      currency: null,
      logo_url: businessData?.logoUrl || null,
      // Explícito: en bases legacy el DEFAULT de la columna era 'quote', que
      // viola wa_businesses_document_title_type_check.
      document_title_type: 'cotizacion',
      slug,
      is_active: true,
      plan_slug:           'pro',
      plan_started_at:     new Date().toISOString(),
      plan_expires_at:     trialEnd,
      trial_expires_at:    trialEnd,
      scheduled_plan_slug: 'starter',
      scheduled_change_at: trialEnd,
    })?.select()?.single();
  if (error) return { data: null, error };
  if (data?.id) {
    console.log('[waBusinessService] createBusiness: triggerOgImageGeneration', { businessId: data?.id });
    triggerOgImageGeneration(data?.id, { force: true });
  } else {
    console.warn('[waBusinessService] createBusiness: no business id returned, skipping OG generation');
  }
  return { data: mapBusinessFromDb(data), error: null };
};

export const createBusinessForUser = async (userId, businessData) => {
  if (!userId) return { data: null, error: { message: 'Usuario no autenticado' } };
  let slug = await generateSlug(businessData?.name);
  const trialEnd = getTrialEndDateFrom().toISOString();
  console.info('[VTLK_NEUTRAL_CREATE]', { event: 'createBusinessForUser_skip_country' });
  const { data, error } = await supabase?.from('wa_businesses')?.insert({
      user_id: userId,
      name: businessData?.name,
      description: businessData?.description || null,
      whatsapp: businessData?.whatsapp || '',
      email: businessData?.email || null,
      address: businessData?.address || null,
      city: businessData?.city || null,
      region: businessData?.region || null,
      country: null,
      country_code: null,
      currency: null,
      logo_url: businessData?.logoUrl || null,
      // Explícito: en bases legacy el DEFAULT de la columna era 'quote', que
      // viola wa_businesses_document_title_type_check.
      document_title_type: 'cotizacion',
      slug,
      is_active: true,
      plan_slug:           'pro',
      plan_started_at:     new Date().toISOString(),
      plan_expires_at:     trialEnd,
      trial_expires_at:    trialEnd,
      scheduled_plan_slug: 'starter',
      scheduled_change_at: trialEnd,
    })?.select()?.single();
  if (error) return { data: null, error };
  if (data?.id) {
    console.log('[waBusinessService] createBusinessForUser: triggerOgImageGeneration', { businessId: data?.id });
    triggerOgImageGeneration(data?.id, { force: true });
  } else {
    console.warn('[waBusinessService] createBusinessForUser: no business id returned, skipping OG generation');
  }
  return { data: mapBusinessFromDb(data), error: null };
};

export async function updateBusiness(businessId, updates) {
  const { data: { session } } = await supabase?.auth?.getSession();
  const user = session?.user;
  if (!user) {
    console.warn('[waBusinessService] updateBusiness: no authenticated user');
    return { data: null, error: { message: 'Usuario no autenticado' } };
  }
  console.log('[waBusinessService] updateBusiness: businessId =', businessId, '| user_id =', user?.id);
  const dbUpdates = {};
  if (updates?.name !== undefined)        dbUpdates.name = updates?.name;
  if (updates?.description !== undefined) dbUpdates.description = updates?.description;
  if (updates?.whatsapp !== undefined)    dbUpdates.whatsapp = normalizeWhatsappForStorage(updates?.whatsapp);
  if (updates?.email !== undefined)       dbUpdates.email = updates?.email;
  if (updates?.address !== undefined)     dbUpdates.address = updates?.address;
  if (updates?.city !== undefined)        dbUpdates.city = updates?.city;
  if (updates?.region !== undefined)      dbUpdates.region = updates?.region;

  // País/moneda: solo persistir con acción explícita de guardado (`persistCountry = true`).
  if (updates?.countryCode !== undefined && updates?.persistCountry === true) {
    const countryGuard = await validateCountryUpdateAllowed({ businessId, userId: user?.id });
    if (!countryGuard.allowed) {
      return { data: null, error: { message: countryGuard.message } };
    }
    const raw = String(updates.countryCode || '').trim().toUpperCase();
    if (raw && COUNTRY_CODES.includes(raw)) {
      const cfg = getCountryConfig(raw);
      dbUpdates.country_code = raw;
      dbUpdates.country = cfg?.name || raw;
      dbUpdates.currency =
        updates?.currency !== undefined && updates?.currency !== null
          ? updates.currency
          : cfg?.currency || 'USD';
      console.info('[VENTALINK_COUNTRY_PERSIST]', {
        event: 'update_business_country',
        businessId,
        country_code: raw,
        country: dbUpdates.country,
        currency: dbUpdates.currency,
      });
    }
  } else if (updates?.countryCode !== undefined && updates?.persistCountry !== true) {
    console.info('[VENTALINK_COUNTRY_PERSIST]', {
      event: 'skip_country_update_without_explicit_save',
      businessId,
    });
  }

  if (updates?.logoUrl !== undefined)     dbUpdates.logo_url = updates?.logoUrl;
  if (updates?.coverImageUrl !== undefined) dbUpdates.cover_image_url = updates?.coverImageUrl;
  if (updates?.lat !== undefined) dbUpdates.lat = updates?.lat ?? null;
  if (updates?.lng !== undefined) dbUpdates.lng = updates?.lng ?? null;
  if (updates?.slug !== undefined)        dbUpdates.slug = updates?.slug;
  if (updates?.isActive !== undefined)    dbUpdates.is_active = updates?.isActive;
  if (updates?.designSettings !== undefined) dbUpdates.design_settings = updates?.designSettings;
  if (updates?.rubroId !== undefined) dbUpdates.rubro_id = updates?.rubroId || null;
  if (updates?.instagramUrl !== undefined) dbUpdates.instagram_url = normalizeSharedSocialUrl(updates.instagramUrl, 'https://instagram.com');
  if (updates?.tiktokUrl    !== undefined) dbUpdates.tiktok_url    = normalizeTikTokUrl(updates.tiktokUrl);
  if (updates?.facebookUrl  !== undefined) dbUpdates.facebook_url  = normalizeSharedSocialUrl(updates.facebookUrl,  'https://facebook.com');
  if (updates?.businessMode !== undefined)     dbUpdates.business_mode = updates?.businessMode;
  if (updates?.documentTitleType !== undefined) {
    // Solo valores del CHECK; cualquier otro (p. ej. 'quote' legacy) se normaliza.
    dbUpdates.document_title_type = ['presupuesto', 'cotizacion'].includes(updates?.documentTitleType)
      ? updates.documentTitleType
      : 'cotizacion';
  }
  if (updates?.printLegend !== undefined || updates?.print_legend !== undefined) {
    const rawPrintLegend = updates?.printLegend !== undefined ? updates?.printLegend : updates?.print_legend;
    const normalizedPrintLegend = String(rawPrintLegend ?? '').trim();
    dbUpdates.print_legend = normalizedPrintLegend || null;
  }
  if (updates?.ticketLogoUrl !== undefined)    dbUpdates.ticket_logo_url = updates?.ticketLogoUrl ?? null;
  if (updates?.planSlug !== undefined)         dbUpdates.plan_slug = updates?.planSlug;
  if (updates?.planExpiresAt !== undefined)    dbUpdates.plan_expires_at = updates?.planExpiresAt ?? null;
  if (updates?.trialExpiresAt !== undefined)   dbUpdates.trial_expires_at = updates?.trialExpiresAt ?? null;
  console.log('[waBusinessService] updateBusiness: payload keys =', Object.keys(dbUpdates));
  let { data, error } = await supabase?.from('wa_businesses')?.update(dbUpdates)?.eq('id', businessId)?.eq('user_id', user?.id)?.select()?.single();
  if (error) {
    console.error('[waBusinessService] updateBusiness error:', error?.message, '| code:', error?.code, '| details:', error?.details, '| hint:', error?.hint);
    // If the error is caused by document_title_type column not existing yet (migration pending),
    // retry without it so other fields are still saved.
    const missingColumn = error?.message?.includes('document_title_type') || error?.details?.includes('document_title_type');
    if (missingColumn && dbUpdates.document_title_type !== undefined) {
      console.warn('[waBusinessService] document_title_type column not found — retrying without it (migration may be pending)');
      const fallbackUpdates = { ...dbUpdates };
      delete fallbackUpdates.document_title_type;
      const { data: d2, error: e2 } = await supabase?.from('wa_businesses')?.update(fallbackUpdates)?.eq('id', businessId)?.eq('user_id', user?.id)?.select()?.single();
      if (e2) {
        console.error('[waBusinessService] updateBusiness fallback error:', e2?.message, '| code:', e2?.code);
        return { data: null, error: e2 };
      }
      data = d2;
      error = null;
    } else {
      return { data: null, error };
    }
  }
  console.log('[waBusinessService] updateBusiness success: updated id =', data?.id);
  if (data?.id) {
    // Trigger OG commit only when designSettings is saved (which is the only way
    // shareImageUrl can change). Cover, logo, name, description do not affect OG.
    // The Edge Function will skip if og_image_url already matches shareImageUrl.
    const visualOgChange = updates?.designSettings !== undefined;
    console.log('[waBusinessService] updateBusiness: triggerOgImageGeneration', { businessId: data?.id, force: visualOgChange });
    triggerOgImageGeneration(data?.id, { force: visualOgChange });
  } else {
    console.warn('[waBusinessService] updateBusiness: no business id returned, skipping OG generation');
  }
  return { data: mapBusinessFromDb(data), error: null };
}

export const uploadBusinessLogo = async (file, businessId) => {
  const compressed = await compressImageForUpload(file, 'logo');
  try {
    const uploaded = await uploadToMediaService(compressed, {
      type: 'business-logo',
      businessId,
    });
    return { url: uploaded.url, error: null };
  } catch (error) {
    return {
      url: null,
      error: { message: error?.message || 'No se pudo subir el logo.' },
    };
  }
};

export const uploadBusinessCover = async (file, businessId) => {
  const compressed = await compressImageForUpload(file, 'cover');
  try {
    const uploaded = await uploadToMediaService(compressed, {
      type: 'business-cover',
      businessId,
    });
    return { url: uploaded.url, error: null };
  } catch (error) {
    return {
      url: null,
      error: { message: error?.message || 'No se pudo subir la portada.' },
    };
  }
};

// wa_products

export const getProducts = async (businessId) => {
  const { data, error } = await supabase
    ?.from('wa_products')
    ?.select('*')
    ?.eq('business_id', businessId)
    ?.neq('is_draft', true)
    ?.order('sort_order', { ascending: true });
  if (error) return { data: null, error };
  return { data: (data || [])?.map(mapProductFromDb), error: null };
};

export const getProduct = async (productId) => {
  const { data, error } = await supabase?.from('wa_products')?.select('*')?.eq('id', productId)?.single();
  if (error) return { data: null, error };
  return { data: mapProductFromDb(data), error: null };
};

/** Cuenta de productos activos del negocio (para límites de plan). */
export const getActiveProductCount = async (businessId) => {
  const { count, error } = await supabase
    ?.from('wa_products')
    ?.select('id', { count: 'exact', head: true })
    ?.eq('business_id', businessId)
    ?.eq('status', 'active')
    ?.neq('is_draft', true);
  if (error) return 0;
  return count ?? 0;
};

function getFirstProductEventStorageKey(businessId) {
  return `${FIRST_PRODUCT_EVENT_PREFIX}${businessId}`;
}

function wasFirstProductEventTracked(businessId) {
  if (!businessId || typeof window === 'undefined') return false;
  try {
    return window.localStorage?.getItem(getFirstProductEventStorageKey(businessId)) === '1';
  } catch {
    return false;
  }
}

function markFirstProductEventTracked(businessId) {
  if (!businessId || typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(getFirstProductEventStorageKey(businessId), '1');
  } catch {
    // Storage can be unavailable in private contexts; the count transition still protects normal flows.
  }
}

function sendFirstProductCreatedEventIfNeeded({ businessId, activeBefore, activeAfter }) {
  if (!businessId || activeBefore !== 0 || activeAfter !== 1) return;
  if (wasFirstProductEventTracked(businessId)) return;
  markFirstProductEventTracked(businessId);

  (async () => {
    try {
      const [{ data: business }, { data: userData }, { count: ordersCount }] = await Promise.all([
        supabase
          ?.from('wa_businesses')
          ?.select('id, name, country, country_code, plan_slug, business_mode')
          ?.eq('id', businessId)
          ?.maybeSingle(),
        supabase?.auth?.getUser(),
        supabase
          ?.from('wa_orders')
          ?.select('id', { count: 'exact', head: true })
          ?.eq('business_id', businessId),
      ]);

      const email = userData?.user?.email || '';
      if (!email) return;

      await trackLoopsEvent('first_product_created', {
        email,
        businessName: business?.name || '',
        businessId,
        productsCount: activeAfter,
        ordersCount: ordersCount ?? 0,
        businessMode: business?.business_mode || 'store',
        country: business?.country_code || business?.country || '',
        plan: business?.plan_slug || 'starter',
      });
    } catch (error) {
      console.warn('[waBusinessService] first_product_created tracking skipped', {
        businessId,
        message: error?.message || 'unknown_error',
      });
    }
  })();
}

/**
 * Verifica si el negocio puede crear más productos u órdenes según su plan.
 * @param {string} businessId
 * @param {'products'|'orders'} type
 * @returns {Promise<{ allowed: boolean, current: number, limit: number|null }>}
 */
export const checkPlanLimits = async (businessId, type) => {
  try {
    if (type === 'products') {
      const { data: biz } = await supabase
        ?.from('wa_businesses')
        ?.select('plan_slug')
        ?.eq('id', businessId)
        ?.single();
      const activePlan = getActivePlan(biz || {});
      const limit = getProductLimitByPlan(activePlan);
      const current = await getActiveProductCount(businessId);
      return { allowed: limit === null || current < limit, current, limit };
    }
    if (type === 'orders') {
      const { data: biz } = await supabase
        ?.from('wa_businesses')
        ?.select('plan_slug, plan_expires_at, trial_expires_at')
        ?.eq('id', businessId)
        ?.single();
      const effectivePlan = getEffectivePlanSlug(
        biz?.plan_slug || 'starter',
        biz?.plan_expires_at ?? null,
        biz?.trial_expires_at ?? null,
      );
      const { maxOrdersPerMonth: limit } = getPlanLimits(effectivePlan);
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const { count: current } = await supabase
        ?.from('wa_orders')
        ?.select('id', { count: 'exact', head: true })
        ?.eq('business_id', businessId)
        ?.gte('created_at', startOfMonth.toISOString());
      return { allowed: limit === null || (current ?? 0) < limit, current: current ?? 0, limit };
    }
    return { allowed: true, current: 0, limit: null };
  } catch (err) {
    console.error('[checkPlanLimits]', err);
    return { allowed: true, current: 0, limit: null };
  }
};

export const createProduct = async (businessId, productData) => {
  const { data: biz } = await supabase
    ?.from('wa_businesses')
    ?.select('plan_slug')
    ?.eq('id', businessId)
    ?.single();
  const activePlan = getActivePlan(biz || {});
  const maxProducts = getProductLimitByPlan(activePlan);
  const status = ['active', 'inactive', 'archived'].includes(productData?.status)
    ? productData.status
    : (productData?.isActive !== false ? 'active' : 'inactive');
  const activeBefore = await getActiveProductCount(businessId);
  if (maxProducts != null) {
    const willBeActive = status === 'active' && productData?.isDraft !== true;
    if (willBeActive && activeBefore >= maxProducts) {
      return { data: null, error: { message: `🚀 Llegaste al límite de productos del plan gratis. Actualiza a Pro para seguir agregando más.`, code: 'PLAN_LIMIT_EXCEEDED' } };
    }
  }
  const imagesArr = Array.isArray(productData?.images) ? productData.images : [];
  const imageUrl = productData?.imageUrl ?? imagesArr?.[0] ?? null;
  const thumbnailUrl = productData?.thumbnailUrl ?? productData?.cardImageUrl ?? null;
  const thumbnailPath = productData?.thumbnailPath ?? productData?.cardImagePath ?? null;
  const wantsMainFeatured = productData?.isMainFeatured === true;
  if (wantsMainFeatured) {
    const { error: clearError } = await clearMainFeaturedForBusiness(businessId);
    if (clearError) return { data: null, error: clearError };
  }
  const { data, error } = await supabase?.from('wa_products')?.insert({
    business_id: businessId,
    name: productData?.name,
    description: productData?.description || null,
    price: productData?.price,
    image_url: imageUrl,
    thumbnail_url: thumbnailUrl,
    thumbnail_path: thumbnailPath,
    images: imagesArr?.length > 0 ? imagesArr : (imageUrl ? [imageUrl] : []),
    status,
    is_active: status === 'active',
    sort_order: productData?.sortOrder || 0,
    category: productData?.category || null,
    has_options: productData?.hasOptions || false,
    options_description: productData?.optionsDescription || null,
    long_description: productData?.longDescription || null,
    featured: productData?.featured === true,
    is_main_featured: wantsMainFeatured,
    on_sale: productData?.onSale === true,
    compare_at_price: productData?.compareAtPrice ?? null,
    is_draft: productData?.isDraft === true,
    card_image_url: productData?.cardImageUrl ?? null,
    card_image_path: productData?.cardImagePath ?? null,
    is_sold_out: productData?.isSoldOut === true,
    show_price: productData?.showPrice !== false,
    add_ons: Array.isArray(productData?.addOns) ? productData.addOns : [],
    combo_config:
      productData?.comboConfig && typeof productData.comboConfig === 'object' && !Array.isArray(productData.comboConfig)
        ? productData.comboConfig
        : null,
    show_in_pos:  productData?.showInPos    === true,
    pos_sort_order: productData?.posSortOrder ?? 0,
    ...(productData?.sku     != null ? { sku:     productData.sku     || null } : {}),
    ...(productData?.barcode != null ? { barcode: productData.barcode || null } : {}),
  })?.select()?.single();
  if (error) {
    if (error?.message?.includes('Límite de productos alcanzado')) {
      return { data: null, error: { message: `🚀 Llegaste al límite de productos del plan gratis. Actualiza a Pro para seguir agregando más.`, code: 'PLAN_LIMIT_EXCEEDED' } };
    }
    return { data: null, error };
  }
  const mappedProduct = mapProductFromDb(data);
  if (status === 'active' && productData?.isDraft !== true) {
    getActiveProductCount(businessId)
      .then((activeAfter) => sendFirstProductCreatedEventIfNeeded({ businessId, activeBefore, activeAfter }))
      .catch(() => {});
  }
  return { data: mappedProduct, error: null };
};

export const createProductDraft = async (businessId, draftData = {}) => {
  const draftName = String(draftData?.name || '').trim() || 'Producto en edicion';
  const draftPriceRaw = Number(draftData?.price);
  const draftPrice = Number.isFinite(draftPriceRaw) && draftPriceRaw > 0 ? Math.round(draftPriceRaw) : 1;

  return createProduct(businessId, {
    name: draftName,
    price: draftPrice,
    description: draftData?.description || null,
    category: draftData?.category || null,
    imageUrl: null,
    images: [],
    isActive: false,
    featured: false,
    onSale: false,
    isDraft: true,
    hasOptions: false,
    optionsDescription: null,
    longDescription: null,
  });
};

export const updateProduct = async (productId, productData) => {
  let currentProduct = null;
  let activeBeforeForFirstProduct = null;
  const nextStatus = productData?.status !== undefined && ['active', 'inactive', 'archived'].includes(productData.status)
    ? productData.status
    : (productData?.isActive !== undefined ? (productData.isActive ? 'active' : 'inactive') : undefined);
  const willBeActive = nextStatus === 'active' && productData?.isDraft !== true;
  if (willBeActive) {
    const { data: product } = await supabase?.from('wa_products')?.select('business_id, is_active, status, is_draft, is_main_featured')?.eq('id', productId)?.single();
    currentProduct = product || null;
    if (product?.business_id) {
      const { data: biz } = await supabase
        ?.from('wa_businesses')
        ?.select('plan_slug')
        ?.eq('id', product.business_id)
        ?.single();
      const activePlan = getActivePlan(biz || {});
      const maxProducts = getProductLimitByPlan(activePlan);
      const productWasVisible = product?.status === 'active' && product?.is_draft !== true;
      if (!productWasVisible) {
        const activeCount = await getActiveProductCount(product.business_id);
        activeBeforeForFirstProduct = activeCount;
        if (maxProducts != null && activeCount >= maxProducts) {
          return { data: null, error: { message: `🚀 Llegaste al límite de productos del plan gratis. Desactiva uno existente o actualiza a Pro para continuar.`, code: 'PLAN_LIMIT_EXCEEDED' } };
        }
      }
    }
  }
  if (!currentProduct && productData?.isMainFeatured !== undefined) {
    const { data: product } = await supabase?.from('wa_products')?.select('business_id, is_active, status, is_draft, is_main_featured')?.eq('id', productId)?.single();
    currentProduct = product || null;
  }
  const dbUpdates = {};
  if (productData?.name !== undefined)        dbUpdates.name = productData?.name;
  if (productData?.description !== undefined) dbUpdates.description = productData?.description;
  if (productData?.price !== undefined)       dbUpdates.price = productData?.price;
  if (productData?.imageUrl !== undefined)    dbUpdates.image_url = productData?.imageUrl;
  if (productData?.thumbnailUrl !== undefined || productData?.cardImageUrl !== undefined) {
    dbUpdates.thumbnail_url = productData?.thumbnailUrl ?? productData?.cardImageUrl ?? null;
  }
  if (productData?.thumbnailPath !== undefined || productData?.cardImagePath !== undefined) {
    dbUpdates.thumbnail_path = productData?.thumbnailPath ?? productData?.cardImagePath ?? null;
  }
  if (productData?.status !== undefined && ['active', 'inactive', 'archived'].includes(productData.status)) {
    dbUpdates.status = productData.status;
  } else if (productData?.isActive !== undefined) {
    dbUpdates.status = productData.isActive ? 'active' : 'inactive';
  }
  if (productData?.sortOrder !== undefined)   dbUpdates.sort_order = productData?.sortOrder;
  if (productData?.hasOptions !== undefined)  dbUpdates.has_options = productData?.hasOptions;
  if (productData?.optionsDescription !== undefined) dbUpdates.options_description = productData?.optionsDescription;
  if (productData?.longDescription !== undefined) dbUpdates.long_description = productData?.longDescription || null;
  if (productData?.category !== undefined) dbUpdates.category = productData?.category || null;
  if (productData?.featured !== undefined) dbUpdates.featured = !!productData.featured;
  if (productData?.isMainFeatured !== undefined) dbUpdates.is_main_featured = productData.isMainFeatured === true;
  if (productData?.onSale !== undefined) dbUpdates.on_sale = !!productData.onSale;
  if (productData?.compareAtPrice !== undefined) dbUpdates.compare_at_price = productData.compareAtPrice ?? null;
  if (productData?.images !== undefined) dbUpdates.images = Array.isArray(productData.images) ? productData.images : (productData?.imageUrl ? [productData.imageUrl] : []);
  if (productData?.isDraft !== undefined) dbUpdates.is_draft = productData.isDraft === true;
  if (productData?.videoUrl !== undefined)           dbUpdates.video_url = productData.videoUrl;
  if (productData?.videoThumbnailUrl !== undefined)  dbUpdates.video_thumbnail_url = productData.videoThumbnailUrl;
  if (productData?.videoPath !== undefined)          dbUpdates.video_path = productData.videoPath;
  if (productData?.videoThumbnailPath !== undefined) dbUpdates.video_thumbnail_path = productData.videoThumbnailPath;
  if (productData?.cardImageUrl !== undefined)       dbUpdates.card_image_url = productData.cardImageUrl;
  if (productData?.cardImagePath !== undefined)      dbUpdates.card_image_path = productData.cardImagePath;
  if (productData?.addOns !== undefined) dbUpdates.add_ons = Array.isArray(productData.addOns) ? productData.addOns : [];
  if (productData?.isSoldOut !== undefined) dbUpdates.is_sold_out = productData.isSoldOut === true;
  if (productData?.showPrice !== undefined) dbUpdates.show_price = productData.showPrice !== false;
  if (productData?.comboConfig !== undefined) {
    dbUpdates.combo_config =
      productData?.comboConfig && typeof productData.comboConfig === 'object' && !Array.isArray(productData.comboConfig)
        ? productData.comboConfig
        : null;
  }
  if (productData?.sku          !== undefined) dbUpdates.sku           = productData.sku     || null;
  if (productData?.barcode      !== undefined) dbUpdates.barcode       = productData.barcode || null;
  if (productData?.showInPos    !== undefined) dbUpdates.show_in_pos   = productData.showInPos === true;
  if (productData?.posSortOrder !== undefined) dbUpdates.pos_sort_order = productData.posSortOrder ?? 0;
  if (productData?.isMainFeatured === true) {
    const businessId = currentProduct?.business_id;
    if (!businessId) {
      return { data: null, error: { message: 'No se pudo resolver el negocio del producto.' } };
    }
    const { error: clearError } = await clearMainFeaturedForBusiness(businessId, productId);
    if (clearError) return { data: null, error: clearError };
  }
  const { data, error } = await supabase?.from('wa_products')?.update(dbUpdates)?.eq('id', productId)?.select()?.single();
  if (error) return { data: null, error };
  const mappedProduct = mapProductFromDb(data);
  if (currentProduct?.business_id && activeBeforeForFirstProduct === 0 && mappedProduct?.isActive === true && mappedProduct?.isDraft !== true) {
    getActiveProductCount(currentProduct.business_id)
      .then((activeAfter) => sendFirstProductCreatedEventIfNeeded({
        businessId: currentProduct.business_id,
        activeBefore: activeBeforeForFirstProduct,
        activeAfter,
      }))
      .catch(() => {});
  }
  return { data: mappedProduct, error: null };
};

export const deleteProduct = async (productId) => {
  const { error } = await supabase?.from('wa_products')?.delete()?.eq('id', productId);
  if (error) return { error };
  return { error: null };
};

export const uploadProductImage = async (file, businessId, productId, index) => {
  if (!(file instanceof Blob)) {
    return { url: null, error: { message: 'Selecciona una imagen valida antes de subir.' } };
  }
  if (!businessId) {
    return { url: null, error: { message: 'No se encontro el negocio para subir la imagen.' } };
  }
  if (!productId) {
    return { url: null, error: { message: 'No se encontro el producto para subir la imagen.' } };
  }
  if (!Number.isInteger(Number(index)) || Number(index) < 0) {
    return { url: null, error: { message: 'Indice de galeria invalido.' } };
  }

  try {
    const uploaded = await uploadToMediaService(file, {
      type: 'product-gallery',
      businessId,
      productId,
      index,
    });

    return {
      url: uploaded.url,
      error: null,
    };
  } catch (error) {
    return {
      url: null,
      error: { message: error?.message || 'No se pudo subir la imagen.' },
    };
  }
};

export const uploadProductMainImage = async ({ file, businessId, productId }) => {
  if (!(file instanceof Blob)) {
    throw new Error('Selecciona una imagen valida antes de subir.');
  }
  if (!businessId) {
    throw new Error('No se encontro el negocio para subir la imagen.');
  }
  if (!productId) {
    throw new Error('No se encontro el producto para subir la imagen.');
  }

  const { mainFile, thumbnailFile } = await generateProductImageUploadSet(file);

  const uploaded = await uploadToMediaService(mainFile, {
    type: 'product-main',
    businessId,
    productId,
    variant: 'main',
    skipClientCompression: true,
  });

  const uploadedThumbnail = await uploadToMediaService(thumbnailFile, {
    type: 'product-main',
    businessId,
    productId,
    variant: 'thumb',
    skipClientCompression: true,
  });

  return {
    ok: true,
    url: uploaded.url,
    key: uploaded.key,
    thumbnailUrl: uploadedThumbnail.url,
    thumbnailPath: uploadedThumbnail.key,
    contentType: uploaded.contentType,
    size: uploaded.size,
  };
};

// wa_orders

/** Tiempo que un pedido entregado permanece en el tablero antes de archivarse (solo UI + flag). */
export const DELIVERED_VISIBLE_MS = 30 * 60 * 1000;

/**
 * Marca como archivados los entregados cuya ventana de visibilidad en tablero ya expiró.
 */
export const expireDeliveredOrders = async (businessId) => {
  if (!businessId) return { expired: 0, error: null };
  return { expired: 0, error: null };
};

export const getOrders = async (businessId, opts = {}) => {
  if (!businessId) return { data: [], error: null };
  let q = supabase
    ?.from('wa_orders')
    ?.select('*, wa_order_items(*)', { count: opts.countOnly ? 'exact' : undefined })
    ?.eq('business_id', businessId)
    ?.order('created_at', { ascending: false });
  if (opts.status && opts.status !== 'all') q = q?.eq('order_status', opts.status);
  if (opts.search?.trim()) {
    const s = opts.search.trim();
    q = q?.or(`customer_name.ilike.%${s}%,customer_phone.ilike.%${s}%,id.ilike.%${s}%`);
  }
  if (opts.limit) q = q?.limit(opts.limit);
  if (opts.offset) q = q?.range(opts.offset, opts.offset + (opts.limit || 50) - 1);
  const { data, error, count } = await q;
  if (error) return { data: null, error, total: 0 };
  return { data: (data || [])?.map(mapOrderFromDb), error: null, total: count ?? (data?.length ?? 0) };
};

/** Pedidos archivados (ocultos del tablero activo). */
export const getArchivedOrders = async (businessId, opts = {}) => {
  if (!businessId) return { data: [], error: null };
  return { data: [], error: null, total: 0 };
};

export const getOrderById = async (orderId) => {
  if (!orderId) return { data: null, error: { message: 'orderId required' } };
  const { data, error } = await supabase
    ?.from('wa_orders')
    ?.select('*, wa_order_items(*)')
    ?.eq('id', orderId)
    ?.maybeSingle();
  if (error) return { data: null, error };
  return { data: data ? mapOrderFromDb(data) : null, error: null };
};

export const updateOrder = async (orderId, updates) => {
  const dbUpdates = {};
  if (updates?.status !== undefined) {
    const s = updates?.status;
    if (ORDER_STATUS_VALID.includes(s)) {
      dbUpdates.order_status = s;
      const { data: prevRow } = await supabase?.from('wa_orders')?.select('order_status')?.eq('id', orderId)?.maybeSingle();
      const prevStatus = prevRow?.order_status;
      if (s === 'entregado') {
        if (prevStatus !== 'entregado') {
          dbUpdates.delivered_at = new Date().toISOString();
        }
      } else if (prevStatus === 'entregado') {
        dbUpdates.delivered_at = null;
      }
      if (s === 'enviado') {
        if (prevStatus !== 'enviado') {
          dbUpdates.sent_at = new Date().toISOString();
        }
      } else if (prevStatus === 'enviado' && s !== 'entregado' && (s === 'pedido' || s === 'en_preparacion')) {
        dbUpdates.sent_at = null;
      }
    }
  }
  if (updates?.paymentStatus !== undefined) {
    const p = updates?.paymentStatus;
    if (PAYMENT_STATUS_VALID.includes(p)) dbUpdates.payment_status = p;
  }
  if (updates?.notes !== undefined)         dbUpdates.notes = updates?.notes;
  if (updates?.internalNotes !== undefined) dbUpdates.internal_notes = updates?.internalNotes;
  // paid_at lo asigna solo el trigger en BD al pasar a pagado; nunca desde el cliente.
  delete dbUpdates.paid_at;
  const { data, error } = await supabase?.from('wa_orders')?.update(dbUpdates)?.eq('id', orderId)?.select()?.single();
  if (error) return { data: null, error };
  return { data: mapOrderFromDb(data), error: null };
};

export const createOrder = async (businessId, orderData, items) => {
  const totalAmount = Number(orderData?.totalAmount) || 0;

  // ─── Validar límite de pedidos por mes del plan ───────────────────────────
  const { data: biz } = await supabase
    ?.from('wa_businesses')
    ?.select('plan_slug, plan_expires_at, trial_expires_at')
    ?.eq('id', businessId)
    ?.single();

  if (biz) {
    const effectivePlan = getEffectivePlanSlug(biz?.plan_slug || 'starter', biz?.plan_expires_at ?? null, biz?.trial_expires_at ?? null);
    const { maxOrdersPerMonth } = getPlanLimits(effectivePlan);

    if (maxOrdersPerMonth != null) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const { count: monthCount } = await supabase
        ?.from('wa_orders')
        ?.select('id', { count: 'exact', head: true })
        ?.eq('business_id', businessId)
        ?.gte('created_at', startOfMonth.toISOString());

      if ((monthCount ?? 0) >= maxOrdersPerMonth) {
        return {
          data: null,
          error: {
            message: `Este catálogo alcanzó el límite de ${maxOrdersPerMonth} pedidos del mes en el plan gratuito. El negocio debe actualizar a Pro para seguir recibiendo pedidos.`,
            code: 'PLAN_LIMIT_EXCEEDED',
          },
        };
      }
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Generar UUID client-side para evitar problemas de RLS con usuarios anónimos.
  const orderId = (typeof crypto !== 'undefined' && crypto?.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  // customer_id lo rellena automáticamente el trigger wa_orders_link_customer (SECURITY DEFINER).
  const { error: orderError } = await supabase?.from('wa_orders')?.insert({
      id: orderId,
      business_id: businessId,
      customer_name: (orderData?.customerName || '').trim() || null,
      customer_phone: orderData?.customerPhone?.trim() || null,
      customer_email: orderData?.customerEmail?.trim() || null,
      service_type: orderData?.serviceType || null,
      table_reference: orderData?.tableReference?.trim() || null,
      delivery_address: orderData?.deliveryAddress?.trim() || null,
      total_amount: totalAmount,
      subtotal: orderData?.subtotal != null ? Number(orderData.subtotal) : totalAmount,
      currency: orderData?.currency || 'USD',
      order_status: 'pedido',
      payment_status: 'pendiente',
      notes: orderData?.notes?.trim() || null,
    });
  if (orderError) {
    const isPlanLimit = (orderError?.message || '').includes('PLAN_LIMIT_EXCEEDED');
    return {
      data: null,
      error: isPlanLimit
        ? { message: 'Este catálogo alcanzó el límite de pedidos del mes del plan gratuito. Actualiza a Pro para recibir pedidos ilimitados.', code: 'PLAN_LIMIT_EXCEEDED' }
        : orderError,
    };
  }

  if (items?.length > 0) {
    const itemRows = items?.map(item => ({
      order_id: orderId,
      product_id: item?.productId || null,
      product_name: item?.productName || '',
      product_price: Number(item?.productPrice) || 0,
      quantity: Math.max(1, parseInt(item?.quantity, 10) || 1),
      subtotal: Number(item?.subtotal) || 0,
      selected_options: item?.selectedOptions ?? [],
    }));
    const { error: itemsError } = await supabase?.from('wa_order_items')?.insert(itemRows);
    if (itemsError) return { data: null, error: itemsError };
  }

  return {
    data: {
      id: orderId,
      businessId,
      totalAmount,
      status: 'pedido',
      paymentStatus: 'pendiente',
      customerName: (orderData?.customerName || '').trim() || null,
      customerPhone: orderData?.customerPhone?.trim() || null,
      serviceType: orderData?.serviceType || null,
      tableReference: orderData?.tableReference?.trim() || null,
      deliveryAddress: orderData?.deliveryAddress?.trim() || null,
      notes: orderData?.notes?.trim() || null,
      items: [],
      createdAt: new Date().toISOString(),
    },
    error: null,
  };
};

// ─── Clientes ─────────────────────────────────────────────────────────────────

export const getCustomer = async (customerId) => {
  const { data, error } = await supabase
    ?.from('wa_customers')
    ?.select('*')
    ?.eq('id', customerId)
    ?.single();
  if (error) return { data: null, error };
  return { data, error: null };
};

export const getCustomerOrders = async (customerId) => {
  const { data, error } = await supabase
    ?.from('wa_orders')
    ?.select('*, wa_order_items(*)')
    ?.eq('customer_id', customerId)
    ?.order('created_at', { ascending: false });
  if (error) return { data: null, error };
  return { data: (data || []).map(mapOrderFromDb), error: null };
};

export const deleteProducts = async (productIds) => {
  if (!productIds?.length) return { error: null };
  const { error } = await supabase?.from('wa_products')?.delete()?.in('id', productIds);
  if (error) return { error };
  return { error: null };
};

export async function getPublicProducts(businessId, options = {}) {
  const { maxProducts } = options;
  let query = supabase
    ?.from('wa_products')
    ?.select('*')
    ?.eq('business_id', businessId)
    ?.eq('is_active', true)
    ?.order('sort_order', { ascending: true });

  // Aplicar límite del plan si se especifica (enforcement de productos visible en catálogo)
  if (maxProducts != null && maxProducts > 0) {
    query = query?.limit(maxProducts);
  }

  const { data, error } = await query;
  if (error) {
    logPublicProductSlugDebug('active_products_lookup_error', {
      businessId,
      message: error?.message || null,
      code: error?.code || null,
      details: error?.details || null,
      hint: error?.hint || null,
    });
    return { data: null, error };
  }
  const mapped = assignFallbackProductSlugs((data || [])?.map(mapProductFromDb));
  logPublicProductSlugDebug('active_products_lookup', {
    businessId,
    count: mapped.length,
  });
  return { data: mapped, error: null };
}

export async function getPublicProductBySlug(businessSlug, productSlug) {
  const requestedSlug = String(productSlug || '').trim();
  logPublicProductSlugDebug('input', {
    businessSlug,
    productSlug,
    requestedSlug,
  });
  if (!businessSlug || !requestedSlug) {
    return { data: null, error: { message: 'Missing business or product slug' } };
  }

  const { data: business, error: businessError } = await getBusinessBySlug(businessSlug);
  logPublicProductSlugDebug('business_lookup', {
    businessSlug,
    found: !!business?.id,
    businessId: business?.id || null,
    isActive: business?.isActive ?? null,
    rawSlug: business?.slug || null,
    error: businessError?.message || null,
    errorCode: businessError?.code || null,
    errorDetails: businessError?.details || null,
    errorHint: businessError?.hint || null,
  });
  if (businessError) return { data: null, error: businessError };
  if (!business?.id || business?.isActive === false) return { data: null, error: null };

  let selectedProduct = null;
  const direct = await supabase
    ?.from('wa_products')
    ?.select('*')
    ?.eq('business_id', business.id)
    ?.eq('slug', requestedSlug)
    ?.eq('is_active', true)
    ?.maybeSingle();

  logPublicProductSlugDebug('direct_slug_lookup', {
    businessId: business.id,
    requestedSlug,
    found: !!direct?.data,
    error: direct?.error?.message || null,
    errorCode: direct?.error?.code || null,
    errorDetails: direct?.error?.details || null,
    errorHint: direct?.error?.hint || null,
    note: direct?.error ? 'If this mentions wa_products.slug, the slug migration is not applied; fallback by product name should continue.' : null,
  });

  if (!direct?.error && direct?.data) {
    selectedProduct = mapProductFromDb(direct.data);
  }

  const productsResult = await getPublicProducts(business.id);
  if (productsResult?.error) return { data: null, error: productsResult.error };
  const products = Array.isArray(productsResult?.data) ? productsResult.data : [];
  logPublicProductSlugDebug('candidate_products', {
    businessId: business.id,
    count: products.length,
    candidates: products.slice(0, 20).map((product) => ({
      id: product?.id,
      name: product?.name,
      persistedSlug: product?._slugSource === 'persisted' ? product?.slug || null : null,
      generatedSlug: product?._generatedSlug || slugifyProductName(product?.name),
      resolvedSlug: product?.slug || null,
      slugSource: product?._slugSource || 'unknown',
      isActive: product?.isActive,
    })),
  });

  if (!selectedProduct) {
    selectedProduct = products.find((product) => {
      const persistedSlug = String(product?.slug || '').trim();
      if (persistedSlug === requestedSlug) return true;
      return slugifyProductName(product?.name) === requestedSlug;
    }) || null;
  } else {
    selectedProduct = products.find((product) => product?.id === selectedProduct?.id) || selectedProduct;
  }

  if (!selectedProduct || selectedProduct?.isActive === false) {
    logPublicProductSlugDebug('resolved_product', {
      requestedSlug,
      found: false,
      reason: selectedProduct?.isActive === false ? 'inactive' : 'not_found',
    });
    return { data: { business, product: null, products }, error: null };
  }

  logPublicProductSlugDebug('resolved_product', {
    requestedSlug,
    found: true,
    id: selectedProduct?.id,
    name: selectedProduct?.name,
    persistedSlug: selectedProduct?._slugSource === 'persisted' ? selectedProduct?.slug || null : null,
    generatedSlug: selectedProduct?._generatedSlug || slugifyProductName(selectedProduct?.name),
    resolvedSlug: selectedProduct?.slug || null,
    slugSource: selectedProduct?._slugSource || 'unknown',
  });

  return { data: { business, product: selectedProduct, products }, error: null };
}

export async function getPublicOfferProducts(businessId) {
  const { data, error } = await supabase
    ?.from('wa_products')
    ?.select('*')
    ?.eq('business_id', businessId)
    ?.eq('is_active', true)
    ?.eq('on_sale', true)
    ?.order('sort_order', { ascending: true });
  if (error) return { data: null, error };
  const mapped = (data || []).map(mapProductFromDb);
  // Primero los de mayor descuento real (compareAtPrice > price), luego sort_order.
  const realDiscount = (p) =>
    p.compareAtPrice != null && !isNaN(p.compareAtPrice) && p.compareAtPrice > p.price
      ? (p.compareAtPrice - p.price) / p.compareAtPrice
      : 0;
  mapped.sort((a, b) => {
    const diff = realDiscount(b) - realDiscount(a);
    if (Math.abs(diff) > 1e-9) return diff;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });
  return { data: mapped, error: null };
}

// Analytics

export const getOrdersByDay = async (businessId, days = 7) => {
  if (!businessId) return { data: [], error: null };
  const { data, error } = await supabase.rpc('rpc_orders_by_day', {
    p_business_id: businessId,
    p_days: days,
  });
  if (error) return { data: null, error };
  return { data: (data || []).map(r => ({ date: r.day, count: Number(r.count) })), error: null };
};

export const getTopProducts = async (businessId, limit = 5, days = null) => {
  if (!businessId) return { data: [], error: null };
  const { data, error } = await supabase.rpc('rpc_top_products', {
    p_business_id: businessId,
    p_limit: limit,
    p_days: days,
  });
  if (error) return { data: null, error };
  return {
    data: (data || []).map(r => ({
      productName: r.product_name,
      totalQty: Number(r.total_qty),
      totalRevenue: Number(r.total_revenue),
    })),
    error: null,
  };
};

/**
 * Ingresos agregados del mes y del día actual.
 * - Pedidos `payment_status = 'pagado'`; fecha de ingreso = `paid_at` o, si falta, `updated_at` (hasta backfill/trigger en BD).
 * - "Hoy" / "ayer": día calendario local (`localCalendarDateKey`), no solo [inicio, fin] instantáneo (evita desajustes con ISO/UTC).
 * - Mes actual / anterior: año y mes en calendario local de `at` vs `now`.
 */
export const getMonthlyRevenue = async (businessId) => {
  const now = new Date();
  const fetchSince = new Date(now.getFullYear() - 1, now.getMonth(), 1, 0, 0, 0, 0);
  const fetchSinceIso = fetchSince.toISOString();
  const q = quoteIsoForOrFilter(fetchSinceIso);
  const { data, error } = await supabase
    ?.from('wa_orders')
    ?.select('total_amount, paid_at, updated_at')
    ?.eq('business_id', businessId)
    ?.eq('payment_status', 'pagado')
    ?.or(`and(paid_at.is.null,updated_at.gte.${q}),paid_at.gte.${q}`);
  if (error) return { data: null, error };

  const todayKey = localCalendarDateKey(now);
  const yRef = new Date(now);
  yRef.setDate(yRef.getDate() - 1);
  const yesterdayKey = localCalendarDateKey(yRef);
  const prevMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const prevMonthIndex = now.getMonth() === 0 ? 11 : now.getMonth() - 1;

  let total = 0;
  let todayTotal = 0;
  let yesterdayTotal = 0;
  let previousMonthTotal = 0;
  const rows = data || [];

  if (import.meta.env?.DEV) {
    const dbgStartLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const dbgEndLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    console.debug('[getMonthlyRevenue] día local (debug)', {
      todayKey,
      yesterdayKey,
      startLocalISO: dbgStartLocal.toISOString(),
      endLocalISO: dbgEndLocal.toISOString(),
      rows: rows.length,
      muestra: rows.slice(0, 8).map((r) => {
        const at = orderRevenueTimestamp(r);
        return {
          paid_at: r.paid_at,
          updated_at: r.updated_at,
          atISO: at?.toISOString?.() ?? null,
          localKey: at ? localCalendarDateKey(at) : null,
          cuentaComoHoy: at ? localCalendarDateKey(at) === todayKey : false,
        };
      }),
    });
  }

  rows.forEach((row) => {
    const amount = parseFloat(row?.total_amount) || 0;
    const at = orderRevenueTimestamp(row);
    if (!at) return;

    const inCurrentMonth = at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth();
    if (inCurrentMonth && at <= now) total += amount;

    if (localCalendarDateKey(at) === todayKey) todayTotal += amount;

    if (localCalendarDateKey(at) === yesterdayKey) yesterdayTotal += amount;

    if (at.getFullYear() === prevMonthYear && at.getMonth() === prevMonthIndex) previousMonthTotal += amount;
  });

  const currentMonthOrders = rows.filter((row) => {
    const at = orderRevenueTimestamp(row);
    if (!at) return false;
    const inCurrentMonth = at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth();
    return inCurrentMonth && at <= now;
  });
  const count = currentMonthOrders.length;
  const avgTicket = count > 0 ? Math.round(total / count) : 0;

  const monthDeltaAmount = total - previousMonthTotal;
  const monthDeltaPct = previousMonthTotal > 0 ? (monthDeltaAmount / previousMonthTotal) * 100 : (total > 0 ? 100 : 0);
  const dayDeltaAmount = todayTotal - yesterdayTotal;
  const dayDeltaPct = yesterdayTotal > 0 ? (dayDeltaAmount / yesterdayTotal) * 100 : (todayTotal > 0 ? 100 : 0);

  return {
    data: {
      total,
      count,
      avgTicket,
      todayTotal,
      yesterdayTotal,
      previousMonthTotal,
      deltas: {
        todayVsYesterday: {
          amount: dayDeltaAmount,
          percent: dayDeltaPct,
          label: 'vs ayer',
        },
        monthVsPreviousMonth: {
          amount: monthDeltaAmount,
          percent: monthDeltaPct,
          label: 'vs mes anterior',
        },
      },
      timezoneLabel: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local',
    },
    error: null,
  };
};

function resolveFunnelPeriod(range = '7d') {
  const now = new Date();
  if (range === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const prevStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
    const prevEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
    return { start, end, prevStart, prevEnd, deltaLabel: 'vs ayer' };
  }
  if (range === '30d') {
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    const end = now;
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - 30);
    const prevEnd = new Date(start.getTime() - 1);
    return { start, end, prevStart, prevEnd, deltaLabel: 'vs mes anterior' };
  }
  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  const end = now;
  const prevStart = new Date(start);
  prevStart.setDate(prevStart.getDate() - 7);
  const prevEnd = new Date(start.getTime() - 1);
  return { start, end, prevStart, prevEnd, deltaLabel: 'vs semana pasada' };
}

/**
 * `ordersRows`: pedidos creados en el periodo (`created_at`).
 * `paidRows`: cobros en el periodo (`paid_at`, solo `pagado`) — ingresos y ticket promedio.
 */
function buildFunnelBase(visits, clicksWhatsapp, ordersRows, paidRows) {
  const ordersCount = ordersRows.length;
  const paidCount = paidRows.length;
  const paidRevenue = paidRows.reduce((sum, o) => sum + (parseFloat(o?.total_amount) || 0), 0);
  const avgPaidTicket = paidCount > 0 ? Math.round(paidRevenue / paidCount) : 0;
  const rateClickFromVisit = visits > 0 ? (clicksWhatsapp / visits) * 100 : 0;
  const rateOrderFromClick = clicksWhatsapp > 0 ? (ordersCount / clicksWhatsapp) * 100 : 0;
  const rateOrderFromVisit = visits > 0 ? (ordersCount / visits) * 100 : 0;
  // Cobros en periodo / pedidos creados en periodo (denominadores distintos; ambos útiles para el embudo).
  const ratePaidFromOrder = ordersCount > 0 ? (paidCount / ordersCount) * 100 : 0;
  const ratePaidFromVisit = visits > 0 ? (paidCount / visits) * 100 : 0;
  return {
    visits,
    clicksWhatsapp,
    orders: ordersCount,
    paid: paidCount,
    paidRevenue,
    avgPaidTicket,
    rateClickFromVisit,
    rateOrderFromClick,
    rateOrderFromVisit,
    ratePaidFromOrder,
    ratePaidFromVisit,
  };
}

function deltaWithPercent(current, previous) {
  const amount = (Number(current) || 0) - (Number(previous) || 0);
  const percent = (Number(previous) || 0) > 0 ? (amount / Number(previous)) * 100 : ((Number(current) || 0) > 0 ? 100 : 0);
  return { amount, percent };
}

export const getPendingOrdersCount = async (businessId) => {
  if (!businessId) return { data: 0, error: null };
  const { count, error } = await supabase
    ?.from('wa_orders')
    ?.select('id', { count: 'exact', head: true })
    ?.eq('business_id', businessId)
    ?.eq('order_status', 'pedido');
  if (error) return { data: 0, error };
  return { data: count ?? 0, error: null };
};

export const getWeeklyOrdersCount = async (businessId) => {
  if (!businessId) return { data: 0, error: null };
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const { count, error } = await supabase
    ?.from('wa_orders')
    ?.select('id', { count: 'exact', head: true })
    ?.eq('business_id', businessId)
    ?.gte('created_at', since.toISOString());
  if (error) return { data: 0, error };
  return { data: count ?? 0, error: null };
};

/**
 * Embudo de conversión del catálogo (visitas -> pedidos -> pagados) por rango.
 * Rango soportado: 'today' | '7d' | '30d'
 */
export const getConversionFunnelStats = async (businessId, range = '7d') => {
  if (!businessId) return { data: null, error: null };

  const { start, end, prevStart, prevEnd, deltaLabel } = resolveFunnelPeriod(range);

  const { data: raw, error } = await supabase.rpc('rpc_dashboard_funnel', {
    p_business_id: businessId,
    p_start:       start.toISOString(),
    p_end:         end.toISOString(),
    p_prev_start:  prevStart.toISOString(),
    p_prev_end:    prevEnd.toISOString(),
  });
  if (error) return { data: null, error };

  const r = raw ?? {};
  const buildFromCounts = (visits, clicks, ordersCount, paidCount, paidRevenue) => {
    const avgPaidTicket = paidCount > 0 ? Math.round(paidRevenue / paidCount) : 0;
    const rateClickFromVisit   = visits > 0        ? (clicks       / visits)       * 100 : 0;
    const rateOrderFromClick   = clicks > 0        ? (ordersCount  / clicks)       * 100 : 0;
    const rateOrderFromVisit   = visits > 0        ? (ordersCount  / visits)       * 100 : 0;
    const ratePaidFromOrder    = ordersCount > 0   ? (paidCount    / ordersCount)  * 100 : 0;
    const ratePaidFromVisit    = visits > 0        ? (paidCount    / visits)       * 100 : 0;
    return { visits, clicksWhatsapp: clicks, orders: ordersCount, paid: paidCount, paidRevenue, avgPaidTicket,
             rateClickFromVisit, rateOrderFromClick, rateOrderFromVisit, ratePaidFromOrder, ratePaidFromVisit };
  };
  const currentBase  = buildFromCounts(
    Number(r.visits ?? 0), Number(r.clicks ?? 0),
    Number(r.orders ?? 0), Number(r.paid ?? 0), Number(r.paid_revenue ?? 0),
  );
  const previousBase = buildFromCounts(
    Number(r.prev_visits ?? 0), Number(r.prev_clicks ?? 0),
    Number(r.prev_orders ?? 0), Number(r.prev_paid ?? 0), Number(r.prev_revenue ?? 0),
  );

  return {
    data: {
      range,
      ...currentBase,
      previousPeriod: previousBase,
      deltas: {
        label: deltaLabel,
        visits:        deltaWithPercent(currentBase.visits,        previousBase.visits),
        clicksWhatsapp:deltaWithPercent(currentBase.clicksWhatsapp,previousBase.clicksWhatsapp),
        orders:        deltaWithPercent(currentBase.orders,        previousBase.orders),
        paid:          deltaWithPercent(currentBase.paid,          previousBase.paid),
        paidRevenue:   deltaWithPercent(currentBase.paidRevenue,   previousBase.paidRevenue),
      },
    },
    error: null,
  };
};

const AI_INSIGHTS_SESSION_KEY = 'ai_insights_disabled_session';
const AI_INSIGHTS_PERM_CODES = new Set(['MISSING_EDGE_SECRETS', 'LOCK_RPC_ERROR']);
const AI_INSIGHTS_PERM_STATUSES = new Set([404, 503]);

function aiInsightsSessionDisabled() {
  try { return !!sessionStorage.getItem(AI_INSIGHTS_SESSION_KEY); } catch { return false; }
}
function aiInsightsDisableSession(reason) {
  try {
    sessionStorage.setItem(AI_INSIGHTS_SESSION_KEY, '1');
    if (import.meta.env?.DEV) console.warn('[dashboard-ai-insights] skip permanente en sesión:', reason);
  } catch { /* sessionStorage no disponible */ }
}

/**
 * Genera insight breve de IA para dashboard usando métricas agregadas.
 * Requiere usuario autenticado (Bearer token) para evitar uso público.
 */
export const getDashboardAiInsights = async (businessId) => {
  if (aiInsightsSessionDisabled()) return { data: null, error: null };

  const supabaseUrl = (import.meta.env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
  const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '';
  if (!supabaseUrl || !anonKey) {
    return { data: null, error: { message: 'Missing Supabase config' } };
  }
  if (!businessId) return { data: null, error: { message: 'businessId required' } };

  const { data: { session } = { session: null } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  if (!session?.access_token) {
    return { data: null, error: { message: 'No active session', code: 'NO_ACTIVE_SESSION' }, pending: false };
  }

  const token = await getValidToken();
  if (!token) return { data: null, error: { message: 'No auth token' } };

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/dashboard-ai-insights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ businessId }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 202) {
      return {
        data: null,
        error: null,
        pending: true,
        message: body?.message || 'Insight en generación',
      };
    }
    if (!res.ok) {
      const isPermanent = AI_INSIGHTS_PERM_STATUSES.has(res.status) || AI_INSIGHTS_PERM_CODES.has(body?.code);
      if (isPermanent) {
        aiInsightsDisableSession(`status=${res.status} code=${body?.code}`);
        return { data: null, error: null };
      }
      logServiceWarningOnce(
        `dashboard-ai-insights-${res.status}-${body?.code || 'unknown'}`,
        '[dashboard-ai-insights] request failed',
        { status: res.status, code: body?.code || 'AI_PROVIDER_ERROR' },
      );
      return { data: null, error: { message: 'AI provider error', code: body?.code || 'AI_PROVIDER_ERROR' }, pending: false };
    }
    return { data: body?.insight || null, error: null, pending: false };
  } catch (err) {
    logServiceWarningOnce('dashboard-ai-insights-network-error', '[dashboard-ai-insights] network error');
    return { data: null, error: { message: 'Network error' }, pending: false };
  }
};

/** Estadísticas de pedidos del negocio: totales, últimos 7/30 días, ingresos del mes (por `paid_at`), por estado */
export const getBusinessOrderStats = async (businessId) => {
  if (!businessId) return { data: null, error: null };
  const now = new Date();
  const startOfMonthDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const startOfMonthIso = startOfMonthDate.toISOString();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const qm = quoteIsoForOrFilter(startOfMonthIso);

  const [allRes, paidMonthRes, byStatusRes] = await Promise.all([
    supabase?.from('wa_orders')?.select('id, created_at, order_status, payment_status, total_amount')?.eq('business_id', businessId),
    supabase
      ?.from('wa_orders')
      ?.select('total_amount, paid_at, updated_at')
      ?.eq('business_id', businessId)
      ?.eq('payment_status', 'pagado')
      ?.or(`and(paid_at.is.null,updated_at.gte.${qm}),paid_at.gte.${qm}`),
    supabase?.from('wa_orders')?.select('order_status')?.eq('business_id', businessId),
  ]);

  if (allRes?.error) return { data: null, error: allRes.error };
  const orders = allRes?.data || [];
  const totalOrders = orders.length;
  const last7 = orders.filter(o => new Date(o?.created_at) >= sevenDaysAgo).length;
  const last30 = orders.filter(o => new Date(o?.created_at) >= thirtyDaysAgo).length;
  const monthlyRevenue = (paidMonthRes?.data || []).reduce((s, r) => {
    const t = orderRevenueTimestamp(r);
    if (!t || t < startOfMonthDate || t > now) return s;
    return s + (parseFloat(r?.total_amount) || 0);
  }, 0);
  const byStatus = {};
  (byStatusRes?.data || []).forEach(r => {
    const st = r?.order_status || 'pedido';
    byStatus[st] = (byStatus[st] || 0) + 1;
  });

  return {
    data: {
      totalOrders,
      last7Days: last7,
      last30Days: last30,
      monthlyRevenue,
      byStatus,
    },
    error: null,
  };
};

// ——— Visitas al catálogo público ———

const VISIT_THROTTLE_MS = 30 * 60 * 1000; // 30 min

function getOrCreateVisitorId() {
  if (typeof sessionStorage === 'undefined') return null;
  let id = sessionStorage.getItem('wa_visitor_id');
  if (!id) {
    id = `v_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    sessionStorage.setItem('wa_visitor_id', id);
  }
  return id;
}

function shouldThrottleVisit(slug) {
  if (typeof sessionStorage === 'undefined') return true;
  const key = `wa_visit_${slug}`;
  const last = sessionStorage.getItem(key);
  if (!last) return false;
  const t = parseInt(last, 10);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < VISIT_THROTTLE_MS;
}

function markVisitDone(slug) {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(`wa_visit_${slug}`, String(Date.now()));
}

/**
 * Registra una visita al catálogo público. Throttle client-side: no envía si ya se registró en los últimos 30 min para este slug.
 * @param {string} slug - Slug del negocio
 * @param {string} [path] - Ruta actual, ej. /catalogo/mi-tienda
 */
export async function recordCatalogVisit(slug, path, attribution = {}) {
  if (!slug?.trim()) return { recorded: false, error: null };
  if (shouldThrottleVisit(slug)) return { recorded: false, throttled: true, error: null };

  const supabaseUrl = (import.meta.env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
  const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '';
  if (!supabaseUrl) {
    console.warn('[record-catalog-visit] Missing VITE_SUPABASE_URL');
    return { recorded: false, error: { message: 'Missing Supabase URL' } };
  }
  if (!anonKey) {
    console.warn('[record-catalog-visit] Missing VITE_SUPABASE_ANON_KEY');
    return { recorded: false, error: { message: 'Missing Supabase API key' } };
  }

  const visitorId = getOrCreateVisitorId();
  const body = {
    slug: slug.trim(),
    path: path || null,
    visitor_id: visitorId,
    source: attribution.source || null,
    referrer: attribution.referrer || null,
    utm_source: attribution.utm_source || null,
  };

  const url = `${supabaseUrl}/functions/v1/record-catalog-visit`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey },
      keepalive: true,
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    // Temporary: deployment verification
    console.log('[record-catalog-visit]', {
      url: url.replace(/https?:\/\/[^/]+/, '[SUPABASE]'),
      status: res.status,
      ok: res.ok,
      body: data,
    });
    if (!res.ok) {
      console.warn('[record-catalog-visit] non-OK response', res.status, data);
    }
    if (res.ok && data?.recorded) markVisitDone(slug);
    return { recorded: !!data?.recorded, throttled: data?.reason === 'throttled', error: res.ok ? null : (data?.error || { message: res.statusText }) };
  } catch (err) {
    console.error('[record-catalog-visit] fetch failed', err?.message, err);
    return { recorded: false, error: { message: err?.message || 'Network error' } };
  }
}

/**
 * Registra click en acción de WhatsApp dentro del catálogo público.
 * @param {string} slug
 * @param {string} [path]
 * @param {string} [source] - store_header | product_modal | cart_checkout | floating_button
 */
export async function recordCatalogWhatsAppClick(slug, path, source = 'unknown') {
  if (!slug?.trim()) return { recorded: false, error: null };

  const supabaseUrl = (import.meta.env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
  const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '';
  if (!supabaseUrl) {
    console.warn('[record-catalog-whatsapp-click] Missing VITE_SUPABASE_URL');
    return { recorded: false, error: { message: 'Missing Supabase URL' } };
  }
  if (!anonKey) {
    console.warn('[record-catalog-whatsapp-click] Missing VITE_SUPABASE_ANON_KEY');
    return { recorded: false, error: { message: 'Missing Supabase API key' } };
  }

  const visitorId = getOrCreateVisitorId();
  const body = { slug: slug.trim(), path: path || null, source, visitor_id: visitorId };
  const url = `${supabaseUrl}/functions/v1/record-catalog-whatsapp-click`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[record-catalog-whatsapp-click] non-OK response', res.status, data);
      return { recorded: false, error: data?.error || { message: res.statusText } };
    }
    return { recorded: !!data?.recorded, error: null };
  } catch (err) {
    console.error('[record-catalog-whatsapp-click] fetch failed', err?.message, err);
    return { recorded: false, error: { message: err?.message || 'Network error' } };
  }
}

/**
 * Estadísticas de visitas al catálogo del negocio (solo dueño).
 * @returns {{ data: { totalVisits, visits30d, visits7d, visitsToday, sourceBreakdown } | null, error }}
 */
export async function getBusinessVisitStats(businessId) {
  if (!businessId) return { data: null, error: null };
  const { data, error } = await supabase?.rpc('wa_get_business_visit_stats', { p_business_id: businessId });
  if (error) return { data: null, error };
  if (data?.error) return { data: null, error: { message: data.error } };
  return {
    data: {
      totalVisits: data?.totalVisits ?? 0,
      visits30d: data?.visits30d ?? 0,
      visits7d: data?.visits7d ?? 0,
      visitsToday: data?.visitsToday ?? 0,
      sourceBreakdown: data?.sourceBreakdown ?? {},
    },
    error: null,
  };
}

// ——— Tracking de visitas al sitio principal ———

const SITE_VISIT_THROTTLE_MS = 30 * 60 * 1000; // 30 min

function shouldThrottleSiteVisit(path) {
  if (typeof sessionStorage === 'undefined') return true;
  const key = `wa_site_visit_${path}`;
  const last = sessionStorage.getItem(key);
  if (!last) return false;
  const t = parseInt(last, 10);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < SITE_VISIT_THROTTLE_MS;
}

function markSiteVisitDone(path) {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(`wa_site_visit_${path}`, String(Date.now()));
}

/**
 * Registra una visita al sitio principal de Ventalink.
 * Throttle client-side: no envía si ya se registró en los últimos 30 min para esta ruta.
 *
 * @param {{ path: string, hostname?: string, attribution?: object }} options
 */
export async function recordSiteVisit({ path, hostname, attribution = {} } = {}) {
  const normalizedPath = (path || '/').trim();
  if (shouldThrottleSiteVisit(normalizedPath)) return { recorded: false, throttled: true };
  if (shouldSkipTrackingByRecentAuthFailure(`site:${normalizedPath}`)) {
    return { recorded: false, throttled: true, skipped: 'recent-auth-failure' };
  }

  const supabaseUrl = (import.meta.env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
  const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '';
  if (!supabaseUrl || !anonKey) return { recorded: false, error: { message: 'Missing Supabase config' } };
  if (trackingInflight.has(`site:${normalizedPath}`)) return { recorded: false, throttled: true, skipped: 'inflight' };

  const visitorId = getOrCreateVisitorId();
  const { data: { session } = { session: null } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  if (!session) return { recorded: false, skipped: 'no-session' };
  const body = {
    path: normalizedPath,
    hostname: hostname || (typeof window !== 'undefined' ? window.location.hostname : null),
    visitor_id:   visitorId,
    source:       attribution.source       || null,
    referrer:     attribution.referrer     || null,
    utm_source:   attribution.utm_source   || null,
    utm_medium:   attribution.utm_medium   || null,
    utm_campaign: attribution.utm_campaign || null,
  };

  const url = `${supabaseUrl}/functions/v1/record-site-visit`;
  try {
    trackingInflight.add(`site:${normalizedPath}`);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      keepalive: true,
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) {
      markTrackingAuthFailure(`site:${normalizedPath}`);
      markSiteVisitDone(normalizedPath);
      logServiceWarningOnce(`record-site-visit-auth-${normalizedPath}`, '[record-site-visit] skipped after auth failure', { status: res.status });
      return { recorded: false, error: null, skipped: 'auth-required' };
    }
    if (res.ok && data?.recorded) markSiteVisitDone(normalizedPath);
    return { recorded: !!data?.recorded, error: res.ok ? null : (data?.error || { message: res.statusText }) };
  } catch (err) {
    logServiceWarningOnce(`record-site-visit-network-${normalizedPath}`, '[record-site-visit] fetch failed');
    return { recorded: false, error: { message: err?.message || 'Network error' } };
  } finally {
    trackingInflight.delete(`site:${normalizedPath}`);
  }
}

/**
 * Estadísticas de visitas al sitio principal. Solo admin.
 * @returns {{ data: { total30d, total7d, totalToday, sources, pages, hostnames } | null, error }}
 */
export async function getAdminSiteVisitStats() {
  const { data, error } = await supabase?.rpc('wa_admin_get_site_visit_stats');
  if (error) return { data: null, error };
  if (data?.error) return { data: null, error: { message: data.error } };
  return {
    data: {
      total30d:   data?.total30d   ?? 0,
      total7d:    data?.total7d    ?? 0,
      totalToday: data?.totalToday ?? 0,
      sources:    Array.isArray(data?.sources)   ? data.sources   : [],
      pages:      Array.isArray(data?.pages)     ? data.pages     : [],
      hostnames:  Array.isArray(data?.hostnames) ? data.hostnames : [],
    },
    error: null,
  };
}

// ——— Consejo del día ———

/**
 * Obtiene el mensaje del día configurado por el admin.
 * @returns {{ data: string | null, error }}
 */
export async function getDailyMessage() {
  const { data, error } = await supabase?.rpc('wa_get_daily_message');
  if (error) return { data: null, error };
  return { data: data ?? null, error: null };
}

/**
 * Guarda el mensaje del día (solo admin).
 * @param {string} message
 * @returns {{ ok: boolean, error }}
 */
export async function setDailyMessage(message) {
  const { data, error } = await supabase?.rpc('wa_admin_set_daily_message', { p_message: message });
  if (error) return { ok: false, error };
  if (data?.error) return { ok: false, error: { message: data.error } };
  return { ok: true, error: null };
}

// ——— Uso del plan actual (para dashboard) ———

/**
 * Devuelve el uso actual de productos y pedidos del negocio vs los límites de su plan.
 * Usa el RPC wa_get_plan_usage que aplica auto-downgrade si el plan venció.
 */
export const getPlanUsage = async (businessId) => {
  if (!businessId) return { data: null, error: null };
  const { data, error } = await supabase?.rpc('wa_get_plan_usage', { p_business_id: businessId });
  if (error) {
    // Fallback JS si la función RPC aún no fue creada
    const { data: biz } = await supabase?.from('wa_businesses')?.select('plan_slug, plan_expires_at, trial_expires_at')?.eq('id', businessId)?.single();
    const planSlug      = biz?.plan_slug || 'starter';
    const effectivePlan = getEffectivePlanSlug(planSlug, biz?.plan_expires_at ?? null, biz?.trial_expires_at ?? null);
    const limits        = getPlanLimits(effectivePlan);
    const now           = new Date();
    const startOfMonth  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const [activeRes, orderRes] = await Promise.all([
      supabase?.from('wa_products')?.select('id', { count: 'exact', head: true })?.eq('business_id', businessId)?.eq('is_active', true),
      supabase?.from('wa_orders')?.select('id', { count: 'exact', head: true })?.eq('business_id', businessId)?.gte('created_at', startOfMonth),
    ]);
    return {
      data: {
        planSlug,
        effectivePlan,
        planExpiresAt:    biz?.plan_expires_at ?? null,
        activeProducts:   activeRes?.count ?? 0,
        maxProducts:      limits.maxProducts,
        ordersThisMonth:  orderRes?.count ?? 0,
        maxOrdersPerMonth: limits.maxOrdersPerMonth,
      },
      error: null,
    };
  }
  return { data, error: null };
};

// ——— Admin panel ———

export const getBusinessesForAdmin = async () => {
  // Intenta usar la vista enriquecida; si no existe, cae al SELECT básico
  const { data: viewData, error: viewErr } = await supabase
    ?.from('wa_admin_business_overview')
    ?.select('*')
    ?.order('created_at', { ascending: false });

  if (!viewErr && viewData) {
    return {
      data: viewData.map(row => ({
        ...mapBusinessFromDb(row),
        totalProducts:   row.total_products   ?? 0,
        activeProducts:  row.active_products  ?? 0,
        totalOrders:     row.total_orders     ?? 0,
        ordersThisMonth: row.orders_this_month ?? 0,
        effectivePlan:   row.effective_plan   ?? row.plan_slug ?? 'starter',
        isTrial:         row.is_trial         ?? false,
        visits30d:       row.visits_30d       ?? null,
        visits7d:        row.visits_7d        ?? null,
        userEmail:       row.user_email       ?? null,
        userCreatedAt:   row.user_created_at  ?? null,
        isDemoSuspected: row.is_demo_suspected ?? false,
      })),
      error: null,
    };
  }

  // Fallback
  const { data, error } = await supabase
    ?.from('wa_businesses')
    ?.select('*')
    ?.order('created_at', { ascending: false });
  if (error) return { data: null, error };
  return { data: (data || []).map(mapBusinessFromDb), error: null };
};

export const getAdminStats = async () => {
  const [b, p, o, planStats] = await Promise.all([
    supabase?.from('wa_businesses')?.select('id', { count: 'exact', head: true }),
    supabase?.from('wa_products')?.select('id', { count: 'exact', head: true }),
    supabase?.from('wa_orders')?.select('id', { count: 'exact', head: true }),
    supabase?.rpc('wa_admin_plan_stats').then(r => r?.data ?? {}),
  ]);

  // Distribución por plan desde la tabla (fallback si RPC no existe)
  let byPlan = planStats ?? {};
  if (!planStats || Object.keys(planStats).length === 0) {
    const { data: planRows } = await supabase
      ?.from('wa_businesses')
      ?.select('plan_slug');
    if (planRows) {
      byPlan = planRows.reduce((acc, r) => {
        const slug = r.plan_slug || 'starter';
        acc[slug] = (acc[slug] || 0) + 1;
        return acc;
      }, {});
    }
  }

  return {
    data: {
      totalBusinesses: b?.count ?? 0,
      totalProducts:   p?.count ?? 0,
      totalOrders:     o?.count ?? 0,
      byPlan,
    },
    error: b?.error || p?.error || o?.error || null,
  };
};

/** Negocios sospechosos / demo (para admin) */
export const getAdminSuspiciousInfo = async () => {
  const { data, error } = await supabase?.rpc('wa_admin_suspicious_businesses');
  if (error || !data) {
    // Fallback JS simple
    const { data: rows } = await supabase
      ?.from('wa_businesses')
      ?.select('id, name, slug, plan_slug, user_id');
    const counts = {};
    (rows || []).forEach(r => { counts[r.user_id] = (counts[r.user_id] || 0) + 1; });
    const multiUsers = Object.entries(counts)
      .filter(([, c]) => c > 1)
      .map(([userId, count]) => ({ userId, count }));
    const demos = (rows || []).filter(r =>
      /test|demo|prueba/i.test(r.name || '') || /test|demo/i.test(r.slug || '')
    );
    return { data: { multiBusinessUsers: multiUsers, demoBusinesses: demos }, error: null };
  }
  return { data, error: null };
};

// ——— Rubros y categorías por rubro ———

const mapRubroFromDb = (row) => ({
  id: row?.id,
  name: row?.name,
  slug: row?.slug,
  sortOrder: row?.sort_order ?? 0,
  createdAt: row?.created_at,
  updatedAt: row?.updated_at,
});

const mapRubroCategoryFromDb = (row) => ({
  id: row?.id,
  rubroId: row?.rubro_id,
  name: row?.name,
  sortOrder: row?.sort_order ?? 0,
  createdAt: row?.created_at,
  updatedAt: row?.updated_at,
});

/** Lista todos los rubros (para selector de negocio y admin). */
export const getRubros = async () => {
  const { data, error } = await supabase?.from('wa_rubros')?.select('*')?.order('sort_order', { ascending: true });
  if (error) return { data: null, error };
  return { data: (data || []).map(mapRubroFromDb), error: null };
};

/** Categorías de un rubro (para formulario de producto y catálogo público). */
export const getCategoriesByRubroId = async (rubroId) => {
  if (!rubroId) return { data: [], error: null };
  const { data, error } = await supabase
    ?.from('wa_rubro_categories')
    ?.select('*')
    ?.eq('rubro_id', rubroId)
    ?.order('sort_order', { ascending: true });
  if (error) return { data: null, error };
  return { data: (data || []).map(mapRubroCategoryFromDb), error: null };
};

// ——— Categorías propias del negocio ———

const BUSINESS_CATEGORY_LIMIT = 30;
const BUSINESS_CATEGORY_NAME_MAX = 60;

/** Convierte texto a slug limpio (sin acentos, solo a-z0-9-). */
function slugifyBusinessCategory(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

const mapBusinessCategoryFromDb = (row) => ({
  id: row?.id,
  businessId: row?.business_id,
  name: row?.name,
  slug: row?.slug,
  sortOrder: row?.sort_order ?? 0,
  createdAt: row?.created_at,
  updatedAt: row?.updated_at,
});

/** Devuelve las categorías propias de un negocio, ordenadas por sort_order. */
export const getBusinessCategories = async (businessId) => {
  if (!businessId) return { data: [], error: null };
  const { data, error } = await supabase
    ?.from('wa_business_categories')
    ?.select('*')
    ?.eq('business_id', businessId)
    ?.order('sort_order', { ascending: true });
  if (error) return { data: null, error };
  return { data: (data || []).map(mapBusinessCategoryFromDb), error: null };
};

/**
 * Crea una categoría propia para el negocio.
 * Valida límite (30) y longitud de nombre.
 */
export const createBusinessCategory = async (businessId, { name, sortOrder = 0 }) => {
  const trimmed = String(name || '').trim();
  if (!trimmed) return { data: null, error: { message: 'El nombre de la categoría es obligatorio' } };
  if (trimmed.length > BUSINESS_CATEGORY_NAME_MAX) {
    return { data: null, error: { message: `El nombre no puede superar ${BUSINESS_CATEGORY_NAME_MAX} caracteres` } };
  }
  // Verificar límite
  const { count } = await supabase
    ?.from('wa_business_categories')
    ?.select('id', { count: 'exact', head: true })
    ?.eq('business_id', businessId) ?? {};
  if ((count ?? 0) >= BUSINESS_CATEGORY_LIMIT) {
    return { data: null, error: { message: `Límite de ${BUSINESS_CATEGORY_LIMIT} categorías propias alcanzado` } };
  }
  const slug = slugifyBusinessCategory(trimmed);
  const { data, error } = await supabase
    ?.from('wa_business_categories')
    ?.insert({ business_id: businessId, name: trimmed, slug, sort_order: sortOrder })
    ?.select()
    ?.single();
  if (error) {
    const isDuplicate = error?.code === '23505';
    return { data: null, error: { message: isDuplicate ? 'Ya existe una categoría con ese nombre' : error.message } };
  }
  return { data: mapBusinessCategoryFromDb(data), error: null };
};

/**
 * Renombra una categoría propia.
 * Actualiza en cascada los productos del negocio que usaban el nombre anterior.
 */
export const updateBusinessCategory = async (id, businessId, { name, sortOrder }) => {
  const updates = {};
  if (name !== undefined) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return { data: null, error: { message: 'El nombre es obligatorio' } };
    if (trimmed.length > BUSINESS_CATEGORY_NAME_MAX) {
      return { data: null, error: { message: `Máximo ${BUSINESS_CATEGORY_NAME_MAX} caracteres` } };
    }
    updates.name = trimmed;
    updates.slug = slugifyBusinessCategory(trimmed);
  }
  if (sortOrder !== undefined) updates.sort_order = sortOrder;
  // Obtener nombre actual antes de actualizar (para cascade)
  const { data: existing } = await supabase
    ?.from('wa_business_categories')?.select('name')?.eq('id', id)?.single() ?? {};
  const { data, error } = await supabase
    ?.from('wa_business_categories')
    ?.update(updates)
    ?.eq('id', id)
    ?.select()
    ?.single();
  if (error) {
    const isDuplicate = error?.code === '23505';
    return { data: null, error: { message: isDuplicate ? 'Ya existe una categoría con ese nombre' : error.message } };
  }
  // Cascade: actualizar productos que tenían el nombre anterior
  if (updates.name && existing?.name && existing.name !== updates.name) {
    await supabase
      ?.from('wa_products')
      ?.update({ category: updates.name })
      ?.eq('business_id', businessId)
      ?.eq('category', existing.name);
  }
  return { data: mapBusinessCategoryFromDb(data), error: null };
};

/**
 * Cuenta cuántos productos activos usan una categoría.
 * Se usa para mostrar el aviso de confirmación antes de eliminar.
 */
export const countProductsInBusinessCategory = async (businessId, categoryName) => {
  const { count } = await supabase
    ?.from('wa_products')
    ?.select('id', { count: 'exact', head: true })
    ?.eq('business_id', businessId)
    ?.eq('category', categoryName) ?? {};
  return count ?? 0;
};

/**
 * Elimina una categoría propia.
 * Si desassignProducts=true, pone category=null en los productos afectados antes de borrar.
 */
export const deleteBusinessCategory = async (id, businessId, { desassignProducts = true } = {}) => {
  const { data: cat } = await supabase
    ?.from('wa_business_categories')?.select('name')?.eq('id', id)?.single() ?? {};
  if (desassignProducts && cat?.name) {
    await supabase
      ?.from('wa_products')
      ?.update({ category: null })
      ?.eq('business_id', businessId)
      ?.eq('category', cat.name);
  }
  const { error } = await supabase
    ?.from('wa_business_categories')
    ?.delete()
    ?.eq('id', id);
  return { error };
};

// ——— Admin: CRUD rubros ———

export const createRubro = async (payload) => {
  const { data, error } = await supabase?.from('wa_rubros')?.insert({
    name: payload?.name,
    slug: payload?.slug || payload?.name?.toLowerCase()?.replace(/\s+/g, '-')?.replace(/[^a-z0-9-]/g, '') || 'rubro',
    sort_order: payload?.sortOrder ?? 0,
  })?.select()?.single();
  if (error) return { data: null, error };
  return { data: mapRubroFromDb(data), error: null };
};

export const updateRubro = async (id, payload) => {
  const db = {};
  if (payload?.name !== undefined) db.name = payload.name;
  if (payload?.slug !== undefined) db.slug = payload.slug;
  if (payload?.sortOrder !== undefined) db.sort_order = payload.sortOrder;
  const { data, error } = await supabase?.from('wa_rubros')?.update(db)?.eq('id', id)?.select()?.single();
  if (error) return { data: null, error };
  return { data: mapRubroFromDb(data), error: null };
};

export const deleteRubro = async (id) => {
  const { error } = await supabase?.from('wa_rubros')?.delete()?.eq('id', id);
  if (error) return { error };
  return { error: null };
};

// ——— Admin: CRUD categorías por rubro ———

export const createRubroCategory = async (payload) => {
  const { data, error } = await supabase?.from('wa_rubro_categories')?.insert({
    rubro_id: payload?.rubroId,
    name: payload?.name,
    sort_order: payload?.sortOrder ?? 0,
  })?.select()?.single();
  if (error) return { data: null, error };
  return { data: mapRubroCategoryFromDb(data), error: null };
};

export const updateRubroCategory = async (id, payload) => {
  const db = {};
  if (payload?.name !== undefined) db.name = payload.name;
  if (payload?.sortOrder !== undefined) db.sort_order = payload.sortOrder;
  const { data, error } = await supabase?.from('wa_rubro_categories')?.update(db)?.eq('id', id)?.select()?.single();
  if (error) return { data: null, error };
  return { data: mapRubroCategoryFromDb(data), error: null };
};

export const deleteRubroCategory = async (id) => {
  const { error } = await supabase?.from('wa_rubro_categories')?.delete()?.eq('id', id);
  if (error) return { error };
  return { error: null };
};

// ——— Proveedores ———

const mapSupplierFromDb = (row) => ({
  id: row?.id,
  businessId: row?.business_id,
  name: row?.name,
  contactName: row?.contact_name,
  phone: row?.phone,
  email: row?.email,
  notes: row?.notes,
  supplierType: row?.supplier_type ?? 'otros',
  createdAt: row?.created_at,
  updatedAt: row?.updated_at,
});

const mapDebtFromDb = (row) => ({
  id: row?.id,
  businessId: row?.business_id,
  supplierId: row?.supplier_id,
  description: row?.description,
  amount: Number(row?.amount ?? 0),
  amountPaid: Number(row?.amount_paid ?? 0),
  balance: Number(row?.amount ?? 0) - Number(row?.amount_paid ?? 0),
  dueDate: row?.due_date,
  paidAt: row?.paid_at,
  status: row?.status,
  createdAt: row?.created_at,
  updatedAt: row?.updated_at,
});

export const getSuppliers = async (businessId) => {
  const { data, error } = await supabase
    ?.from('wa_suppliers')
    ?.select('*')
    ?.eq('business_id', businessId)
    ?.order('name');
  if (error) return { data: null, error };
  return { data: data?.map(mapSupplierFromDb) ?? [], error: null };
};

export const getSupplier = async (id) => {
  const { data, error } = await supabase?.from('wa_suppliers')?.select('*')?.eq('id', id)?.single();
  if (error) return { data: null, error };
  return { data: mapSupplierFromDb(data), error: null };
};

export const createSupplier = async (businessId, payload) => {
  const { data, error } = await supabase?.from('wa_suppliers')?.insert({
    business_id: businessId,
    name: payload?.name,
    contact_name: payload?.contactName ?? null,
    phone: payload?.phone ?? null,
    email: payload?.email ?? null,
    notes: payload?.notes ?? null,
    supplier_type: payload?.supplierType ?? 'otros',
  })?.select()?.single();
  if (error) return { data: null, error };
  return { data: mapSupplierFromDb(data), error: null };
};

export const updateSupplier = async (id, payload) => {
  const db = {};
  if (payload?.name !== undefined) db.name = payload.name;
  if (payload?.contactName !== undefined) db.contact_name = payload.contactName;
  if (payload?.phone !== undefined) db.phone = payload.phone;
  if (payload?.email !== undefined) db.email = payload.email;
  if (payload?.notes !== undefined) db.notes = payload.notes;
  if (payload?.supplierType !== undefined) db.supplier_type = payload.supplierType;
  const { data, error } = await supabase?.from('wa_suppliers')?.update(db)?.eq('id', id)?.select()?.single();
  if (error) return { data: null, error };
  return { data: mapSupplierFromDb(data), error: null };
};

export const deleteSupplier = async (id) => {
  const { error } = await supabase?.from('wa_suppliers')?.delete()?.eq('id', id);
  if (error) return { error };
  return { error: null };
};

export const getSupplierDebts = async (supplierId) => {
  const { data, error } = await supabase
    ?.from('wa_supplier_debts')
    ?.select('*')
    ?.eq('supplier_id', supplierId)
    ?.order('created_at', { ascending: false });
  if (error) return { data: null, error };
  return { data: data?.map(mapDebtFromDb) ?? [], error: null };
};

export const getAllBusinessDebts = async (businessId) => {
  const { data, error } = await supabase
    ?.from('wa_supplier_debts')
    ?.select('*')
    ?.eq('business_id', businessId)
    ?.order('due_date', { ascending: true, nullsFirst: false });
  if (error) return { data: null, error };
  return { data: data?.map(mapDebtFromDb) ?? [], error: null };
};

export const createSupplierDebt = async (businessId, supplierId, payload) => {
  const { data, error } = await supabase?.from('wa_supplier_debts')?.insert({
    business_id: businessId,
    supplier_id: supplierId,
    description: payload?.description,
    amount: payload?.amount,
    due_date: payload?.dueDate ?? null,
    status: 'pending',
  })?.select()?.single();
  if (error) return { data: null, error };
  return { data: mapDebtFromDb(data), error: null };
};

export const updateSupplierDebt = async (id, payload) => {
  const db = {};
  if (payload?.description !== undefined) db.description = payload.description;
  if (payload?.amount !== undefined) db.amount = payload.amount;
  if (payload?.amountPaid !== undefined) db.amount_paid = payload.amountPaid;
  if (payload?.dueDate !== undefined) db.due_date = payload.dueDate;
  if (payload?.status !== undefined) db.status = payload.status;
  const { data, error } = await supabase?.from('wa_supplier_debts')?.update(db)?.eq('id', id)?.select()?.single();
  if (error) return { data: null, error };
  return { data: mapDebtFromDb(data), error: null };
};

export const addDebtPayment = async (id, paymentAmount, currentAmountPaid, totalAmount) => {
  const newAmountPaid = Math.min(Number(currentAmountPaid) + Number(paymentAmount), Number(totalAmount));
  const isPaidOff = newAmountPaid >= Number(totalAmount);
  const db = {
    amount_paid: newAmountPaid,
    ...(isPaidOff ? { status: 'paid', paid_at: new Date().toISOString() } : {}),
  };
  const { data, error } = await supabase?.from('wa_supplier_debts')?.update(db)?.eq('id', id)?.select()?.single();
  if (error) return { data: null, error };
  return { data: mapDebtFromDb(data), error: null };
};

export const markDebtAsPaid = async (id, totalAmount) => {
  const { data, error } = await supabase
    ?.from('wa_supplier_debts')
    ?.update({ status: 'paid', paid_at: new Date().toISOString(), amount_paid: totalAmount ?? undefined })
    ?.eq('id', id)
    ?.select()
    ?.single();
  if (error) return { data: null, error };
  return { data: mapDebtFromDb(data), error: null };
};

export const deleteSupplierDebt = async (id) => {
  const { error } = await supabase?.from('wa_supplier_debts')?.delete()?.eq('id', id);
  if (error) return { error };
  return { error: null };
};
