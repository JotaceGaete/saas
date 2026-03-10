import React, { useRef } from 'react';
import Icon from 'components/AppIcon';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCLP } from 'utils/formatCLP';

export default function PrintOrderModal({ order, businessName, onClose }) {
  const printRef = useRef(null);

  const formattedDate = order?.createdAt
    ? format(new Date(order.createdAt), "d 'de' MMMM yyyy, HH:mm", { locale: es })
    : '—';

  const orderNumber = order?.id?.slice(-8)?.toUpperCase() || '—';

  const handlePrint = () => {
    const printContent = printRef?.current?.innerHTML;
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    printWindow?.document?.write(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Pedido #${orderNumber}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Courier New', Courier, monospace;
            font-size: 13px;
            color: #000;
            background: #fff;
            padding: 20px;
            max-width: 380px;
            margin: 0 auto;
          }
          @media print {
            body { padding: 10px; }
            .no-print { display: none !important; }
          }
          @page {
            margin: 10mm;
            size: A4;
          }
          .receipt { width: 100%; }
          .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 12px; margin-bottom: 12px; }
          .business-name { font-size: 18px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 4px; }
          .order-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
          .order-number { font-size: 22px; font-weight: bold; margin-bottom: 4px; }
          .section { margin-bottom: 12px; }
          .section-title { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #000; padding-bottom: 3px; margin-bottom: 8px; font-weight: bold; }
          .info-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 12px; }
          .info-label { font-weight: bold; }
          .info-value { text-align: right; max-width: 60%; word-break: break-word; }
          .products-table { width: 100%; border-collapse: collapse; }
          .products-table th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; padding: 4px 0; border-bottom: 1px solid #000; }
          .products-table th:last-child { text-align: right; }
          .products-table td { padding: 5px 0; font-size: 12px; vertical-align: top; border-bottom: 1px dotted #ccc; }
          .products-table td:last-child { text-align: right; font-weight: bold; white-space: nowrap; }
          .product-name { font-weight: 500; }
          .product-qty { font-size: 11px; color: #555; }
          .total-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-top: 2px solid #000; margin-top: 8px; }
          .total-label { font-size: 14px; font-weight: bold; text-transform: uppercase; }
          .total-amount { font-size: 20px; font-weight: bold; }
          .notes-box { border: 1px dashed #000; padding: 8px; border-radius: 4px; font-size: 12px; line-height: 1.5; }
          .footer { text-align: center; border-top: 2px dashed #000; padding-top: 12px; margin-top: 12px; font-size: 10px; color: #555; }
          .divider { border: none; border-top: 1px dashed #000; margin: 12px 0; }
        </style>
      </head>
      <body>
        ${printContent}
      </body>
      </html>
    `);
    printWindow?.document?.close();
    printWindow?.focus();
    setTimeout(() => {
      printWindow?.print();
      printWindow?.close();
    }, 300);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
        style={{ border: '1px solid var(--color-border)' }}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-2">
            <Icon name="Printer" size={18} color="var(--color-primary)" />
            <h2 className="font-bold text-base" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>Vista previa de impresión</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors"
          >
            <Icon name="X" size={16} color="var(--color-muted-foreground)" />
          </button>
        </div>

        {/* Print preview */}
        <div className="flex-1 overflow-y-auto p-5">
          <div
            className="border rounded-xl p-5 bg-white"
            style={{ borderColor: 'var(--color-border)', fontFamily: "'Courier New', Courier, monospace" }}
          >
            <div ref={printRef}>
              <div className="receipt">
                {/* Header */}
                <div className="header" style={{ textAlign: 'center', borderBottom: '2px dashed #000', paddingBottom: '12px', marginBottom: '12px' }}>
                  <div className="business-name" style={{ fontSize: '18px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '4px' }}>
                    {businessName || 'Mi Tienda'}
                  </div>
                  <div className="order-title" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', color: '#555' }}>
                    Comprobante de Pedido
                  </div>
                  <div className="order-number" style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '4px' }}>
                    #{orderNumber}
                  </div>
                  <div style={{ fontSize: '11px', color: '#555' }}>{formattedDate}</div>
                </div>

                {/* Customer info */}
                <div className="section" style={{ marginBottom: '12px' }}>
                  <div className="section-title" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #000', paddingBottom: '3px', marginBottom: '8px', fontWeight: 'bold' }}>Datos del cliente</div>
                  <div className="info-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px' }}>
                    <span className="info-label" style={{ fontWeight: 'bold' }}>Nombre:</span>
                    <span className="info-value" style={{ textAlign: 'right' }}>{order?.customerName || '—'}</span>
                  </div>
                  <div className="info-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px' }}>
                    <span className="info-label" style={{ fontWeight: 'bold' }}>WhatsApp:</span>
                    <span className="info-value" style={{ textAlign: 'right' }}>{order?.customerPhone || '—'}</span>
                  </div>
                </div>

                <hr style={{ border: 'none', borderTop: '1px dashed #000', margin: '12px 0' }} />

                {/* Products */}
                <div className="section" style={{ marginBottom: '12px' }}>
                  <div className="section-title" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #000', paddingBottom: '3px', marginBottom: '8px', fontWeight: 'bold' }}>Productos</div>
                  <table className="products-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left', padding: '4px 0', borderBottom: '1px solid #000' }}>Producto</th>
                        <th style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', padding: '4px 0', borderBottom: '1px solid #000', width: '30px' }}>Cant.</th>
                        <th style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', padding: '4px 0', borderBottom: '1px solid #000' }}>Precio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order?.items?.length > 0 ? order?.items?.map((item, idx) => (
                        <tr key={idx}>
                          <td style={{ padding: '5px 0', fontSize: '12px', verticalAlign: 'top', borderBottom: '1px dotted #ccc' }}>
                            <div style={{ fontWeight: '500' }}>{item?.productName}</div>
                          </td>
                          <td style={{ padding: '5px 0', fontSize: '12px', textAlign: 'center', verticalAlign: 'top', borderBottom: '1px dotted #ccc' }}>
                            {item?.quantity}
                          </td>
                          <td style={{ padding: '5px 0', fontSize: '12px', textAlign: 'right', fontWeight: 'bold', whiteSpace: 'nowrap', verticalAlign: 'top', borderBottom: '1px dotted #ccc' }}>
                            {currency} {item?.subtotal?.toLocaleString('es', { minimumFractionDigits: 0 })}
                          </td>
                        </tr>
                      )) : (
                        <tr><td colSpan={3} style={{ padding: '8px 0', fontSize: '12px', color: '#555' }}>Sin productos</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Total */}
                <div className="total-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '2px solid #000', marginTop: '8px' }}>
                  <span className="total-label" style={{ fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase' }}>TOTAL</span>
                  <span className="total-amount" style={{ fontSize: '20px', fontWeight: 'bold' }}>
                    {formatCLP(order?.totalAmount)}
                  </span>
                </div>

                {/* Notes */}
                {order?.customerNotes && (
                  <>
                    <hr style={{ border: 'none', borderTop: '1px dashed #000', margin: '12px 0' }} />
                    <div className="section" style={{ marginBottom: '12px' }}>
                      <div className="section-title" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #000', paddingBottom: '3px', marginBottom: '8px', fontWeight: 'bold' }}>Notas del cliente</div>
                      <div className="notes-box" style={{ border: '1px dashed #000', padding: '8px', borderRadius: '4px', fontSize: '12px', lineHeight: '1.5' }}>
                        {order?.customerNotes}
                      </div>
                    </div>
                  </>
                )}

                {/* Footer */}
                <div className="footer" style={{ textAlign: 'center', borderTop: '2px dashed #000', paddingTop: '12px', marginTop: '12px', fontSize: '10px', color: '#555' }}>
                  <div>¡Gracias por tu pedido!</div>
                  <div style={{ marginTop: '4px' }}>Generado el {format(new Date(), "d MMM yyyy HH:mm", { locale: es })}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors hover:bg-muted"
            style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
          >
            Cancelar
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
            style={{ backgroundColor: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
          >
            <Icon name="Printer" size={15} color="#fff" />
            Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}
