/**
 * supplierInvoiceService.js — capa de servicio para el modelo canónico de
 * facturas/compras y pagos de proveedor (PROVEEDORES-CORE-2/2B), separada
 * de waBusinessService.js a propósito (PROVEEDORES-CORE-3): no seguir
 * haciendo crecer ese archivo con lógica financiera nueva.
 *
 * wa_supplier_invoices no tiene status/amount_paid/balance almacenados --
 * se derivan siempre desde wa_supplier_invoice_balances (nunca
 * recalculados acá). Toda escritura de pagos pasa exclusivamente por la
 * RPC wa_register_supplier_payment -- nunca un INSERT directo (esa tabla
 * y wa_supplier_payment_allocations no tienen política de INSERT bajo
 * RLS, así que un INSERT directo fallaría de todos modos).
 */
import { supabase } from '../lib/supabase';

const mapInvoiceRow = (row) => ({
  id: row?.id,
  businessId: row?.business_id,
  supplierId: row?.supplier_id,
  documentType: row?.document_type,
  documentNumber: row?.document_number,
  issueDate: row?.issue_date,
  dueDate: row?.due_date,
  purchaseType: row?.purchase_type,
  netAmount: Number(row?.net_amount ?? 0),
  taxRate: Number(row?.tax_rate ?? 0),
  // PROVEEDORES-CORE-4A: metadata de captura, nunca fuente de verdad
  // contable -- ver comentario de la migración que agrega la columna.
  taxIncluded: row?.tax_included ?? true,
  taxAmount: Number(row?.tax_amount ?? 0),
  totalAmount: Number(row?.total_amount ?? 0),
  notes: row?.notes,
  createdAt: row?.created_at,
  updatedAt: row?.updated_at,
});

const mapPaymentRow = (row) => ({
  id: row?.id,
  businessId: row?.business_id,
  supplierId: row?.supplier_id,
  paymentDate: row?.payment_date,
  amount: Number(row?.amount ?? 0),
  paymentMethod: row?.payment_method,
  reference: row?.reference,
  notes: row?.notes,
  createdBy: row?.created_by,
  createdAt: row?.created_at,
});

/** Fusiona una fila de wa_supplier_invoices con su balance derivado (si existe). */
function withBalance(invoice, balanceRow) {
  return {
    ...invoice,
    paidAmount: Number(balanceRow?.paid_amount ?? 0),
    balance: balanceRow ? Number(balanceRow.balance) : invoice.totalAmount,
    paymentStatus: balanceRow?.payment_status ?? 'pending',
    isOverdue: Boolean(balanceRow?.is_overdue),
  };
}

async function fetchInvoicesWithBalances(invoicesQuery, balancesQuery) {
  const [{ data: invoices, error: invError }, { data: balances, error: balError }] = await Promise.all([
    invoicesQuery,
    balancesQuery,
  ]);
  if (invError) return { data: null, error: invError };
  if (balError) return { data: null, error: balError };
  const balanceByInvoiceId = new Map((balances ?? []).map((b) => [b.invoice_id, b]));
  const merged = (invoices ?? []).map((row) => withBalance(mapInvoiceRow(row), balanceByInvoiceId.get(row.id)));
  return { data: merged, error: null };
}

/** Todas las facturas de un negocio, con balance/estado ya derivados. */
export const getSupplierInvoices = async (businessId) => {
  return fetchInvoicesWithBalances(
    supabase?.from('wa_supplier_invoices')?.select('*')?.eq('business_id', businessId)?.order('issue_date', { ascending: false }),
    supabase?.from('wa_supplier_invoice_balances')?.select('*')?.eq('business_id', businessId),
  );
};

/** Facturas de un proveedor puntual (detalle de proveedor). */
export const getSupplierInvoicesBySupplier = async (supplierId) => {
  return fetchInvoicesWithBalances(
    supabase?.from('wa_supplier_invoices')?.select('*')?.eq('supplier_id', supplierId)?.order('issue_date', { ascending: false }),
    supabase?.from('wa_supplier_invoice_balances')?.select('*')?.eq('supplier_id', supplierId),
  );
};

const DUPLICATE_DOCUMENT_MESSAGE = 'Ya existe una factura con ese número de documento para este proveedor.';

export const createSupplierInvoice = async (businessId, supplierId, payload) => {
  const { data, error } = await supabase?.from('wa_supplier_invoices')?.insert({
    business_id: businessId,
    supplier_id: supplierId,
    document_type: payload?.documentType,
    document_number: payload?.documentNumber || null,
    issue_date: payload?.issueDate,
    due_date: payload?.dueDate || null,
    purchase_type: payload?.purchaseType || null,
    net_amount: payload?.netAmount ?? 0,
    tax_rate: payload?.taxRate ?? 0,
    tax_included: payload?.taxIncluded ?? true,
    tax_amount: payload?.taxAmount ?? 0,
    total_amount: payload?.totalAmount,
    notes: payload?.notes || null,
  })?.select()?.single();
  if (error?.code === '23505') return { data: null, error: new Error(DUPLICATE_DOCUMENT_MESSAGE) };
  if (error) return { data: null, error };
  return { data: mapInvoiceRow(data), error: null };
};

// Campos que nunca se aceptan en updateSupplierInvoice una vez que la
// factura tiene paid_amount > 0 -- los 4 monetarios pedidos por CORE-3 §8,
// más document_type/purchase_type/issue_date por prudencia (CORE-3
// hardening): ninguno de estos cambia el monto directamente, pero
// cambiarlos después de que ya se pagó algo contra un total específico
// puede dejar la clasificación/fecha de la factura inconsistente con lo
// que ya se cobró.
const PROTECTED_INVOICE_FIELDS_WHEN_PAID = [
  'documentType', 'purchaseType', 'issueDate',
  'netAmount', 'taxRate', 'taxIncluded', 'taxAmount', 'totalAmount',
];

const INVOICE_ALREADY_PAID_MESSAGE =
  'Esta factura ya tiene pagos registrados: no se pueden modificar sus datos financieros ni su clasificación. Solo se puede editar el número de documento, el vencimiento y las notas.';

/**
 * payload solo debe incluir los campos que realmente cambiaron.
 *
 * PROVEEDORES-CORE-3 hardening: la restricción de "factura con pagos no
 * puede tocar campos financieros" NO depende solo de que
 * SupplierInvoiceFormModal omita esos campos en su payload -- acá se
 * vuelve a verificar server-side (bueno, cliente-Supabase-side, pero
 * INDEPENDIENTE de qué UI llame a esta función) contra el estado real en
 * wa_supplier_invoice_balances antes de escribir nada. Un caller que
 * ignore la UI y llame updateSupplierInvoice directamente con
 * totalAmount igual es rechazado acá.
 */
export const updateSupplierInvoice = async (id, payload) => {
  const { data: balanceRow, error: balanceError } = await supabase
    ?.from('wa_supplier_invoice_balances')
    ?.select('paid_amount')
    ?.eq('invoice_id', id)
    ?.maybeSingle();
  if (balanceError) return { data: null, error: balanceError };

  const paidAmount = Number(balanceRow?.paid_amount ?? 0);
  if (paidAmount > 0) {
    const attemptedProtectedFields = PROTECTED_INVOICE_FIELDS_WHEN_PAID.filter((field) => payload?.[field] !== undefined);
    if (attemptedProtectedFields.length > 0) {
      return { data: null, error: new Error(INVOICE_ALREADY_PAID_MESSAGE) };
    }
  }

  const db = {};
  if (payload?.documentType !== undefined) db.document_type = payload.documentType;
  if (payload?.documentNumber !== undefined) db.document_number = payload.documentNumber;
  if (payload?.issueDate !== undefined) db.issue_date = payload.issueDate;
  if (payload?.dueDate !== undefined) db.due_date = payload.dueDate;
  if (payload?.purchaseType !== undefined) db.purchase_type = payload.purchaseType;
  if (payload?.netAmount !== undefined) db.net_amount = payload.netAmount;
  if (payload?.taxRate !== undefined) db.tax_rate = payload.taxRate;
  if (payload?.taxIncluded !== undefined) db.tax_included = payload.taxIncluded;
  if (payload?.taxAmount !== undefined) db.tax_amount = payload.taxAmount;
  if (payload?.totalAmount !== undefined) db.total_amount = payload.totalAmount;
  if (payload?.notes !== undefined) db.notes = payload.notes;
  const { data, error } = await supabase?.from('wa_supplier_invoices')?.update(db)?.eq('id', id)?.select()?.single();
  if (error?.code === '23505') return { data: null, error: new Error(DUPLICATE_DOCUMENT_MESSAGE) };
  if (error) return { data: null, error };
  return { data: mapInvoiceRow(data), error: null };
};

/** Falla con mensaje amigable si la factura ya tiene pagos (FK RESTRICT). */
export const deleteSupplierInvoice = async (id) => {
  const { error } = await supabase?.from('wa_supplier_invoices')?.delete()?.eq('id', id);
  if (error?.code === '23503') {
    return { error: new Error('No se puede eliminar: esta factura ya tiene pagos registrados.') };
  }
  if (error) return { error };
  return { error: null };
};

const SUPPLIER_PAYMENT_ERROR_MESSAGES = {
  NOT_AUTHENTICATED: 'Tu sesión expiró. Volvé a iniciar sesión.',
  MISSING_REQUIRED_PARAMETER: 'Faltan datos obligatorios para registrar el pago.',
  INVALID_AMOUNT: 'Ingresá un monto de pago válido.',
  INVALID_PAYMENT_METHOD: 'Seleccioná un método de pago válido.',
  SUPPLIER_NOT_FOUND: 'El proveedor no es válido para este negocio.',
  INVALID_ALLOCATIONS: 'Revisá los montos asignados a cada factura.',
  DUPLICATE_ALLOCATION_INVOICE: 'No se puede asignar el pago dos veces a la misma factura.',
  ALLOCATIONS_MUST_EQUAL_PAYMENT_AMOUNT: 'El monto asignado a las facturas debe ser exactamente igual al monto del pago.',
  INVOICE_NOT_FOUND: 'Una de las facturas seleccionadas no es válida.',
  INVOICE_SUPPLIER_MISMATCH: 'Una de las facturas seleccionadas pertenece a otro proveedor.',
  ALLOCATION_EXCEEDS_BALANCE: 'El monto asignado supera el saldo pendiente de una de las facturas.',
};

function mapSupplierPaymentError(error) {
  const raw = String(error?.message || '');
  if (raw.includes('Business not accessible')) return new Error('No tenés acceso a este negocio.');
  const code = Object.keys(SUPPLIER_PAYMENT_ERROR_MESSAGES).find((key) => raw.includes(key));
  if (!code) return new Error('No se pudo registrar el pago. Intentá nuevamente.');
  return new Error(SUPPLIER_PAYMENT_ERROR_MESSAGES[code]);
}

/**
 * Única vía de escritura de pagos -- siempre wa_register_supplier_payment,
 * nunca INSERT directo (PROVEEDORES-CORE-3 §7). El invariante
 * SUM(allocations.amount) = amount se construye del lado de la UI
 * (SupplierPaymentModal no expone un campo de monto libre, lo deriva de
 * las asignaciones) pero la RPC lo vuelve a validar server-side siempre.
 *
 * payload.allocations: Array<{invoiceId: string, amount: number}>
 */
export const registerSupplierPayment = async (businessId, supplierId, payload) => {
  const allocations = (Array.isArray(payload?.allocations) ? payload.allocations : [])
    .map((a) => ({ invoice_id: a.invoiceId, amount: a.amount }));
  const { data, error } = await supabase?.rpc('wa_register_supplier_payment', {
    p_business_id: businessId,
    p_supplier_id: supplierId,
    p_amount: payload?.amount,
    p_payment_method: payload?.paymentMethod,
    p_payment_date: payload?.paymentDate || undefined,
    p_reference: payload?.reference || null,
    p_notes: payload?.notes || null,
    p_allocations: allocations,
  });
  if (error) return { data: null, error: mapSupplierPaymentError(error) };
  const payment = Array.isArray(data) ? data[0] : data;
  return { data: mapPaymentRow(payment), error: null };
};

export const getSupplierPayments = async (supplierId) => {
  const { data, error } = await supabase
    ?.from('wa_supplier_payments')
    ?.select('*')
    ?.eq('supplier_id', supplierId)
    ?.order('payment_date', { ascending: false });
  if (error) return { data: null, error };
  return { data: (data ?? []).map(mapPaymentRow), error: null };
};

/**
 * Todos los pagos del negocio (todos los proveedores) -- necesario para el
 * KPI "Pagado este mes" de la lista principal, que es agregado a nivel
 * negocio, no por proveedor. El filtro por mes se hace en el cliente,
 * mismo criterio que ya usaba paidThisMonth en el legacy.
 */
export const getBusinessSupplierPayments = async (businessId) => {
  const { data, error } = await supabase
    ?.from('wa_supplier_payments')
    ?.select('*')
    ?.eq('business_id', businessId)
    ?.order('payment_date', { ascending: false });
  if (error) return { data: null, error };
  return { data: (data ?? []).map(mapPaymentRow), error: null };
};

/**
 * PROVEEDORES-CORE-4A — reemplazo canónico de
 * crmService.getPurchaseTotalsForPeriod, consultando wa_supplier_invoices
 * en vez de la tabla legacy crm_purchase_invoices (que queda congelada,
 * sin nuevas escrituras, desde PROVEEDORES-CORE-4).
 *
 * Devuelve la MISMA forma que la función legacy a propósito -- no un
 * {data, error} como el resto de este archivo -- para que un futuro
 * CORE-4B pueda reemplazar el import en CrmCostCenter.jsx/CrmCostos.jsx
 * (confirmado releyendo los 3 archivos, PROVEEDORES-CORE-4A review fix
 * §1: CrmPurchases.jsx NUNCA consume `purchaseTotals`, arma su propio
 * resumen local desde el array de facturas del período -- solo
 * CrmCostCenter.jsx/ComprasWidget y CrmCostos.jsx/ComprasLinkPanel+
 * IvaSummaryPanel lo hacen, y ambos leen exactamente
 * `.totals.mercaderia.total`, `.totalOperational`, `.totalTaxCredit`) sin
 * tocar ninguna línea de esas páginas. A diferencia de la legacy --que
 * descarta el `error` de Supabase en silencio (`const { data } = await
 * supabase...`)-- acá el error SÍ se expone en el campo `error` del mismo
 * objeto: los consumidores actuales nunca lo leen, así que no cambia su
 * comportamiento hoy, pero deja de esconder un fallo real detrás de
 * totales en cero sin ninguna señal.
 *
 * SELECT normal bajo RLS (misma política que ya protege
 * wa_supplier_invoices) -- no hace falta SECURITY DEFINER para una
 * agregación de solo lectura.
 *
 * review fix (riesgo detectado antes de CORE-4B): la primera versión de
 * esta función descartaba en silencio las facturas con purchase_type
 * 'servicio'/'otros'/NULL -- valores que SÍ son alcanzables hoy desde
 * /proveedores (a diferencia de crm_purchase_invoices, cuyo CHECK nunca
 * permitió más que los 3 buckets legacy). Perder esas filas sin ningún
 * error visible habría sido exactamente el tipo de pérdida silenciosa que
 * esta unificación busca evitar. Se agrega un 4º bucket `other` que las
 * acumula (net/tax/total, igual que los demás), y un `totalAmountAll` de
 * reconciliación: SIEMPRE debe cumplirse que
 * `totalAmountAll === mercaderia.total + gasto_con_iva.total +
 * gasto_sin_iva.total + other.total` para el período -- ninguna fila
 * puede desaparecer sin que la suma deje de cuadrar.
 *
 * IMPORTANTE (no inventar clasificación tributaria): `other` NUNCA se
 * suma a totalTaxCredit ni a totalOperational. purchase_type por sí solo
 * no determina si una compra 'servicio'/'otros' tiene crédito IVA
 * recuperable o si es gasto operativo -- esa es una decisión de producto
 * que esta función no puede tomar por su cuenta (ni por el nombre del
 * tipo, ni asumiendo que tax_amount>0 implica crédito fiscal válido, algo
 * que tampoco se puede inferir con certeza solo de los montos). Se
 * preserva el importe en `other` para que CORE-4B decida, con contexto de
 * producto, cómo mostrarlo -- nunca se esconde ni se fuerza dentro de una
 * categoría existente.
 *
 * totalTaxCredit/totalOperational conservan EXACTAMENTE la misma fórmula
 * que crmService.getPurchaseTotalsForPeriod ya tenía (confirmada leyendo
 * su código fuente, no intuida): totalTaxCredit = IVA de mercadería + IVA
 * de gasto_con_iva; totalOperational = total de gasto_con_iva + total de
 * gasto_sin_iva (mercadería es inventario, nunca gasto operativo). Ningún
 * consumidor real demostró una definición distinta -- se preserva tal
 * cual, sin ampliarla a `other`.
 */
export const getSupplierPurchaseTotalsForPeriod = async (businessId, startDate, endDate) => {
  const totals = {
    mercaderia:    { net: 0, tax: 0, total: 0 },
    gasto_con_iva: { net: 0, tax: 0, total: 0 },
    gasto_sin_iva: { net: 0, tax: 0, total: 0 },
    // servicio/otros/purchase_type NULL -- alcanzables solo en el modelo
    // canónico (crm_purchase_invoices nunca los permitió). Nunca se
    // pierden: se acumulan acá, sin semántica tributaria asumida.
    other:         { net: 0, tax: 0, total: 0 },
  };
  const LEGACY_BUCKETS = ['mercaderia', 'gasto_con_iva', 'gasto_sin_iva'];

  const { data, error } = await supabase
    ?.from('wa_supplier_invoices')
    ?.select('purchase_type, net_amount, tax_amount, total_amount')
    ?.eq('business_id', businessId)
    ?.gte('issue_date', startDate)
    ?.lt('issue_date', endDate);

  if (error) return { totals, totalTaxCredit: 0, totalOperational: 0, totalAmountAll: 0, error };

  for (const row of data ?? []) {
    const bucketKey = LEGACY_BUCKETS.includes(row.purchase_type) ? row.purchase_type : 'other';
    const bucket = totals[bucketKey];
    bucket.net += Number(row.net_amount ?? 0);
    bucket.tax += Number(row.tax_amount ?? 0);
    bucket.total += Number(row.total_amount ?? 0);
  }

  // Misma fórmula que crmService.getPurchaseTotalsForPeriod: IVA
  // recuperable = mercadería + gasto con IVA; gasto operativo = gasto con
  // IVA + gasto sin IVA (mercadería es inventario, no pérdida directa).
  // `other` nunca entra en ninguna de las dos -- ver comentario de la
  // función sobre por qué no se le asigna semántica tributaria inventada.
  const totalTaxCredit = totals.mercaderia.tax + totals.gasto_con_iva.tax;
  const totalOperational = totals.gasto_con_iva.total + totals.gasto_sin_iva.total;
  // Reconciliación: la suma de los 4 buckets siempre debe igualar esto --
  // ninguna factura del período puede faltar del reporte.
  const totalAmountAll = totals.mercaderia.total + totals.gasto_con_iva.total + totals.gasto_sin_iva.total + totals.other.total;

  return { totals, totalTaxCredit, totalOperational, totalAmountAll, error: null };
};
