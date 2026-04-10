import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Icon from './AppIcon';

const SS_IMPERSONATED  = 'ventalink_impersonated';
const SS_ADMIN_EMAIL   = 'ventalink_support_admin_email';
const SS_TARGET_EMAIL  = 'ventalink_support_target_email';
const SS_INITIATED_AT  = 'ventalink_support_initiated_at';

function clearSupportSession() {
  sessionStorage.removeItem(SS_IMPERSONATED);
  sessionStorage.removeItem(SS_ADMIN_EMAIL);
  sessionStorage.removeItem(SS_TARGET_EMAIL);
  sessionStorage.removeItem(SS_INITIATED_AT);
}

function stripSupportParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete('impersonated');
  url.searchParams.delete('ae');
  window.history.replaceState(null, '', url.toString());
}

export default function SupportModeBanner() {
  const [visible, setVisible] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [targetEmail, setTargetEmail] = useState('');
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isImpersonated = params.get('impersonated') === '1';

    if (isImpersonated) {
      sessionStorage.setItem(SS_IMPERSONATED, '1');
      if (!sessionStorage.getItem(SS_INITIATED_AT)) {
        sessionStorage.setItem(SS_INITIATED_AT, new Date().toISOString());
      }
      const ae = params.get('ae');
      if (ae && !sessionStorage.getItem(SS_ADMIN_EMAIL)) {
        sessionStorage.setItem(SS_ADMIN_EMAIL, ae);
      }
      stripSupportParams();
    }

    if (sessionStorage.getItem(SS_IMPERSONATED) !== '1') return;

    setVisible(true);
    setAdminEmail(sessionStorage.getItem(SS_ADMIN_EMAIL) ?? '');

    const cached = sessionStorage.getItem(SS_TARGET_EMAIL);
    if (cached) {
      setTargetEmail(cached);
    } else {
      supabase.auth.getUser().then(({ data }) => {
        const email = data?.user?.email ?? '';
        if (email) {
          sessionStorage.setItem(SS_TARGET_EMAIL, email);
          setTargetEmail(email);
        }
      });
    }
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && visible) {
        clearSupportSession();
        setVisible(false);
      }
    });
    return () => subscription.unsubscribe();
  }, [visible]);

  const handleExit = async () => {
    setExiting(true);
    clearSupportSession();
    await supabase.auth.signOut();
    window.location.assign('/login');
  };

  if (!visible) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-between gap-3 px-4 py-2 text-white text-xs font-medium"
      style={{
        background: 'linear-gradient(90deg, #7C3AED 0%, #6D28D9 100%)',
        boxShadow: '0 2px 8px rgba(109,40,217,0.35)',
        fontFamily: 'var(--font-caption)',
        minHeight: '40px',
      }}
    >
      <span className="flex items-center gap-2 min-w-0">
        <Icon name="ShieldAlert" size={14} color="#ffffff" aria-hidden />
        <span className="min-w-0">
          <span className="font-bold mr-1">Modo soporte</span>
          {adminEmail && (
            <span className="opacity-80 mr-1">· Admin: <strong className="font-bold opacity-100">{adminEmail}</strong></span>
          )}
          <span className="opacity-80">
            · Viendo la cuenta de:{' '}
            <strong className="font-bold opacity-100">{targetEmail || '…'}</strong>
          </span>
        </span>
      </span>
      <button
        type="button"
        onClick={handleExit}
        disabled={exiting}
        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
        style={{ backgroundColor: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)' }}
      >
        <Icon name="LogOut" size={12} color="#ffffff" aria-hidden />
        {exiting ? 'Saliendo…' : 'Salir de modo soporte'}
      </button>
    </div>
  );
}
