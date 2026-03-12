import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "components/AppIcon";
import Button from "components/ui/Button";

export default function HeroSection() {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <section
      className="relative overflow-hidden pt-24 pb-16 md:pt-32 md:pb-24 lg:pt-40 lg:pb-32"
      style={{ backgroundColor: '#FFFFFF' }}>
      
      {/* Background gradients */}
      <div className="absolute inset-0 -z-10" aria-hidden="true">
        <div style={{ background: 'radial-gradient(ellipse 90% 70% at 50% -5%, rgba(124,58,237,0.09) 0%, transparent 65%)' }} className="absolute inset-0" />
        <div style={{ background: 'radial-gradient(circle at 85% 20%, rgba(139,92,246,0.07) 0%, transparent 50%)' }} className="absolute inset-0" />
        <div style={{ background: 'radial-gradient(circle at 15% 80%, rgba(109,40,217,0.05) 0%, transparent 40%)' }} className="absolute inset-0" />
      </div>

      <div className="max-w-screen-xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
          {/* Text content */}
          <div
            className="flex-1 text-center lg:text-left max-w-2xl mx-auto lg:mx-0"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'translateY(0)' : 'translateY(12px)',
              transition: 'opacity 0.5s ease, transform 0.5s ease'
            }}>
            
            {/* Badge */}
            <div
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full mb-6 border text-xs font-semibold"
              style={{
                backgroundColor: 'rgba(124,58,237,0.06)',
                borderColor: 'rgba(124,58,237,0.18)',
                color: 'var(--color-primary)',
                fontFamily: 'var(--font-caption)'
              }}>
              
              <div className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ backgroundColor: 'var(--color-primary)' }} />
              Gratis para empezar · Sin tarjeta de crédito
            </div>

            {/* Headline */}
            <h1
              className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-[1.08] mb-5"
              style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.035em' }}>
              
              Crea tu catálogo y recibe pedidos por{" "}
              <span
                style={{
                  background: 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text'
                }}>
                
                WhatsApp
              </span>
            </h1>

            <p
              className="text-base md:text-lg mb-8 max-w-xl mx-auto lg:mx-0 leading-relaxed"
              style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-body)' }}>
              
              Organiza tus productos, comparte tu catálogo y recibe pedidos automáticamente. Ideal para negocios que venden por redes sociales.
            </p>

            {/* CTA buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <Button
                variant="default"
                size="xl"
                iconName="ArrowRight"
                iconPosition="right"
                onClick={() => navigate("/business-registration")}
                className="shadow-violet hover:shadow-violet-lg">
                
                Crear mi catálogo gratis
              </Button>
              <Button
                variant="outline"
                size="xl"
                iconName="Play"
                iconPosition="left"
                onClick={() => navigate("/dashboard")}>
                
                Ver demo
              </Button>
            </div>

            {/* Social proof */}
            <div className="flex items-center gap-4 mt-8 justify-center lg:justify-start flex-wrap">
              <div className="flex -space-x-2.5">
                {[
                { src: "https://img.rocket.new/generatedImages/rocket_gen_img_19f6c3715-1773064930094.png", alt: "Emprendedora satisfecha usando Gong" },
                { src: "https://img.rocket.new/generatedImages/rocket_gen_img_123919a54-1773064935660.png", alt: "Emprendedor satisfecho usando Gong" },
                { src: "https://img.rocket.new/generatedImages/rocket_gen_img_19f6c3715-1773064930094.png", alt: "Emprendedora satisfecha usando Gong" },
                { src: "https://img.rocket.new/generatedImages/rocket_gen_img_123919a54-1773064935660.png", alt: "Emprendedor satisfecho usando Gong" }]?.
                map((person, i) =>
                <img
                  key={i}
                  src={person?.src}
                  alt={person?.alt}
                  className="w-8 h-8 rounded-full border-2 object-cover"
                  style={{ borderColor: '#FFFFFF' }} />

                )}
              </div>
              <div>
                <div className="flex items-center gap-0.5 mb-0.5">
                  {[1, 2, 3, 4, 5]?.map((s) =>
                  <svg key={s} width="13" height="13" viewBox="0 0 24 24" fill="#F59E0B">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  )}
                </div>
                <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                  <strong style={{ color: 'var(--color-foreground)' }}>Ideal para tiendas, ferias y emprendedores.</strong>
                </p>
              </div>
            </div>

            {/* Chile subtitle */}
            <p className="text-xs mt-3 text-center lg:text-left" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              🇨🇱 Hecho para negocios que venden por WhatsApp en Chile
            </p>
          </div>

          {/* Hero visual */}
          <div
            className="flex-1 w-full max-w-xs lg:max-w-sm mx-auto"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'translateY(0)' : 'translateY(16px)',
              transition: 'opacity 0.6s ease 0.15s, transform 0.6s ease 0.15s'
            }}>
            
            <HeroMockup />
          </div>
        </div>
      </div>
    </section>);

}

function HeroMockup() {
  const products = [
  {
    name: 'Torta de Chocolate',
    price: '$18.000',
    image: "https://images.unsplash.com/photo-1629121003845-e96bfccd1026",
    imageAlt: 'Deliciosa torta de chocolate con cobertura brillante y decoración de fresas frescas'
  },
  {
    name: 'Cupcakes Vainilla',
    price: '$3.500',
    image: "https://images.unsplash.com/photo-1680580731075-6734dec584c2",
    imageAlt: 'Cupcakes de vainilla con frosting rosado en espiral y chispas de colores'
  },
  {
    name: 'Macarons surtidos',
    price: '$8.990',
    image: 'https://images.unsplash.com/photo-1683425226038-6f7d5ae9e7e8',
    imageAlt: 'Macarons franceses surtidos en colores pastel rosa verde y amarillo'
  }];


  return (
    <div className="relative">
      {/* Glow behind phone */}
      <div
        className="absolute inset-0 -z-10 blur-3xl opacity-30"
        style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.4) 0%, transparent 70%)' }}
        aria-hidden="true" />
      

      {/* Phone mockup */}
      <div
        className="relative mx-auto rounded-[2.5rem] border overflow-hidden"
        style={{
          width: 'min(280px, 88vw)',
          backgroundColor: '#FFFFFF',
          borderColor: 'rgba(226,232,240,0.8)',
          boxShadow: '0 32px 64px rgba(124,58,237,0.18), 0 8px 24px rgba(15,23,42,0.08), 0 0 0 1px rgba(226,232,240,0.5)'
        }}>
        
        {/* Status bar */}
        <div className="h-7 flex items-center justify-between px-5" style={{ backgroundColor: '#F8FAFC' }}>
          <span className="text-xs font-semibold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-data)', fontSize: '10px' }}>9:41</span>
          <div className="flex items-center gap-1.5">
            <div className="flex gap-0.5">
              {[3, 4, 5]?.map((h, i) =>
              <div key={i} className="w-0.5 rounded-sm" style={{ height: `${h}px`, backgroundColor: 'var(--color-foreground)' }} />
              )}
            </div>
            <div className="w-3.5 h-2 rounded-sm border" style={{ borderColor: 'var(--color-foreground)' }}>
              <div className="w-2 h-full rounded-sm" style={{ backgroundColor: 'var(--color-foreground)' }} />
            </div>
          </div>
        </div>

        {/* App header */}
        <div className="px-4 py-3 flex items-center gap-2.5 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)', boxShadow: '0 2px 8px rgba(124,58,237,0.3)' }}>
            
            <Icon name="ShoppingBag" size={15} color="#FFFFFF" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold leading-none" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.01em' }}>Dulces Mariana</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)', fontSize: '10px' }}>+56 9 1234 5678</p>
          </div>
          <div
            className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold"
            style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: '#059669', fontSize: '10px' }}>
            
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#10B981' }} />
            Activo
          </div>
        </div>

        {/* Products */}
        <div className="p-3 space-y-2">
          {products?.map((p, i) =>
          <div
            key={i}
            className="flex items-center gap-3 p-2.5 rounded-xl"
            style={{ backgroundColor: i === 0 ? 'rgba(124,58,237,0.04)' : '#F8FAFC', border: i === 0 ? '1px solid rgba(124,58,237,0.12)' : '1px solid transparent' }}>
            
              <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0">
                <img src={p?.image} alt={p?.imageAlt} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)', fontSize: '11px' }}>{p?.name}</p>
                <p className="text-xs font-bold mt-0.5" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-data)', fontSize: '11px' }}>{p?.price}</p>
              </div>
              <button
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-transform hover:scale-110"
              style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)', boxShadow: '0 2px 6px rgba(124,58,237,0.3)' }}
              aria-label={`Agregar ${p?.name} al carrito`}>
              
                <Icon name="Plus" size={12} color="#fff" />
              </button>
            </div>
          )}
        </div>

        {/* Cart button */}
        <div className="px-3 pb-4">
          <div
            className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-white"
            style={{ backgroundColor: '#25D366', fontSize: '11px', boxShadow: '0 2px 8px rgba(37,211,102,0.3)' }}>
            
            <Icon name="MessageCircle" size={13} color="#fff" />
            Pedir por WhatsApp
          </div>
        </div>
      </div>

      {/* Floating badge - top right */}
      <div
        className="absolute -top-4 -right-3 md:right-0 px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5"
        style={{
          backgroundColor: '#FFFFFF',
          borderColor: 'var(--color-border)',
          boxShadow: 'var(--shadow-lg)',
          fontFamily: 'var(--font-caption)',
          color: 'var(--color-foreground)'
        }}>
        
        <Icon name="TrendingUp" size={12} color="var(--color-success)" />
        <span>+40% ventas</span>
      </div>

      {/* Floating badge - bottom left */}
      <div
        className="absolute -bottom-3 -left-3 md:left-0 px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2"
        style={{
          backgroundColor: '#FFFFFF',
          borderColor: 'var(--color-border)',
          boxShadow: 'var(--shadow-lg)',
          fontFamily: 'var(--font-caption)',
          color: 'var(--color-foreground)'
        }}>
        
        <div className="w-2 h-2 rounded-full pulse-dot" style={{ backgroundColor: '#10B981' }} />
        <span>Nuevo pedido recibido</span>
      </div>
    </div>);

}