import React from "react";
import Icon from "components/AppIcon";
import { getCountryLabels } from "config/country";

const BENEFITS_BASE = [
  { icon: "Smartphone", title: "100% Mobile-First", description: "Diseñado para que tus clientes naveguen y compren fácilmente desde su celular.", featured: true },
  { icon: "Link", title: "Link único de catálogo", description: "Comparte un solo enlace en Instagram, Facebook o WhatsApp y tus clientes ven todo." },
  { icon: "MessageCircle", title: "Pedidos a WhatsApp", description: "El mensaje del pedido se genera solo con todos los productos y cantidades seleccionadas." },
  { icon: "Sparkles", title: "IA para descripciones", description: "Mejora la descripción de tus productos con un clic: texto comercial, llamada a la acción y hashtags (planes Pro/Business)." },
  { icon: "Image", title: "Fotos y variantes", description: "Múltiples imágenes por producto y opciones como talles o colores para vender más." },
  { icon: "BarChart2", title: "Dashboard en tiempo real", description: "Métricas, pedidos por día, productos más vendidos y notificación al instante cuando llega un pedido." },
  { icon: "Palette", title: "Catálogo personalizable", description: "Temas, colores, fuentes y estilo del catálogo para que tu tienda se vea como vos querés." },
  { icon: "Truck", title: "Entregas y pagos", description: "Configurá retiro, entrega local o envío nacional; efectivo, transferencia, MercadoPago y más." },
  { icon: "Globe", titleKey: "benefitsTitle", descriptionKey: "benefitsDescription", countrySpecific: true },
];

export default function BenefitsSection() {
  const labels = getCountryLabels();
  const BENEFITS = BENEFITS_BASE.map((b) => {
    if (b.countrySpecific) {
      return { ...b, title: labels.benefitsTitle, description: labels.benefitsDescription };
    }
    return { ...b, title: b.title, description: b.description };
  });
  return (
    <section id="beneficios" className="py-20 md:py-28" style={{ backgroundColor: '#FFFFFF' }}>
      <div className="w-full max-w-screen-xl mx-auto px-4 md:px-6 lg:px-8 min-w-0">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-14 md:mb-16">
          <div className="max-w-xl">
            <span
              className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest mb-4 px-3 py-1.5 rounded-full"
              style={{ color: 'var(--color-primary)', backgroundColor: 'rgba(124,58,237,0.08)', fontFamily: 'var(--font-caption)' }}
            >
              <Icon name="Star" size={11} color="var(--color-primary)" />
              Beneficios
            </span>
            <h2
              className="text-3xl md:text-4xl font-extrabold mb-3"
              style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.025em' }}
            >
              Todo lo que necesitas para vender más
            </h2>
            <p
              className="text-base leading-relaxed"
              style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-body)' }}
            >
              Herramientas pensadas para emprendedores que quieren crecer sin complicaciones técnicas.
            </p>
          </div>
          <div
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border flex-shrink-0"
            style={{ backgroundColor: 'rgba(16,185,129,0.06)', borderColor: 'rgba(16,185,129,0.2)' }}
          >
            <Icon name="CheckCircle" size={15} color="var(--color-success)" />
            <span className="text-sm font-semibold" style={{ color: 'var(--color-success)', fontFamily: 'var(--font-caption)' }}>100% Gratis para empezar</span>
          </div>
        </div>

        {/* Benefits grid - varied sizes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
          {BENEFITS?.map((b, i) => (
            <div
              key={i}
              className="group p-6 rounded-2xl border transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
              style={{
                backgroundColor: '#FFFFFF',
                borderColor: 'var(--color-border)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-all duration-200 group-hover:scale-110"
                style={{ backgroundColor: 'rgba(124,58,237,0.08)' }}
              >
                <Icon name={b?.icon} size={18} color="var(--color-primary)" />
              </div>
              <h3
                className="text-base font-bold mb-2"
                style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.01em' }}
              >
                {b?.title}
              </h3>
              <p
                className="text-sm leading-relaxed"
                style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-body)' }}
              >
                {b?.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}