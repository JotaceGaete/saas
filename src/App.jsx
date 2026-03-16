import React from 'react';
import Routes from './Routes';
import { ToastProvider } from './components/ui/Toast';
import { AuthProvider } from './contexts/AuthContext';

function App() {
  return (
    <div className="app-shell min-w-0" style={{ width: '100%', maxWidth: '100vw', overflowX: 'hidden', minHeight: '100vh' }}>
      <AuthProvider>
        <ToastProvider>
          <Routes />
        </ToastProvider>
      </AuthProvider>
    </div>
  );
}

export default App;
