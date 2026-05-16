import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { SUPPORT_WHATSAPP_NUMBER } from '../../config/support';

const HELP_WHATSAPP_MESSAGE = 'Hola, necesito ayuda con mi tienda Walinka';
const HELP_WHATSAPP_HREF = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(HELP_WHATSAPP_MESSAGE)}`;

const DEMO_STORES = [
  {
    id: 'ropa',
    category: 'Ropa y moda',
    icon: 'Shirt',
    gradient: 'from-pink-100 to-rose-50',
    iconColor: '#EC4899',
    url: 'https://miralatienda.de/catalogo/la-tienda-de-lola',
    live: true,
  },
  {
    id: 'gastronomia',
    category: 'Gastronomía',
    icon: 'UtensilsCrossed',
    gradient: 'from-orange-100 to-amber-50',
    iconColor: '#F97316',
    url: 'https://go.ventalink.app/catalog/sr-hamburguesa',
    live: true,
  },
  {
    id: 'belleza',
    category: 'Belleza',
    icon: 'Sparkles',
    gradient: 'from-violet-100 to-purple-50',
    iconColor: '#7C3AED',
    url: null,
    live: false,
  },
  {
    id: 'regalos',
    category: 'Regalos',
    icon: 'Gift',
    gradient: 'from-teal-100 to-emerald-50',
    iconColor: '#059669',
    url: null,
    live: false,
  },
];

function DemoCard({ store, onCreateSimilar }) {
  return (
    <div
      className="rounded-2xl border overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-1 hover:scale-105 hover:shadow-md"
      style={{
        backgroundColor: '#ffffff',
        borderColor: 'var(--color-border)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
      <div className={`h-36 bg-gradient-to-br ${store.gradient} flex items-center justify-center`}>
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: 'rgba(255,255,255,0.7)' }}
        >
          <Icon name={store.icon} size={28} color={store.iconColor} />
        </div>
      </div>

      <div className="p-4 flex flex-col flex-1 gap-3">
        <p className="text-sm font-semibold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
          {store.category}
        </p>

        <div className="flex gap-2 mt-auto">
          {store.live && store.url ? (
            <a
              href={store.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
              style={{ backgroundColor: 'var(--color-primary)', color: '#ffffff', fontFamily: 'var(--font-caption)' }}
            >
              <Icon name="ExternalLink" size={13} color="#ffffff" />
              Ver ejemplo
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="flex-1 flex items-center justify-center px-3 py-2 rounded-lg text-xs font-medium cursor-not-allowed opacity-60"
              style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
            >
              Ejemplo en preparación
            </button>
          )}
          <button
            type="button"
            onClick={onCreateSimilar}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors hover:bg-muted"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
          >
            <Icon name="Plus" size={13} color="currentColor" />
            Crear igual
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HelpPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const videoRef = useRef(null);
  const [videoError, setVideoError] = useState(false);

  React.useEffect(() => {
    if (!loading && !user) navigate('/login', { replace: true });
  }, [loading, user, navigate]);

  if (!user) return null;

  return (
    <DashboardAppShell>
      <PanelHeader
        title={
          <h1 className="text-lg font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
            Ayuda
          </h1>
        }
        subtitle={
          <p className="text-xs hidden sm:block" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            Aprende, inspírate y empieza a vender
          </p>
        }
      />

      <DashboardLayoutContent>

        {/* ── Sección video ───────────────────────────────────────────── */}
        <section
          className="rounded-2xl border overflow-hidden"
          style={{ backgroundColor: '#ffffff', borderColor: 'var(--color-border)' }}
        >
          <div className="px-6 pt-6 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon name="Play" size={18} color="var(--color-primary)" />
              <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
                Cómo funciona Walinka
              </h2>
            </div>
            <p className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              Mira en minutos cómo crear tu tienda, cargar productos y recibir pedidos por WhatsApp.
            </p>
          </div>

          <div className="relative bg-black" style={{ aspectRatio: '16/9' }}>
            {!videoError ? (
              <video
                ref={videoRef}
                className="w-full h-full object-contain"
                controls
                preload="metadata"
                onError={() => setVideoError(true)}
              >
                <source src="https://media.ventalink.app/Demo-Completo.mp4" type="video/mp4" />
              </video>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3" style={{ backgroundColor: '#1e293b' }}>
                <Icon name="VideoOff" size={32} color="#94a3b8" />
                <p className="text-sm" style={{ color: '#94a3b8', fontFamily: 'var(--font-caption)' }}>
                  Video no disponible en este momento
                </p>
              </div>
            )}
          </div>

          <div className="px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
                En menos de 5 minutos puedes tener tu catálogo listo
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                Sin tarjeta de crédito. Sin instalar nada. Empieza gratis hoy.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/business-registration')}
              className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
              style={{ backgroundColor: 'var(--color-primary)', color: '#ffffff', fontFamily: 'var(--font-caption)' }}
            >
              <Icon name="Zap" size={16} color="#ffffff" />
              Crear mi tienda ahora
            </button>
          </div>
        </section>

        {/* ── Sección demos ───────────────────────────────────────────── */}
        <section>
          <div className="mb-4">
            <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
              Ve cómo lo usan otros negocios
            </h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              Ejemplos reales de tiendas creadas con Walinka.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {DEMO_STORES.map((store) => (
              <DemoCard
                key={store.id}
                store={store}
                onCreateSimilar={() => navigate('/business-registration')}
              />
            ))}
          </div>
        </section>

        {/* ── Sección blog ────────────────────────────────────────────── */}
        <section
          className="rounded-2xl border p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4"
          style={{ backgroundColor: '#ffffff', borderColor: 'var(--color-border)' }}
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'rgba(124,58,237,0.1)' }}
          >
            <Icon name="BookOpen" size={22} color="var(--color-primary)" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
              Aprende a vender más
            </h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              Consejos reales para vender más con tu tienda Walinka.
            </p>
          </div>
          <a
            href="https://blog.walinka.com"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all hover:bg-muted"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
          >
            Ir al blog
            <Icon name="ExternalLink" size={14} color="currentColor" />
          </a>
        </section>

        {/* ── Soporte directo ─────────────────────────────────────────── */}
        <section
          className="rounded-2xl border p-6"
          style={{ backgroundColor: '#ffffff', borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'rgba(37,211,102,0.1)' }}
            >
              <Icon name="MessageCircle" size={20} color="#25D366" />
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
                ¿Necesitas ayuda directa?
              </h2>
              <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                El equipo Walinka te responde
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href={HELP_WHATSAPP_HREF}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
              style={{ backgroundColor: '#25D366', color: '#ffffff', fontFamily: 'var(--font-caption)' }}
            >
              <Icon name="MessageCircle" size={16} color="#ffffff" />
              Contactar por WhatsApp
            </a>
            <a
              href="mailto:contacto@ventalink.app"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all hover:bg-muted"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
            >
              <Icon name="Mail" size={16} color="currentColor" />
              Enviar correo
            </a>
          </div>
        </section>

      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
