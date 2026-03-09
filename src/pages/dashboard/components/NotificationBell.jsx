import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60) return 'hace un momento';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} días`;
}

export default function NotificationBell({ notifications = [], onMarkAllRead }) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  const unreadCount = notifications?.filter(n => !n?.read)?.length ?? 0;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef?.current && !dropdownRef?.current?.contains(e?.target)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(prev => !prev)}
        className="w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-150 hover:bg-muted relative"
        style={{ color: 'var(--color-muted-foreground)' }}
        aria-label="Notificaciones"
      >
        <Icon name="BellRing" size={17} color={unreadCount > 0 ? '#10B981' : 'currentColor'} />
        {unreadCount > 0 && (
          <span
            className="absolute top-1 right-1 flex items-center justify-center rounded-full text-white font-bold"
            style={{
              backgroundColor: '#EF4444',
              fontSize: unreadCount > 1 ? '9px' : '0px',
              width: unreadCount > 1 ? '16px' : '8px',
              height: unreadCount > 1 ? '16px' : '8px',
              minWidth: unreadCount > 1 ? '16px' : '8px',
              lineHeight: 1,
            }}
          >
            {unreadCount > 1 ? unreadCount : ''}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 rounded-xl border shadow-lg overflow-hidden"
          style={{
            backgroundColor: '#FFFFFF',
            borderColor: 'var(--color-border)',
            width: '320px',
            maxHeight: '384px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            zIndex: 200,
          }}
        >
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
              Notificaciones
            </span>
            {unreadCount > 0 && (
              <button
                onClick={() => { onMarkAllRead?.(); }}
                className="text-xs font-medium transition-opacity hover:opacity-70"
                style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
              >
                Marcar todo como leído
              </button>
            )}
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: '320px' }}>
            {notifications?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Icon name="BellOff" size={24} color="var(--color-muted-foreground)" />
                <p className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Sin notificaciones</p>
              </div>
            ) : (
              notifications?.slice(0, 10)?.map((notif) => (
                <button
                  key={notif?.id}
                  onClick={() => { navigate('/orders'); setOpen(false); }}
                  className="w-full flex items-start gap-3 px-4 py-3 border-b last:border-b-0 text-left transition-colors hover:bg-gray-50"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: notif?.read ? 'transparent' : 'rgba(16,185,129,0.04)' }}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: 'rgba(16,185,129,0.1)' }}
                  >
                    <Icon name="ShoppingBag" size={14} color="#10B981" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold leading-snug" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                      Nuevo pedido de {notif?.customerName || 'cliente'}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                      {timeAgo(notif?.createdAt)}
                    </p>
                  </div>
                  {!notif?.read && (
                    <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: '#10B981' }} />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
