import React, { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "components/AppIcon";
import ProgressCircle from "components/common/ProgressCircle";
import { QRCodeSVG } from "qrcode.react";
import { getCatalogShareMessage } from "../../../utils/branding";
import { getPublicCatalogRelativePath } from "../../../config/appUrl";
import { hasCompletedCatalogShare } from "../../../utils/catalogShareCelebration";

const STEPS = [
  {
    number: 1,
    title: "Configura tu tienda",
    description: "Agrega logo, portada (banner) y WhatsApp",
    icon: "Settings2",
    cta: "Ir a configuración",
    path: "/business-configuration",
  },
  {
    number: 2,
    title: "Agrega tu primer producto",
    description: "Crea productos con imagen, nombre y precio",
    icon: "Package",
    cta: "Crear producto",
    path: "/product-editor",
  },
  {
    number: 3,
    title: "Comparte tu catálogo",
    description: "Envía tu link a clientes por WhatsApp",
    icon: "Share2",
    cta: "Copiar link",
    path: null,
  },
];

const ACTION_CARDS = [
  {
    title: "Agregar producto",
    description: "Nuevo al catálogo",
    icon: "PackagePlus",
    accent: "#7C3AED",
    accentBg: "rgba(124,58,237,0.1)",
    action: "navigate",
    path: "/product-editor",
  },
  {
    title: "Ver catálogo",
    description: "Vista pública del catálogo",
    icon: "ExternalLink",
    accent: "#4F46E5",
    accentBg: "rgba(79,70,229,0.1)",
    action: "open_catalog",
  },
  {
    title: "Compartir catálogo",
    description: "Enviar por WhatsApp",
    icon: "Share2",
    accent: "#059669",
    accentBg: "rgba(5,150,105,0.1)",
    action: "share_whatsapp",
  },
  {
    title: "Copiar link",
    description: "Copiar enlace al portapapeles",
    icon: "Copy",
    accent: "#0284C7",
    accentBg: "rgba(2,132,199,0.1)",
    action: "copy_link",
  },
  {
    title: "Generar QR",
    description: "Código QR de tu catálogo",
    icon: "QrCode",
    accent: "#D97706",
    accentBg: "rgba(217,119,6,0.1)",
    action: "qr_code",
  },
];

export default function GettingStartedSection({
  productCount = 0,
  business,
  catalogUrl,
  onCopy,
  onCatalogShare,
}) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const [copyToast, setCopyToast] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [shareTick, setShareTick] = useState(0);
  const qrPrintRef = useRef(null);

  useEffect(() => {
    const bump = () => setShareTick((t) => t + 1);
    window.addEventListener("ventalink-catalog-shared", bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener("ventalink-catalog-shared", bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  const hasWhatsapp = !!(business?.whatsapp);
  const hasLogo = !!(business?.logoUrl?.trim());
  const hasBanner = !!(business?.coverImageUrl?.trim());
  const hasProducts = productCount > 0;

  const hasSharedCatalog = useMemo(
    () => hasCompletedCatalogShare(business?.id),
    [business?.id, shareTick],
  );

  const stepCompleted = [
    hasWhatsapp && hasLogo && hasBanner,
    hasProducts,
    hasSharedCatalog,
  ];
  const completedCount = stepCompleted?.filter(Boolean)?.length;
  const allCompleted = completedCount === 3;

  /** Lista detallada de pasos (solo sin productos aún); el anillo de progreso se muestra siempre en móvil. */
  const showOnboardingStepper = productCount === 0;

  const handleCopyLink = () => {
    if (!catalogUrl) return;
    navigator.clipboard?.writeText(catalogUrl)?.catch(() => {});
    setCopyToast(true);
    onCopy?.();
    setTimeout(() => setCopyToast(false), 2500);
  };

  const handlePrintQR = () => {
    if (!catalogUrl) return;
    const onAfterPrint = () => {
      document.body.classList.remove("print-qr-mode");
      window.removeEventListener("afterprint", onAfterPrint);
    };
    window.addEventListener("afterprint", onAfterPrint);
    document.body.classList.add("print-qr-mode");
    setTimeout(() => window.print(), 150);
  };

  useEffect(() => {
    return () => {
      document.body.classList.remove("print-qr-mode");
    };
  }, []);

  const handleCardAction = (card) => {
    switch (card?.action) {
      case "navigate":
        navigate(card?.path);
        break;
      case "open_catalog":
        if (business?.slug) navigate(getPublicCatalogRelativePath(business.slug));
        else if (catalogUrl) window.location.href = catalogUrl;
        break;
      case "share_whatsapp": {
        if (!catalogUrl) return;
        const msg = getCatalogShareMessage({
          businessName: business?.name,
          catalogUrl,
          plan: business?.planSlug,
        });
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
        onCatalogShare?.();
        break;
      }
      case "copy_link":
        handleCopyLink();
        break;
      case "qr_code":
        setQrModalOpen(true);
        break;
      default:
        break;
    }
  };

  const handleStepCta = (step) => {
    if (step?.number === 3) {
      handleCopyLink();
    } else {
      navigate(step?.path);
    }
  };

  return (
    <div className="mb-6">
      {/* Congratulations banner */}
      {allCompleted && !dismissed && (
        <div
          className="dashboard-premium-card dashboard-premium-card--success mb-4 flex items-center gap-3 p-4 rounded-2xl border-0 ring-1 ring-emerald-200/50"
        >
          <span className="text-xl">🎉</span>
          <p
            className="flex-1 text-sm font-semibold"
            style={{
              color: "#065F46",
              fontFamily: "var(--font-caption)",
            }}
          >
            ¡Tu tienda está lista! Comparte tu catálogo con tus clientes.
          </p>
          <button
            onClick={() => setDismissed(true)}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-black/5 transition-colors"
            aria-label="Cerrar"
          >
            <Icon name="X" size={14} color="#065F46" />
          </button>
        </div>
      )}
      {/* Progress Steps Card — anillo/barra siempre; stepper detallado solo en onboarding */}
      <div className="dashboard-premium-card rounded-2xl border-0 p-5 md:p-6 mb-4">
          <div className="mb-5">
            <h2
              className="text-base font-bold tracking-tight"
              style={{
                fontFamily: "var(--font-heading)",
                color: "var(--color-foreground)",
                letterSpacing: "-0.015em",
              }}
            >
              Primeros pasos
            </h2>
            <p
              className="text-xs mt-0.5"
              style={{
                color: "var(--color-muted-foreground)",
                fontFamily: "var(--font-caption)",
              }}
            >
              Completa estos pasos para empezar a vender
            </p>
          </div>

          <div className="mb-6">
            {/* Móvil: anillo SVG protagonista */}
            <div className="md:hidden flex flex-col items-center">
              <ProgressCircle percentage={(completedCount / 3) * 100} />
              <p
                className="text-xs font-medium mt-3 text-center max-w-[240px]"
                style={{
                  color: "var(--color-muted-foreground)",
                  fontFamily: "var(--font-caption)",
                }}
              >
                {completedCount} de 3 pasos completados
              </p>
            </div>

            {/* Escritorio: barra plana */}
            <div className="hidden md:block">
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-xs font-medium"
                  style={{
                    color: "var(--color-muted-foreground)",
                    fontFamily: "var(--font-caption)",
                  }}
                >
                  {completedCount} de 3 pasos completados
                </span>
                <span
                  className="text-xs font-bold tabular-nums"
                  style={{
                    color: "var(--color-primary)",
                    fontFamily: "var(--font-stat)",
                  }}
                >
                  {Math.round((completedCount / 3) * 100)}%
                </span>
              </div>
              <div
                className="w-full h-2 rounded-full overflow-hidden"
                style={{ backgroundColor: "rgba(124,58,237,0.1)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${(completedCount / 3) * 100}%`,
                    background: "linear-gradient(90deg, #9333EA 0%, #7C3AED 40%, #6366F1 100%)",
                    boxShadow: "0 0 12px rgba(124,58,237,0.35)",
                  }}
                />
              </div>
            </div>
          </div>

          {showOnboardingStepper && (
          <>
          {/* Mobile: stepper vertical */}
          <div className="md:hidden relative pl-0">
            <div
              className="absolute left-[21px] top-5 bottom-5 w-2 rounded-full z-0"
              style={{
                background: "linear-gradient(180deg, #9333EA 0%, #7C3AED 45%, #4F46E5 100%)",
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.35)",
              }}
              aria-hidden
            />
            <ul className="relative z-[1] space-y-4 list-none p-0 m-0">
              {STEPS?.map((step, idx) => {
                const isCompleted = stepCompleted?.[idx];
                const isActive = !isCompleted && (idx === 0 || stepCompleted?.[idx - 1]);
                return (
                  <li key={step?.number} className="flex gap-4">
                    <div className="flex-shrink-0 w-11 flex justify-center pt-0.5">
                      <div
                        className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 shadow-md text-white font-black text-sm tabular-nums ${
                          isCompleted ? "bg-emerald-500" : "bg-gradient-to-br from-purple-600 to-indigo-500"
                        }`}
                        style={{ fontFamily: "var(--font-stat)" }}
                      >
                        {isCompleted ? <Icon name="Check" size={18} color="#FFFFFF" /> : step?.number}
                      </div>
                    </div>
                    <div className="dashboard-premium-card flex-1 min-w-0 rounded-2xl border-0 p-4">
                      <div className="flex items-start gap-2 mb-2">
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{
                            backgroundColor: isCompleted || isActive ? "rgba(124,58,237,0.12)" : "rgba(0,0,0,0.04)",
                          }}
                        >
                          <Icon
                            name={step?.icon}
                            size={15}
                            color={isCompleted || isActive ? "var(--color-primary)" : "var(--color-muted-foreground)"}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className="text-sm font-semibold leading-snug"
                            style={{
                              color: isCompleted || isActive ? "var(--color-foreground)" : "var(--color-muted-foreground)",
                              fontFamily: "var(--font-caption)",
                            }}
                          >
                            {step?.title}
                          </p>
                          <p className="text-xs mt-1" style={{ color: "var(--color-muted-foreground)", fontFamily: "var(--font-caption)" }}>
                            {step?.description}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleStepCta(step)}
                        disabled={!isActive && !isCompleted}
                        className="w-full sm:w-auto text-xs font-semibold px-4 py-2.5 rounded-xl transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{
                          backgroundColor: isCompleted ? "rgba(124,58,237,0.08)" : isActive ? "var(--color-primary)" : "rgba(0,0,0,0.06)",
                          color: isCompleted ? "var(--color-primary)" : isActive ? "#FFFFFF" : "var(--color-muted-foreground)",
                          fontFamily: "var(--font-caption)",
                        }}
                      >
                        {isCompleted ? "✓ Completado" : step?.cta}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Desktop: stepper horizontal */}
          <div className="hidden md:flex flex-row items-start gap-0">
            {STEPS?.map((step, idx) => {
              const isCompleted = stepCompleted?.[idx];
              const isActive = !isCompleted && (idx === 0 || stepCompleted?.[idx - 1]);
              return (
                <React.Fragment key={step?.number}>
                  <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 shadow-md text-white font-black text-base tabular-nums ${
                        isCompleted ? "bg-emerald-500" : "bg-gradient-to-br from-purple-600 to-indigo-500"
                      }`}
                      style={{ fontFamily: "var(--font-stat)" }}
                    >
                      {isCompleted ? <Icon name="Check" size={20} color="#FFFFFF" /> : step?.number}
                    </div>
                    <div className="dashboard-premium-card w-full rounded-2xl border-0 p-4 text-center">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center mx-auto mb-2" style={{ backgroundColor: "rgba(124,58,237,0.1)" }}>
                        <Icon name={step?.icon} size={14} color="var(--color-primary)" />
                      </div>
                      <p className="text-sm font-semibold leading-tight" style={{ color: "var(--color-foreground)", fontFamily: "var(--font-caption)" }}>
                        {step?.title}
                      </p>
                      <p className="text-xs mt-1 mb-3" style={{ color: "var(--color-muted-foreground)", fontFamily: "var(--font-caption)" }}>
                        {step?.description}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleStepCta(step)}
                        disabled={!isActive && !isCompleted}
                        className="text-xs font-semibold px-3 py-2 rounded-xl transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed w-full"
                        style={{
                          backgroundColor: isCompleted ? "rgba(124,58,237,0.08)" : isActive ? "var(--color-primary)" : "rgba(0,0,0,0.06)",
                          color: isCompleted ? "var(--color-primary)" : isActive ? "#FFFFFF" : "var(--color-muted-foreground)",
                          fontFamily: "var(--font-caption)",
                        }}
                      >
                        {isCompleted ? "✓ Completado" : step?.cta}
                      </button>
                    </div>
                  </div>
                  {idx < STEPS?.length - 1 && (
                    <div className="flex items-center justify-center w-6 flex-shrink-0 self-center pt-7">
                      <div
                        className="h-1 w-full rounded-full"
                        style={{
                          background: stepCompleted?.[idx]
                            ? "linear-gradient(90deg, #9333EA, #6366F1)"
                            : "rgba(148,163,184,0.35)",
                        }}
                      />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
          </>
          )}
        </div>
      {/* Action Cards Grid */}
      <div className="dashboard-premium-card rounded-2xl border-0 p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-base font-bold"
            style={{
              fontFamily: "var(--font-heading)",
              color: "var(--color-foreground)",
              letterSpacing: "-0.015em",
            }}
          >
            Acciones rápidas
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {ACTION_CARDS?.map((card, i) => (
            <button
              key={i}
              onClick={() => handleCardAction(card)}
              className="dashboard-premium-card flex flex-row sm:flex-col items-center gap-3 sm:gap-2.5 p-4 rounded-2xl border-0 text-center group cursor-pointer min-w-0"
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-105 flex-shrink-0"
                style={{ backgroundColor: card?.accentBg }}
              >
                <Icon name={card?.icon} size={20} color={card?.accent} />
              </div>
              <div className="min-w-0 w-full">
                <p
                  className="text-sm font-semibold leading-tight truncate"
                  style={{
                    color: "var(--color-foreground)",
                    fontFamily: "var(--font-caption)",
                  }}
                  title={card?.title}
                >
                  {card?.title}
                </p>
                <p
                  className="text-xs mt-0.5 hidden sm:block truncate"
                  style={{
                    color: "var(--color-muted-foreground)",
                    fontFamily: "var(--font-caption)",
                  }}
                  title={card?.description}
                >
                  {card?.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
      {/* Copy toast */}
      {copyToast && (
        <div
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg"
          style={{
            backgroundColor: "var(--color-foreground)",
            color: "#FFFFFF",
            fontFamily: "var(--font-caption)",
            fontSize: "0.875rem",
          }}
          role="status"
          aria-live="polite"
        >
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
          >
            <Icon name="Check" size={12} color="#FFFFFF" />
          </div>
          ¡Link copiado!
        </div>
      )}
      {/* Print styles for QR modal */}
      <style>{`
        @media print {
          body.print-qr-mode * { visibility: hidden; }
          body.print-qr-mode .printable-qr-content,
          body.print-qr-mode .printable-qr-content * { visibility: visible; }
          body.print-qr-mode .printable-qr-content {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 24px !important;
            background: #fff !important;
            box-shadow: none !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 16px !important;
          }
          body.print-qr-mode .printable-qr-content .print-hide { display: none !important; }
        }
      `}</style>
      {/* QR Modal */}
      {qrModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={() => setQrModalOpen(false)}
        >
          <div
            ref={qrPrintRef}
            className="printable-qr-content rounded-2xl p-6 max-w-xs w-full flex flex-col items-center gap-4"
            style={{
              backgroundColor: "#FFFFFF",
              boxShadow: "var(--shadow-lg, 0 20px 60px rgba(0,0,0,0.15))",
            }}
            onClick={(e) => e?.stopPropagation()}
          >
            <div className="flex items-center justify-between w-full">
              <h3
                className="text-base font-bold"
                style={{
                  fontFamily: "var(--font-heading)",
                  color: "var(--color-foreground)",
                }}
              >
                Código QR
              </h3>
              <button
                onClick={() => setQrModalOpen(false)}
                className="print-hide w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Icon name="X" size={16} color="var(--color-muted-foreground)" />
              </button>
            </div>
            {catalogUrl ? (
              <>
                <div className="p-3 rounded-xl border" style={{ borderColor: "var(--color-border)" }}>
                  <QRCodeSVG value={catalogUrl} size={200} level="H" />
                </div>
                <p
                  className="text-xs text-center"
                  style={{
                    color: "var(--color-muted-foreground)",
                    fontFamily: "var(--font-caption)",
                  }}
                >
                  Escanea este código para abrir tu catálogo
                </p>
                <p
                  className="text-xs text-center break-all"
                  style={{
                    color: "var(--color-foreground)",
                    fontFamily: "var(--font-caption)",
                  }}
                >
                  {catalogUrl}
                </p>
                <div className="flex flex-col gap-2 w-full print-hide">
                  <button
                    onClick={handlePrintQR}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 hover:opacity-90 border"
                    style={{
                      borderColor: "var(--color-primary)",
                      color: "var(--color-primary)",
                      fontFamily: "var(--font-caption)",
                      backgroundColor: "transparent",
                    }}
                  >
                    Imprimir
                  </button>
                  <button
                    onClick={() => {
                      handleCopyLink();
                      setQrModalOpen(false);
                    }}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 hover:opacity-90"
                    style={{
                      backgroundColor: "var(--color-primary)",
                      color: "#FFFFFF",
                      fontFamily: "var(--font-caption)",
                    }}
                  >
                    Copiar link del catálogo
                  </button>
                </div>
              </>
            ) : (
              <p
                className="text-sm text-center"
                style={{
                  color: "var(--color-muted-foreground)",
                  fontFamily: "var(--font-caption)",
                }}
              >
                Configura tu tienda para generar el QR.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
