import React, { useId } from "react";

/**
 * Isotipo V-Check: doble gancho violeta (marca sin wordmark).
 * @param {'default'|'light'|'onDark'|'embedded'} variant — embedded: solo ganchos (el contenedor aporta el fondo, p. ej. `.sidebar-logo`)
 */
export default function VCheckIsotype({
  variant = "default",
  className = "",
  size = 32,
  title = "Walinka",
}) {
  const isLight = variant === "light";
  const onDark = variant === "onDark";
  const embedded = variant === "embedded";
  const gradId = `vcheckBg-${useId().replace(/:/g, "")}`;

  /* default: caja con gradiente + ganchos claros (navbar/footer claros) */
  const backStroke = embedded
    ? "rgba(255,255,255,0.82)"
    : isLight
      ? "#DDD6FE"
      : onDark
        ? "#A78BFA"
        : "rgba(255,255,255,0.82)";
  const frontStroke = embedded ? "#FFFFFF" : isLight ? "#FFFFFF" : onDark ? "#EDE9FE" : "#FFFFFF";

  if (embedded) {
    return (
      <img
        src="/walinka-white.svg"
        width={size}
        height={size}
        alt={title}
        className={className}
        role="img"
        aria-label={title}
      />
    );
  }

  return (
    <img
      src="/walinka-white.svg"
      width={size}
      height={size}
      alt={title}
      className={className}
      role="img"
      aria-label={title}
    />
  );
}
