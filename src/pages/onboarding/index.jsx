import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import Icon from '../../components/AppIcon';
import DynamicWhatsAppField from '../../components/DynamicWhatsAppField';
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
import { getOnboardingResumeStep, isOnboardingComplete } from '../../lib/onboarding/state';

const DEFAULT_PRODUCT = {
  name: '',
  description: '',
  price: '',
};

function validateWhatsappByCountry(value, countryConfig) {
  const prefixDigits = String(countryConfig?.phonePrefix || '').replace(/\D/g, '');
  const localLength = Number(countryConfig?.phoneLocalLength || 0);
  const localPrefix = countryConfig?.phoneLocalPrefix ? String(countryConfig.phoneLocalPrefix) : null;
  const digits = String(value || '').replace(/\D/g, '');

  if (!digits) return 'El WhatsApp es obligatorio.';
  if (!prefixDigits || !localLength) return null;
  if (!digits.startsWith(prefixDigits)) return 'El numero no coincide con el pais seleccionado.';

  const localDigits = digits.slice(prefixDigits.length);
  if (localDigits.length !== localLength) {
    return `Ingresa ${localLength} digitos para ${countryConfig?.name || 'este pais'}.`;
  }
  if (localPrefix && !localDigits.startsWith(localPrefix)) {
    return `El numero debe comenzar con ${localPrefix}.`;
  }

  return null;
}

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

  const [basics, setBasics] = useState({
    name: business?.name || user?.user_metadata?.name || '',
    whatsapp: business?.whatsapp || '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [product, setProduct] = useState(DEFAULT_PRODUCT);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [reconcilingStep, setReconcilingStep] = useState(false);
  const [savingBasics, setSavingBasics] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState(null);

  const selectedCountryCode =
    business?.countryCodeDb ||
    countryCode ||
    user?.user_metadata?.onboarding_country_code ||
    null;

  const countryConfig = getCountryConfig(selectedCountryCode);
  const currentStep = useMemo(
    () => getOnboardingResumeStep(business, products),
    [business, products],
  );

  const catalogUrl = useMemo(
    () => (business?.slug ? getPublicCatalogUrl(business.slug) : ''),
    [business?.slug],
  );

  useEffect(() => {
    setBasics({
      name: business?.name || user?.user_metadata?.name || '',
      whatsapp: business?.whatsapp || '',
    });
  }, [business?.name, business?.whatsapp, user?.user_metadata?.name]);

  useEffect(() => {
    let ignore = false;

    const loadProducts = async () => {
      if (!business?.id) {
        setProducts([]);
        return;
      }

      setProductsLoading(true);
      try {
        const { data, error: productsError } = await getProducts(business.id);
        if (ignore) return;

        if (productsError) {
          setError(productsError.message || 'No se pudieron cargar los productos del onboarding.');
          setProducts([]);
          return;
        }

        setProducts(data || []);
      } catch (loadError) {
        if (!ignore) {
          setError(loadError?.message || 'No se pudieron cargar los productos del onboarding.');
          setProducts([]);
        }
      } finally {
        if (!ignore) setProductsLoading(false);
      }
    };

    loadProducts();
    return () => {
      ignore = true;
    };
  }, [business?.id]);

  useEffect(() => {
    let cancelled = false;

    const reconcileStoredStep = async () => {
      if (!business?.id || productsLoading || reconcilingStep || isOnboardingComplete(business)) return;

      const storedStep = business?.onboardingStep || 'business_basics';
      if (storedStep === currentStep) return;

      setReconcilingStep(true);
      try {
        const { data, error: updateError } = await updateBusiness(business.id, {
          onboardingStep: currentStep,
        });

        if (!cancelled && !updateError && data) {
          patchBusiness(data);
        }
      } finally {
        if (!cancelled) setReconcilingStep(false);
      }
    };

    reconcileStoredStep();
    return () => {
      cancelled = true;
    };
  }, [business, currentStep, patchBusiness, productsLoading, reconcilingStep]);

  if (!user) {
    return <Navigate to="/business-registration" replace />;
  }

  if (!selectedCountryCode && !business?.id) {
    return <Navigate to="/elegir-pais" replace />;
  }

  if (isOnboardingComplete(business)) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleCreateBusiness = async (e) => {
    e?.preventDefault();
    if (savingBasics) return;

    const nextFieldErrors = {};
    if (!basics.name.trim()) {
      nextFieldErrors.name = 'El nombre del negocio es obligatorio.';
    }

    const whatsappError = validateWhatsappByCountry(basics.whatsapp, countryConfig);
    if (whatsappError) {
      nextFieldErrors.whatsapp = whatsappError;
    }

    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) {
      setError('Revisa los datos obligatorios para continuar.');
      return;
    }

    setSavingBasics(true);
    setError(null);

    try {
      const { error: metadataError } = await persistOnboardingCountry(selectedCountryCode);
      if (metadataError) {
        setError(metadataError.message || 'No se pudo guardar el pais del onboarding.');
        return;
      }

      const { data, error: createError } = await createBusinessFromOnboarding({
        name: basics.name.trim(),
        whatsapp: basics.whatsapp,
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
    } catch (createError) {
      setError(createError?.message || 'No se pudo crear el negocio.');
    } finally {
      setSavingBasics(false);
    }
  };

  const handleCreateFirstProduct = async (e) => {
    e?.preventDefault();
    if (savingProduct) return;

    if (!business?.id) {
      setError('Primero debes crear el negocio.');
      return;
    }

    if (!product.name.trim() || !String(product.price).trim()) {
      setError('Completa nombre y precio del producto.');
      return;
    }

    const numericPrice = Number(product.price);
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      setError('Ingresa un precio valido mayor a 0.');
      return;
    }

    setSavingProduct(true);
    setError(null);

    try {
      const { error: productError } = await createProduct(business.id, {
        name: product.name.trim(),
        description: product.description.trim() || null,
        price: numericPrice,
        isActive: true,
      });

      if (productError) {
        setError(productError.message || 'No se pudo crear el producto.');
        return;
      }

      const { data: refreshedProducts, error: productsError } = await getProducts(business.id);
      if (productsError) {
        setError(productsError.message || 'Se creo el producto, pero no se pudo refrescar el preview.');
        return;
      }

      setProducts(refreshedProducts || []);

      const { data: updatedBusiness, error: updateError } = await updateBusiness(business.id, {
        onboardingStep: 'preview',
      });

      if (updateError) {
        setError(updateError.message || 'No se pudo avanzar el onboarding.');
        return;
      }

      patchBusiness(updatedBusiness);
      setProduct(DEFAULT_PRODUCT);
    } catch (productError) {
      setError(productError?.message || 'No se pudo guardar el producto.');
    } finally {
      setSavingProduct(false);
    }
  };

  const handleComplete = async () => {
    if (!business?.id || completing) return;

    if (!products.length) {
      setError('Agrega al menos un producto antes de activar la tienda.');
      return;
    }

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
    } catch (completeError) {
      setError(completeError?.message || 'No se pudo completar el onboarding.');
    } finally {
      setCompleting(false);
    }
  };

  if (businessLoading || productsLoading || reconcilingStep) {
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
            Pais seleccionado: <strong>{countryConfig?.name || selectedCountryCode}</strong> · Moneda <strong>{countryConfig?.currency}</strong>
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
              Datos minimos del negocio
            </h2>
            <div>
              <label className="block text-sm mb-2" style={{ color: 'var(--color-foreground)' }}>Nombre del negocio</label>
              <input
                value={basics.name}
                onChange={(e) => {
                  setBasics((prev) => ({ ...prev, name: e.target.value }));
                  setFieldErrors((prev) => ({ ...prev, name: null }));
                  setError(null);
                }}
                className="w-full h-12 px-4 rounded-xl border"
                style={{ borderColor: fieldErrors.name ? 'var(--color-error)' : 'var(--color-border)', backgroundColor: 'var(--color-background)' }}
                placeholder="Ej. Cafeteria Nube"
              />
              {fieldErrors.name && (
                <p className="mt-2 text-sm" style={{ color: 'var(--color-error)' }}>{fieldErrors.name}</p>
              )}
            </div>

            <DynamicWhatsAppField
              value={basics.whatsapp}
              onChange={(value) => {
                setBasics((prev) => ({ ...prev, whatsapp: value }));
                setFieldErrors((prev) => ({ ...prev, whatsapp: null }));
                setError(null);
              }}
              error={fieldErrors.whatsapp}
              countryCode={selectedCountryCode}
              editableCountry={false}
              persistCountrySelection={false}
              label="Numero de WhatsApp"
              hint={`Usa solo el numero local. El prefijo ${countryConfig?.phonePrefix || ''} ya esta configurado para ${countryConfig?.name || 'tu pais'}.`}
            />

            <button
              type="submit"
              disabled={savingBasics}
              className="px-5 py-3 rounded-xl text-white font-semibold"
              style={{ backgroundColor: 'var(--color-primary)', opacity: savingBasics ? 0.7 : 1 }}
            >
              {savingBasics ? 'Creando tu tienda...' : 'Crear mi tienda'}
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
              <label className="block text-sm mb-2" style={{ color: 'var(--color-foreground)' }}>Descripcion</label>
              <textarea
                value={product.description}
                onChange={(e) => setProduct((prev) => ({ ...prev, description: e.target.value }))}
                rows={3}
                className="w-full px-4 py-3 rounded-xl border"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)' }}
                placeholder="Cuentale al cliente que incluye"
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
                Revisa tu catalogo real antes de entrar al dashboard.
              </p>
            </div>

            <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)' }}>
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--color-foreground)' }}>{business?.name}</p>
              <p className="text-xs mb-3" style={{ color: 'var(--color-muted-foreground)' }}>{catalogUrl}</p>
              <div className="space-y-2">
                {products.length ? products.slice(0, 3).map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg border px-3 py-2" style={{ borderColor: 'var(--color-border)' }}>
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>{item.name}</p>
                      <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>{item.description}</p>
                    </div>
                    <span className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
                      {countryConfig?.symbol || '$'} {item.price}
                    </span>
                  </div>
                )) : (
                  <div className="rounded-lg border px-3 py-4 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted-foreground)' }}>
                    No encontramos productos todavia. Vuelve al paso anterior y agrega uno para activar la tienda.
                  </div>
                )}
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
                Abrir catalogo
              </a>
              <button
                type="button"
                onClick={handleComplete}
                disabled={completing || !products.length}
                className="px-5 py-3 rounded-xl text-white font-semibold"
                style={{ backgroundColor: 'var(--color-primary)', opacity: completing || !products.length ? 0.7 : 1 }}
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
