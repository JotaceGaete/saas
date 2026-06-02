import React, { useEffect, useRef } from 'react';
import Icon from 'components/AppIcon';
import { formatMoney } from '../../../utils/formatMoney';

const PAYMENT_LABELS = {
  cash: 'Efectivo',
  bank_transfer: 'Transferencia',
  card: 'Tarjeta',
  check: 'Cheque',
  other: 'Otro',
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  otro: 'Otro',
};

function pad(n) { return String(n).padStart(4, '0'); }

function formatDateTime(dt) {
  const d = dt ? new Date(dt) : new Date();
  return d.toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const formatCurrency = (n, currency) => formatMoney(n, currency);

function Divider() {
  return <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />;
}

function Row({ label, value, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: bold ? 700 : 400, margin: '2px 0' }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default function CrmThermalTicket({
  business,
  sale,
  items = [],
  customer,
  paymentMethod = 'efectivo',
  discountAmount = 0,
  subtotal = 0,
  total = 0,
  amountReceived = null,
  change = null,
  notes,
  createdAt,
  onNewSale,
  onClose,
}) {
  const printingRef = useRef(false);

  // Inject print styles while modal is open.
  // The overlay (.crm-ticket-noprint) becomes visibility:hidden (not display:none)
  // so #crm-ticket-print-content (inside it) can override to visibility:visible
  // and position:fixed — rendering a single copy of the ticket without double-print.
  useEffect(() => {
    const styleId = 'crm-thermal-print-style';
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @media print {
        body * {
          visibility: hidden !important;
        }

        #crm-ticket-print-content,
        #crm-ticket-print-content * {
          visibility: visible !important;
        }

        #crm-ticket-print-content {
          display: block !important;
          position: fixed !important;
          left: 0 !important;
          top: 0 !important;
          width: 58mm !important;
          max-width: 58mm !important;
          min-height: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
          color: #000 !important;
          overflow: visible !important;
          transform: none !important;
        }

        #crm-ticket-print-content *:not(img) {
          color: #000 !important;
          background: transparent !important;
          box-shadow: none !important;
        }

        .no-print,
        .crm-ticket-noprint {
          visibility: hidden !important;
        }

        @page {
          size: 58mm auto;
          margin: 0;
        }
      }
    `;
    document.head.appendChild(style);
    return () => {
      const el = document.getElementById(styleId);
      if (el) el.remove();
    };
  }, []);

  const ticketNumber = sale?.invoice_number
    ? `NV-${pad(sale.invoice_number)}`
    : `T-${Date.now().toString().slice(-6)}`;

  const customerName = customer?.name || 'Consumidor final';

  const logoUrl = business?.logoUrl || business?.logo_url || null;
  const address = business?.address || null;
  const phone = business?.whatsapp || null;

  const handlePrint = () => {
    // Guard: prevent double-fire from fast double-clicks or re-entrant calls.
    if (printingRef.current) return;
    printingRef.current = true;
    const reset = () => {
      printingRef.current = false;
      window.removeEventListener('afterprint', reset);
    };
    window.addEventListener('afterprint', reset);
    window.print();
  };

  // Ticket content — rendered both in the modal preview and in the print-only sibling.
  const ticketBody = (
    <div style={{
      padding: '16px 14px',
      fontFamily: "'Courier New', Courier, monospace",
      fontSize: 11,
      color: '#111',
      lineHeight: 1.4,
      backgroundColor: '#fff',
      width: '100%',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        {logoUrl && (
          <div style={{ marginBottom: 6, textAlign: 'center' }}>
            <img
              src={logoUrl}
              alt={business?.name || 'Logo'}
              crossOrigin="anonymous"
              style={{ maxWidth: 260, maxHeight: 120, width: '90%', objectFit: 'contain', display: 'inline-block' }}
            />
          </div>
        )}
        <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: 1, textTransform: 'uppercase' }}>
          {business?.name || 'Mi Negocio'}
        </div>
        {address && (
          <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>{address}</div>
        )}
        {phone && (
          <div style={{ fontSize: 10, color: '#555', marginTop: 1 }}>{phone}</div>
        )}
        <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>Terminal de Ventas</div>
      </div>

      <Divider />

      <div style={{ fontSize: 10, color: '#444', marginBottom: 4 }}>
        <div>Ticket: <strong>{ticketNumber}</strong></div>
        <div>Fecha: {formatDateTime(createdAt)}</div>
        <div>Cliente: {customerName}</div>
      </div>

      <Divider />

      {/* Items */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, marginBottom: 4, color: '#555' }}>
          <span style={{ flex: '0 0 28px' }}>Cant</span>
          <span style={{ flex: 1 }}>Producto</span>
          <span style={{ flex: '0 0 64px', textAlign: 'right' }}>Total</span>
        </div>
        {items.map((item, i) => (
          <div key={item.product_id || item.id || i} style={{ marginBottom: 3 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ flex: '0 0 28px', color: '#555' }}>{item.quantity}x</span>
              <span style={{ flex: 1, fontWeight: 600, wordBreak: 'break-word', paddingRight: 4 }}>{item.name}</span>
              <span style={{ flex: '0 0 64px', textAlign: 'right' }}>
                {formatCurrency(item.unit_price * item.quantity, business?.currency)}
              </span>
            </div>
            {item.quantity > 1 && (
              <div style={{ paddingLeft: 28, fontSize: 10, color: '#888' }}>
                {formatCurrency(item.unit_price, business?.currency)} c/u
              </div>
            )}
          </div>
        ))}
      </div>

      <Divider />

      {/* Totals */}
      <div style={{ marginBottom: 4 }}>
        <Row label="Subtotal" value={formatCurrency(subtotal, business?.currency)} />
        {discountAmount > 0 && (
          <Row label="Descuento" value={`-${formatCurrency(discountAmount, business?.currency)}`} />
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, margin: '6px 0' }}>
        <span>TOTAL</span>
        <span>{formatCurrency(total, business?.currency)}</span>
      </div>

      <Divider />

      <Row label="Método de pago" value={PAYMENT_LABELS[paymentMethod] || paymentMethod} />
      {amountReceived != null && amountReceived > 0 && (
        <Row label="Pago recibido" value={formatCurrency(amountReceived, business?.currency)} />
      )}
      {change != null && change > 0 && (
        <Row label="Vuelto" value={formatCurrency(change, business?.currency)} bold />
      )}

      {notes && (
        <>
          <Divider />
          <div style={{ fontSize: 10, color: '#555' }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>Notas:</div>
            <div>{notes}</div>
          </div>
        </>
      )}

      <Divider />

      <div style={{ textAlign: 'center', fontSize: 11, color: '#555', marginTop: 8, marginBottom: 4 }}>
        Gracias por su compra
      </div>
    </div>
  );

  return (
    <>
      {/* Modal overlay — crm-ticket-noprint → display:none during @media print.
          This removes the entire fixed overlay from print layout, preventing Chrome
          from double-rendering the ticket content. */}
      <div
        className="crm-ticket-noprint"
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          backgroundColor: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Ticket de venta"
      >
        <div style={{
          backgroundColor: '#fff',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          width: '100%',
          maxWidth: 400,
          maxHeight: '90vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}>

          {/* Modal header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', borderBottom: '1px solid #f0f0f0',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, backgroundColor: '#d1fae5',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon name="CheckCircle2" size={18} color="#059669" />
              </div>
              <div>
                <p style={{ fontWeight: 700, fontSize: 13, color: '#111827', margin: 0 }}>¡Venta registrada!</p>
                <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>{ticketNumber}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, color: '#9ca3af' }}
              aria-label="Cerrar"
            >
              <Icon name="X" size={18} color="currentColor" />
            </button>
          </div>

          {/* Ticket preview inside modal — also serves as the print target */}
          <div id="crm-ticket-print-content">
            {ticketBody}
          </div>

          {/* Action buttons */}
          <div style={{
            display: 'flex', gap: 10, padding: '12px 16px 16px',
            borderTop: '1px solid #f0f0f0',
          }}>
            <button
              onClick={handlePrint}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 6, padding: '10px 0', borderRadius: 10, border: '1.5px solid #d1d5db',
                backgroundColor: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151',
              }}
            >
              <Icon name="Printer" size={15} color="currentColor" />
              Imprimir ticket
            </button>
            <button
              onClick={onNewSale}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 6, padding: '10px 0', borderRadius: 10, border: 'none',
                backgroundColor: '#059669', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#fff',
              }}
            >
              <Icon name="Plus" size={15} color="currentColor" />
              Nueva venta
            </button>
          </div>
        </div>
      </div>

    </>
  );
}
