import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Icon from './AppIcon';

/**
 * Pantalla mostrada por RequireAuth/RequireCrm/business-registration cuando
 * VITE_RESTRICTED_ACCESS='true' y el visitante no es admin. Medida temporal
 * -- ver src/config/restrictedAccess.js.
 */
export default function RestrictedAccessScreen() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: 'var(--color-background, #f6f7fb)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border-2 p-8 flex flex-col items-center text-center gap-5"
        style={{ backgroundColor: '#fff', borderColor: 'rgba(124,58,237,0.18)' }}
      >
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: 'rgba(124,58,237,0.08)' }}
        >
          <Icon name="Lock" size={28} color="#7C3AED" />
        </div>

        <div>
          <p className="text-base font-bold text-gray-900 mb-1">Acceso temporalmente restringido</p>
          <p className="text-sm text-gray-500">
            Walinka se encuentra actualmente en una etapa de mantenimiento y mejora. El acceso está
            temporalmente limitado a cuentas autorizadas.
          </p>
        </div>

        {user ? (
          <button
            type="button"
            onClick={handleLogout}
            className="w-full py-3 rounded-xl text-white text-sm font-bold text-center transition-colors"
            style={{ backgroundColor: '#7C3AED' }}
          >
            Cerrar sesión
          </button>
        ) : (
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="w-full py-3 rounded-xl text-white text-sm font-bold text-center transition-colors"
            style={{ backgroundColor: '#7C3AED' }}
          >
            Iniciar sesión
          </button>
        )}
      </div>
    </div>
  );
}
