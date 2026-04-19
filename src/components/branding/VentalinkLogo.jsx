import React from "react";

/** Identidad v2.1: isotipo celeste WhatsApp + wordmark azul oscuro */
const CELESTE_WHATSAPP = "#00AFFF";
const TEXT_INK = "#1E1B4B";

/**
 * Logo completo: isotipo V-Check + wordmark Ventalink.
 * @param {'default'|'white'|'light'} variant — white|light: trazos y texto #FFFFFF; default: isotipo #00AFFF, texto #1E1B4B
 * @param {number} [height] — alto fijo (el ancho sale del viewBox 400×120)
 * @param {number} [size] — alias de height (compatibilidad)
 * @param {number} [width] — ancho máximo en px (100% del contenedor hasta este tope); el alto es automático. Prioridad sobre height/size.
 */
export default function VentalinkLogo({ variant = "default", className = "", height: heightProp, size, width: widthProp }) {
  const v = variant === "light" ? "white" : variant;
  const isWhite = v === "white";
  const strokeBack = isWhite ? "#FFFFFF" : "rgba(0, 175, 255, 0.82)";
  const strokeFront = isWhite ? "#FFFFFF" : CELESTE_WHATSAPP;
  const textColor = isWhite ? "#FFFFFF" : TEXT_INK;
  const height = heightProp ?? size ?? 40;
  const widthMode = widthProp != null && widthProp > 0;

  const svg = (
    <img
      src={isWhite ? "/walinka-white.svg" : "/walinka.svg"}
      alt="Walinka"
      className={widthMode ? "w-full h-auto block max-w-full" : "h-full w-auto block"}
    />
  );

  if (widthMode) {
    return (
      <div
        className={`flex flex-col items-center justify-center flex-shrink-0 w-full ${className}`}
        style={{ maxWidth: widthProp }}
        role="img"
        aria-label="Walinka"
      >
        {svg}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center flex-shrink-0 ${className}`}
      style={{ height, minHeight: height }}
      role="img"
      aria-label="Walinka"
    >
      {svg}
    </div>
  );
}
