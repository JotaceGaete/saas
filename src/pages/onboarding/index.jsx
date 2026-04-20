import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import Icon from '../../components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { useCountry } from '../../contexts/CountryContext';
import {
  createBusinessFromOnboarding,
  createProduct,
  getProducts,
  updateBusiness,
} from '../../services/waBusinessService';
import { getCountryConfig } from '../../config/countryConfig';
import { getPublicCatalogUrl } from '../../config/appUrl';

const DEFAULT_PRODUCT = {
  name: '',
  description: '',
  price: '',
};

export default function OnboardingPage() {
  const navigate = useNavigate();
  const {
    user,
    business,
    businessLoading,
    patchBusiness,
    refreshBusiness,
    persistOnboardingCountry,
  } = useAuth();
  const { countryCode } = useCountry();
  const selectedCountryCode = business?.countryCodeDb || countryCode || user?.user_metadata?.onboarding_country_code || null;
  const countryConfig = getCountryConfig(selectedCountryCode);
  const currentStep = business?.onboardingStep || 'business_basics';

  const [basics, setBasics] = useState({
    name: business?.name || user?.user_metadata?.name || '',
    whatsapp: business?.whatsapp || '',
  });
  const [product, setProduct] = useState(DEFAULT_PRODUCT);
  const [products, setProducts] = useState([]);
  const [savingBasics, setSavingBasics] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (business?.name || business?.whatsapp) {
      setBasics({
        name: business?.name || user?.user_metadata?.name || '',
        whatsapp: business?.whatsapp || '',
      });
    }
  }, [business?.name, business?.whatsapp, user?.user_metadata?.name]);

  useEffect(() => {
    if (!business?.id) {
      setProducts([]);
      return;
    }
    getProducts(business.id).then(({ data }) => {
      setProducts(data || []);
    }).catch(() => {
      setProducts([]);
    });
  }, [business?.id]);

  const catalogUrl = useMemo(() => (
    business?.slug ? getPublicCatalogUrl(business.slug) : ''
  ), [business?.slug]);

  if (!user) {
    return <Navigate to="/business-registration" replace />;
  }

  if (!selectedCountryCode && !business?.id) {
    return <Navigate to="/elegir-pais" replace />;
  }

  if (business?.onboardingStep === 'completed' && business?.onboardingCompletedAt) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleCreateBusiness = async (e) => {
    e?.preventDefault();
    if (!basics.name.trim() || !basics.whatsapp.trim()) {
      setError('Completa nombre del negocio y WhatsApp.');
      return;
    }
    setSavingBasics(true);
    setError(null);
    try {
      if (selectedCountryCode) {
        await persistOnboardingCountry(selectedCountryCode);
      }
      const { data, error: createError } = await createBusinessFromOnboarding({
        name: basics.name.trim(),
        whatsapp: basics.whatsapp.trim(),
        countryCode: selectedCountryCode,
        email: user?.email || null,
      });
      if (createError) {
        setError(createError.message || 'No se pudo crear el negocio.');
        return;
      }
      if (data) {
        patchBusiness(data);
        await refreshBusiness();
      }
    } finally {
      setSavingBasics(false);
    }
  };

  const handleCreateFirstProduct = async (e) => {
    e?.preventDefault();
    if (!business?.id) {
      setError('Primero debes crear el negocio.');
      return;
    }
    if (!product.name.trim() || !String(product.price).trim()) {
      setError('Completa nombre y precio del producto.');
      return;
    }
    setSavingProduct(true);
    setError(null);
    try {
      const { error: productError } = await createProduct(business.id, {
        name: product.name.trim(),
        description: product.description.trim() || null,
        price: Number(product.price),
        isActive: true,
      });
      if (productError) {
        setError(productError.message || 'No se pudo crear el producto.');
        return;
      }
      const { data: updatedBusiness, error: updateError } = await updateBusiness(business.id, {
        onboardingStep: 'preview',
      });
      if (updateError) {
        setError(updateError.message || 'No se pudo avanzar el onboarding.');
        return;
      }
      patchBusiness(updatedBusiness);
      await refreshBusiness();
      setProduct(DEFAULT_PRODUCT);
    } finally {
      setSavingProduct(false);
    }
  };

  const handleComplete = async () => {
    if (!business?.id) return;
    setCompleting(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const { data, error: updateError } = await updateBusiness(business.id, {
        onboardingStep: 'completed',
        onboardingCompletedAt: now,
        activatedAt: business?.activatedAt || now,
      });
      if (updateError) {
        setError(updateError.message || 'No se pudo completar el onboarding.');
        return;
      }
      patchBusiness(data);
      navigate('/dashboard', { replace: true });
    } finally {
      setCompleting(false);
    }
  };

  if (businessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
          <p className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            Cargando onboarding...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 py-10" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-semibold" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}>
            Onboarding
          </p>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>
            Configura tu tienda para compartirla hoy
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            País seleccionado: <strong>{countryConfig?.name || selectedCountryCode}</strong>
          </p>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {[
            { key: 'business_basics', label: 'Negocio' },
            { key: 'first_product', label: 'Producto' },
            { key: 'preview', label: 'Preview' },
            { key: 'completed', label: 'Listo' },
          ].map((step, index) => {
            const done = ['business_basics', 'first_product', 'preview', 'completed'].indexOf(currentStep) > index;
            const active = currentStep === step.key;
            return (
              <div key={step.key} className="rounded-xl border p-3 text-center" style={{ borderColor: active || done ? 'var(--color-primary)' : 'var(--color-border)' }}>
                <div className="w-8 h-8 mx-auto mb-2 rounded-full flex items-center justify-center" style={{ backgroundColor: active || done ? 'var(--color-primary)' : 'var(--color-muted)' }}>
                  {done ? <Icon name="Check" size={16} color="#fff" /> : <span className="text-xs font-bold" style={{ color: active ? '#fff' : 'var(--color-muted-foreground)' }}>{index + 1}</span>}
                </div>
                <span className="text-xs font-semibold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>{step.label}</span>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'rgba(239,68,68,0.25)', color: 'var(--color-error)', backgroundColor: 'rgba(239,68,68,0.05)' }}>
            {error}
          </div>
        )}

        {currentStep === 'business_basics' && (
          <form onSubmit={handleCreateBusiness} className="rounded-2xl border p-6 space-y-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
            <h2 className="text-xl font-semibold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>
              Datos mínimos del negocio
            </h2>
            <div>
              <label className="block text-sm mb-2" style={{ color: 'var(--color-foreground)' }}>Nombre del negocio</label>
              <input
                value={basics.name}
                onChange={(e) => setBasics((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full h-12 px-4 rounded-xl border"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)' }}
                placeholder="Ej. Cafetería Nube"
              />
            </div>
            <div>
              <label className="block text-sm mb-2" style={{ color: 'var(--color-foreground)' }}>WhatsApp</label>
              <input
                value={basics.whatsapp}
                onChange={(e) => setBasics((prev) => ({ ...prev, whatsapp: e.target.value }))}
                className="w-full h-12 px-4 rounded-xl border"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)' }}
                placeholder={`${countryConfig?.phonePrefix || '+'} ...`}
              />
            </div>
            <button
              type="submit"
              disabled={savingBasics}
              className="px-5 py-3 rounded-xl text-white font-semibold"
              style={{ backgroundColor: 'var(--color-primary)', opacity: savingBasics ? 0.7 : 1 }}
            >
              {savingBasics ? 'Creando negocio...' : 'Continuar'}
            </button>
          </form>
        )}

        {currentStep === 'first_product' && business?.id && (
          <form onSubmit={handleCreateFirstProduct} className="rounded-2xl border p-6 space-y-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
            <h2 className="text-xl font-semibold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>
              Agrega tu primer producto
            </h2>
            <div>
              <label className="block text-sm mb-2" style={{ color: 'var(--color-foreground)' }}>Nombre</label>
              <input
                value={product.name}
                onChange={(e) => setProduct((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full h-12 px-4 rounded-xl border"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)' }}
                placeholder="Ej. Combo desayuno"
              />
            </div>
            <div>
              <label className="block text-sm mb-2" style={{ color: 'var(--color-foreground)' }}>Precio ({countryConfig?.currency || business?.currency})</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={product.price}
                onChange={(e) => setProduct((prev) => ({ ...prev, price: e.target.value }))}
                className="w-full h-12 px-4 rounded-xl border"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)' }}
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm mb-2" style={{ color: 'var(--color-foreground)' }}>Descripción</label>
              <textarea
                value={product.description}
                onChange={(e) => setProduct((prev) => ({ ...prev, description: e.target.value }))}
                rows={3}
                className="w-full px-4 py-3 rounded-xl border"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)' }}
                placeholder="Cuéntale al cliente qué incluye"
              />
            </div>
            <button
              type="submit"
              disabled={savingProduct}
              className="px-5 py-3 rounded-xl text-white font-semibold"
              style={{ backgroundColor: 'var(--color-primary)', opacity: savingProduct ? 0.7 : 1 }}
            >
              {savingProduct ? 'Guardando producto...' : 'Ver preview'}
            </button>
          </form>
        )}

        {currentStep === 'preview' && business?.id && (
          <div className="rounded-2xl border p-6 space-y-5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
            <div>
              <h2 className="text-xl font-semibold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>
                Tu tienda ya se puede compartir
              </h2>
              <p className="text-sm mt-2" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                Revisa tu catálogo real antes de entrar al dashboard.
              </p>
            </div>

            <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)' }}>
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--color-foreground)' }}>{business?.name}</p>
              <p className="text-xs mb-3" style={{ color: 'var(--color-muted-foreground)' }}>{catalogUrl}</p>
              <div className="space-y-2">
                {products.slice(0, 3).map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg border px-3 py-2" style={{ borderColor: 'var(--color-border)' }}>
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>{item.name}</p>
                      <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>{item.description}</p>
                    </div>
                    <span className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
                      {countryConfig?.symbol || '$'} {item.price}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <a
                href={catalogUrl}
                target="_blank"
                rel="noreferrer"
                className="px-5 py-3 rounded-xl border font-semibold"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)' }}
              >
                Abrir catálogo
              </a>
              <button
                type="button"
                onClick={handleComplete}
                disabled={completing}
                className="px-5 py-3 rounded-xl text-white font-semibold"
                style={{ backgroundColor: 'var(--color-primary)', opacity: completing ? 0.7 : 1 }}
              >
                {completing ? 'Activando...' : 'Ir al dashboard'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
