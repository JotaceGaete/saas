import React from 'react';
import Routes from './Routes';
import { ToastProvider } from './components/ui/Toast';
import { AuthProvider } from './contexts/AuthContext';

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes />
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
