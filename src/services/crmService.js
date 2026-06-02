import { supabase } from '../lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function formatQuoteNumber(n, documentTitleType = 'cotizacion') {
  const prefix = documentTitleType === 'presupuesto' ? 'PRES' : 'COT';
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

/** Returns UI and PDF labels for the quote document type. */
export function getQuoteDocLabel(documentTitleType = 'cotizacion') {
  if (documentTitleType === 'presupuesto') {
    return {
      title: 'Presupuesto', titleUpper: 'PRESUPUESTO', prefix: 'PRES',
      singular: 'presupuesto', plural: 'presupuestos',
      nuevo: 'Nuevo presupuesto', crear: 'Crear presupuesto',
    };
  }
  return {
    title: 'Cotización', titleUpper: 'COTIZACIÓN', prefix: 'COT',
    singular: 'cotización', plural: 'cotizaciones',
    nuevo: 'Nueva cotización', crear: 'Crear cotización',
  };
}

export function formatInvoiceNumber(n) {
  return `NV-${String(n).padStart(4, '0')}`;
}

function calcItemSubtotal(unitPrice, quantity, discountPct, discountType = 'percentage') {
  const base = (unitPrice || 0) * (quantity || 0);
  if (discountType === 'fixed') {
    return +(Math.max(0, base - Math.min(discountPct || 0, base))).toFixed(2);
  }
  return +(base - (base * (discountPct || 0)) / 100).toFixed(2);
}

function calcItemDiscountAmount(item) {
  const base = (item.unit_price || 0) * (item.quantity || 0);
  if (item.discount_type === 'fixed') return Math.min(item.discount_pct || 0, base);
  return (base * (item.discount_pct || 0)) / 100;
}

function calcDocTotals(items) {
  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
  const discountAmount = items.reduce((s, i) => s + calcItemDiscountAmount(i), 0);
  const total = subtotal;
  return {
    subtotal: +subtotal.toFixed(2),
    discount_amount: +discountAmount.toFixed(2),
    total: +total.toFixed(2),
  };
}

export const PAYMENT_METHOD_LABELS = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  bank_transfer: 'Transferencia',
  check: 'Cheque',
  other: 'Otro',
};

export function getLocalDateString() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

export function normalizePaymentMethod(method) {
  const value = String(method || '').trim().toLowerCase();
  const map = {
    cash: 'cash',
    efectivo: 'cash',
    card: 'card',
    tarjeta: 'card',
    bank_transfer: 'bank_transfer',
    transferencia: 'bank_transfer',
    check: 'check',
    cheque: 'check',
    other: 'other',
    otro: 'other',
  };
  return map[value] || 'other';
}

// ─────────────────────────────────────────────────────────────────────────────
// CLIENTES
// ─────────────────────────────────────────────────────────────────────────────

export async function getCrmCustomers(businessId) {
  const { data, error } = await supabase
    .from('wa_customers')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });
  return { data: data || [], error };
}

export async function getCrmCustomer(id) {
  const { data, error } = await supabase
    .from('wa_customers')
    .select('*')
    .eq('id', id)
    .single();
  return { data, error };
}

export async function createCrmCustomer(businessId, fields) {
  const { data, error } = await supabase
    .from('wa_customers')
    .insert({ business_id: businessId, ...fields })
    .select()
    .single();
  return { data, error };
}

export async function updateCrmCustomer(id, fields) {
  const { data, error } = await supabase
    .from('wa_customers')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  return { data, error };
}

export async function deleteCrmCustomer(id) {
  const { error } = await supabase.from('wa_customers').delete().eq('id', id);
  return { error };
}

// ─────────────────────────────────────────────────────────────────────────────
// PRESUPUESTOS
// ─────────────────────────────────────────────────────────────────────────────

export async function getCrmQuotes(businessId) {
  const { data, error } = await supabase
    .from('crm_quotes')
    .select('*, wa_customers(id, name, company)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });
  return { data: data || [], error };
}

export async function getCrmQuote(id) {
  const { data, error } = await supabase
    .from('crm_quotes')
    .select('*, wa_customers(id, name, company, phone, email, address, rut), crm_quote_items(*)')
    .eq('id', id)
    .single();
  if (data?.crm_quote_items) {
    data.crm_quote_items.sort((a, b) => a.sort_order - b.sort_order);
  }
  return { data, error };
}

export async function createCrmQuote(businessId, { customerId, validUntil, notes, paymentTerms, deliveryDays, deliveryMethod, commercialNotes, items = [] }) {
  const { data: nextNum, error: numErr } = await supabase
    .rpc('crm_next_quote_number', { p_business_id: businessId });
  if (numErr) return { data: null, error: numErr };

  const mappedItems = items.map((it, idx) => ({
    ...it,
    discount_type: it.discount_type || 'percentage',
    subtotal: calcItemSubtotal(it.unit_price, it.quantity, it.discount_pct || 0, it.discount_type || 'percentage'),
    sort_order: idx,
  }));
  const totals = calcDocTotals(mappedItems);

  const { data: quote, error } = await supabase
    .from('crm_quotes')
    .insert({
      business_id: businessId,
      customer_id: customerId || null,
      quote_number: nextNum,
      valid_until: validUntil || null,
      notes: notes || null,
      payment_terms: paymentTerms || null,
      delivery_days: deliveryDays || null,
      delivery_method: deliveryMethod || null,
      commercial_notes: commercialNotes || null,
      ...totals,
    })
    .select()
    .single();
  if (error) return { data: null, error };

  if (mappedItems.length > 0) {
    const { error: itemsErr } = await supabase
      .from('crm_quote_items')
      .insert(mappedItems.map(it => ({ ...it, quote_id: quote.id })));
    if (itemsErr) return { data: null, error: itemsErr };
  }
  return { data: quote, error: null };
}

export async function updateCrmQuote(quoteId, { customerId, validUntil, notes, paymentTerms, deliveryDays, deliveryMethod, commercialNotes, status, items }) {
  const updates = {};
  if (customerId !== undefined) updates.customer_id = customerId;
  if (validUntil !== undefined) updates.valid_until = validUntil;
  if (notes !== undefined) updates.notes = notes;
  if (status !== undefined) updates.status = status;
  if (paymentTerms !== undefined) updates.payment_terms = paymentTerms;
  if (deliveryDays !== undefined) updates.delivery_days = deliveryDays;
  if (deliveryMethod !== undefined) updates.delivery_method = deliveryMethod;
  if (commercialNotes !== undefined) updates.commercial_notes = commercialNotes;

  if (items !== undefined) {
    const mappedItems = items.map((it, idx) => ({
      ...it,
      discount_type: it.discount_type || 'percentage',
      subtotal: calcItemSubtotal(it.unit_price, it.quantity, it.discount_pct || 0, it.discount_type || 'percentage'),
      sort_order: idx,
    }));
    const totals = calcDocTotals(mappedItems);
    Object.assign(updates, totals);

    await supabase.from('crm_quote_items').delete().eq('quote_id', quoteId);
    if (mappedItems.length > 0) {
      await supabase.from('crm_quote_items')
        .insert(mappedItems.map(it => ({ ...it, quote_id: quoteId })));
    }
  }

  const { data, error } = await supabase
    .from('crm_quotes')
    .update(updates)
    .eq('id', quoteId)
    .select()
    .single();
  return { data, error };
}

export async function duplicateCrmQuote(quoteId) {
  const { data: original, error } = await getCrmQuote(quoteId);
  if (error || !original) return { data: null, error: error || new Error('Not found') };
  return createCrmQuote(original.business_id, {
    customerId: original.customer_id,
    validUntil: original.valid_until,
    notes: original.notes,
    items: (original.crm_quote_items || []).map(it => ({
      product_id: it.product_id,
      name: it.name,
      description: it.description,
      unit_price: it.unit_price,
      quantity: it.quantity,
      discount_pct: it.discount_pct,
      discount_type: it.discount_type || 'percentage',
    })),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// FACTURAS INTERNAS
// ─────────────────────────────────────────────────────────────────────────────

export async function getCrmInvoices(businessId) {
  const { data, error } = await supabase
    .from('crm_invoices')
    .select('*, wa_customers(id, name, company), crm_payments(amount)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });
  return { data: data || [], error };
}

export async function getCrmInvoice(id) {
  const { data, error } = await supabase
    .from('crm_invoices')
    .select('*, wa_customers(id, name, company, phone, email, address, rut), crm_invoice_items(*)')
    .eq('id', id)
    .single();
  if (data?.crm_invoice_items) {
    data.crm_invoice_items.sort((a, b) => a.sort_order - b.sort_order);
  }
  return { data, error };
}

export async function createCrmInvoice(businessId, { customerId, issueDate, dueDate, notes, paymentTerms, deliveryDays, deliveryMethod, commercialNotes, items = [], quoteId }) {
  const { data: nextNum, error: numErr } = await supabase
    .rpc('crm_next_invoice_number', { p_business_id: businessId });
  if (numErr) return { data: null, error: numErr };

  const mappedItems = items.map((it, idx) => ({
    ...it,
    discount_type: it.discount_type || 'percentage',
    subtotal: calcItemSubtotal(it.unit_price, it.quantity, it.discount_pct || 0, it.discount_type || 'percentage'),
    sort_order: idx,
  }));
  const totals = calcDocTotals(mappedItems);

  const { data: invoice, error } = await supabase
    .from('crm_invoices')
    .insert({
      business_id: businessId,
      customer_id: customerId || null,
      invoice_number: nextNum,
      issue_date: issueDate || new Date().toISOString().slice(0, 10),
      due_date: dueDate || null,
      notes: notes || null,
      payment_terms: paymentTerms || null,
      delivery_days: deliveryDays || null,
      delivery_method: deliveryMethod || null,
      commercial_notes: commercialNotes || null,
      quote_id: quoteId || null,
      ...totals,
    })
    .select()
    .single();
  if (error) return { data: null, error };

  if (mappedItems.length > 0) {
    const { error: itemsErr } = await supabase
      .from('crm_invoice_items')
      .insert(mappedItems.map(it => ({ ...it, invoice_id: invoice.id })));
    if (itemsErr) return { data: null, error: itemsErr };
  }
  return { data: invoice, error: null };
}

export async function updateCrmInvoiceStatus(invoiceId, status) {
  const updates = { status };
  if (status === 'pagada') updates.paid_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('crm_invoices')
    .update(updates)
    .eq('id', invoiceId)
    .select()
    .single();
  return { data, error };
}

/** Convierte un presupuesto aceptado en factura interna */
export async function convertQuoteToInvoice(quoteId) {
  const { data: quote, error } = await getCrmQuote(quoteId);
  if (error || !quote) return { data: null, error: error || new Error('Not found') };

  const { data: invoice, error: invErr } = await createCrmInvoice(quote.business_id, {
    customerId: quote.customer_id,
    notes: quote.notes,
    quoteId: quote.id,
    items: (quote.crm_quote_items || []).map(it => ({
      product_id: it.product_id,
      name: it.name,
      description: it.description,
      unit_price: it.unit_price,
      quantity: it.quantity,
      discount_pct: it.discount_pct,
      discount_type: it.discount_type || 'percentage',
    })),
  });
  if (invErr) return { data: null, error: invErr };

  await supabase
    .from('crm_quotes')
    .update({ converted_to_invoice_id: invoice.id, status: 'aceptado' })
    .eq('id', quoteId);

  return { data: invoice, error: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// STOCK
// ─────────────────────────────────────────────────────────────────────────────

export async function getCrmStockProducts(businessId) {
  const { data, error } = await supabase
    .from('wa_products')
    .select('id, name, price, image_url, thumbnail_url, card_image_url, images, category, stock_actual, stock_minimo, is_active')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('name', { ascending: true });
  return { data: data || [], error };
}

export async function getCrmStockMovements(businessId, productId) {
  let q = supabase
    .from('crm_stock_movements')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (productId) q = q.eq('product_id', productId);
  const { data, error } = await q;
  return { data: data || [], error };
}

export async function registerStockMovement(businessId, { productId, type, quantity, notes }) {
  const { data: { user } } = await supabase.auth.getUser();

  const { error: movErr } = await supabase
    .from('crm_stock_movements')
    .insert({
      business_id: businessId,
      product_id: productId,
      type,
      quantity,
      notes: notes || null,
      created_by: user?.id || null,
    });
  if (movErr) return { error: movErr };

  // Actualizar stock_actual directamente
  const delta = type === 'entrada' ? quantity : type === 'salida' ? -quantity : 0;
  let updateData;
  if (type === 'ajuste') {
    updateData = { stock_actual: quantity };
  } else {
    // Sumar/restar al valor actual
    const { data: prod } = await supabase
      .from('wa_products')
      .select('stock_actual')
      .eq('id', productId)
      .single();
    const current = prod?.stock_actual ?? 0;
    updateData = { stock_actual: Math.max(0, current + delta) };
  }

  const { error: updErr } = await supabase
    .from('wa_products')
    .update(updateData)
    .eq('id', productId);

  return { error: updErr || null };
}

export async function updateStockMinimo(productId, stockMinimo) {
  const { error } = await supabase
    .from('wa_products')
    .update({ stock_minimo: stockMinimo })
    .eq('id', productId);
  return { error };
}

// ─────────────────────────────────────────────────────────────────────────────
// TERMINAL DE VENTAS (POS)
// ─────────────────────────────────────────────────────────────────────────────

export async function createPosInvoice(businessId, { customerId, items = [], discount = 0, paymentMethod = 'cash', notes, currency = 'CLP' }) {
  // Defensive server-side guard: no open cash session → reject before any DB write.
  const { data: openSession } = await getOpenCashSession(businessId);
  if (!openSession) {
    return { data: null, error: { message: 'No hay caja abierta. Abre caja antes de registrar una venta.' } };
  }

  const { data: nextNum, error: numErr } = await supabase
    .rpc('crm_next_invoice_number', { p_business_id: businessId });
  if (numErr) return { data: null, error: numErr };

  const localDate = getLocalDateString();
  const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod);

  const mappedItems = items.map((it, idx) => ({
    product_id: it.product_id || null,
    name: it.name,
    description: null,
    unit_price: it.unit_price,
    quantity: it.quantity,
    discount_pct: 0,
    subtotal: +(it.unit_price * it.quantity).toFixed(2),
    sort_order: idx,
  }));

  const subtotal = mappedItems.reduce((s, i) => s + i.subtotal, 0);
  const discountAmount = +Math.min(discount, subtotal).toFixed(2);
  const total = +(subtotal - discountAmount).toFixed(2);

  const { data: invoice, error } = await supabase
    .from('crm_invoices')
    .insert({
      business_id: businessId,
      customer_id: customerId || null,
      invoice_number: nextNum,
      issue_date: localDate,
      status: 'pagada',
      subtotal: +subtotal.toFixed(2),
      discount_amount: discountAmount,
      total,
      notes: notes || null,
      paid_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) return { data: null, error };

  if (mappedItems.length > 0) {
    const { error: itemsErr } = await supabase
      .from('crm_invoice_items')
      .insert(mappedItems.map(it => ({ ...it, invoice_id: invoice.id })));
    if (itemsErr) return { data: null, error: itemsErr };
  }

  const { data: { user } } = await supabase.auth.getUser();

  // Register payment record
  const { error: payErr } = await supabase
    .from('crm_payments')
    .insert({
      business_id: businessId,
      invoice_id: invoice.id,
      amount: total,
      currency: currency || 'CLP',
      payment_method: normalizedPaymentMethod,
      payment_status: 'received',
      payment_date: localDate,
      reference: `TPV ${formatInvoiceNumber(nextNum)}`,
      notes: notes || null,
      created_by: user?.id || null,
    });
  if (payErr) return { data: null, error: payErr };

  return { data: invoice, error: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD CRM
// ─────────────────────────────────────────────────────────────────────────────

export async function getCrmDashboardStats(businessId) {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [quotesRes, invoicesRes, customersRes, stockRes] = await Promise.all([
    supabase
      .from('crm_quotes')
      .select('id, quote_number, status, total, created_at, wa_customers(name)')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('crm_invoices')
      .select('id, invoice_number, status, total, created_at, wa_customers(name)')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('wa_customers')
      .select('id, name, company, created_at')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('wa_products')
      .select('id, name, stock_actual, stock_minimo')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .not('stock_actual', 'is', null)
      .not('stock_minimo', 'is', null),
  ]);

  // Totales del mes
  const [monthQuotes, monthInvoices] = await Promise.all([
    supabase
      .from('crm_quotes')
      .select('total')
      .eq('business_id', businessId)
      .in('status', ['enviado', 'aceptado'])
      .gte('created_at', firstOfMonth),
    supabase
      .from('crm_invoices')
      .select('total')
      .eq('business_id', businessId)
      .neq('status', 'anulada')
      .gte('created_at', firstOfMonth),
  ]);

  const totalPresupuestadoMes = (monthQuotes.data || []).reduce((s, r) => s + (r.total || 0), 0);
  const totalFacturadoMes = (monthInvoices.data || []).reduce((s, r) => s + (r.total || 0), 0);
  const stockBajo = (stockRes.data || []).filter(p => (p.stock_actual ?? 0) < (p.stock_minimo ?? 0));

  return {
    recentQuotes: quotesRes.data || [],
    recentInvoices: invoicesRes.data || [],
    recentCustomers: customersRes.data || [],
    stockBajo,
    totalPresupuestadoMes,
    totalFacturadoMes,
  };
}

// ─── Centro de Costos ────────────────────────────────────────────────────────

export async function getCrmSalesTotalsForPeriod(businessId, month, year) {
  const from = new Date(year, month - 1, 1).toISOString();
  const to = new Date(year, month, 1).toISOString();

  const { data } = await supabase
    .from('crm_invoices')
    .select('total, issue_date')
    .eq('business_id', businessId)
    .neq('status', 'anulada')
    .gte('issue_date', from)
    .lt('issue_date', to);

  const salesMonth = (data || []).reduce((s, r) => s + (r.total || 0), 0);

  const today = new Date().toISOString().slice(0, 10);
  const salesToday = (data || [])
    .filter(r => r.issue_date && r.issue_date.slice(0, 10) === today)
    .reduce((s, r) => s + (r.total || 0), 0);

  return { salesMonth, salesToday };
}

export async function getCrmDailySalesForPeriod(businessId, month, year) {
  const from = new Date(year, month - 1, 1).toISOString();
  const to = new Date(year, month, 1).toISOString();

  const { data } = await supabase
    .from('crm_invoices')
    .select('total, issue_date')
    .eq('business_id', businessId)
    .neq('status', 'anulada')
    .gte('issue_date', from)
    .lt('issue_date', to);

  const byDay = {};
  for (const r of data || []) {
    const day = r.issue_date ? parseInt(r.issue_date.slice(8, 10), 10) : null;
    if (day) byDay[day] = (byDay[day] || 0) + (r.total || 0);
  }
  return byDay;
}

export async function getCostCenter(businessId, month, year) {
  const { data } = await supabase
    .from('crm_cost_centers')
    .select('*')
    .eq('business_id', businessId)
    .eq('month', month)
    .eq('year', year)
    .maybeSingle();
  return data;
}

export async function upsertCostCenter(businessId, month, year, fields) {
  const { data, error } = await supabase
    .from('crm_cost_centers')
    .upsert(
      { business_id: businessId, month, year, ...fields },
      { onConflict: 'business_id,month,year' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function bulkCreateCostItems(businessId, month, year, items) {
  if (!items.length) return [];
  const rows = items.map(it => ({ business_id: businessId, month, year, ...it }));
  const { data, error } = await supabase.from('crm_cost_items').insert(rows).select();
  if (error) throw error;
  return data || [];
}

export async function getCostItems(businessId, month, year) {
  const { data } = await supabase
    .from('crm_cost_items')
    .select('*')
    .eq('business_id', businessId)
    .eq('month', month)
    .eq('year', year)
    .order('created_at', { ascending: true });
  return data || [];
}

export async function createCostItem(businessId, month, year, fields) {
  const { data, error } = await supabase
    .from('crm_cost_items')
    .insert({ business_id: businessId, month, year, ...fields })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCostItem(id, fields) {
  const { data, error } = await supabase
    .from('crm_cost_items')
    .update(fields)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCostItem(id) {
  const { error } = await supabase.from('crm_cost_items').delete().eq('id', id);
  if (error) throw error;
}

// ─── Compras registradas ──────────────────────────────────────────────────────

export async function getCrmPurchases(businessId, month, year) {
  const { data } = await supabase
    .from('crm_purchases')
    .select('*')
    .eq('business_id', businessId)
    .eq('month', month)
    .eq('year', year)
    .order('purchase_date', { ascending: true });
  return data || [];
}

export async function createCrmPurchase(businessId, month, year, fields) {
  const { data, error } = await supabase
    .from('crm_purchases')
    .insert({ business_id: businessId, month, year, ...fields })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCrmPurchase(id, fields) {
  const { data, error } = await supabase
    .from('crm_purchases')
    .update(fields)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCrmPurchase(id) {
  const { error } = await supabase.from('crm_purchases').delete().eq('id', id);
  if (error) throw error;
}

// ─── Gastos variables ─────────────────────────────────────────────────────────
// Reusa la tabla crm_purchases: description=nombre, supplier=categoría

export async function getVariableExpenses(businessId, month, year) {
  const { data } = await supabase
    .from('crm_purchases')
    .select('*')
    .eq('business_id', businessId)
    .eq('month', month)
    .eq('year', year)
    .order('purchase_date', { ascending: false });
  return data || [];
}

export async function createVariableExpense(businessId, month, year, { name, category, amount, date }) {
  const { data, error } = await supabase
    .from('crm_purchases')
    .insert({
      business_id: businessId, month, year,
      description: name,
      supplier: category,
      amount,
      purchase_date: date,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateVariableExpense(id, { name, category, amount, date }) {
  const { data, error } = await supabase
    .from('crm_purchases')
    .update({ description: name, supplier: category, amount, purchase_date: date })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteVariableExpense(id) {
  const { error } = await supabase.from('crm_purchases').delete().eq('id', id);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────────────
// Caja Diaria (crm_cash_sessions)
// ─────────────────────────────────────────────────────────────────────────────

export async function getOpenCashSession(businessId) {
  const { data, error } = await supabase
    .from('crm_cash_sessions')
    .select('*')
    .eq('business_id', businessId)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { data, error };
}

export async function getLatestCashSessionForDate(businessId, date = getLocalDateString()) {
  const { data, error } = await supabase
    .from('crm_cash_sessions')
    .select('*')
    .eq('business_id', businessId)
    .eq('date', date)
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { data, error };
}

export async function getCashSessionsForDate(businessId, date = getLocalDateString()) {
  const { data, error } = await supabase
    .from('crm_cash_sessions')
    .select('*')
    .eq('business_id', businessId)
    .eq('date', date)
    .order('opened_at', { ascending: false });
  return { data: data || [], error };
}

export async function openCashSession(businessId, { openedBy, initialAmount = null, date = null, notes = null } = {}) {
  const openRes = await getOpenCashSession(businessId);
  if (openRes.error) return { data: null, error: openRes.error };
  if (openRes.data) {
    return {
      data: null,
      error: new Error('Ya hay una caja abierta. Cierra esa caja antes de abrir otra.'),
    };
  }

  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('crm_cash_sessions')
    .insert({
      business_id: businessId,
      opened_by: openedBy || user?.id || null,
      initial_amount: initialAmount,
      date: date || getLocalDateString(),
      status: 'open',
      opened_at: new Date().toISOString(),
    })
    .select()
    .single();
  return { data, error };
}

export async function reopenCashSession(sessionId) {
  const { data: session, error: sessionError } = await supabase
    .from('crm_cash_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();
  if (sessionError) return { data: null, error: sessionError };

  const openRes = await getOpenCashSession(session.business_id);
  if (openRes.error) return { data: null, error: openRes.error };
  if (openRes.data && openRes.data.id !== sessionId) {
    return {
      data: null,
      error: new Error('No se puede reabrir esta caja porque ya hay otra caja abierta.'),
    };
  }

  const { data, error } = await supabase
    .from('crm_cash_sessions')
    .update({ status: 'open', closed_at: null })
    .eq('id', sessionId)
    .select()
    .single();
  return { data, error };
}

export async function updateCashSession(sessionId, fields = {}) {
  const updates = {};
  if (fields.initial_amount !== undefined) updates.initial_amount = fields.initial_amount;
  if (fields.notes !== undefined) updates.notes = fields.notes || null;

  const { data, error } = await supabase
    .from('crm_cash_sessions')
    .update(updates)
    .eq('id', sessionId)
    .select()
    .single();
  return { data, error };
}

export async function closeCashSession(sessionId) {
  const { data, error } = await supabase
    .from('crm_cash_sessions')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', sessionId)
    .select()
    .single();
  return { data, error };
}

export async function getPaymentsForSession(businessId, sessionId) {
  const { data: session, error: sErr } = await supabase
    .from('crm_cash_sessions')
    .select('opened_at, closed_at, date')
    .eq('id', sessionId)
    .single();
  if (sErr) throw sErr;

  // Filter by payment_date (the actual date column) matching the session date.
  // This is the canonical field — created_at can differ due to timezone offsets.
  const sessionDate = session.date || session.opened_at.slice(0, 10);

  const { data, error } = await supabase
    .from('crm_payments')
    .select('id, amount, payment_method, payment_status, payment_date, created_at, invoice_id, customer_id, notes, reference')
    .eq('business_id', businessId)
    .eq('payment_date', sessionDate)
    .eq('payment_status', 'received')
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data || []).map(p => ({ ...p, payment_method: p.payment_method || 'otro' }));
}

export async function getCashSessionPayments(businessId, session) {
  if (!session?.opened_at) return { data: [], error: null };

  let query = supabase
    .from('crm_payments')
    .select('id, business_id, invoice_id, amount, currency, payment_method, payment_status, payment_date, reference, notes, created_at')
    .eq('business_id', businessId)
    .eq('payment_status', 'received')
    .gte('created_at', session.opened_at);

  query = query.lte('created_at', session.closed_at || new Date().toISOString());

  const { data, error } = await query
    .order('created_at', { ascending: false });
  return { data: data || [], error };
}

export async function getCashDayPayments(businessId, date = getLocalDateString()) {
  const { data, error } = await supabase
    .from('crm_payments')
    .select('id, business_id, invoice_id, amount, currency, payment_method, payment_status, payment_date, reference, notes, created_at')
    .eq('business_id', businessId)
    .eq('payment_date', date)
    .eq('payment_status', 'received')
    .order('created_at', { ascending: false });
  return { data: data || [], error };
}

export async function updateCrmPayment(paymentId, fields = {}) {
  const updates = {};
  if (fields.amount !== undefined) updates.amount = fields.amount;
  if (fields.payment_method !== undefined) updates.payment_method = normalizePaymentMethod(fields.payment_method);
  if (fields.reference !== undefined) updates.reference = fields.reference || null;
  if (fields.notes !== undefined) updates.notes = fields.notes || null;

  const { data, error } = await supabase
    .from('crm_payments')
    .update(updates)
    .eq('id', paymentId)
    .select()
    .single();
  return { data, error };
}

export async function getRecentCashSessions(businessId, limit = 10) {
  const { data, error } = await supabase
    .from('crm_cash_sessions')
    .select('*')
    .eq('business_id', businessId)
    .order('opened_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}
