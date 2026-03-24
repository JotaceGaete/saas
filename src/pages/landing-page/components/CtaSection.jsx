import React from "react";
import { useNavigate } from "react-router-dom";
import Icon from "components/AppIcon";

const STATS = [
  { value: "+2.400", label: "Negocios activos", icon: "Store" },
  { value: "+18.000", label: "Pedidos enviados", icon: "ShoppingCart" },
  { value: "4.9/5", label: "Valoración promedio", icon: "Star" },
];

export default function CtaSection({ onOpenRegister }) {
  const navigate = useNavigate();

  return (
    <section className="py-20 md:py-28" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="w-full max-w-screen-xl mx-auto px-4 md:px-6 lg:px-8 min-w-0">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 md:gap-8 mb-14 max-w-2xl mx-auto">
          {STATS?.map((s, i) => (
            <div key={i} className="text-center">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3"
                style={{ backgroundColor: 'rgba(124,58,237,0.08)' }}
              >
                <Icon name={s?.icon} size={18} color="var(--color-primary)" />
              </div>
              <p
                className="text-2xl md:text-3xl font-extrabold"
                style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.025em' }}
              >
                {s?.value}
              </p>
              <p
                className="text-xs md:text-sm mt-1"
                style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
              >
                {s?.label}
              </p>
            </div>
          ))}
        </div>

        {/* CTA card */}
        <div
          className="relative overflow-hidden rounded-3xl p-8 md:p-12 lg:p-16 text-center"
          style={{ background: 'linear-gradient(145deg, #5B21B6 0%, #7C3AED 45%, #6D28D9 100%)' }}
        >
          {/* Decorative elements */}
          <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-10" style={{ backgroundColor: '#fff' }} />
            <div className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full opacity-10" style={{ backgroundColor: '#fff' }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-5" style={{ backgroundColor: '#fff' }} />
          </div>

          <div className="relative z-10">
            <div
              className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-6"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
            >
              <Icon name="Zap" size={24} color="#fff" />
            </div>

            <h2
              className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-white mb-4"
              style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.025em' }}
            >
              ¿Listo para vender más?
            </h2>
            <p
              className="text-sm md:text-base max-w-lg mx-auto mb-8 leading-relaxed"
              style={{ color: 'rgba(255,255,255,0.78)', fontFamily: 'var(--font-body)' }}
            >
              Crea tu catálogo gratis hoy mismo. Sin tarjeta de crédito. Sin límite de tiempo. Empieza a recibir pedidos en minutos.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => (onOpenRegister ? onOpenRegister() : navigate("/business-registration"))}
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-semibold transition-all duration-150 hover:opacity-95 active:scale-[0.98] shadow-lg"
                style={{ backgroundColor: '#fff', color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
              >
                <Icon name="ArrowRight" size={15} color="var(--color-primary)" />
                Comenzar gratis
              </button>
              <button
                onClick={() => navigate("/dashboard")}
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-semibold transition-all duration-150 hover:bg-white/10 active:scale-[0.98]"
                style={{ border: '1.5px solid rgba(255,255,255,0.3)', color: '#fff', fontFamily: 'var(--font-caption)' }}
              >
                <Icon name="Eye" size={15} color="#fff" />
                Ver demo
              </button>
            </div>

            <div className="flex items-center justify-center gap-6 mt-8 flex-wrap">
              {[
                { icon: 'CheckCircle', text: 'Gratis para siempre' },
                { icon: 'CheckCircle', text: 'Sin tarjeta de crédito' },
                { icon: 'CheckCircle', text: 'Cancela cuando quieras' },
              ]?.map((item, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Icon name={item?.icon} size={13} color="rgba(255,255,255,0.65)" />
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--font-caption)' }}>{item?.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}