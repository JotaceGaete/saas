import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate, useParams } from 'react-router-dom';
import Icon from '../../components/AppIcon';
import PremiumLoader from '../../components/ui/PremiumLoader';
import { CartProvider } from '../../contexts/CartContext';
import {
  getBusinessBySlug,
  getPublicProductBySlug,
  getPublicProducts,
} from '../../services/waBusinessService';
import { formatPrice as formatPriceUtil, resolveCatalogCurrency } from '../../utils/formatPrice';
import { getBusinessLocale } from '../../lib/locale/businessLocale';
import { getOrderMessageBrandingSuffix } from '../../utils/branding';
import { getPublicCatalogRelativePath, getPublicProductUrl, getWhatsAppOrderCatalogUrl } from '../../config/appUrl';
import { resolveCatalogTheme } from '../../utils/catalogTheme';
import { ProductModal } from '../public-catalog';

function getProductCommercialState(product) {
  if (product?.isActive === false) return 'hidden';
  if (product?.isSoldOut === true) return 'sold_out';
  return 'available';
}

function ProductNotFound({ onBack }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 font-catalog antialiased">
      <div className="max-w-sm text-center">
        <div className="w-20 h-20 rounded-3xl bg-gray-100 flex items-center justify-center mx-auto mb-5">
          <Icon name="PackageSearch" size={36} color="#9CA3AF" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Producto no encontrado</h1>
        <p className="text-sm text-gray-500 mb-5">El producto no existe, no está disponible o el enlace cambió.</p>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white"
        >
          Ver catálogo
        </button>
      </div>
    </div>
  );
}

function PublicProductInner() {
  const { businessSlug, productSlug } = useParams();
  const navigate = useNavigate();
  const [business, setBusiness] = useState(null);
  const [product, setProduct] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadProductPage() {
      setLoading(true);
      setNotFound(false);

      const { data: biz, error: bizError } = await getBusinessBySlug(businessSlug);
      if (cancelled) return;
      if (bizError || !biz) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const [{ data: selectedProduct }, { data: catalogProducts }] = await Promise.all([
        getPublicProductBySlug(biz.id, productSlug),
        getPublicProducts(biz.id),
      ]);
      if (cancelled) return;

      const resolvedProduct = selectedProduct || null;
      if (!resolvedProduct || getProductCommercialState(resolvedProduct) === 'hidden') {
        setBusiness(biz);
        setNotFound(true);
        setLoading(false);
        return;
      }

      setBusiness(biz);
      setProduct(resolvedProduct);
      setProducts(catalogProducts || (resolvedProduct ? [resolvedProduct] : []));
      setLoading(false);
    }

    loadProductPage();
    return () => {
      cancelled = true;
    };
  }, [businessSlug, productSlug]);

  const catalogMoney = useMemo(() => getBusinessLocale(business), [business]);
  const businessCurrency = useMemo(
    () => resolveCatalogCurrency(business, catalogMoney),
    [business, catalogMoney],
  );
  const formatPrice = useMemo(
    () => (price) => formatPriceUtil(price, businessCurrency, catalogMoney?.countryCode),
    [businessCurrency, catalogMoney?.countryCode],
  );

  if (loading) {
    return <PremiumLoader fullScreen business={business} context="catalog" />;
  }

  const catalogPath = getPublicCatalogRelativePath(businessSlug);
  const goToCatalog = () => navigate(catalogPath || '/');

  if (notFound || !business || !product) {
    return <ProductNotFound onBack={goToCatalog} />;
  }

  const design = business?.designSettings || {};
  const catalogTheme = resolveCatalogTheme(design);
  const theme = {
    primaryColor: catalogTheme.primaryColor,
    primaryColorDark: catalogTheme.primaryColorDark,
    primaryRgba: catalogTheme.primaryRgba,
  };
  const cardSettings = {
    showPrice: true,
    showDescription: true,
    showStock: false,
    showWhatsApp: true,
    ...design?.cardSettings,
  };

  const phone = business?.whatsapp?.replace(/\D/g, '');
  const catalogUrl = businessSlug ? getWhatsAppOrderCatalogUrl(businessSlug) : '';
  const productUrl = getPublicProductUrl(businessSlug, product?.slug);
  const body = product?.publicCode
    ? `Hola, quiero este producto: ${product.publicCode} - ${product?.name}\n\nPrecio: ${formatPrice(product?.price)}\n\nTienda: ${business?.name || 'la tienda'}`
    : `Hola! Me interesa el producto:\n\n*${product?.name}*\nPrecio: ${formatPrice(product?.price)}\n\nTienda: ${business?.name || 'la tienda'}`;
  let whatsAppMessage = productUrl ? `${productUrl}\n\n${body}` : (catalogUrl ? `${catalogUrl}\n\n${body}` : body);
  const branding = getOrderMessageBrandingSuffix(business);
  if (branding) whatsAppMessage += `${productUrl || catalogUrl ? '\n\n\n' : '\n\n'}${branding}`;
  const whatsAppUrl = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(whatsAppMessage)}` : '';
  const title = `${product?.name || 'Producto'} | ${business?.name || 'Catálogo'}`;
  const description = String(product?.description || business?.description || 'Consulta este producto y pide por WhatsApp.').slice(0, 160);

  return (
    <div className="min-h-screen bg-slate-950 font-catalog antialiased">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:type" content="product" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        {productUrl && <link rel="canonical" href={productUrl} />}
      </Helmet>
      <ProductModal
        product={product}
        products={products}
        business={business}
        slug={businessSlug}
        formatPrice={formatPrice}
        whatsAppUrl={whatsAppUrl}
        whatsAppMessage={whatsAppMessage}
        onClose={goToCatalog}
        theme={theme}
        cardSettings={cardSettings}
        useCategories={design?.useCategories === true}
      />
    </div>
  );
}

export default function PublicProductPage() {
  return (
    <CartProvider>
      <PublicProductInner />
    </CartProvider>
  );
}
