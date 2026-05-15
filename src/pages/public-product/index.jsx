import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { getPublicProductBySlug } from '../../services/waBusinessService';
import { formatPrice } from '../../utils/formatPrice';
import { getPublicCatalogRelativePath } from '../../config/appUrl';
import PublicPageLayout from '../../components/PublicPageLayout';
import { buildCfImageErrorHandler, cfImageUrl, isCfTransformableUrl } from '../../utils/cloudflareImage';

function PublicProductPage() {
  const { businessSlug, productSlug } = useParams();
  const [state, setState] = useState({ loading: true, product: null, business: null, notFound: false });

  console.log('[public-product-page] params', { businessSlug, productSlug });

  useEffect(() => {
    if (!businessSlug || !productSlug) {
      setState({ loading: false, product: null, business: null, notFound: true });
      return;
    }
    let cancelled = false;
    getPublicProductBySlug(businessSlug, productSlug).then(({ data, error }) => {
      console.log('[public-product-page] service_result', { data, error });
      if (cancelled) return;
      if (error || !data) {
        console.log('[public-product-page] show_not_found', { error });
        setState({ loading: false, product: null, business: null, notFound: true });
      } else {
        setState({ loading: false, product: data.product, business: data.business, notFound: false });
      }
    });
    return () => { cancelled = true; };
  }, [businessSlug, productSlug]);

  if (state.loading) {
    return (
      <PublicPageLayout>
        <div className="min-h-screen flex items-center justify-center">
          <svg className="animate-spin" width={36} height={36} viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="10" stroke="rgba(124,58,237,0.2)" strokeWidth="3" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="#7C3AED" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
      </PublicPageLayout>
    );
  }

  if (state.notFound) {
    return (
      <PublicPageLayout>
        <Helmet>
          <title>Producto no encontrado</title>
        </Helmet>
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
          <p className="text-2xl font-semibold text-slate-700">Producto no encontrado</p>
          <p className="text-slate-500 text-sm">Es posible que el producto ya no esté disponible.</p>
          {businessSlug && (
            <Link
              to={getPublicCatalogRelativePath(businessSlug)}
              className="mt-2 text-violet-600 underline text-sm"
            >
              Ver catálogo completo
            </Link>
          )}
        </div>
      </PublicPageLayout>
    );
  }

  const { product, business } = state;
  const displayImage = product.cardImageUrl || product.imageUrl || (product.images?.[0] ?? null);
  const optimizedImage = displayImage && isCfTransformableUrl(displayImage)
    ? cfImageUrl(displayImage, { width: 800, format: 'webp', quality: 85 })
    : displayImage;

  const currency = business.currency || 'USD';
  const catalogPath = getPublicCatalogRelativePath(business.slug);

  return (
    <PublicPageLayout>
      <Helmet>
        <title>{`${product.name} — ${business.name}`}</title>
        <meta name="description" content={product.description || `${product.name} en ${business.name}`} />
        {optimizedImage && <meta property="og:image" content={optimizedImage} />}
      </Helmet>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <nav className="text-sm text-slate-500 mb-6">
          <Link to={catalogPath} className="hover:text-violet-600 transition-colors">
            {business.name}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-slate-700">{product.name}</span>
        </nav>

        {optimizedImage && (
          <div className="rounded-2xl overflow-hidden mb-6 bg-slate-100 aspect-square max-h-80 flex items-center justify-center">
            <img
              src={optimizedImage}
              alt={product.name}
              className="object-cover w-full h-full"
              onError={buildCfImageErrorHandler(displayImage)}
            />
          </div>
        )}

        <h1 className="text-2xl font-bold text-slate-800 mb-2">{product.name}</h1>

        <div className="flex items-baseline gap-3 mb-4">
          <span className="text-2xl font-semibold text-violet-700">
            {formatPrice(product.price, currency)}
          </span>
          {product.compareAtPrice != null && product.compareAtPrice > product.price && (
            <span className="text-slate-400 line-through text-base">
              {formatPrice(product.compareAtPrice, currency)}
            </span>
          )}
        </div>

        {product.description && (
          <p className="text-slate-600 text-sm leading-relaxed mb-4">{product.description}</p>
        )}

        {product.longDescription && (
          <p className="text-slate-500 text-sm leading-relaxed mb-4 whitespace-pre-line">
            {product.longDescription}
          </p>
        )}

        <Link
          to={catalogPath}
          className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
        >
          Ver catálogo completo
        </Link>
      </div>
    </PublicPageLayout>
  );
}

export default PublicProductPage;
