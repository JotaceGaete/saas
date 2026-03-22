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

function isGoHost() {
  if (typeof window === 'undefined') return false;
  return /(^|\.)go\.ventalink\.app$/.test((window.location?.hostname || '').toLowerCase());
}

export default function GoInternationalLanding() {
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
          <Link
            to="/"
            className="flex items-center gap-2.5 font-bold text-gray-900 text-sm tracking-tight"
            aria-label="VentALink inicio"
          >
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
              Crear cuenta
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
              <Icon name="Globe" size={14} className="text-teal-700" aria-hidden />
              Uso internacional · Pagos en USD
            </p>
            <h1
              id="intl-hero-heading"
              className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-6"
              style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.03em' }}
            >
              Tu catálogo digital, clientes en cualquier lugar
            </h1>
            <p className="text-lg text-gray-600 leading-relaxed mb-10 max-w-2xl mx-auto">
              Publica productos, comparte un enlace y recibe pedidos por WhatsApp sin depender de una
              tienda en línea compleja. Pensado para equipos y emprendedores que operan de forma
              internacional o con clientes en varios países.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => navigate('/business-registration')}
              >
                Comenzar gratis
              </Button>
              {isGoHost() && (
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto border-teal-200 text-teal-900 hover:bg-teal-50"
                  asChild
                >
                  <Link to="/elegir-pais">Configurar país y moneda</Link>
                </Button>
              )}
            </div>
          </div>
        </section>

        <section className="py-16 md:py-20 bg-gray-50 border-y border-gray-100" aria-labelledby="usd-heading">
          <div className="max-w-5xl mx-auto px-4 grid md:grid-cols-2 gap-12 items-start">
            <div>
              <h2 id="usd-heading" className="text-2xl font-bold text-gray-900 mb-4">
                Precios y facturación en dólares (USD)
              </h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                En el entorno internacional, los planes y pagos recurrentes se gestionan en{' '}
                <strong>USD</strong>, con un proveedor de pagos adaptado a clientes fuera de un solo
                país. Así evitas sorpresas al vender a distintas regiones y mantienes una referencia
                clara para tu presupuesto.
              </p>
              <p className="text-gray-600 leading-relaxed">
                Si más adelante necesitas una moneda o método de pago distinto, puedes ajustar el
                contexto desde la configuración una vez que definas el país de operación.
              </p>
            </div>
            <ul className="space-y-4 text-gray-700">
              <li className="flex gap-3">
                <span className="mt-0.5 text-teal-600 flex-shrink-0" aria-hidden>
                  <Icon name="CheckCircle" size={20} />
                </span>
                <span>
                  <strong className="text-gray-900">Alcance global:</strong> comparte el mismo
                  catálogo con contactos en distintos husos horarios; el pedido sigue llegando por
                  WhatsApp.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 text-teal-600 flex-shrink-0" aria-hidden>
                  <Icon name="CheckCircle" size={20} />
                </span>
                <span>
                  <strong className="text-gray-900">Mensaje unificado:</strong> el flujo es
                  coherente para quien compra desde el extranjero o en la misma ciudad: un enlace,
                  una lista de productos, un canal de contacto directo.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 text-teal-600 flex-shrink-0" aria-hidden>
                  <Icon name="CheckCircle" size={20} />
                </span>
                <span>
                  <strong className="text-gray-900">Sin enfoque en un solo país:</strong> esta
                  página describe el producto de forma neutral; no está limitada a un mercado
                  concreto.
                </span>
              </li>
            </ul>
          </div>
        </section>

        <section className="py-16 md:py-20" aria-labelledby="steps-heading">
          <div className="max-w-5xl mx-auto px-4">
            <h2 id="steps-heading" className="text-2xl font-bold text-gray-900 text-center mb-12">
              Tres pasos para operar de forma internacional
            </h2>
            <ol className="grid md:grid-cols-3 gap-8 list-none p-0 m-0">
              {[
                {
                  step: '1',
                  title: 'Registra tu negocio',
                  body: 'Crea tu cuenta y define los datos básicos. Si vendes en varios mercados, puedes indicar país y preferencias cuando lo necesites.',
                },
                {
                  step: '2',
                  title: 'Carga el catálogo',
                  body: 'Sube imágenes, precios y textos. Los visitantes ven una sola página ordenada, lista para compartir en redes o por mensaje.',
                },
                {
                  step: '3',
                  title: 'Recibe pedidos por WhatsApp',
                  body: 'El cliente elige productos y envía el pedido al número que configures. Tú respondes con el mismo canal que ya utilizas.',
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
          <div className="max-w-3xl mx-auto px-4 text-center">
            <h2 id="cta-heading" className="text-2xl md:text-3xl font-bold mb-4">
              ¿Listo para vender con un catálogo online simple?
            </h2>
            <p className="text-teal-100 mb-8 leading-relaxed">
              Crea tu cuenta, prueba el flujo y comparte tu enlace con clientes en cualquier país.
              Sin complicaciones técnicas: enfoque en productos, pedidos y conversación por WhatsApp.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                size="lg"
                className="bg-white text-teal-900 hover:bg-teal-50 w-full sm:w-auto"
                onClick={() => navigate('/business-registration')}
              >
                Crear cuenta
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-teal-300 text-white hover:bg-teal-800 w-full sm:w-auto"
                onClick={() => navigate('/login')}
              >
                Ya tengo cuenta
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-100 py-10 bg-white" role="contentinfo">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row justify-between gap-6 text-sm text-gray-500">
          <p>© {new Date().getFullYear()} VentALink · Uso internacional</p>
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
