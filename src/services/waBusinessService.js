import { supabase } from '../lib/supabase';
import { getPlanLimits } from '../constants/plans';

// Helpers

const SUPPORTED_COUNTRY_CODES = new Set(['AR', 'BO', 'BR', 'CL', 'CO', 'CR', 'EC', 'GT', 'MX', 'PA', 'PE', 'PY', 'UY']);

function normalizeCountryCode(value, currencyHint) {
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

  const currency = (currencyHint || '').toString().trim().toUpperCase();
  if (currency === 'ARS') return 'AR';
  if (currency === 'CLP') return 'CL';

  return 'CL';
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

const mapBusinessFromDb = (row) => {
  const designSettings = row?.design_settings || null;
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
  countryCode: normalizeCountryCode(row?.country_code ?? row?.country, row?.currency),
  currency: row?.currency,
  logoUrl: row?.logo_url || designSettings?.logoUrl || null,
  coverImageUrl: row?.cover_image_url || designSettings?.headerImageUrl || designSettings?.coverImageUrl || null,
  slug: row?.slug,
  isActive: row?.is_active,
  rubroId: row?.rubro_id || null,
  designSettings,
  bankName: row?.bank_name || '',
  bankAccountType: row?.bank_account_type || '',
  bankAccountNumber: row?.bank_account_number || '',
  bankAccountHolder: row?.bank_account_holder || '',
  bankRut: row?.bank_rut || '',
  bankEmail: row?.bank_email || '',
  orderMessageTemplate: row?.order_message_template || null,
  planSlug: row?.plan_slug || 'starter',
  planExpiresAt: row?.plan_expires_at ?? null,
  trialExpiresAt: row?.trial_expires_at ?? null,
  scheduledPlanSlug: row?.scheduled_plan_slug ?? null,
  scheduledChangeAt: row?.scheduled_change_at ?? null,
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
    description: row?.description,
    price: parseFloat(row?.price),
    imageUrl: row?.image_url || imagesArray?.[0] || null,
    images: imagesArray,
    isActive: row?.is_active ?? (status === 'active'),
    status,
    sortOrder: row?.sort_order,
    category: row?.category || null,
    hasOptions: row?.has_options || false,
    optionsDescription: row?.options_description || null,
    createdAt: row?.created_at,
    updatedAt: row?.updated_at,
  };
};

const ORDER_STATUS_VALID = ['pedido', 'en_preparacion', 'enviado', 'entregado', 'cancelado'];
const PAYMENT_STATUS_VALID = ['pendiente', 'pagado', 'anulado'];

const mapOrderFromDb = (row) => ({
  id: row?.id,
  businessId: row?.business_id,
  customerName: row?.customer_name,
  customerPhone: row?.customer_phone,
  customerEmail: row?.customer_email ?? null,
  totalAmount: parseFloat(row?.total_amount),
  subtotal: row?.subtotal != null ? parseFloat(row?.subtotal) : null,
  currency: row?.currency ?? 'CLP',
  status: ORDER_STATUS_VALID.includes(row?.order_status) ? row?.order_status : 'pedido',
  paymentStatus: PAYMENT_STATUS_VALID.includes(row?.payment_status) ? row?.payment_status : 'pendiente',
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
  const { data, error } = await supabase?.from('wa_businesses')?.select('*')?.eq('user_id', user?.id)?.maybeSingle();
  if (error) {
    console.error('[waBusinessService] getMyBusiness error:', error);
    return { data: null, error };
  }
  console.log('[waBusinessService] getMyBusiness result:', data ? `found id=${data?.id}` : 'not found');
  return { data: data ? mapBusinessFromDb(data) : null, error: null };
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
  const { data, error } = await supabase?.from('wa_businesses')?.select('*')?.eq('slug', slug)?.eq('is_active', true)?.maybeSingle();
  if (error) return { data: null, error };
  return { data: data ? mapBusinessFromDb(data) : null, error: null };
};

export const createBusiness = async (businessData) => {
  const { data: { user } } = await supabase?.auth?.getUser();
  if (!user) return { data: null, error: { message: 'Usuario no autenticado' } };
  let slug = await generateSlug(businessData?.name);
  const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase?.from('wa_businesses')?.insert({
      user_id: user?.id,
      name: businessData?.name,
      description: businessData?.description || null,
      whatsapp: businessData?.whatsapp || '',
      email: businessData?.email || null,
      address: businessData?.address || null,
      city: businessData?.city || null,
      region: businessData?.region || null,
      country: businessData?.country || null,
      country_code: normalizeCountryCode(businessData?.countryCode ?? businessData?.country, businessData?.currency),
      currency: businessData?.currency || 'CLP',
      logo_url: businessData?.logoUrl || null,
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
  return { data: mapBusinessFromDb(data), error: null };
};

export const createBusinessForUser = async (userId, businessData) => {
  if (!userId) return { data: null, error: { message: 'Usuario no autenticado' } };
  let slug = await generateSlug(businessData?.name);
  const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase?.from('wa_businesses')?.insert({
      user_id: userId,
      name: businessData?.name,
      description: businessData?.description || null,
      whatsapp: businessData?.whatsapp || '',
      email: businessData?.email || null,
      address: businessData?.address || null,
      city: businessData?.city || null,
      region: businessData?.region || null,
      country: businessData?.country || null,
      country_code: normalizeCountryCode(businessData?.countryCode ?? businessData?.country, businessData?.currency),
      currency: businessData?.currency || 'CLP',
      logo_url: businessData?.logoUrl || null,
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
  if (updates?.whatsapp !== undefined)    dbUpdates.whatsapp = updates?.whatsapp;
  if (updates?.email !== undefined)       dbUpdates.email = updates?.email;
  if (updates?.address !== undefined)     dbUpdates.address = updates?.address;
  if (updates?.city !== undefined)        dbUpdates.city = updates?.city;
  if (updates?.region !== undefined)      dbUpdates.region = updates?.region;
  if (updates?.country !== undefined)     dbUpdates.country = updates?.country;
  if (updates?.countryCode !== undefined) dbUpdates.country_code = normalizeCountryCode(updates?.countryCode, updates?.currency);
  else if (updates?.country !== undefined) dbUpdates.country_code = normalizeCountryCode(updates?.country, updates?.currency);
  if (updates?.currency !== undefined)    dbUpdates.currency = updates?.currency;
  if (updates?.logoUrl !== undefined)     dbUpdates.logo_url = updates?.logoUrl;
  if (updates?.coverImageUrl !== undefined) dbUpdates.cover_image_url = updates?.coverImageUrl;
  if (updates?.slug !== undefined)        dbUpdates.slug = updates?.slug;
  if (updates?.isActive !== undefined)    dbUpdates.is_active = updates?.isActive;
  if (updates?.designSettings !== undefined) dbUpdates.design_settings = updates?.designSettings;
  if (updates?.rubroId !== undefined) dbUpdates.rubro_id = updates?.rubroId || null;
  if (updates?.bankName !== undefined)          dbUpdates.bank_name = updates?.bankName;
  if (updates?.bankAccountType !== undefined)   dbUpdates.bank_account_type = updates?.bankAccountType;
  if (updates?.bankAccountNumber !== undefined) dbUpdates.bank_account_number = updates?.bankAccountNumber;
  if (updates?.bankAccountHolder !== undefined) dbUpdates.bank_account_holder = updates?.bankAccountHolder;
  if (updates?.bankRut !== undefined)           dbUpdates.bank_rut = updates?.bankRut;
  if (updates?.bankEmail !== undefined)         dbUpdates.bank_email = updates?.bankEmail;
  if (updates?.planSlug !== undefined)         dbUpdates.plan_slug = updates?.planSlug;
  if (updates?.planExpiresAt !== undefined)    dbUpdates.plan_expires_at = updates?.planExpiresAt ?? null;
  if (updates?.trialExpiresAt !== undefined)   dbUpdates.trial_expires_at = updates?.trialExpiresAt ?? null;
  console.log('[waBusinessService] updateBusiness: payload =', dbUpdates);
  const { data, error } = await supabase?.from('wa_businesses')?.update(dbUpdates)?.eq('id', businessId)?.eq('user_id', user?.id)?.select()?.single();
  if (error) {
    console.error('[waBusinessService] updateBusiness error:', error);
    return { data: null, error };
  }
  console.log('[waBusinessService] updateBusiness success: updated id =', data?.id);
  return { data: mapBusinessFromDb(data), error: null };
}

// ——— Upload a R2 (Cloudflare) vía presigned URL ———
// Usa el mismo cliente supabase de la app (lib/supabase.js con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY).
// Solo se envía el JWT del usuario (session.access_token), nunca la anon key como Bearer.
async function uploadToR2(file, { type, businessId, productId }) {
  const supabaseUrl = (import.meta.env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
  if (!supabaseUrl) return { url: null, error: { message: 'Missing Supabase URL' } };

  console.warn('[uploadToR2] start', {
    type,
    businessId: businessId ?? null,
    productId: productId ?? null,
    fileName: file?.name ?? null,
    contentType: file?.type ?? null,
    fileSize: file?.size ?? null,
  });
  const { data: { session } } = await supabase.auth.getSession();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  // Logs temporales para depurar 401 en upload-image-r2 (no imprimir el token completo)
  console.log('[uploadToR2] session exists:', !!session);
  console.log('[uploadToR2] session.access_token exists:', !!session?.access_token);
  console.log('[uploadToR2] access_token length:', session?.access_token ? session.access_token.length : 0);
  console.log('[uploadToR2] userData.user exists:', !!userData?.user);
  console.log('[uploadToR2] user id:', userData?.user?.id ?? null);
  console.log('[uploadToR2] userError:', userError ? {
    message: userError.message,
    status: userError.status ?? null,
    name: userError.name ?? null,
  } : null);
  if (!session?.access_token || !userData?.user) {
    return { url: null, error: { message: 'Usuario no autenticado o sesión inválida' } };
  }
  const accessToken = String(session.access_token).trim();
  const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '';
  const fileName = file?.name || 'upload';
  const contentType = file?.type || 'image/jpeg';
  const res = await fetch(`${supabaseUrl}/functions/v1/upload-image-r2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(anonKey ? { apikey: anonKey } : {}),
    },
    body: JSON.stringify({ type, businessId, productId: productId || undefined, fileName, contentType }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { url: null, error: typeof data?.error === 'string' ? { message: data.error } : (data?.error || { message: res.statusText }) };
  const { uploadUrl, publicUrl } = data;
  if (!uploadUrl || !publicUrl) return { url: null, error: { message: 'Respuesta inválida del servidor' } };
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  });
  if (!putRes.ok) return { url: null, error: { message: 'Error al subir el archivo a almacenamiento' } };
  return { url: publicUrl, error: null };
}

export const uploadBusinessLogo = async (file, businessId) => {
  return uploadToR2(file, { type: 'logo', businessId });
};

export const uploadBusinessCover = async (file, businessId) => {
  return uploadToR2(file, { type: 'cover', businessId });
};

// wa_products

export const getProducts = async (businessId) => {
  const { data, error } = await supabase?.from('wa_products')?.select('*')?.eq('business_id', businessId)?.order('sort_order', { ascending: true });
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
    ?.eq('status', 'active');
  if (error) return 0;
  return count ?? 0;
};

export const createProduct = async (businessId, productData) => {
  const { data: biz } = await supabase?.from('wa_businesses')?.select('plan_slug, plan_expires_at, trial_expires_at')?.eq('id', businessId)?.single();
  const planSlug = biz?.plan_slug || 'starter';
  const planExpiresAt = biz?.plan_expires_at ?? null;
  const effectivePlan = getEffectivePlanSlug(planSlug, planExpiresAt, biz?.trial_expires_at ?? null);
  if (effectivePlan !== planSlug && ['pro', 'business'].includes(planSlug)) {
    await supabase?.from('wa_businesses')?.update({ plan_slug: 'starter', plan_expires_at: null, trial_expires_at: null })?.eq('id', businessId);
  }
  const { maxProducts } = getPlanLimits(effectivePlan);
  if (maxProducts != null) {
    const activeCount = await getActiveProductCount(businessId);
    const willBeActive = productData?.isActive !== false;
    if (willBeActive && activeCount >= maxProducts) {
      return { data: null, error: { message: `Has alcanzado el límite de ${maxProducts} productos activos de tu plan. Actualiza a Pro o Business para más.` } };
    }
  }
  const imagesArr = Array.isArray(productData?.images) ? productData.images : [];
  const imageUrl = productData?.imageUrl ?? imagesArr?.[0] ?? null;
  const status = ['active', 'inactive', 'archived'].includes(productData?.status)
    ? productData.status
    : (productData?.isActive !== false ? 'active' : 'inactive');
  const { data, error } = await supabase?.from('wa_products')?.insert({
    business_id: businessId,
    name: productData?.name,
    description: productData?.description || null,
    price: productData?.price,
    image_url: imageUrl,
    images: imagesArr?.length > 0 ? imagesArr : (imageUrl ? [imageUrl] : []),
    status,
    is_active: status === 'active',
    sort_order: productData?.sortOrder || 0,
    category: productData?.category || null,
    has_options: productData?.hasOptions || false,
    options_description: productData?.optionsDescription || null,
  })?.select()?.single();
  if (error) return { data: null, error };
  return { data: mapProductFromDb(data), error: null };
};

export const updateProduct = async (productId, productData) => {
  if (productData?.isActive === true) {
    const { data: product } = await supabase?.from('wa_products')?.select('business_id, is_active')?.eq('id', productId)?.single();
    if (product?.business_id) {
      const { data: biz } = await supabase?.from('wa_businesses')?.select('plan_slug, plan_expires_at, trial_expires_at')?.eq('id', product.business_id)?.single();
      const planSlug = biz?.plan_slug || 'starter';
      const effectivePlan = getEffectivePlanSlug(planSlug, biz?.plan_expires_at ?? null, biz?.trial_expires_at ?? null);
      if (effectivePlan !== planSlug && ['pro', 'business'].includes(planSlug)) {
        await supabase?.from('wa_businesses')?.update({ plan_slug: 'starter', plan_expires_at: null, trial_expires_at: null })?.eq('id', product.business_id);
      }
      const { maxProducts } = getPlanLimits(effectivePlan);
      if (maxProducts != null && !product?.is_active) {
        const activeCount = await getActiveProductCount(product.business_id);
        if (activeCount >= maxProducts) {
          return { data: null, error: { message: `Límite de ${maxProducts} productos activos. Desactiva uno o actualiza tu plan.` } };
        }
      }
    }
  }
  const dbUpdates = {};
  if (productData?.name !== undefined)        dbUpdates.name = productData?.name;
  if (productData?.description !== undefined) dbUpdates.description = productData?.description;
  if (productData?.price !== undefined)       dbUpdates.price = productData?.price;
  if (productData?.imageUrl !== undefined)    dbUpdates.image_url = productData?.imageUrl;
  if (productData?.status !== undefined && ['active', 'inactive', 'archived'].includes(productData.status)) {
    dbUpdates.status = productData.status;
  } else if (productData?.isActive !== undefined) {
    dbUpdates.status = productData.isActive ? 'active' : 'inactive';
  }
  if (productData?.sortOrder !== undefined)   dbUpdates.sort_order = productData?.sortOrder;
  if (productData?.hasOptions !== undefined)  dbUpdates.has_options = productData?.hasOptions;
  if (productData?.optionsDescription !== undefined) dbUpdates.options_description = productData?.optionsDescription;
  if (productData?.category !== undefined) dbUpdates.category = productData?.category || null;
  if (productData?.images !== undefined) dbUpdates.images = Array.isArray(productData.images) ? productData.images : (productData?.imageUrl ? [productData.imageUrl] : []);
  const { data, error } = await supabase?.from('wa_products')?.update(dbUpdates)?.eq('id', productId)?.select()?.single();
  if (error) return { data: null, error };
  return { data: mapProductFromDb(data), error: null };
};

export const deleteProduct = async (productId) => {
  const { error } = await supabase?.from('wa_products')?.delete()?.eq('id', productId);
  if (error) return { error };
  return { error: null };
};

export const uploadProductImage = async (file, businessId, productId) => {
  return uploadToR2(file, { type: 'product', businessId, productId });
};

// wa_orders

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
    if (ORDER_STATUS_VALID.includes(s)) dbUpdates.order_status = s;
  }
  if (updates?.paymentStatus !== undefined) {
    const p = updates?.paymentStatus;
    if (PAYMENT_STATUS_VALID.includes(p)) dbUpdates.payment_status = p;
  }
  if (updates?.notes !== undefined)         dbUpdates.notes = updates?.notes;
  if (updates?.internalNotes !== undefined) dbUpdates.internal_notes = updates?.internalNotes;
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
        const label = maxOrdersPerMonth === 30 ? 'Starter/Control' : effectivePlan;
        return {
          data: null,
          error: {
            message: `Este catálogo alcanzó el límite de ${maxOrdersPerMonth} pedidos del mes (plan ${label}). El negocio debe actualizar su plan para seguir recibiendo pedidos.`,
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

  const { error: orderError } = await supabase?.from('wa_orders')?.insert({
      id: orderId,
      business_id: businessId,
      customer_name: (orderData?.customerName || '').trim() || null,
      customer_phone: orderData?.customerPhone?.trim() || null,
      customer_email: orderData?.customerEmail?.trim() || null,
      total_amount: totalAmount,
      subtotal: orderData?.subtotal != null ? Number(orderData.subtotal) : totalAmount,
      currency: orderData?.currency || 'CLP',
      order_status: 'pedido',
      payment_status: 'pendiente',
      notes: orderData?.notes?.trim() || null,
    });
  if (orderError) {
    const isPlanLimit = (orderError?.message || '').includes('PLAN_LIMIT_EXCEEDED');
    return {
      data: null,
      error: isPlanLimit
        ? { message: 'Tu plan Free permite 30 pedidos por mes. Actualiza a Pro para recibir pedidos ilimitados.', code: 'PLAN_LIMIT_EXCEEDED' }
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
      notes: orderData?.notes?.trim() || null,
      items: [],
      createdAt: new Date().toISOString(),
    },
    error: null,
  };
};

export const deleteProducts = async (productIds) => {
  if (!productIds?.length) return { error: null };
  const { error } = await supabase?.from('wa_products')?.delete()?.in('id', productIds);
  if (error) return { error };
  return { error: null };
};

export async function getPublicProducts(businessId) {
  const { data, error } = await supabase
    ?.from('wa_products')
    ?.select('*')
    ?.eq('business_id', businessId)
    ?.eq('is_active', true)
    ?.order('sort_order', { ascending: true });
  if (error) return { data: null, error };
  return { data: (data || [])?.map(mapProductFromDb), error: null };
}

// Analytics

export const getOrdersByDay = async (businessId, days = 7) => {
  const since = new Date();
  since?.setDate(since?.getDate() - (days - 1));
  since?.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    ?.from('wa_orders')
    ?.select('created_at')
    ?.eq('business_id', businessId)
    ?.gte('created_at', since?.toISOString());
  if (error) return { data: null, error };
  // Build a map of date -> count for the last `days` days
  const counts = {};
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d?.setDate(d?.getDate() - (days - 1 - i));
    const key = d?.toISOString()?.slice(0, 10);
    counts[key] = 0;
  }
  (data || [])?.forEach(row => {
    const key = row?.created_at?.slice(0, 10);
    if (key && counts?.[key] !== undefined) counts[key]++;
  });
  const result = Object.entries(counts)?.map(([date, count]) => ({ date, count }));
  return { data: result, error: null };
};

export const getTopProducts = async (businessId, limit = 5) => {
  const { data, error } = await supabase
    ?.from('wa_order_items')
    ?.select('product_id, product_name, quantity, subtotal, wa_orders!inner(business_id)')
    ?.eq('wa_orders.business_id', businessId);
  if (error) return { data: null, error };
  // Aggregate by product
  const map = {};
  (data || [])?.forEach(item => {
    const key = item?.product_id || item?.product_name;
    if (!map?.[key]) map[key] = { productName: item?.product_name, totalQty: 0, totalRevenue: 0 };
    map[key].totalQty += item?.quantity || 0;
    map[key].totalRevenue += parseFloat(item?.subtotal) || 0;
  });
  const sorted = Object.values(map)?.sort((a, b) => b?.totalQty - a?.totalQty)?.slice(0, limit);
  return { data: sorted, error: null };
};

/** Ingresos del mes: solo pedidos con payment_status = 'pagado' y created_at en el mes actual */
export const getMonthlyRevenue = async (businessId) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)?.toISOString();
  const { data, error } = await supabase
    ?.from('wa_orders')
    ?.select('total_amount')
    ?.eq('business_id', businessId)
    ?.eq('payment_status', 'pagado')
    ?.gte('created_at', startOfMonth);
  if (error) return { data: null, error };
  const total = (data || [])?.reduce((sum, row) => sum + (parseFloat(row?.total_amount) || 0), 0);
  const count = (data || [])?.length;
  const avgTicket = count > 0 ? Math.round(total / count) : 0;
  return { data: { total, count, avgTicket }, error: null };
};

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

/** Estadísticas de pedidos del negocio: totales, últimos 7/30 días, ingresos mes, por estado */
export const getBusinessOrderStats = async (businessId) => {
  if (!businessId) return { data: null, error: null };
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [allRes, paidMonthRes, byStatusRes] = await Promise.all([
    supabase?.from('wa_orders')?.select('id, created_at, order_status, payment_status, total_amount')?.eq('business_id', businessId),
    supabase?.from('wa_orders')?.select('total_amount')?.eq('business_id', businessId)?.eq('payment_status', 'pagado')?.gte('created_at', startOfMonth),
    supabase?.from('wa_orders')?.select('order_status')?.eq('business_id', businessId),
  ]);

  if (allRes?.error) return { data: null, error: allRes.error };
  const orders = allRes?.data || [];
  const totalOrders = orders.length;
  const last7 = orders.filter(o => new Date(o?.created_at) >= sevenDaysAgo).length;
  const last30 = orders.filter(o => new Date(o?.created_at) >= thirtyDaysAgo).length;
  const monthlyRevenue = (paidMonthRes?.data || []).reduce((s, r) => s + (parseFloat(r?.total_amount) || 0), 0);
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
export async function recordCatalogVisit(slug, path) {
  if (!slug?.trim()) return { recorded: false, error: null };
  if (shouldThrottleVisit(slug)) return { recorded: false, throttled: true, error: null };

  const supabaseUrl = (import.meta.env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
  if (!supabaseUrl) {
    console.warn('[record-catalog-visit] Missing VITE_SUPABASE_URL');
    return { recorded: false, error: { message: 'Missing Supabase URL' } };
  }

  const visitorId = getOrCreateVisitorId();
  const body = { slug: slug.trim(), path: path || null, visitor_id: visitorId };

  const url = `${supabaseUrl}/functions/v1/record-catalog-visit`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
 * Estadísticas de visitas al catálogo del negocio (solo dueño).
 * @returns {{ data: { totalVisits, visits30d, visits7d, visitsToday } | null, error }}
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
    },
    error: null,
  };
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