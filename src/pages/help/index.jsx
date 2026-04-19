import React from 'react';
import { useNavigate } from 'react-router-dom';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import PanelHeader from 'components/ui/PanelHeader';
import { useIsDesktop } from 'hooks/useMediaQuery';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';

import { SUPPORT_WHATSAPP_NUMBER } from '../../config/support';

const HELP_WHATSAPP_MESSAGE = 'Hola, estoy en la sección Centro de ayuda y necesito soporte';
const HELP_WHATSAPP_HREF = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(HELP_WHATSAPP_MESSAGE)}`;

export default function HelpPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const isDesktop = useIsDesktop();
  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';

  React.useEffect(() => {
    if (!loading && !user) navigate('/login', { replace: true });
  }, [loading, user, navigate]);

  if (!user) return null;

  return (
    <div className="panel-root min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <BusinessSidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <main
        className="panel-main min-h-screen w-full max-w-full min-w-0 overflow-x-hidden transition-all"
        style={{ marginLeft: isDesktop ? sidebarWidth : 0 }}
      >
        <PanelHeader
          title={<h1 className="text-lg font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>Ayuda</h1>}
        />
        <div className="max-w-2xl mx-auto px-4 py-8 pb-24">
          <div
            className="rounded-2xl border p-6"
            style={{ backgroundColor: '#ffffff', borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: 'rgba(124,58,237,0.1)' }}
              >
                <Icon name="HelpCircle" size={24} color="var(--color-primary)" />
              </div>
              <div>
                <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
                  Centro de ayuda
                </h2>
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
                  Recursos y soporte para tu catálogo
                </p>
              </div>
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
              ¿Necesitas ayuda para configurar tu tienda, productos o pedidos? Revisa las secciones del menú: <strong>Configuración</strong> para datos del negocio y opciones del catálogo, <strong>Diseño</strong> para logo, portada y colores, y <strong>Plan y facturación</strong> para tu suscripción.
            </p>
            <p className="text-sm mb-0" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
              Soporte directo con el equipo Walinka:
            </p>
            <div className="mt-4 flex flex-col sm:flex-row gap-3">
              <a
                href={HELP_WHATSAPP_HREF}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-lg bg-green-500 text-white font-medium hover:bg-green-600 transition text-center"
              >
                💬 Contactar por WhatsApp
              </a>

              <a
                href="mailto:contacto@ventalink.app"
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-800 font-medium hover:bg-gray-200 transition text-center"
              >
                📧 Enviar correo
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
