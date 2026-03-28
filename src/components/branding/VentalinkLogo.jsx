import React from "react";
import VCheckIsotype from "components/branding/VCheckIsotype";

/**
 * Marca compacta: isotipo V-Check (doble gancho violeta), sin wordmark.
 * @param {'default'|'light'} variant — light: sobre fondos morados oscuros
 */
export default function VentalinkLogo({ variant = "default", className = "", size = 32 }) {
  return (
    <div className={`flex items-center flex-shrink-0 ${className}`}>
      <VCheckIsotype variant={variant} size={size} />
    </div>
  );
}
