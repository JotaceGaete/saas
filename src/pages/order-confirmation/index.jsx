import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCart } from '../../contexts/CartContext';
import { createOrder, getBusinessBySlug } from '../../services/waBusinessService';
import Icon from '../../components/AppIcon';
import { formatCurrency } from '../../utils/formatCLP';
import { getBusinessLocale } from '../../lib/locale/businessLocale';
import { getPublicCatalogRelativePath, getWhatsAppOrderCatalogUrl } from '../../config/appUrl';
import { getBrandingMessage } from '../../utils/branding';
import { isRestaurantBusiness } from '../../utils/businessType';
import { normalizeOptionalCustomerPhone } from '../../utils/customerPhone';
import CheckoutPhoneOptional from '../../components/checkout/CheckoutPhoneOptional';
import { buildCfImageErrorHandler, cfImageUrl } from '../../utils/cloudflareImage';
import { getCountryLabels } from '../../config/country';

function isWhatsAppWebView() {
  if (typeof navigator === 'undefined') return false;
  const ua = String(navigator.userAgent || '');
  return ua.includes('WhatsApp');
}

export default function OrderConfirmation() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { items, total, updateQuantity, removeItem, clearCart } = useCart();
  const [customerName, setCustomerName] = useState('');
  const [customerPhoneDigits, setCustomerPhoneDigits] = useState('');
  const [serviceType, setServiceType] = useState('mesa');
  const [tableReference, setTableReference] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [checkoutState, setCheckoutState] = useState('idle'); // idle | loading | success | error
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [submitInfo, setSubmitInfo] = useState(null);
  const [pendingWhatsappMessage, setPendingWhatsappMessage] = useState('');
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [business, setBusiness] = useState(null);
  const submitLockRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!slug) return;
      const { data } = await getBusinessBySlug(slug);
      if (!cancelled) setBusiness(data || null);
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const isRestaurant = isRestaurantBusiness(business);
  const requiresTable = isRestaurant && serviceType === 'mesa';
  const requiresDeliveryAddress = isRestaurant && serviceType === 'delivery';
  const loading = checkoutState === 'loading';

  const checkoutMoney = useMemo(() => getBusinessLocale(business), [business]);
  const countryLabels = useMemo(() => getCountryLabels(checkoutMoney.countryCode), [checkoutMoney.countryCode]);

  const formatPrice = (amount) => {
    const currency = String(business?.currency || checkoutMoney.currencyCode || 'USD').trim().toUpperCase();
    const numeric = Number(amount);
    if (!Number.isFinite(numeric)) return formatCurrency(0, currency, checkoutMoney.locale);
    return formatCurrency(numeric, currency, checkoutMoney.locale);
  };

  const validate = () => {
    const errs = {};
    if (!customerName?.trim()) errs.customerName = 'Por favor ingresa tu nombre.';
    if (requiresTable && !tableReference?.trim()) errs.tableReference = 'Por favor ingresa tu mesa.';
    if (requiresDeliveryAddress && !deliveryAddress?.trim()) errs.deliveryAddress = 'Por favor ingresa la dirección de entrega.';
    return errs;
  };

  const buildWhatsappMessage = ({ biz, phoneForOrder }) => {
    const lines = items?.map(i => `- ${i?.quantity} ${i?.name}`);
    const serviceTypeLabel = serviceType === 'delivery'
      ? 'Delivery'
      : serviceType === 'pickup'
        ? 'Retiro en mostrador'
        : 'Mesa';
    const body = [
      'Hola, quiero hacer un pedido.',
      '',
      `Nombre: ${customerName?.trim()}`,
      phoneForOrder ? `Telefono: ${phoneForOrder}` : null,
      isRestaurantBusiness(biz) ? `Tipo: ${serviceTypeLabel}` : null,
      isRestaurantBusiness(biz) && serviceType === 'mesa' ? `Mesa: ${tableReference?.trim()}` : null,
      isRestaurantBusiness(biz) && serviceType === 'delivery' ? `Direccion: ${deliveryAddress?.trim()}` : null,
      '',
      'Pedido:',
      ...lines,
      notes?.trim() ? `\nComentario:\n${notes?.trim()}` : '',
    ]?.filter(Boolean)?.join('\n')?.trim();
    const catalogUrl = slug ? getWhatsAppOrderCatalogUrl(slug) : '';
    let message = catalogUrl ? `${catalogUrl}\n\n${body}` : body;
    const branding = getBrandingMessage(biz);
    if (branding) message += `\n\n\n${branding}`;
    return message;
  };

  const handleCopyMessage = async () => {
    if (!pendingWhatsappMessage) return;
    try {
      await navigator.clipboard.writeText(pendingWhatsappMessage);
      setCopiedMessage(true);
      setTimeout(() => setCopiedMessage(false), 1800);
    } catch {
      setSubmitError('No pudimos copiar el mensaje automaticamente. Copialo manualmente.');
    }
  };

  const handleConfirm = async () => {
    if (submitLockRef.current) return;
    const errs = validate();
    if (Object.keys(errs)?.length > 0) { setErrors(errs); return; }
    submitLockRef.current = true;
    setCheckoutState('loading');
    setSubmitError(null);
    setSubmitInfo(null);
    setPendingWhatsappMessage('');
    setCopiedMessage(false);
    console.info('[checkout] creating order...');
    try {
      const { data: biz, error: bizError } = await getBusinessBySlug(slug);
      if (bizError || !biz) {
        console.error('[checkout] error loading business', bizError?.message || 'business_not_found');
        setCheckoutState('error');
        setSubmitError('No se pudo cargar la tienda. Intenta de nuevo.');
        return;
      }

      const orderItems = items?.map(item => ({
        productId: item?.id,
        productName: item?.name,
        productPrice: item?.price,
        quantity: item?.quantity,
        subtotal: item?.price * item?.quantity,
      }));

      const phoneForOrder = normalizeOptionalCustomerPhone(customerPhoneDigits);

      const { data: order, error: orderError } = await createOrder(biz.id, {
        customerName: customerName?.trim(),
        customerPhone: phoneForOrder,
        serviceType: isRestaurantBusiness(biz) ? serviceType : null,
        tableReference: isRestaurantBusiness(biz) && serviceType === 'mesa'
          ? tableReference?.trim()
          : null,
        deliveryAddress: isRestaurantBusiness(biz) && serviceType === 'delivery'
          ? deliveryAddress?.trim()
          : null,
        totalAmount: total,
        notes: notes?.trim() || null,
      }, orderItems);

      if (orderError) {
        console.error('[checkout] error creating order', orderError?.message || orderError);
        const isPlanLimit = orderError?.code === 'PLAN_LIMIT_EXCEEDED' || (orderError?.message && orderError.message.includes('PLAN_LIMIT_EXCEEDED'));
        setCheckoutState('error');
        setSubmitError(isPlanLimit
          ? 'Tu plan Free permite 30 pedidos por mes. Actualiza a Pro para recibir pedidos ilimitados.'
          : 'No pudimos guardar tu pedido. Intenta nuevamente.');
        return;
      }
      console.info('[checkout] order created id=', order?.id || '(unknown)');

      const message = buildWhatsappMessage({ biz, phoneForOrder });

      const whatsappNumber = biz?.whatsapp?.replace(/[^0-9]/g, '');
      const waUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
      console.info('[checkout] opening whatsapp...');
      if (isWhatsAppWebView()) {
        console.info('[whatsapp-webview] detected, blocking auto-open');
        setCheckoutState('error');
        setSubmitInfo('No podemos abrir WhatsApp desde aquí. Abre este catálogo en Safari o Chrome para enviar tu pedido.');
        setPendingWhatsappMessage(message);
        return;
      }
      const popup = window.open(waUrl, '_blank', 'noopener,noreferrer');

      if (!popup) {
        setCheckoutState('error');
        setSubmitInfo('Pedido guardado, pero no pudimos abrir WhatsApp.');
        setPendingWhatsappMessage(message);
        return;
      }

      setCheckoutState('success');
      setSubmitInfo('Pedido confirmado. Te abrimos WhatsApp para enviarlo.');
      clearCart();
      navigate(getPublicCatalogRelativePath(slug));
    } catch (e) {
      console.error('[checkout] unexpected error', e?.message || e);
      setCheckoutState('error');
      setSubmitError('No pudimos guardar tu pedido. Intenta nuevamente.');
    } finally {
      submitLockRef.current = false;
    }
  };

  if (items?.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
        <div className="text-center px-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'var(--color-muted)' }}>
            <Icon name="ShoppingCart" size={32} color="var(--color-muted-foreground)" />
          </div>
          <h1 className="text-xl font-bold mb-2" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>Tu carrito está vacío</h1>
          <button onClick={() => navigate(getPublicCatalogRelativePath(slug))} className="mt-4 px-5 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}>Ver catálogo</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      {/* Header */}
      <header className="sticky top-0 z-40 border-b" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-xs)' }}>
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(getPublicCatalogRelativePath(slug))} className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors hover:bg-gray-100" style={{ color: 'var(--color-foreground)' }}>
            <Icon name="ArrowLeft" size={18} color="var(--color-foreground)" />
          </button>
          <h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>Confirmar pedido</h1>
        </div>
      </header>
      <div className="max-w-lg mx-auto px-4 py-6 pb-32 space-y-5">
        {/* Order Items */}
        <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>Tu pedido</h2>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {items?.map(item => (
              <div key={item?.id} className="px-4 py-3 flex items-center gap-3">
                {item?.imageUrl ? (
                  <img
                    src={cfImageUrl(item.imageUrl, 'thumbnail')}
                    alt={item?.name}
                    className="w-12 h-12 rounded-xl object-cover flex-shrink-0"
                    onError={buildCfImageErrorHandler(item.imageUrl)}
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--color-muted)' }}>
                    <Icon name="Package" size={20} color="var(--color-muted-foreground)" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>{item?.name}</p>
                  <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-data)' }}>{formatPrice(item?.price)}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => updateQuantity(item?.id, item?.quantity - 1)} className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors" style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-foreground)' }}>
                    <Icon name="Minus" size={12} color="var(--color-foreground)" />
                  </button>
                  <span className="text-sm font-bold w-5 text-center" style={{ fontFamily: 'var(--font-data)', color: 'var(--color-foreground)' }}>{item?.quantity}</span>
                  <button onClick={() => updateQuantity(item?.id, item?.quantity + 1)} className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors" style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-foreground)' }}>
                    <Icon name="Plus" size={12} color="var(--color-foreground)" />
                  </button>
                  <button onClick={() => removeItem(item?.id)} className="w-7 h-7 rounded-lg flex items-center justify-center ml-1 transition-colors hover:bg-red-50">
                    <Icon name="Trash2" size={12} color="var(--color-error)" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface-subtle)' }}>
            <span className="text-sm font-semibold" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>Total</span>
            <span className="text-lg font-bold" style={{ fontFamily: 'var(--font-data)', color: 'var(--color-primary)' }}>{formatPrice(total)}</span>
          </div>
        </div>

        {/* Customer Info */}
        <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>Tus datos</h2>
          </div>
          <div className="px-4 py-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>Tu nombre <span style={{ color: 'var(--color-error)' }}>*</span></label>
              <input
                type="text"
                value={customerName}
                onChange={e => { setCustomerName(e?.target?.value); setErrors(prev => ({ ...prev, customerName: '' })); }}
                placeholder="Tu nombre completo"
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-all"
                style={{ borderColor: errors?.customerName ? 'var(--color-error)' : 'var(--color-border)', fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)', backgroundColor: '#FFFFFF' }}
              />
              {errors?.customerName && <p className="text-xs mt-1" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>{errors?.customerName}</p>}
            </div>
            <CheckoutPhoneOptional
              variant="order"
              digits={customerPhoneDigits}
              onDigitsChange={setCustomerPhoneDigits}
            />
            {isRestaurant && (
              <>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>Tipo de pedido <span style={{ color: 'var(--color-error)' }}>*</span></label>
                  <select
                    value={serviceType}
                    onChange={(e) => {
                      setServiceType(e?.target?.value);
                      if (e?.target?.value !== 'mesa') setErrors(prev => ({ ...prev, tableReference: '' }));
                      if (e?.target?.value !== 'delivery') setErrors(prev => ({ ...prev, deliveryAddress: '' }));
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-all"
                    style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)', backgroundColor: '#FFFFFF' }}
                  >
                    <option value="mesa">Mesa</option>
                    <option value="pickup">Retiro en mostrador</option>
                    <option value="delivery">Delivery</option>
                  </select>
                </div>
                {serviceType === 'mesa' && (
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
                      Mesa <span style={{ color: 'var(--color-error)' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={tableReference}
                      onChange={e => { setTableReference(e?.target?.value); setErrors(prev => ({ ...prev, tableReference: '' })); }}
                      placeholder="Ej: 7, 12, A3, Terraza, Barra"
                      maxLength={24}
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-all"
                      style={{ borderColor: errors?.tableReference ? 'var(--color-error)' : 'var(--color-border)', fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)', backgroundColor: '#FFFFFF' }}
                    />
                    {errors?.tableReference && <p className="text-xs mt-1" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>{errors?.tableReference}</p>}
                  </div>
                )}
                {serviceType === 'delivery' && (
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
                      Dirección de entrega <span style={{ color: 'var(--color-error)' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={deliveryAddress}
                      onChange={e => { setDeliveryAddress(e?.target?.value); setErrors(prev => ({ ...prev, deliveryAddress: '' })); }}
                      placeholder={countryLabels.addressPlaceholder}
                      maxLength={160}
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-all"
                      style={{ borderColor: errors?.deliveryAddress ? 'var(--color-error)' : 'var(--color-border)', fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)', backgroundColor: '#FFFFFF' }}
                    />
                    {errors?.deliveryAddress && <p className="text-xs mt-1" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>{errors?.deliveryAddress}</p>}
                  </div>
                )}
              </>
            )}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>Notas <span style={{ color: 'var(--color-muted-foreground)' }}>(opcional)</span></label>
              <textarea
                value={notes}
                onChange={e => setNotes(e?.target?.value)}
                placeholder="Instrucciones especiales, dirección de entrega..."
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-all resize-none"
                style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)', backgroundColor: '#FFFFFF' }}
              />
            </div>
          </div>
        </div>
      </div>
      {/* Fixed Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-50 p-4" style={{ backgroundColor: 'var(--color-background)', borderTop: '1px solid var(--color-border)' }}>
        <div className="max-w-lg mx-auto">
          {(submitError || submitInfo) && (
            <div className="mb-3 flex items-center gap-2 px-3 py-2.5 rounded-xl border bg-red-50" style={{ borderColor: 'var(--color-error)' }}>
              <Icon
                name={submitError ? 'AlertCircle' : 'Info'}
                size={18}
                style={{ color: submitError ? 'var(--color-error)' : 'var(--color-primary)', flexShrink: 0 }}
              />
              <p
                className="text-sm font-medium"
                style={{ color: submitError ? 'var(--color-error)' : 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
              >
                {submitError || submitInfo}
              </p>
            </div>
          )}
          {!!pendingWhatsappMessage && (
            <button
              type="button"
              onClick={handleCopyMessage}
              className="w-full mb-3 py-2.5 rounded-xl text-sm font-semibold border"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', backgroundColor: '#fff', fontFamily: 'var(--font-caption)' }}
            >
              {copiedMessage ? 'Mensaje copiado' : 'Copiar mensaje'}
            </button>
          )}
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="w-full py-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all duration-150 active:scale-[0.98] disabled:opacity-60"
            style={{ backgroundColor: '#25D366', boxShadow: '0 4px 20px rgba(37,211,102,0.35)', fontFamily: 'var(--font-caption)' }}
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Confirmar y enviar por WhatsApp
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
