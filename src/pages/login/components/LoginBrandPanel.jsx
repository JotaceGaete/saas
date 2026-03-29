import React from "react";
import VentalinkLogo from "components/branding/VentalinkLogo";

const DEMO_IMAGE_SRC = "/demo-dashboard.png";

/**
 * Columna derecha (solo desktop): marca, captura del panel y testimonio.
 */
export default function LoginBrandPanel() {
  return (
    <aside
      className="hidden lg:flex lg:w-[min(520px,44vw)] xl:w-[min(560px,42%)] flex-col justify-between p-10 xl:p-14 min-h-screen"
      style={{
        background: "linear-gradient(155deg, #7C3AED 0%, #6D28D9 45%, #5B21B6 100%)",
      }}
      aria-hidden={false}
    >
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex flex-col items-center w-full mb-10 xl:mb-12">
          <VentalinkLogo variant="white" width={320} className="w-full max-w-[min(100%,320px)]" />
        </div>

        <p
          className="text-xs font-semibold uppercase tracking-[0.12em] text-violet-200/90 mb-3"
          style={{ fontFamily: "var(--font-caption)" }}
        >
          Panel de control
        </p>
        <h2
          className="text-2xl xl:text-3xl font-bold text-white mb-3 leading-tight"
          style={{ fontFamily: "var(--font-heading)", letterSpacing: "-0.03em" }}
        >
          Todo tu negocio, en un solo lugar
        </h2>

        <div className="relative rounded-2xl overflow-hidden border border-white/20 shadow-2xl shadow-black/20 bg-white/5 mt-2 mb-8 min-h-[220px] max-h-[min(42vh,380px)]">
          <img
            src={DEMO_IMAGE_SRC}
            alt="Vista del panel VentALink: dashboard, productos y pedidos"
            className="w-full h-full min-h-[220px] max-h-[min(42vh,380px)] object-cover object-top"
            onError={(e) => {
              e.target.style.display = "none";
              const fallback = e.target.parentElement?.querySelector(".demo-fallback");
              if (fallback) {
                fallback.classList.remove("hidden");
                fallback.style.display = "flex";
              }
            }}
          />
          <div
            className="demo-fallback hidden absolute inset-0 flex items-center justify-center p-6"
            style={{ display: "none" }}
          >
            <p className="text-white/80 text-sm text-center" style={{ fontFamily: "var(--font-body)" }}>
              Dashboard · Productos · Pedidos
            </p>
          </div>
        </div>

        <blockquote
          className="mt-auto pt-6 border-t border-white/15"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <p className="text-white/95 text-base xl:text-lg leading-relaxed font-medium">
            «Únete a +2,400 negocios que ya venden de forma organizada»
          </p>
          <footer className="mt-3 text-sm text-violet-200/85">VentALink · WhatsApp + catálogo online</footer>
        </blockquote>
      </div>
    </aside>
  );
}
