import { describe, it, expect } from 'vitest';
import orderDetailDrawerSource from './OrderDetailDrawer.jsx?raw';

// OrderDetailDrawer.jsx tiene dependencias profundas (crmService, date-fns,
// react-router, AppIcon, impresión, etc.) -- se valida por escaneo de fuente
// (mismo patrón que MercadoPagoConnect.test.jsx) en vez de montarlo con RTL,
// enfocado en los invariantes de MP-PAYMENT-DETAIL-2: nunca "pagado sin
// método", la ficha de pago se lee de wa_order_payments, y el éxito del
// modal refresca la ficha.

describe('OrderDetailDrawer — nunca existe un camino que marque "pagado" sin método', () => {
  it('handleMarkAsPaid ya no existe en el archivo', () => {
    expect(orderDetailDrawerSource).not.toMatch(/handleMarkAsPaid/);
  });

  it('handlePaymentStatusChange rechaza explícitamente "pagado" antes de cualquier onUpdate', () => {
    expect(orderDetailDrawerSource).toMatch(
      /const handlePaymentStatusChange = async \(newPaymentStatus\) => \{\s*if \(newPaymentStatus === 'pagado'\) return;/,
    );
  });

  it('las píldoras de "Estado del pago" enrutan el click en "pagado" a handleOpenManualPayment, no a handlePaymentStatusChange', () => {
    expect(orderDetailDrawerSource).toMatch(
      /onClick=\{\(\) => \(s\.key === 'pagado' \? handleOpenManualPayment\(\) : handlePaymentStatusChange\(s\.key\)\)\}/,
    );
  });

  it('handleOpenManualPayment nunca llama a onUpdate -- solo abre el modal', () => {
    const match = orderDetailDrawerSource.match(
      /const handleOpenManualPayment = \(\) => \{[\s\S]*?\n  \};/,
    );
    expect(match).not.toBeNull();
    expect(match[0]).not.toMatch(/onUpdate/);
    expect(match[0]).toMatch(/setShowManualPaymentModal\(true\)/);
  });
});

describe('OrderDetailDrawer — ficha de pago lee wa_order_payments (fuente única)', () => {
  it('importa getOrderPayment del servicio dedicado, nunca consulta wa_merchant_payment_events', () => {
    expect(orderDetailDrawerSource).toMatch(
      /import \{ getOrderPayment \} from '\.\.\/\.\.\/\.\.\/services\/orderPaymentService';/,
    );
    expect(orderDetailDrawerSource).not.toMatch(/from\(['"]wa_merchant_payment_events['"]\)/);
  });

  it('renderiza la sección "Pago" con OrderPaymentDetail recibiendo orderPayment/paymentStatus/business/formatCLP', () => {
    expect(orderDetailDrawerSource).toMatch(/<OrderPaymentDetail/);
    expect(orderDetailDrawerSource).toMatch(/orderPayment=\{orderPayment\}/);
    expect(orderDetailDrawerSource).toMatch(/paymentStatus=\{currentPaymentStatus\}/);
    expect(orderDetailDrawerSource).toMatch(/business=\{business\}/);
  });
});

describe('OrderDetailDrawer — flujo de pago manual', () => {
  it('renderiza ManualPaymentModal condicionalmente con onSuccess={handleManualPaymentSuccess}', () => {
    expect(orderDetailDrawerSource).toMatch(/\{showManualPaymentModal && \(/);
    expect(orderDetailDrawerSource).toMatch(/<ManualPaymentModal/);
    expect(orderDetailDrawerSource).toMatch(/onSuccess=\{handleManualPaymentSuccess\}/);
  });

  it('el éxito del pago manual refresca la ficha: parche local, cierra el modal y refetch de wa_order_payments', () => {
    const match = orderDetailDrawerSource.match(
      /const handleManualPaymentSuccess = async \(\) => \{[\s\S]*?\n  \};/,
    );
    expect(match).not.toBeNull();
    expect(match[0]).toMatch(/setLocalPaymentPatch\(\{ paymentStatus: 'pagado' \}\)/);
    expect(match[0]).toMatch(/setShowManualPaymentModal\(false\)/);
    expect(match[0]).toMatch(/await refreshOrderPayment\(\)/);
  });

  it('refreshOrderPayment vuelve a consultar getOrderPayment (no inventa datos localmente)', () => {
    const match = orderDetailDrawerSource.match(
      /const refreshOrderPayment = async \(\) => \{[\s\S]*?\n  \};/,
    );
    expect(match).not.toBeNull();
    expect(match[0]).toMatch(/getOrderPayment\(order\.id\)/);
  });
});

describe('OrderDetailDrawer — compatibilidad con flujo CRM/caja existente (crm_payments)', () => {
  it('handleRegisterPayment sigue existiendo, exige orderInvoice y payMethod, usa registerOrderPayment -- no se reemplaza en esta fase', () => {
    expect(orderDetailDrawerSource).toMatch(/const handleRegisterPayment = async \(\) => \{/);
    expect(orderDetailDrawerSource).toMatch(/registerOrderPayment\(business\.id, \{/);
    expect(orderDetailDrawerSource).toMatch(/paymentMethod: payMethod,/);
  });
});
