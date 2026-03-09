import React from "react";
import Icon from "components/AppIcon";

const STEPS = [
  {
    step: "01",
    icon: "Store",
    title: "Crea tu negocio",
    description: "Registra tu negocio en minutos. Agrega tu nombre, logo, número de WhatsApp y personaliza tu perfil.",
    highlight: true,
  },
  {
    step: "02",
    icon: "Package",
    title: "Agrega tus productos",
    description: "Sube fotos, escribe nombres, precios y descripciones. Tu catálogo queda listo al instante.",
  },
  {
    step: "03",
    icon: "MessageCircle",
    title: "Recibe pedidos",
    description: "Comparte el link de tu catálogo. Tus clientes eligen productos y el pedido llega directo a tu WhatsApp.",
  },
];

export default function HowItWorksSection() {
  return (
    <section id="como-funciona" className="py-20 md:py-28" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="max-w-screen-xl mx-auto px-4 md:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-2xl mb-14 md:mb-16">
          <span
            className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest mb-4 px-3 py-1.5 rounded-full"
            style={{ color: 'var(--color-primary)', backgroundColor: 'rgba(124,58,237,0.08)', fontFamily: 'var(--font-caption)' }}
          >
            <Icon name="Layers" size={11} color="var(--color-primary)" />
            Cómo funciona
          </span>
          <h2
            className="text-3xl md:text-4xl font-extrabold mb-4"
            style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.025em' }}
          >
            En 3 pasos tienes tu catálogo listo
          </h2>
          <p
            className="text-base leading-relaxed"
            style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-body)' }}
          >
            Sin conocimientos técnicos. Sin complicaciones. Solo sigue los pasos y empieza a vender.
          </p>
        </div>

        {/* Steps - bento layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">
          {STEPS?.map((step, idx) => (
            <div
              key={idx}
              className="relative p-6 lg:p-8 rounded-2xl border transition-all duration-200 hover:-translate-y-1 group"
              style={{
                backgroundColor: step?.highlight ? 'var(--color-primary)' : '#FFFFFF',
                borderColor: step?.highlight ? 'transparent' : 'var(--color-border)',
                boxShadow: step?.highlight ? 'var(--shadow-violet)' : 'var(--shadow-sm)',
              }}
            >
              {/* Step number - large background */}
              <div
                className="absolute top-4 right-5 text-5xl font-black select-none"
                style={{
                  color: step?.highlight ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.05)',
                  fontFamily: 'var(--font-heading)',
                  lineHeight: 1,
                }}
                aria-hidden="true"
              >
                {step?.step}
              </div>

              <div className="flex items-start gap-4 mb-5">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: step?.highlight ? 'rgba(255,255,255,0.18)' : 'rgba(124,58,237,0.08)',
                  }}
                >
                  <Icon
                    name={step?.icon}
                    size={20}
                    color={step?.highlight ? '#FFFFFF' : 'var(--color-primary)'}
                  />
                </div>
                <div
                  className="text-xs font-bold uppercase tracking-widest mt-3"
                  style={{
                    color: step?.highlight ? 'rgba(255,255,255,0.6)' : 'var(--color-muted-foreground)',
                    fontFamily: 'var(--font-caption)',
                  }}
                >
                  Paso {step?.step}
                </div>
              </div>

              <h3
                className="text-lg font-bold mb-2.5"
                style={{
                  fontFamily: 'var(--font-heading)',
                  color: step?.highlight ? '#FFFFFF' : 'var(--color-foreground)',
                  letterSpacing: '-0.015em',
                }}
              >
                {step?.title}
              </h3>
              <p
                className="text-sm leading-relaxed"
                style={{
                  color: step?.highlight ? 'rgba(255,255,255,0.78)' : 'var(--color-muted-foreground)',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {step?.description}
              </p>

              {/* Arrow connector (desktop) */}
              {idx < STEPS?.length - 1 && (
                <div
                  className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: '#FFFFFF', border: '1.5px solid var(--color-border)', boxShadow: 'var(--shadow-xs)' }}
                  aria-hidden="true"
                >
                  <Icon name="ChevronRight" size={12} color="var(--color-muted-foreground)" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}