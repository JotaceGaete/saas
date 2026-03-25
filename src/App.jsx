import React from 'react';
import Routes from './Routes';
import { ToastProvider } from './components/ui/Toast';
import { AuthProvider } from './contexts/AuthContext';
import { CountryProvider } from './contexts/CountryContext';
import EmailConfirmBanner from './components/EmailConfirmBanner';
import { bootstrapManualMarketChoiceFromUrl } from './config/countryConfig';

// Persistir elección manual (cl/ar/go) antes de que corran efectos de auth/routing.
bootstrapManualMarketChoiceFromUrl();

function App() {
  return (
    <div className="app-shell min-w-0" style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden', minHeight: '100vh' }}>
      <AuthProvider>
        <CountryProvider>
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
