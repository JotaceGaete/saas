import React from 'react';
import Routes from './Routes';
import { ToastProvider } from './components/ui/Toast';
import { AuthProvider } from './contexts/AuthContext';
import { CountryProvider } from './contexts/CountryContext';
import EmailConfirmBanner from './components/EmailConfirmBanner';
import SupportModeBanner from './components/SupportModeBanner';
import { bootstrapManualMarketChoiceFromUrl } from './config/countryConfig';
import { captureKoronelHandoff } from './utils/koronelHandoff';

// Persistir elección manual (cl/ar/go) antes de que corran efectos de auth/routing.
bootstrapManualMarketChoiceFromUrl();

// Fase 2 Koronel↔Walinka: capturar source=koronel&koronel_business_id=... antes de
// cualquier redirect (login, OAuth) para poder retomarlo después de autenticarse.
captureKoronelHandoff();

function App() {
  return (
    <div className="app-shell min-w-0" style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden', minHeight: '100vh' }}>
      <AuthProvider>
        <CountryProvider>
          <SupportModeBanner />
          <EmailConfirmBanner />
          <ToastProvider>
            <Routes />
          </ToastProvider>
        </CountryProvider>
      </AuthProvider>
    </div>
  );
}

export default App;
