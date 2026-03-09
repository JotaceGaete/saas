import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import Icon from '../AppIcon';

const ToastContext = createContext(null);

const ICONS = {
  success: 'CheckCircle2',
  error: 'XCircle',
  warning: 'AlertTriangle',
  info: 'Info',
};

const STYLES = {
  success: {
    bg: '#10B981',
    border: 'rgba(16,185,129,0.3)',
    icon: '#fff',
  },
  error: {
    bg: '#EF4444',
    border: 'rgba(239,68,68,0.3)',
    icon: '#fff',
  },
  warning: {
    bg: '#F59E0B',
    border: 'rgba(245,158,11,0.3)',
    icon: '#fff',
  },
  info: {
    bg: 'var(--color-foreground)',
    border: 'rgba(15,23,42,0.3)',
    icon: '#fff',
  },
};

function ToastItem({ id, message, type = 'info', onRemove }) {
  const style = STYLES?.[type] || STYLES?.info;
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg toast-enter"
      style={{
        backgroundColor: style?.bg,
        color: '#FFFFFF',
        minWidth: '260px',
        maxWidth: '380px',
        fontFamily: 'var(--font-caption)',
        fontSize: '0.875rem',
        fontWeight: 500,
      }}
      role="status"
      aria-live="polite"
    >
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
      >
        <Icon name={ICONS?.[type]} size={13} color={style?.icon} />
      </div>
      <span className="flex-1 leading-snug">{message}</span>
      <button
        onClick={() => onRemove(id)}
        className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity ml-1"
        aria-label="Cerrar"
      >
        <Icon name="X" size={14} color="#fff" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const remove = useCallback((id) => {
    setToasts(prev => prev?.filter(t => t?.id !== id));
    if (timers?.current?.[id]) {
      clearTimeout(timers?.current?.[id]);
      delete timers?.current?.[id];
    }
  }, []);

  const show = useCallback((message, type = 'info', duration = 3500) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev?.slice(-4), { id, message, type }]);
    timers.current[id] = setTimeout(() => remove(id), duration);
    return id;
  }, [remove]);

  const success = useCallback((msg, dur) => show(msg, 'success', dur), [show]);
  const error = useCallback((msg, dur) => show(msg, 'error', dur), [show]);
  const warning = useCallback((msg, dur) => show(msg, 'warning', dur), [show]);
  const info = useCallback((msg, dur) => show(msg, 'info', dur), [show]);

  return (
    <ToastContext.Provider value={{ show, success, error, warning, info, remove }}>
      {children}
      <div
        className="fixed bottom-6 right-6 flex flex-col gap-2.5 pointer-events-none"
        style={{ zIndex: 'var(--z-toast, 300)' }}
        aria-live="polite"
        aria-label="Notificaciones"
      >
        {toasts?.map(t => (
          <div key={t?.id} className="pointer-events-auto">
            <ToastItem {...t} onRemove={remove} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export default ToastProvider;
