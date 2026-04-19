import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import Icon from 'components/AppIcon';
import GoogleIcon from 'components/GoogleIcon';
import VentalinkLogo from 'components/branding/VentalinkLogo';
import PasswordStrengthIndicator from './PasswordStrengthIndicator';
import { getCountryLabels, getCountryCode } from 'config/country';
import { COUNTRY_CODES } from 'config/countryConfig';

const NEUTRAL_HERO_SUBTITLE = 'Hecho para negocios que venden por WhatsApp';
const LATAM_REGION_LABEL = 'Disponible en toda Latinoamérica';

function readCountryFromStorage() {
  if (typeof window === 'undefined') return null;
  return getCountryCode();
}

const BENEFITS = [
  'Comparte tu catálogo en redes',
  'Recibe pedidos organizados',
  'Sin comisiones',
];

const FEATURE_CARDS = [
  { icon: 'Package', title: 'Productos', description: 'Catálogo claro y ordenado.' },
  { icon: 'ShoppingCart', title: 'Pedidos', description: 'Recibe solicitudes al instante.' },
  { icon: 'Link', title: 'Link propio', description: 'Un enlace para compartir.' },
  { icon: 'BarChart2', title: 'Métricas', description: 'Visitas y ventas en un vistazo.' },
];

const CATALOG_PREVIEW_PRODUCTS = [
  {
    name: 'Polera Essential',
    price: '$15.990',
    image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=500&q=80',
  },
  {
    name: 'Pulsera de Plata',
    price: '$22.500',
    image: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=500&q=80',
  },
  {
    name: 'Burger Especial',
    price: '$8.900',
    image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&q=80',
  },
  {
    name: 'Planta de Interior',
    price: '$12.000',
    image: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=500&q=80',
  },
];

/** Isotipo V-Check en blanco (misma geometría que el branding) */
function VCheckWhiteIsotype({ size = 22 }) {
  return (
    <img src="/walinka-white.svg" width={size} height={size} alt="" aria-hidden />
  );
}

function WhatsAppGlyphTiny({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width={12} height={12} fill="#25D366" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.123 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

/**
 * Parallax suave: el marco del teléfono rota hasta ±5° siguiendo el puntero.
 */
function PhonePreviewParallax({ children }) {
  const zoneRef = useRef(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const springX = useSpring(mx, { stiffness: 280, damping: 32, mass: 0.6 });
  const springY = useSpring(my, { stiffness: 280, damping: 32, mass: 0.6 });
  const rotateY = useTransform(springX, [-1, 1], [-5, 5]);
  const rotateX = useTransform(springY, [-1, 1], [5, -5]);

  const updateFromEvent = (clientX, clientY) => {
    const el = zoneRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const nx = ((clientX - r.left) / r.width - 0.5) * 2;
    const ny = ((clientY - r.top) / r.height - 0.5) * 2;
    mx.set(Math.max(-1, Math.min(1, nx)));
    my.set(Math.max(-1, Math.min(1, ny)));
  };

  const handleMove = (e) => updateFromEvent(e.clientX, e.clientY);
  const handleLeave = () => {
    mx.set(0);
    my.set(0);
  };

  const handleTouch = (e) => {
    const t = e.touches?.[0];
    if (t) updateFromEvent(t.clientX, t.clientY);
  };
  const handleTouchEnd = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <div
      ref={zoneRef}
      className="w-full max-w-[320px] mx-auto [perspective:1100px]"
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onTouchMove={handleTouch}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <motion.div
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
        className="will-change-transform"
      >
        {children}
      </motion.div>
    </div>
  );
}

/** Vista previa tipo catálogo multi-rubro dentro de un marco estilo iPhone + parallax */
function CatalogPhoneMock() {
  return (
    <PhonePreviewParallax>
      <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-5 sm:p-6 w-full">
        <div
          className="mx-auto rounded-[2.25rem] p-2 shadow-2xl"
          style={{
            background: 'linear-gradient(145deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%)',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.1)',
          }}
        >
          <div className="rounded-[1.85rem] overflow-hidden bg-white aspect-[9/18] flex flex-col min-h-[320px]">
            <div className="h-7 bg-neutral-100 flex items-center justify-center shrink-0">
              <div className="h-4 w-20 rounded-full bg-neutral-200/90" aria-hidden />
            </div>
            <div className="px-3 pt-2.5 pb-2 shrink-0" style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)' }}>
              <div className="flex items-center gap-2 text-white">
                <VCheckWhiteIsotype size={22} />
                <span className="text-[11px] font-bold tracking-tight flex-1 min-w-0 truncate" style={{ fontFamily: 'var(--font-heading)' }}>
                  Mi tienda
                </span>
                <div className="flex gap-1 shrink-0">
                  <span className="w-3.5 h-3.5 rounded-full bg-white/20" />
                  <span className="w-3.5 h-3.5 rounded-full bg-white/20" />
                </div>
              </div>
              <div className="mt-2 h-7 rounded-lg bg-white/15 backdrop-blur-sm flex items-center px-2 gap-1.5">
                <Icon name="Search" size={12} color="rgba(255,255,255,0.7)" />
                <span className="text-[10px] text-white/50" style={{ fontFamily: 'var(--font-caption)' }}>Buscar…</span>
              </div>
            </div>
            <div className="flex-1 min-h-0 p-2.5 bg-neutral-50 grid grid-cols-2 gap-2 content-start overflow-y-auto">
              {CATALOG_PREVIEW_PRODUCTS.map((p) => (
                <article
                  key={p.name}
                  className="rounded-xl bg-white p-1.5 shadow-sm border border-neutral-100/90 flex flex-col"
                >
                  <div className="aspect-square rounded-lg overflow-hidden bg-neutral-100 mb-1.5 relative">
                    <img
                      src={p.image}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <div className="flex items-start justify-between gap-1 min-w-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold text-neutral-800 leading-tight line-clamp-2" style={{ fontFamily: 'var(--font-caption)' }}>
                        {p.name}
                      </p>
                      <p className="text-[10px] font-bold text-violet-700 tabular-nums mt-0.5" style={{ fontFamily: 'var(--font-caption)' }}>
                        {p.price}
                      </p>
                    </div>
                    <WhatsAppGlyphTiny className="shrink-0 mt-0.5 opacity-95" />
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PhonePreviewParallax>
  );
}

export default function AuthStep({ onRegister, onLogin, onGoogleLogin, isLoading, cooldownMs = 0, authError, onClearError }) {
  /** País desde localStorage / hostname (misma lógica que el resto de la app). */
  const [storageCountryCode, setStorageCountryCode] = useState(readCountryFromStorage);
  /** País inferido por IP solo si no hay país en almacenamiento (evita “Sin definir”). */
  const [geoCountryCode, setGeoCountryCode] = useState(null);
  const [geoLookupDone, setGeoLookupDone] = useState(false);

  useEffect(() => {
    setStorageCountryCode(readCountryFromStorage());
  }, []);

  useEffect(() => {
    if (storageCountryCode) {
      setGeoLookupDone(true);
      return undefined;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      fetch('https://ipwho.is/', { method: 'GET', credentials: 'omit' })
        .then((r) => r.json())
        .then((data) => {
          if (cancelled || !data?.success) return;
          const c = String(data.country_code || '').trim().toUpperCase();
          if (c && COUNTRY_CODES.includes(c)) setGeoCountryCode(c);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setGeoLookupDone(true);
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [storageCountryCode]);

  const effectiveCountryCode = storageCountryCode || geoCountryCode || null;
  const countryLabelsResolved = useMemo(
    () => (effectiveCountryCode ? getCountryLabels(effectiveCountryCode) : null),
    [effectiveCountryCode],
  );
  /** País ISO (localStorage o IP): bandera + nombre. Si no hay ISO tras intentar IP: mensaje regional (nunca “Sin definir”). */
  const showCountryBadge = Boolean(countryLabelsResolved);
  const showLatamFallbackBadge = !countryLabelsResolved && geoLookupDone;
  const heroSubtitle = countryLabelsResolved?.heroSubtitle ?? NEUTRAL_HERO_SUBTITLE;

  const [mode, setMode] = useState('register');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [formData, setFormData] = useState({ businessName: '', email: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const cooldownSeconds = Math.ceil(Math.max(0, cooldownMs) / 1000);

  const update = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => { const e = { ...prev }; delete e[field]; return e; });
    if (authError) onClearError?.();
  };

  const switchMode = (next) => {
    setMode(next);
    setErrors({});
    onClearError?.();
  };

  const validate = () => {
    const e = {};
    const emailVal = (formData.email || '').trim();
    if (!emailVal) e.email = 'El correo es obligatorio';
    else if (emailVal.length > 254) e.email = 'El correo es demasiado largo';
    else if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(emailVal)) e.email = 'Ingresa un correo válido (ej: tu@negocio.com)';
    if (!formData.password) e.password = 'La contraseña es obligatoria';
    else if (formData.password.length < 6) e.password = 'Mínimo 6 caracteres';
    if (mode === 'register') {
      if (!formData.businessName.trim()) e.businessName = 'El nombre del negocio es obligatorio';
      if (formData.password !== formData.confirmPassword) e.confirmPassword = 'Las contraseñas no coinciden';
    }
    return e;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    if (mode === 'register') {
      onRegister({ email: formData.email, password: formData.password, businessName: formData.businessName });
    } else {
      onLogin({ email: formData.email, password: formData.password });
    }
  };

  const dividerHint = mode === 'register' ? 'o regístrate con tu email' : 'o inicia sesión con tu email';

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" style={{ backgroundColor: 'var(--color-background)' }}>

      <div
        className="w-full lg:w-1/2 flex flex-col justify-between p-8 md:p-10 xl:p-14 min-h-[50vh] lg:min-h-screen order-1"
        style={{ background: 'linear-gradient(145deg, #7C3AED 0%, #5B21B6 55%, #4C1D95 100%)' }}
      >
        <div>
          {(showCountryBadge || showLatamFallbackBadge) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.35 }}
              className="mb-6 md:mb-8"
            >
              {showCountryBadge ? (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm bg-white/15 text-white/95"
                  aria-label={countryLabelsResolved.countryName}
                  title={countryLabelsResolved.countryName}
                >
                  {countryLabelsResolved.flag} {countryLabelsResolved.countryName}
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm bg-white/15 text-white/95"
                  aria-label={LATAM_REGION_LABEL}
                  title={LATAM_REGION_LABEL}
                >
                  🌍 {LATAM_REGION_LABEL}
                </span>
              )}
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08 }}
          >
            {mode === 'register' && (
              <span className="inline-block mb-3 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-white/20 text-white border border-white/30" style={{ fontFamily: 'var(--font-caption)' }}>
                Sin comisiones
              </span>
            )}
            <h2 className="text-2xl sm:text-3xl md:text-4xl xl:text-[2.75rem] font-bold text-white mb-3 leading-[1.15]" style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.04em' }}>
              {mode === 'register' ? 'Tu catálogo digital, listo en minutos' : 'Bienvenido de vuelta'}
            </h2>
            <p className="text-white/85 text-base sm:text-lg leading-relaxed mb-6" style={{ fontFamily: 'var(--font-body)' }}>
              {mode === 'register' ? 'Carga productos, comparte tu link y recibe pedidos sin complicarte.' : 'Accede a tu panel para gestionar tu catálogo y pedidos.'}
            </p>

            {mode === 'register' && (
              <>
                <ul className="space-y-2 mb-6">
                  {BENEFITS.map((text, i) => (
                    <motion.li
                      key={text}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.28, delay: 0.18 + i * 0.07 }}
                      className="flex items-center gap-2.5 text-white/95 text-sm"
                      style={{ fontFamily: 'var(--font-body)' }}
                    >
                      <span className="text-[#86efac] font-bold text-base leading-none shrink-0">✔</span>
                      {text}
                    </motion.li>
                  ))}
                </ul>
                <p className="text-white/70 text-sm mb-8" style={{ fontFamily: 'var(--font-caption)' }}>
                  {heroSubtitle}
                </p>
              </>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.2 }}
            className="mt-2 flex justify-center"
          >
            <CatalogPhoneMock />
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.35 }}
          className="grid grid-cols-2 gap-4 mt-8 lg:mt-6"
        >
          {FEATURE_CARDS.map((f) => (
            <motion.div
              key={f.title}
              whileHover={{ y: -2, transition: { duration: 0.2 } }}
              className="rounded-2xl p-3.5 bg-white/5 backdrop-blur-[2px] transition-colors duration-200 cursor-default"
            >
              <div className="flex flex-col gap-2">
                <Icon name={f.icon} size={20} color="rgba(255,255,255,0.92)" className="opacity-95" />
                <p className="text-white font-semibold text-sm leading-tight" style={{ fontFamily: 'var(--font-caption)' }}>{f.title}</p>
                <p className="text-white/65 text-xs leading-snug" style={{ fontFamily: 'var(--font-body)' }}>{f.description}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center py-8 px-6 md:py-10 md:px-8 lg:p-10 overflow-y-auto order-2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.12 }}
          className="w-full max-w-[420px]"
        >
          {(showCountryBadge || showLatamFallbackBadge) && (
            <div className="lg:hidden flex justify-end w-full mb-4">
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs bg-violet-100 text-violet-700 max-w-[min(100%,11rem)] truncate"
                title={showCountryBadge ? countryLabelsResolved.countryName : LATAM_REGION_LABEL}
              >
                {showCountryBadge ? countryLabelsResolved.flag : '🌍'}
              </span>
            </div>
          )}

          <div
            className="border-none rounded-[40px] p-8 md:p-10"
            style={{
              backgroundColor: 'var(--color-surface)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.1)',
            }}
          >
            <div className="flex flex-col items-center w-full mb-9 sm:mb-11">
              <VentalinkLogo variant="violet" width={300} className="w-full max-w-[min(100%,320px)]" />
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold mb-1 w-full" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.03em' }}>
              {mode === 'register' ? 'Crear cuenta' : 'Iniciar sesión'}
            </h1>
            <p className="text-sm mb-6 flex items-center gap-2 flex-wrap" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              {mode === 'register' ? 'Solo toma un minuto.' : 'Ingresa tus credenciales.'}
              {(showCountryBadge || showLatamFallbackBadge) && (
                <span className="text-base lg:hidden" title={showCountryBadge ? countryLabelsResolved.countryName : LATAM_REGION_LABEL}>
                  {showCountryBadge ? countryLabelsResolved.flag : '🌍'}
                </span>
              )}
            </p>

            {authError && (
              <div className="mb-5 flex items-start gap-2 p-3 rounded-xl border" style={{ backgroundColor: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.2)' }}>
                <Icon name="AlertCircle" size={15} color="var(--color-error)" className="mt-0.5 flex-shrink-0" />
                <span className="text-sm flex-1" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>{authError}</span>
                <button type="button" onClick={onClearError} className="flex-shrink-0 opacity-60 hover:opacity-100">
                  <Icon name="X" size={14} color="var(--color-error)" />
                </button>
              </div>
            )}

            {onGoogleLogin && (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    setGoogleLoading(true);
                    onClearError?.();
                    await onGoogleLogin();
                    setGoogleLoading(false);
                  }}
                  disabled={googleLoading || isLoading}
                  className="w-full h-12 rounded-xl font-medium text-sm flex items-center justify-center gap-3 border transition-all"
                  style={{
                    borderColor: 'var(--color-border)',
                    backgroundColor: 'var(--color-background)',
                    color: 'var(--color-foreground)',
                    fontFamily: 'var(--font-caption)',
                    cursor: googleLoading || isLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {googleLoading ? (
                    <>
                      <svg className="animate-spin" width={20} height={20} viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="rgba(124,58,237,0.2)" strokeWidth="3" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-primary)" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      Redirigiendo a Google...
                    </>
                  ) : (
                    <>
                      <GoogleIcon size={20} />
                      Continuar con Google
                    </>
                  )}
                </button>
                <p
                  className="text-center mt-4 mb-6 text-[11px] tracking-[0.02em]"
                  style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)', opacity: 0.72 }}
                >
                  {dividerHint}
                </p>
              </>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-6">
              {mode === 'register' && (
                <>
                  <Field
                    label="Nombre del negocio"
                    required
                    error={errors.businessName}
                    input={
                      <input
                        type="text"
                        value={formData.businessName}
                        onChange={(e) => update('businessName', e.target.value)}
                        placeholder="Ej: Tienda Artesanal Lucía"
                        autoFocus
                        className="w-full h-12 px-4 rounded-xl border text-sm outline-none transition-all duration-200"
                        style={inputStyle(!!errors.businessName)}
                        onFocus={(e) => applyFocus(e, !!errors.businessName)}
                        onBlur={(e) => applyBlur(e, !!errors.businessName)}
                      />
                    }
                  />
                </>
              )}

              <Field
                label="Correo electrónico"
                required
                error={errors.email}
                input={
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => update('email', e.target.value)}
                    placeholder="tu@negocio.com"
                    autoComplete="email"
                    autoFocus={mode === 'login'}
                    className="w-full h-12 px-4 rounded-xl border text-sm outline-none transition-all"
                    style={inputStyle(!!errors.email)}
                    onFocus={(e) => applyFocus(e, !!errors.email)}
                    onBlur={(e) => applyBlur(e, !!errors.email)}
                  />
                }
              />
              <PasswordField
                value={formData.password}
                onChange={(v) => update('password', v)}
                error={errors.password}
                showStrength={mode === 'register'}
              />
              {mode === 'register' && (
                <Field
                  label="Confirmar contraseña"
                  required
                  error={errors.confirmPassword}
                  input={
                    <input
                      type="password"
                      value={formData.confirmPassword}
                      onChange={(e) => update('confirmPassword', e.target.value)}
                      placeholder="Repite tu contraseña"
                      autoComplete="new-password"
                      className="w-full h-12 px-4 rounded-xl border text-sm outline-none transition-all duration-200"
                      style={inputStyle(!!errors.confirmPassword)}
                      onFocus={(e) => applyFocus(e, !!errors.confirmPassword)}
                      onBlur={(e) => applyBlur(e, !!errors.confirmPassword)}
                    />
                  }
                />
              )}

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
                  style={{
                    backgroundColor: isLoading ? 'rgba(124,58,237,0.7)' : 'var(--color-primary)',
                    color: '#fff',
                    fontFamily: 'var(--font-caption)',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    boxShadow: isLoading ? 'none' : '0 4px 14px rgba(124,58,237,0.35)',
                  }}
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin" width={18} height={18} viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      Procesando...
                    </>
                  ) : mode === 'register' ? 'Crear mi catálogo' : 'Iniciar sesión'}
                </button>
                {mode === 'register' && cooldownSeconds > 0 && (
                  <p className="text-center text-xs mt-3" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                    Espera {cooldownSeconds}s para volver a intentar.
                  </p>
                )}
                {mode === 'register' && (
                  <p className="text-center text-xs mt-3" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                    No se requiere tarjeta de crédito.
                  </p>
                )}
              </div>
            </form>
          </div>

          <p className="text-center text-sm mt-6" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            {mode === 'register' ? '¿Ya tienes cuenta? ' : '¿No tienes cuenta? '}
            <button
              type="button"
              onClick={() => switchMode(mode === 'register' ? 'login' : 'register')}
              className="font-semibold hover:underline"
              style={{ color: 'var(--color-primary)' }}
            >
              {mode === 'register' ? 'Iniciar sesión' : 'Crear cuenta gratis'}
            </button>
          </p>

          {mode === 'login' && (
            <p className="text-center text-xs mt-3" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              ¿Olvidaste tu contraseña?{' '}
              <Link to="/login" className="hover:underline" style={{ color: 'var(--color-primary)' }}>
                Ir al inicio de sesión
              </Link>
            </p>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function Field({ label, required, error, input }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
        {label} {required && <span style={{ color: 'var(--color-error)' }}>*</span>}
      </label>
      {input}
      {error && (
        <p className="mt-1.5 text-xs flex items-center gap-1" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>
          <Icon name="AlertCircle" size={12} />{error}
        </p>
      )}
    </div>
  );
}

function PasswordField({ value, onChange, error, showStrength }) {
  const [show, setShow] = useState(false);
  return (
    <Field
      label="Contraseña"
      required
      error={error}
      input={
        <div className="space-y-2">
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="••••••••"
              autoComplete={showStrength ? 'new-password' : 'current-password'}
              className="w-full h-12 px-4 pr-11 rounded-xl border text-sm outline-none transition-all duration-200"
              style={inputStyle(!!error)}
              onFocus={(e) => applyFocus(e, !!error)}
              onBlur={(e) => applyBlur(e, !!error)}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShow((p) => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded"
              style={{ color: 'var(--color-muted-foreground)' }}
            >
              <Icon name={show ? 'EyeOff' : 'Eye'} size={18} />
            </button>
          </div>
          {showStrength && value && <PasswordStrengthIndicator password={value} />}
        </div>
      }
    />
  );
}

function inputStyle(hasError) {
  return {
    borderColor: hasError ? 'var(--color-error)' : 'var(--color-border)',
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-foreground)',
    fontFamily: 'var(--font-body)',
    boxShadow: hasError ? '0 0 0 3px rgba(239,68,68,0.1)' : 'none',
  };
}

function applyFocus(e, hasError) {
  e.target.style.borderColor = hasError ? 'var(--color-error)' : 'var(--color-primary)';
  if (!hasError) e.target.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.15)';
}

function applyBlur(e, hasError) {
  e.target.style.borderColor = hasError ? 'var(--color-error)' : 'var(--color-border)';
  e.target.style.boxShadow = hasError ? '0 0 0 3px rgba(239,68,68,0.1)' : 'none';
}
