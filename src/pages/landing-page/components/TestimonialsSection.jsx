import React from "react";
import Icon from "components/AppIcon";
import Image from "components/AppImage";

const TESTIMONIALS = [
{
  name: "Mariana López",
  business: "Dulces Mariana · Repostería",
  avatar: "https://img.rocket.new/generatedImages/rocket_gen_img_143f257e5-1773083367740.png",
  avatarAlt: "Mujer joven sonriente con cabello oscuro rizado, emprendedora de repostería artesanal en Santiago Chile",
  quote: "Antes mis clientes me pedían por mensaje y yo tenía que buscar las fotos una por una. Ahora comparto mi link y listo. ¡Mis ventas subieron un 40%!",
  stars: 5,
  country: "🇨🇱 Santiago"
},
{
  name: "Carlos Mendoza",
  business: "Ropa Urbana CM · Moda",
  avatar: "https://img.rocket.new/generatedImages/rocket_gen_img_1683266f7-1773083366598.png",
  avatarAlt: "Hombre joven con barba corta y camisa casual, dueño de tienda de ropa urbana en Valparaíso Chile",
  quote: "Mis clientes pueden ver todos mis productos con fotos y precios. El pedido llega directo a mi WhatsApp ya organizado. Súper práctico.",
  stars: 5,
  country: "🇨🇱 Valparaíso"
},
{
  name: "Sofía Ramírez",
  business: "Plantas & Flores SR · Jardinería",
  avatar: "https://img.rocket.new/generatedImages/rocket_gen_img_1b24a9b98-1773083367419.png",
  avatarAlt: "Mujer adulta con sonrisa amable y cabello castaño, emprendedora de plantas y flores en Concepción Chile",
  quote: "Nunca pensé que podría tener una tienda online tan bonita. Mis clientes me dicen que parece una tienda de verdad. ¡Muy recomendado!",
  stars: 5,
  country: "🇨🇱 Concepción"
}];


export default function TestimonialsSection() {
  return (
    <section id="testimonios" className="py-20 md:py-28" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="max-w-screen-xl mx-auto px-4 md:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-14 md:mb-16">
          <span
            className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest mb-4 px-3 py-1.5 rounded-full"
            style={{ color: 'var(--color-primary)', backgroundColor: 'rgba(124,58,237,0.08)', fontFamily: 'var(--font-caption)' }}>
            
            <Icon name="MessageSquare" size={11} color="var(--color-primary)" />
            Testimonios
          </span>
          <h2 className="text-3xl md:text-4xl font-extrabold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
            Lo que dicen nuestros clientes
          </h2>
        </div>

        {/* Testimonials grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">
          {TESTIMONIALS?.map((t, i) =>
          <div
            key={i}
            className="flex flex-col p-6 rounded-2xl border transition-all duration-200 hover:-translate-y-1"
            style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
            
              {/* Stars */}
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: t?.stars })?.map((_, s) => <Icon key={s} name="Star" size={14} color="#F59E0B" />)}
              </div>

              {/* Quote */}
              <p className="text-sm leading-relaxed flex-1 mb-5" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-body)' }}>
                &ldquo;{t?.quote}&rdquo;
              </p>

              {/* Author */}
              <div className="flex items-center gap-3 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                  <Image src={t?.avatar} alt={t?.avatarAlt} className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>{t?.name}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{t?.business}</p>
                </div>
                <span className="ml-auto text-base flex-shrink-0" aria-label={`País: ${t?.country}`}>{t?.country}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>);

}