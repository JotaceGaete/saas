// Mercado Pago Point SIMULADO para Preview: misma interfaz y mismas formas de
// respuesta que las funciones de crmService (mp-point-*), sin red, sin
// terminal real y sin cobro. Lo usa pointClient.js cuando POINT_MODE es
// 'simulated'; el TPV no sabe la diferencia.
//
// Reglas que replica del servidor:
//  - createPointOrder es idempotente por createIdempotencyKey: reintentar
//    devuelve la MISMA operación (nunca un segundo cobro).
//  - Una operación aprobada se finaliza una sola vez: todas las consultas
//    devuelven el mismo invoice_id (una sola venta, una sola boleta).
//  - 'finalization_pending' (pago aprobado, la venta tarda en registrarse)
//    responde 202 POINT_FINALIZATION_PENDING antes de finalizar.
//  - Un estado terminal (rechazo, vencimiento, cancelación) nunca crea venta.
//
// La venta simulada vive solo en este navegador (id 'sim-point-…'): no se
// escribe nada en la base de datos ni se toca stock o caja.

export const POINT_SIM_SCENARIO_KEY = 'walinka:point-sim:scenario';
export const POINT_SIM_SCENARIOS = Object.freeze(['approved', 'finalization_pending', 'rejected', 'expired']);
export const POINT_SIM_SCENARIO_LABELS = Object.freeze({
  approved: 'pago aprobado',
  finalization_pending: 'aprobado, venta tarda en registrarse',
  rejected: 'pago rechazado',
  expired: 'cobro vencido en la terminal',
});
export const POINT_SIM_TERMINAL_ID = 'SIMULADA__POINT-SMART-0001';

// Consultas a la terminal antes de que el "cliente" pase la tarjeta.
const POLLS_AT_TERMINAL = 1;
// Consultas extra con la venta todavía sin registrar (escenario finalization_pending).
const POLLS_FINALIZATION_PENDING = 2;

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

function lineTotal(it) {
  return Math.round(Number(it.unit_price || 0) * Number(it.quantity || 0));
}

/**
 * @param {{ businessId: string, storage?: Storage, scenario?: () => string, now?: () => Date }} opts
 */
export function createPointSimulator({ businessId, storage, scenario, now = () => new Date() } = {}) {
  const s = storage || globalThis.localStorage || memoryStorage();
  const key = `walinka:point-sim:ledger:${businessId || 'none'}`;
  const read = () => {
    try { return JSON.parse(s.getItem(key)) || { seq: 0, ops: {}, byCreateKey: {} }; } catch { return { seq: 0, ops: {}, byCreateKey: {} }; }
  };
  const write = (ledger) => { try { s.setItem(key, JSON.stringify(ledger)); } catch { /* sin almacenamiento */ } };
  const pickScenario = () => {
    let sc = null;
    try { sc = scenario ? scenario() : JSON.parse(s.getItem(POINT_SIM_SCENARIO_KEY)); } catch { sc = null; }
    return POINT_SIM_SCENARIOS.includes(sc) ? sc : 'approved';
  };
  let charges = 0;

  const ok = (data) => ({ data, error: null });
  const fail = (data, message, reason) => ({ data, error: { message, reason, status: null } });

  const terminal = Object.freeze({
    id: POINT_SIM_TERMINAL_ID, pos_id: 'SIM', store_id: 'SIM', operating_mode: 'PDV', simulated: true,
  });

  function view(op) {
    return {
      ok: true,
      operation_id: op.id,
      order_id: op.orderId,
      status: op.status,
      status_detail: op.statusDetail,
      payment_id: op.paymentId,
      payment_status: op.paymentStatus,
      payment_status_detail: op.paymentStatusDetail,
      amount: op.amount,
      finalized: Boolean(op.invoiceId),
      invoice_id: op.invoiceId,
      sale: op.invoiceId ? op.sale : null,
      simulated: true,
    };
  }

  return Object.freeze({
    mode: 'simulated',
    /** Cobros "enviados a la terminal" en esta instancia (para pruebas). */
    get charges() { return charges; },

    async startPointOauth() {
      return fail(null, 'Point simulada: no hay cuenta de Mercado Pago que conectar.', 'POINT_SIMULATED');
    },
    async getPointConnection() {
      return ok({ connection: { provider_user_id: 'Point SIMULADA (sin cobro real)', simulated: true } });
    },
    async disconnectPointConnection() {
      return fail(null, 'Point simulada: no se desconecta.', 'POINT_SIMULATED');
    },
    async getPointTerminals() {
      return ok({ terminals: [terminal] });
    },
    async getPointTerminalPreference() {
      return ok({ preference: { terminal_id: POINT_SIM_TERMINAL_ID, verification_status: 'verified', simulated: true } });
    },
    async selectPointTerminal() {
      return ok({ preference: { terminal_id: POINT_SIM_TERMINAL_ID, verification_status: 'verified', simulated: true } });
    },
    async verifyPointTerminal() {
      return ok({ preference: { terminal_id: POINT_SIM_TERMINAL_ID, verification_status: 'verified', simulated: true } });
    },
    async unlinkPointTerminal() {
      return fail(null, 'Point simulada: no se desvincula.', 'POINT_SIMULATED');
    },
    async setupPointTerminal() {
      return ok({ restart_required: false });
    },

    async createPointOrder({ terminalId, items, discount = 0, createIdempotencyKey, saleIdempotencyKey }) {
      if (!createIdempotencyKey || !saleIdempotencyKey) return fail(null, 'Faltan claves de idempotencia.', 'INVALID_REQUEST');
      if (terminalId !== POINT_SIM_TERMINAL_ID) return fail(null, 'Terminal desconocida.', 'POINT_TERMINAL_NOT_FOUND');
      const ledger = read();
      const existingId = ledger.byCreateKey[createIdempotencyKey];
      // Reintento de la misma llamada: misma operación, ningún cobro nuevo.
      if (existingId && ledger.ops[existingId]) return ok(view(ledger.ops[existingId]));

      const lines = (items || []).map((it) => ({
        product_id: it.product_id || null, name: it.name, unit_price: it.unit_price, quantity: it.quantity, note: it.note || null,
      }));
      const amount = lines.reduce((a, it) => a + lineTotal(it), 0) - Math.round(Number(discount || 0));
      if (lines.length === 0 || amount <= 0) return fail(null, 'Importe inválido.', 'INVALID_REQUEST');

      const op = {
        id: uuid(), orderId: `SIM-ORD-${uuid().slice(0, 8)}`, createKey: createIdempotencyKey, saleKey: saleIdempotencyKey,
        scenario: pickScenario(), status: 'at_terminal', statusDetail: 'at_terminal', polls: 0,
        paymentId: null, paymentStatus: null, paymentStatusDetail: null,
        amount, items: lines, invoiceId: null, sale: null, createdAt: now().toISOString(),
      };
      ledger.ops[op.id] = op;
      ledger.byCreateKey[createIdempotencyKey] = op.id;
      write(ledger);
      charges += 1;
      return ok(view(op));
    },

    async getPointOrder(operationId) {
      const ledger = read();
      const op = ledger.ops[operationId];
      if (!op) return fail(null, 'Operación Point no encontrada.', 'POINT_OPERATION_NOT_FOUND');
      if (['processed', 'failed', 'expired', 'canceled'].includes(op.status) && (op.status !== 'processed' || op.invoiceId)) {
        return ok(view(op));
      }
      op.polls += 1;
      if (op.status === 'at_terminal' && op.polls > POLLS_AT_TERMINAL) {
        if (op.scenario === 'rejected') {
          Object.assign(op, { status: 'failed', statusDetail: 'failed', paymentStatus: 'rejected', paymentStatusDetail: 'cc_rejected_insufficient_amount' });
        } else if (op.scenario === 'expired') {
          Object.assign(op, { status: 'expired', statusDetail: 'expired' });
        } else {
          Object.assign(op, {
            status: 'processed', statusDetail: 'accredited', paymentId: `SIM-PAY-${uuid().slice(0, 8)}`,
            paymentStatus: 'approved', paymentStatusDetail: 'accredited', approvedAtPoll: op.polls,
          });
        }
      }
      if (op.status === 'processed' && !op.invoiceId) {
        const wait = op.scenario === 'finalization_pending' ? POLLS_FINALIZATION_PENDING : 0;
        if (op.polls - op.approvedAtPoll < wait) {
          write(ledger);
          return fail({ operation_id: op.id, order_id: op.orderId, status: op.status },
            'Payment processed but sale finalization is pending', 'POINT_FINALIZATION_PENDING');
        }
        // Finalizador idempotente: una sola venta por operación.
        ledger.seq += 1;
        op.invoiceId = `sim-point-${op.id}`;
        op.sale = {
          id: op.invoiceId,
          invoice_number: `SIM-${String(ledger.seq).padStart(4, '0')}`,
          total: op.amount, status: 'pagada', source: 'pos', simulated: true,
          mp_order_id: op.orderId, mp_payment_id: op.paymentId,
        };
      }
      write(ledger);
      return ok(view(op));
    },

    async cancelPointOrder(operationId) {
      const ledger = read();
      const op = ledger.ops[operationId];
      if (!op) return fail(null, 'Operación Point no encontrada.', 'POINT_OPERATION_NOT_FOUND');
      if (op.status === 'at_terminal') Object.assign(op, { status: 'canceled', statusDetail: 'canceled' });
      write(ledger);
      return ok(view(op));
    },
  });
}
