import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import Icon from 'components/AppIcon';
import Button from 'components/ui/Button';
import {
  GO_INTERNATIONAL_DESCRIPTION,
  GO_INTERNATIONAL_TITLE,
  buildGoInternationalJsonLd,
  getGoInternationalCanonical,
  getGoInternationalOgImage,
  stringifyJsonLd,
} from '../../utils/goInternationalSeo';

export default function GoInternationalLanding() {
  const navigate = useNavigate();
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin.replace(/\/$/, '')
      : '';
  const canonicalUrl = getGoInternationalCanonical(origin) || `${origin}/`;
  const ogImage = getGoInternationalOgImage(origin);
  const jsonLd = buildGoInternationalJsonLd({ url: canonicalUrl });

  return (
    <div
      className="min-h-screen w-full max-w-full min-w-0 overflow-x-hidden bg-white"
      style={{ fontFamily: 'var(--font-body)' }}
    >
      <Helmet htmlAttributes={{ lang: 'es' }}>
        <title>{GO_INTERNATIONAL_TITLE}</title>
        <meta name="description" content={GO_INTERNATIONAL_DESCRIPTION} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:title" content={GO_INTERNATIONAL_TITLE} />
        <meta property="og:description" content={GO_INTERNATIONAL_DESCRIPTION} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:locale" content="es" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={GO_INTERNATIONAL_TITLE} />
        <meta name="twitter:description" content={GO_INTERNATIONAL_DESCRIPTION} />
        <meta name="twitter:image" content={ogImage} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: stringifyJsonLd(jsonLd) }}
        />
      </Helmet>

      <header
        className="sticky top-0 z-50 border-b border-gray-100 bg-white/95 backdrop-blur-md"
        role="banner"
      >
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 font-bold text-gray-900 text-sm tracking-tight" aria-label="VentALink inicio">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
                boxShadow: '0 2px 8px rgba(13,148,136,0.35)',
              }}
            >
              <Icon name="Globe" size={16} color="#FFFFFF" />
            </div>
            VentALink
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3" aria-label="Acciones">
            <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>
              Iniciar sesión
            </Button>
            <Button size="sm" className="hidden sm:inline-flex" onClick={() => navigate('/business-registration')}>
              Comenzar gratis
            </Button>
          </nav>
        </div>
      </header>

      <main role="main">
        <section
          className="relative overflow-hidden pt-16 pb-20 md:pt-24 md:pb-28"
          aria-labelledby="intl-hero-heading"
        >
          <div className="absolute inset-0 -z-10" aria-hidden="true">
            <div
              className="absolute inset-0 opacity-[0.12]"
              style={{
                background:
                  'radial-gradient(ellipse 80% 60% at 50% -10%, rgb(13 148 136) 0%, transparent 55%)',
              }}
            />
          </div>
          <div className="max-w-3xl mx-auto px-4 text-center">
            <p
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-6 border border-teal-200 bg-teal-50 text-teal-900"
            >
              <Icon name="CheckCircle" size={14} className="text-teal-700" aria-hidden />
              Catálogo online + pedidos por WhatsApp
            </p>
            <h1
              id="intl-hero-heading"
              className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-6"
              style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.03em' }}
            >
              Vende por WhatsApp con tu propio catálogo online
            </h1>
            <p className="text-lg text-gray-600 leading-relaxed mb-10 max-w-2xl mx-auto">
              Crea tu catálogo, comparte el link y recibe pedidos ordenados sin complicaciones
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => navigate('/business-registration')}
              >
                Comenzar gratis
              </Button>
              <Button variant="outline" size="lg" className="w-full sm:w-auto border-teal-200 text-teal-900 hover:bg-teal-50" onClick={() => navigate('/login')}>
                Iniciar sesión
              </Button>
            </div>
          </div>
        </section>

        <section className="py-16 md:py-20" aria-labelledby="steps-heading">
          <div className="max-w-4xl mx-auto px-4">
            <h2 id="steps-heading" className="text-2xl font-bold text-gray-900 text-center mb-12">
              ¿Cómo funciona?
            </h2>
            <ol className="grid md:grid-cols-3 gap-8 list-none p-0 m-0">
              {[
                {
                  step: '1',
                  title: 'Crear catálogo',
                  body: 'Sube tus productos con fotos, precios y descripciones en minutos.',
                },
                {
                  step: '2',
                  title: 'Compartir link',
                  body: 'Envía tu catálogo por WhatsApp, Instagram o donde prefieras.',
                },
                {
                  step: '3',
                  title: 'Recibir pedidos',
                  body: 'Recibe pedidos ordenados y responde rápido desde WhatsApp.',
                },
              ].map((item) => (
                <li
                  key={item.step}
                  className="relative rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
                >
                  <span
                    className="absolute -top-3 left-6 inline-flex h-8 w-8 items-center justify-center rounded-full bg-teal-600 text-white text-sm font-bold"
                    aria-hidden
                  >
                    {item.step}
                  </span>
                  <h3 className="text-lg font-semibold text-gray-900 mt-2 mb-2">{item.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{item.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          className="py-16 md:py-20 bg-teal-900 text-white"
          aria-labelledby="cta-heading"
        >
          <div className="max-w-2xl mx-auto px-4 text-center">
            <h2 id="cta-heading" className="text-2xl md:text-3xl font-bold mb-8">
              Empieza gratis en menos de 1 minuto
            </h2>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                size="lg"
                className="bg-white text-teal-900 hover:bg-teal-50 w-full sm:w-auto"
                onClick={() => navigate('/business-registration')}
              >
                Comenzar gratis
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-teal-300 text-white hover:bg-teal-800 w-full sm:w-auto"
                onClick={() => navigate('/login')}
              >
                Iniciar sesión
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-100 py-10 bg-white" role="contentinfo">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row justify-between gap-6 text-sm text-gray-500">
          <p>© {new Date().getFullYear()} VentALink</p>
          <div className="flex flex-wrap gap-4">
            <Link to="/terms" className="hover:text-gray-800">
              Términos
            </Link>
            <Link to="/privacy" className="hover:text-gray-800">
              Privacidad
            </Link>
            <Link to="/plans" className="hover:text-gray-800">
              Precios
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
