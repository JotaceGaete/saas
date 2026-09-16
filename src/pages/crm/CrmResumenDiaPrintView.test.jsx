/**
 * CrmResumenDiaPrintView.test.jsx — RESUMEN-DEL-DIA-2 (corrección de
 * impresión A4).
 *
 * El bug era: window.print() imprimía las tarjetas del dashboard de
 * pantalla. El fix separa un componente de impresión DEDICADO
 * (CrmResumenDiaPrintView) que consume el mismo buildResumenDiaPdfViewModel()
 * que ya usa el PDF. Estos tests prueban, con DOM real (React Testing
 * Library) sobre datos que vienen de la getDailySummary REAL (supabase
 * mockeado, mismo patrón que resumenDiaPdf.test.js), que:
 *
 *  - la vista de impresión nunca inventa un $0 para una sección no disponible
 *  - nunca muestra 'credit' (cuenta corriente) como dinero recibido
 *  - una caja abierta muestra el expectedCash YA calculado por getDailySummary
 *    (nunca lo recalcula)
 *  - una caja cerrada conciliada muestra el arqueo persistido verbatim
 *  - no contiene el bloque "Walinka IA · Próximamente"
 *
 * El resto de las garantías del ticket (PrintView nunca llama a
 * getDailySummary; pantalla y PrintView reciben el mismo `summary`; solo
 * PrintView queda visible en @media print) se prueban por source-scan más
 * abajo -- son invariantes estructurales de CrmResumenDia.jsx, no del
 * componente de impresión en sí, y ese archivo depende de AuthContext/router
 * para montarse completo.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

const fromMock = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: (...args) => fromMock(...args),
  },
}));

import { getDailySummary } from '../../services/crmService';
import CrmResumenDiaPrintView from './CrmResumenDiaPrintView';
import printViewSource from './CrmResumenDiaPrintView.jsx?raw';
import crmResumenDiaSource from './CrmResumenDia.jsx?raw';

beforeEach(() => {
  fromMock.mockReset();
});

// Mismos helpers que resumenDiaPdf.test.js/crmService.dailySummary.test.js
// (replicados a propósito para no acoplar los archivos de test entre sí).
function queryResult(result) {
  const proxy = new Proxy(() => {}, {
    get(_target, prop) {
      if (prop === 'then') return (resolve, reject) => Promise.resolve(result).then(resolve, reject);
      return () => proxy;
    },
  });
  return proxy;
}

function mockTables(map) {
  const counters = {};
  fromMock.mockImplementation((table) => {
    if (!(table in map)) throw new Error(`tabla inesperada en el test: ${table}`);
    const entry = map[table];
    if (!Array.isArray(entry)) return queryResult(entry);
    const idx = counters[table] || 0;
    counters[table] = idx + 1;
    return queryResult(entry[Math.min(idx, entry.length - 1)]);
  });
}

const EMPTY_TABLES = {
  crm_invoices: { data: [], error: null },
  crm_payments: { data: [], error: null },
  crm_cost_items: { data: [], error: null },
  crm_cash_movements: { data: [], error: null },
  crm_cash_sessions: { data: [], error: null },
  wa_products: { data: [], error: null },
  crm_stock_movements: { data: [], error: null },
};

const BUSINESS = { name: 'Café Ñuñoa & Co.', currency: 'CLP', logoUrl: null };

describe('CrmResumenDiaPrintView — no contiene el bloque "Walinka IA"', () => {
  it('nunca renderiza el placeholder "Próximamente" del dashboard', async () => {
    mockTables(EMPTY_TABLES);
    const summary = await getDailySummary('biz1', '2026-09-16');
    render(<CrmResumenDiaPrintView summary={summary} business={BUSINESS} date="2026-09-16" />);

    expect(screen.queryByText('Próximamente')).not.toBeInTheDocument();
    expect(screen.queryByText(/Walinka IA/i)).not.toBeInTheDocument();
  });
});

describe('CrmResumenDiaPrintView — available:false nunca se disfraza de $0', () => {
  it('una sección con available:false muestra "no pudimos/no se pudo obtener", nunca un monto', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: { data: null, error: { message: 'conexión perdida' } },
    });
    const summary = await getDailySummary('biz1', '2026-09-16');
    expect(summary.sales.available).toBe(false); // precondición real, no inventada

    render(<CrmResumenDiaPrintView summary={summary} business={BUSINESS} date="2026-09-16" />);

    // Mensaje de indisponibilidad presente (headline + sección 1. Ventas).
    expect(screen.getAllByText(/no (pudimos|se pudo) obtener/i).length).toBeGreaterThan(0);

    // Dentro de la SECCIÓN de ventas específicamente: nunca un "$0"
    // fabricado -- el mensaje de indisponibilidad, no un monto. (Otras
    // secciones sí pueden mostrar $0 legítimo si de verdad no hubo
    // actividad ahí -- eso no es el bug.)
    const salesSection = screen.getByText('1. Ventas').closest('section');
    expect(within(salesSection).queryByText('$0')).not.toBeInTheDocument();
    expect(within(salesSection).getByText(/no pudimos obtener/i)).toBeInTheDocument();

    // El headline "Ventas netas" tampoco muestra $0 -- muestra "No disponible".
    const ventasNetasCard = screen.getByText('Ventas netas').closest('div');
    expect(within(ventasNetasCard).getByText('No disponible')).toBeInTheDocument();
    expect(within(ventasNetasCard).queryByText('$0')).not.toBeInTheDocument();
  });
});

describe('CrmResumenDiaPrintView — dinero recibido nunca incluye cuenta corriente (credit)', () => {
  it('una venta a crédito no aparece como fila de dinero recibido', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: {
        data: [{
          id: 'inv-credit', status: 'pendiente', total: 10000, subtotal: 10000, discount_amount: 0,
          source: 'crm', order_id: null, created_at: '2026-09-16T14:00:00-03:00', issue_date: '2026-09-16',
          crm_invoice_items: [{ product_id: 'p1', name: 'Producto A', quantity: 1, subtotal: 10000 }],
        }],
        error: null,
      },
    });
    const summary = await getDailySummary('biz1', '2026-09-16');
    expect(summary.collections.total).toBe(0); // la venta a crédito no generó ningún pago 'received'

    render(<CrmResumenDiaPrintView summary={summary} business={BUSINESS} date="2026-09-16" />);

    // "Sin cobros registrados este día" -- nunca una fila de "Cuenta corriente"/"Crédito".
    expect(screen.getByText('Sin cobros registrados este día.')).toBeInTheDocument();
    expect(screen.queryByText('Cuenta corriente')).not.toBeInTheDocument();
  });
});

describe('CrmResumenDiaPrintView — caja abierta usa expectedCash ya calculado', () => {
  it('muestra el mismo expectedCash que ya trae summary.cash.sessions[0].liveEstimate, nunca lo recalcula', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_cash_sessions: {
        data: [{ id: 'sess-open', status: 'open', opened_at: '2026-09-16T09:00:00-03:00', closed_at: null, initial_amount: 20000 }],
        error: null,
      },
      crm_payments: {
        data: [
          { id: 'p-cash', invoice_id: null, amount: 10000, payment_method: 'cash', payment_status: 'received', payment_date: '2026-09-16', created_at: '2026-09-16T10:00:00-03:00', voided_at: null, cash_session_id: 'sess-open' },
          { id: 'p-debit', invoice_id: null, amount: 50000, payment_method: 'debit_card', payment_status: 'received', payment_date: '2026-09-16', created_at: '2026-09-16T11:00:00-03:00', voided_at: null, cash_session_id: 'sess-open' },
        ],
        error: null,
      },
    });
    const summary = await getDailySummary('biz1', '2026-09-16');
    const expectedCash = summary.cash.sessions[0].liveEstimate.expectedCash;
    expect(expectedCash).toBe(30000); // precondición real: solo efectivo físico (PR #72), no 80.000

    render(<CrmResumenDiaPrintView summary={summary} business={BUSINESS} date="2026-09-16" />);

    // Acotado a la sección de caja -- "$50.000" (débito) también aparece,
    // legítimamente, en "2. Dinero recibido" (desglose por medio del día
    // completo) -- eso no es el bug que se está probando acá.
    const cashSection = screen.getByText('4. Caja y conciliación').closest('section');

    // El monto mostrado es EXACTAMENTE el que ya trae el summary -- ningún
    // recálculo nuevo en la capa de impresión.
    expect(within(cashSection).getByText('$30.000')).toBeInTheDocument();
    // El medio no-cash (débito) se muestra aparte, nunca sumado al efectivo.
    expect(within(cashSection).getByText('$50.000')).toBeInTheDocument();
    expect(within(cashSection).queryByText('$80.000')).not.toBeInTheDocument();
  });
});

describe('CrmResumenDiaPrintView — conciliación cerrada usa el snapshot recibido', () => {
  it('muestra Esperado/Conciliado/Diferencia tal cual vienen en summary, nunca recalculados', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_cash_sessions: {
        data: [{ id: 'sess-closed', status: 'closed', opened_at: '2026-09-16T09:00:00-03:00', closed_at: '2026-09-16T20:00:00-03:00', initial_amount: 10000 }],
        error: null,
      },
      crm_cash_session_reconciliations: {
        data: [{ id: 'r1', session_id: 'sess-closed', payment_method: 'cash', expected_amount: 50000, reconciled_amount: 48000, difference: -2000 }],
        error: null,
      },
    });
    const summary = await getDailySummary('biz1', '2026-09-16');

    render(<CrmResumenDiaPrintView summary={summary} business={BUSINESS} date="2026-09-16" />);

    expect(screen.getByText('$50.000')).toBeInTheDocument(); // esperado (snapshot)
    expect(screen.getByText('$48.000')).toBeInTheDocument(); // conciliado (snapshot)
    expect(screen.getByText('$-2.000')).toBeInTheDocument(); // diferencia (snapshot)
  });
});

describe('CrmResumenDiaPrintView — nunca llama a getDailySummary (source-scan)', () => {
  // El propio archivo lo MENCIONA en prosa (comentarios) para explicar que
  // recibe `summary` ya calculado -- se compara contra el código sin
  // comentarios para no confundir la explicación con una llamada real.
  const codeOnly = printViewSource
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');

  it('el archivo importa buildResumenDiaPdfViewModel y no referencia getDailySummary en ningún lado del código real', () => {
    expect(codeOnly).toMatch(/buildResumenDiaPdfViewModel/);
    expect(codeOnly).not.toMatch(/getDailySummary/);
  });
});

describe('CrmResumenDia.jsx — pantalla y PrintView reciben el mismo `summary` (source-scan)', () => {
  const codeOnly = crmResumenDiaSource
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');

  it('getDailySummary se llama exactamente una vez (una sola fuente de datos)', () => {
    const matches = codeOnly.match(/getDailySummary\(/g) || [];
    expect(matches).toHaveLength(1);
  });

  it('CrmResumenDiaPrintView recibe la MISMA variable `summary` que ya está en estado (no un valor recalculado)', () => {
    expect(codeOnly).toMatch(/<CrmResumenDiaPrintView\s+summary=\{summary\}/);
  });

  it('solo un elemento lleva la clase "resumen-dia-print-sheet", y envuelve a CrmResumenDiaPrintView (no a las tarjetas del dashboard)', () => {
    const matches = codeOnly.match(/resumen-dia-print-sheet/g) || [];
    // Una vez en el JSX (el div envolvente) + las referencias dentro de PRINT_STYLE.
    const jsxClassMatches = codeOnly.match(/className="resumen-dia-print-sheet[^"]*"/g) || [];
    expect(jsxClassMatches).toHaveLength(1);
    expect(matches.length).toBeGreaterThan(0);

    // La hoja imprimible envuelve CrmResumenDiaPrintView, nunca el div de las
    // tarjetas del dashboard (`flex flex-col gap-5 md:gap-6`).
    const sheetIdx = codeOnly.indexOf(jsxClassMatches[0]);
    const nextPrintViewIdx = codeOnly.indexOf('<CrmResumenDiaPrintView', sheetIdx);
    expect(nextPrintViewIdx).toBeGreaterThan(-1);
    // Nada de las tarjetas del dashboard (KpiCard grande de pantalla) debe
    // aparecer ENTRE la apertura de la hoja imprimible y CrmResumenDiaPrintView.
    const between = codeOnly.slice(sheetIdx, nextPrintViewIdx);
    expect(between).not.toMatch(/<KpiCard/);
  });

  it('el CSS de impresión no fuerza break-inside:avoid sobre secciones completas (causa original del bug: 4 páginas, mucho blanco)', () => {
    expect(codeOnly).not.toMatch(/\.resumen-dia-print-sheet\s+section\s*\{/);
  });

  it('el CSS de impresión sí aplica break-inside:avoid a bloques chicos vía .print-avoid-break', () => {
    expect(codeOnly).toMatch(/\.print-avoid-break[\s\S]{0,80}break-inside:\s*avoid/);
  });
});

describe('CrmResumenDia.jsx — páginas fantasma en impresión (regresión)', () => {
  // Bug real después de mergear la corrección de impresión: Chrome generaba
  // 4 páginas (1 con contenido, 1 con Caja/Inventario/Alertas + mucho
  // espacio libre, 2 completamente vacías) porque `visibility:hidden` NUNCA
  // saca un elemento del flujo -- el dashboard completo (9 secciones, con
  // tarjetas grandes) seguía montado, oculto pero con su altura real
  // intacta, hermano de la hoja imprimible. Además `.panel-root`/
  // `.panel-main` (DashboardAppShell.jsx) fuerzan `min-h-screen` -- son
  // ANCESTROS de la hoja imprimible, así que nunca pueden ocultarse con
  // display:none (eso también taparía la hoja imprimible).
  const codeOnly = crmResumenDiaSource
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');

  it('el dashboard de pantalla tiene una clase dedicada (.resumen-dia-screen-only), hermana de la hoja imprimible', () => {
    expect(codeOnly).toMatch(/className="resumen-dia-screen-only\s+flex flex-col gap-5 md:gap-6"/);
  });

  it('esa clase se oculta con display:none REAL en impresión (no solo visibility) -- elimina la altura fantasma del dashboard', () => {
    expect(codeOnly).toMatch(/\.resumen-dia-screen-only\s*\{[^}]*display:\s*none\s*!important/);
  });

  it('el dashboard NUNCA es ancestro de la hoja imprimible -- CrmResumenDiaPrintView aparece DESPUÉS de que .resumen-dia-screen-only se cierra', () => {
    const openIdx = codeOnly.indexOf('className="resumen-dia-screen-only');
    expect(openIdx).toBeGreaterThan(-1);
    // Cuenta apertura/cierre de <div ...> desde el div del dashboard hasta
    // encontrar su propio cierre -- si CrmResumenDiaPrintView aparece ANTES
    // de que el contador vuelva a 0, sería un descendiente (el bug que este
    // fix evita), no un hermano.
    const rest = codeOnly.slice(openIdx);
    let depth = 0;
    let closeOffset = -1;
    const tagRe = /<div\b|<\/div>/g;
    let match;
    while ((match = tagRe.exec(rest))) {
      depth += match[0] === '<div' ? 1 : -1;
      if (depth === 0) { closeOffset = match.index; break; }
    }
    expect(closeOffset).toBeGreaterThan(-1);
    const printViewIdx = rest.indexOf('<CrmResumenDiaPrintView');
    expect(printViewIdx).toBeGreaterThan(closeOffset);
  });

  it('.panel-root/.panel-main (ancestros reales de la hoja imprimible) resetean min-height en impresión, pero NUNCA se ocultan con display:none', () => {
    expect(codeOnly).toMatch(/\.panel-root,\s*\n?\s*\.panel-main\s*\{[^}]*min-height:\s*0\s*!important/);
    expect(codeOnly).not.toMatch(/\.panel-root[^}]*display:\s*none/);
    expect(codeOnly).not.toMatch(/\.panel-main[^}]*display:\s*none/);
  });

  it('html/body también resetean min-height en impresión', () => {
    const printBlockMatch = codeOnly.match(/html, body \{([^}]*)\}/);
    expect(printBlockMatch).not.toBeNull();
    expect(printBlockMatch[1]).toMatch(/min-height:\s*0\s*!important/);
  });
});

describe('CrmResumenDiaPrintView.jsx — "Saldo antes de costo de mercadería" tiene una sola explicación', () => {
  it('no repite dos veces la misma frase del disclaimer -- ya no hay un texto fijo hardcodeado, viene una sola vez de vm.disclaimer', () => {
    const source = printViewSource;
    const occurrences = (source.match(/Ventas netas menos gastos registrados\. No incluye el costo de los productos vendidos/g) || []).length;
    expect(occurrences).toBe(0);
  });

  it('la única explicación viene de vm.disclaimer (crmService.js), no de un texto fijo duplicado', () => {
    expect(printViewSource).toMatch(/\{vm\.disclaimer\}/);
  });

  it('en el DOM renderizado, la frase requerida aparece UNA sola vez, no dos', async () => {
    mockTables(EMPTY_TABLES);
    const summary = await getDailySummary('biz1', '2026-09-16');
    render(<CrmResumenDiaPrintView summary={summary} business={BUSINESS} date="2026-09-16" />);

    expect(screen.getAllByText(/no representa la ganancia del día/i)).toHaveLength(1);
  });
});
