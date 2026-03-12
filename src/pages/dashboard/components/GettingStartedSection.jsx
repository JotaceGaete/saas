import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "components/AppIcon";
import { QRCodeSVG } from "qrcode.react";

const STEPS = [
  {
    number: 1,
    title: "Configura tu tienda",
    description: "Agrega tu logo, WhatsApp y descripción",
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
}) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const [copyToast, setCopyToast] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const qrPrintRef = useRef(null);

  const hasWhatsapp = !!(business?.whatsapp);
  const hasProducts = productCount > 0;

  const stepCompleted = [hasWhatsapp, hasProducts, false];
  const completedCount = stepCompleted?.filter(Boolean)?.length;
  const allCompleted = completedCount === 3;

  const showProgressSteps = productCount === 0;

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
        if (business?.slug) navigate(`/catalogo/${business.slug}`);
        else if (catalogUrl) window.location.href = catalogUrl;
        break;
      case "share_whatsapp": {
        if (!catalogUrl) return;
        const msg = `Ver catálogo de ${business?.name || "mi tienda"}: ${catalogUrl}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
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
          className="mb-4 flex items-center gap-3 p-4 rounded-xl border"
          style={{
            backgroundColor: "rgba(5,150,105,0.06)",
            borderColor: "rgba(5,150,105,0.25)",
          }}
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
      {/* Progress Steps Card */}
      {showProgressSteps && (
        <div
          className="rounded-xl border p-5 mb-4"
          style={{
            backgroundColor: "#FFFFFF",
            borderColor: "var(--color-border)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          {/* Header */}
          <div className="mb-4">
            <h2
              className="text-base font-bold"
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

          {/* Overall progress bar */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-1.5">
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
                className="text-xs font-semibold"
                style={{
                  color: "var(--color-primary)",
                  fontFamily: "var(--font-caption)",
                }}
              >
                {Math.round((completedCount / 3) * 100)}%
              </span>
            </div>
            <div
              className="w-full h-1.5 rounded-full overflow-hidden"
              style={{ backgroundColor: "rgba(124,58,237,0.12)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(completedCount / 3) * 100}%`,
                  background:
                    "linear-gradient(90deg, #7C3AED 0%, #6D28D9 100%)",
                }}
              />
            </div>
          </div>

          {/* Steps */}
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-0 sm:items-start">
            {STEPS?.map((step, idx) => {
              const isCompleted = stepCompleted?.[idx];
              const isActive = !isCompleted && (idx === 0 || stepCompleted?.[idx - 1]);
              return (
                <React.Fragment key={step?.number}>
                  <div className="flex sm:flex-col items-start sm:items-center gap-3 sm:gap-2 flex-1 min-w-0">
                    {/* Circle + icon */}
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200"
                      style={{
                        backgroundColor: isCompleted
                          ? "var(--color-primary)"
                          : isActive
                          ? "rgba(124,58,237,0.12)"
                          : "rgba(0,0,0,0.06)",
                        border: isActive
                          ? "2px solid var(--color-primary)"
                          : "2px solid transparent",
                      }}
                    >
                      {isCompleted ? (
                        <Icon name="Check" size={16} color="#FFFFFF" />
                      ) : (
                        <span
                          className="text-sm font-bold"
                          style={{
                            color: isActive
                              ? "var(--color-primary)"
                              : "var(--color-muted-foreground)",
                            fontFamily: "var(--font-heading)",
                          }}
                        >
                          {step?.number}
                        </span>
                      )}
                    </div>

                    {/* Text + CTA */}
                    <div className="flex-1 sm:text-center min-w-0">
                      <div className="flex sm:flex-col sm:items-center gap-2 sm:gap-1 mb-1">
                        <div
                          className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                          style={{
                            backgroundColor: isCompleted
                              ? "rgba(124,58,237,0.1)"
                              : isActive
                              ? "rgba(124,58,237,0.08)"
                              : "rgba(0,0,0,0.04)",
                          }}
                        >
                          <Icon
                            name={step?.icon}
                            size={13}
                            color={
                              isCompleted || isActive
                                ? "var(--color-primary)"
                                : "var(--color-muted-foreground)"
                            }
                          />
                        </div>
                        <p
                          className="text-sm font-semibold leading-tight"
                          style={{
                            color:
                              isCompleted || isActive
                                ? "var(--color-foreground)"
                                : "var(--color-muted-foreground)",
                            fontFamily: "var(--font-caption)",
                          }}
                        >
                          {step?.title}
                        </p>
                      </div>
                      <p
                        className="text-xs mb-2.5 hidden sm:block"
                        style={{
                          color: "var(--color-muted-foreground)",
                          fontFamily: "var(--font-caption)",
                        }}
                      >
                        {step?.description}
                      </p>
                      <button
                        onClick={() => handleStepCta(step)}
                        disabled={!isActive && !isCompleted}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{
                          backgroundColor: isCompleted
                            ? "rgba(124,58,237,0.08)"
                            : isActive
                            ? "var(--color-primary)"
                            : "rgba(0,0,0,0.06)",
                          color: isCompleted
                            ? "var(--color-primary)"
                            : isActive
                            ? "#FFFFFF" :"var(--color-muted-foreground)",
                          fontFamily: "var(--font-caption)",
                        }}
                      >
                        {isCompleted ? "✓ Completado" : step?.cta}
                      </button>
                    </div>
                  </div>
                  {/* Connector line (desktop only) */}
                  {idx < STEPS?.length - 1 && (
                    <div
                      className="hidden sm:flex items-center justify-center w-8 flex-shrink-0 mt-5"
                    >
                      <div
                        className="h-0.5 w-full rounded-full transition-all duration-300"
                        style={{
                          backgroundColor: stepCompleted?.[idx]
                            ? "var(--color-primary)"
                            : "rgba(0,0,0,0.1)",
                        }}
                      />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}
      {/* Action Cards Grid */}
      <div
        className="rounded-xl border p-5"
        style={{
          backgroundColor: "#FFFFFF",
          borderColor: "var(--color-border)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {ACTION_CARDS?.map((card, i) => (
            <button
              key={i}
              onClick={() => handleCardAction(card)}
              className="flex flex-col items-center gap-2.5 p-4 rounded-xl border text-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md group cursor-pointer min-w-0"
              style={{
                backgroundColor: "#FFFFFF",
                borderColor: "var(--color-border)",
              }}
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
