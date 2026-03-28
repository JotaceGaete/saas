import React, { useId } from "react";

/**
 * Isotipo V-Check: doble gancho violeta (marca sin wordmark).
 * @param {'default'|'light'|'onDark'|'embedded'} variant — embedded: solo ganchos (el contenedor aporta el fondo, p. ej. `.sidebar-logo`)
 */
export default function VCheckIsotype({
  variant = "default",
  className = "",
  size = 32,
  title = "VentALink",
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
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        className={className}
        role="img"
        aria-label={title}
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>{title}</title>
        <path
          d="M18 34 L28 44 L46 22"
          fill="none"
          stroke={backStroke}
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M26 34 L36 44 L54 22"
          fill="none"
          stroke={frontStroke}
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#6D28D9" />
        </linearGradient>
      </defs>
      {!isLight && !onDark && <rect width="64" height="64" rx="14" fill={`url(#${gradId})`} />}
      {(isLight || onDark) && <rect width="64" height="64" rx="14" fill="transparent" />}
      {/* Gancho trasero */}
      <path
        d="M18 34 L28 44 L46 22"
        fill="none"
        stroke={backStroke}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Gancho delantero */}
      <path
        d="M26 34 L36 44 L54 22"
        fill="none"
        stroke={frontStroke}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
