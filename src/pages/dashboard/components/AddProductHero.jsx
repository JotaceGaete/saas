import React from "react";
import { useNavigate } from "react-router-dom";
import Icon from "components/AppIcon";

/**
 * Hero CTA shown when a business has zero products.
 * Designed to be the single dominant action on the dashboard at onboarding time.
 */
export default function AddProductHero() {
  const navigate = useNavigate();

  return (
    <div
      className="dashboard-premium-card rounded-2xl border-0 p-6 text-center relative overflow-hidden"
      role="region"
      aria-label="Cargar productos"
    >
      {/* Subtle gradient blobs for depth */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div
          className="absolute -top-10 -right-10 w-36 h-36 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(124,58,237,0.12), transparent 70%)" }}
        />
        <div
          className="absolute -bottom-10 -left-10 w-28 h-28 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(99,102,241,0.1), transparent 70%)" }}
        />
      </div>

      <div className="relative z-10">
        {/* Icon */}
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.12), rgba(99,102,241,0.12))" }}
        >
          <Icon name="Package" size={30} color="var(--color-primary)" />
        </div>

        {/* Copy */}
        <h2
          className="text-lg font-bold mb-2"
          style={{
            fontFamily: "var(--font-heading)",
            color: "var(--color-foreground)",
            letterSpacing: "-0.02em",
          }}
        >
          Empieza cargando tus productos
        </h2>
        <p
          className="text-sm mb-5 mx-auto"
          style={{
            color: "var(--color-muted-foreground)",
            fontFamily: "var(--font-caption)",
            maxWidth: "22rem",
          }}
        >
          Agrega tus primeros productos para que tu catálogo esté listo para vender por WhatsApp.
        </p>

        {/* Primary CTA */}
        <button
          type="button"
          onClick={() => navigate("/product-editor")}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
          style={{
            background: "linear-gradient(135deg, #7C3AED 0%, #6366F1 100%)",
            boxShadow: "0 4px 14px rgba(124,58,237,0.35)",
            fontFamily: "var(--font-caption)",
          }}
        >
          <Icon name="Plus" size={16} color="#FFFFFF" />
          Cargar productos
        </button>
      </div>
    </div>
  );
}
