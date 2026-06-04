import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createBusinessForUser, getMyBusiness, updateBusiness } from '../services/waBusinessService';
import { getAppBaseUrl, getAuthRedirectUrl, getResetPasswordRedirectUrl } from '../config/appUrl';
import {
  startSession,
  startHeartbeat,
  stopHeartbeat,
  endSession,
  registerActivityListeners,
  registerUnloadHandler,
  getCurrentSessionId,
} from '../services/userSessionService';

const AuthContext = createContext({})
let handlingCorruptSession = false

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}

const SESSION_EXPIRED_MESSAGE = 'Tu sesión expiró. Vuelve a iniciar sesión.'

const CORRUPT_REFRESH_TOKEN_MESSAGES = [
  'Refresh Token Not Found',
  'Invalid Refresh Token',
  'refresh_token_not_found',
  'invalid refresh token',
]

function isCorruptRefreshTokenError(errorLike) {
  const raw = String(errorLike?.message || errorLike || '').toLowerCase()
  return CORRUPT_REFRESH_TOKEN_MESSAGES.some((fragment) => raw.includes(fragment.toLowerCase()))
}

function maskEmailForLog(email) {
  const normalized = String(email || '').trim().toLowerCase()
  const [localPart, domain] = normalized.split('@')
  if (!localPart || !domain) return null
  const visibleLocal = localPart.length <= 2 ? `${localPart[0] || ''}*` : `${localPart.slice(0, 2)}***${localPart.slice(-1)}`
  const [domainName, ...domainRest] = domain.split('.')
  const visibleDomain =
    domainName.length <= 2 ? `${domainName[0] || ''}*` : `${domainName.slice(0, 2)}***${domainName.slice(-1)}`
  return `${visibleLocal}@${visibleDomain}${domainRest.length ? `.${domainRest.join('.')}` : ''}`
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [business, setBusiness] = useState(null)
  const [impersonatedBusiness, setImpersonatedBusiness] = useState(null)
  const [loading, setLoading] = useState(true)
  // sessionReady: true once onAuthStateChange has fired its first event (INITIAL_SESSION
  // or SIGNED_IN). Distinct from `loading` — guards against OAuth redirect races on mobile
  // where the page mounts before Supabase has exchanged the code for a session.
  const [sessionReady, setSessionReady] = useState(false)
  const [businessLoading, setBusinessLoading] = useState(false)
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState(null)
  const trackingSessionIdRef = useRef(null)
  const trackingCleanupRef = useRef(null)

  const businessOperations = {
    async load(userId) {
      if (!userId) return
      setBusinessLoading(true)
      try {
        const { data } = await getMyBusiness()
        if (data) {
          const isPaidOrTrial = data.planSlug === 'pro' || data.planSlug === 'business'
          const now = new Date()

          const paidExpired  = isPaidOrTrial && data.planExpiresAt  && new Date(data.planExpiresAt)  <= now
          const trialExpired = isPaidOrTrial && data.trialExpiresAt && new Date(data.trialExpiresAt) <= now
                               && !data.planExpiresAt  // solo trial, sin pago activo

          if (paidExpired || trialExpired) {
            await updateBusiness(data.id, { planSlug: 'starter', planExpiresAt: null, trialExpiresAt: null })
            const { data: updated } = await getMyBusiness()
            setBusiness(updated || data)
            startSessionTracking((updated || data)?.id).catch(() => {})
            if (typeof sessionStorage !== 'undefined') {
              sessionStorage.setItem(trialExpired ? 'showTrialExpiredBanner' : 'showPlanExpiredBanner', '1')
            }
          } else {
            setBusiness(data)
            startSessionTracking(data?.id).catch(() => {})
          }
        }
      } catch (err) {
        console.error('Business load error:', err)
      } finally {
        setBusinessLoading(false)
      }
    },
    clear() {
      setBusiness(null)
      setBusinessLoading(false)
    }
  }

  const clearSessionExpiredMessage = () => setSessionExpiredMessage(null)

  const startSessionTracking = async (businessId) => {
    // Don't start tracking if admin is impersonating (we track the real user only)
    try {
      stopTrackingSession();
      const id = await startSession(businessId || null);
      if (!id) return;
      trackingSessionIdRef.current = id;
      startHeartbeat(id);
      const removeActivity = registerActivityListeners(id);
      const removeUnload = registerUnloadHandler(id);
      trackingCleanupRef.current = () => {
        stopHeartbeat();
        removeActivity?.();
        removeUnload?.();
      };
    } catch (err) {
      console.warn('[AuthContext] startSessionTracking error:', err?.message);
    }
  };

  const stopTrackingSession = () => {
    if (trackingCleanupRef.current) {
      trackingCleanupRef.current();
      trackingCleanupRef.current = null;
    }
  };

  const handleCorruptSession = async (reason) => {
    if (handlingCorruptSession) return
    handlingCorruptSession = true
    try {
      if (typeof window !== 'undefined' && window.__AUTH_DEBUG__) {
        console.warn('[Auth] clearing corrupt session', { reason: String(reason || 'unknown') })
      }
      await supabase?.auth?.signOut?.({ scope: 'local' })
      setUser(null)
      setImpersonatedBusiness(null)
      businessOperations?.clear()
      setSessionReady(true)
      setSessionExpiredMessage(SESSION_EXPIRED_MESSAGE)

      if (typeof window !== 'undefined' && !window.location.pathname?.startsWith('/login')) {
        const nextPath = `${window.location.pathname || ''}${window.location.search || ''}${window.location.hash || ''}` || '/dashboard'
        window.location.replace(`/login?reason=session-expired&next=${encodeURIComponent(nextPath)}`)
      }
    } catch (err) {
      console.warn('[Auth] failed to clear corrupt session', { message: err?.message || String(err || '') })
    } finally {
      handlingCorruptSession = false
    }
  }

  const authStateHandlers = {
    onChange: async (event, session) => {
      if (typeof window !== 'undefined') {
        const safeTokenPreview = (t) => {
          if (!t || typeof t !== 'string') return null
          if (!t.includes('.')) return '(non-jwt)'
          return `${t.slice(0, 10)}...${t.slice(-8)}`
        }

        console.log('[Auth] state change:', event ?? 'init', session
          ? {
              user: session.user?.id,
              hasAccessToken: !!session?.access_token,
              tokenPreview: safeTokenPreview(session?.access_token),
              hasRefreshToken: !!session?.refresh_token,
            }
          : 'no session')
      }
      if (event === 'TOKEN_REFRESH_FAILED' || isCorruptRefreshTokenError(session)) {
        await handleCorruptSession(event || session)
        return
      }
      if (event === 'SIGNED_OUT') {
        if (typeof window !== 'undefined') {
          console.log('[Auth] session expired')
        }
        stopTrackingSession()
        endSession(trackingSessionIdRef.current || getCurrentSessionId()).catch(() => {})
        trackingSessionIdRef.current = null
        setUser(null)
        setImpersonatedBusiness(null)
        businessOperations?.clear()
        setSessionExpiredMessage(SESSION_EXPIRED_MESSAGE)
        setLoading(false)
        return
      }
      setUser(session?.user ?? null)
      setSessionReady(true)
      setLoading(false)
      if (session?.user) {
        businessOperations?.load(session?.user?.id)
      } else {
        businessOperations?.clear()
      }
    }
  }

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      const { data: { session } } = await supabase?.auth?.getSession() ?? { data: { session: null } }
      if (cancelled) return
      if (typeof window !== 'undefined' && window.__AUTH_DEBUG__) {
        console.log('[Auth] getSession result', session ? { user: session.user?.id, hasRefreshToken: !!session.refresh_token } : 'no session')
      }
      if (session?.user) {
        const { data: { user: freshUser }, error } = await supabase?.auth?.getUser() ?? {}
        if (cancelled) return
        if (error && isCorruptRefreshTokenError(error)) {
          await handleCorruptSession(error?.message ?? error)
          return
        }
        if (freshUser) {
          authStateHandlers?.onChange(null, session)
          return
        }
      }
      authStateHandlers?.onChange(null, session)
    }
    init()
    const { data: { subscription } } = supabase?.auth?.onAuthStateChange(
      authStateHandlers?.onChange
    )
    return () => {
      cancelled = true
      subscription?.unsubscribe()
    }
  }, [])

  const signIn = async (email, password) => {
    try {
      const { data, error } = await supabase?.auth?.signInWithPassword({ email, password })
      if (typeof window !== 'undefined' && window.__AUTH_DEBUG__) {
        console.log('[Auth] signIn result', error ? { error: error?.message } : { session: !!data?.session, hasRefreshToken: !!data?.session?.refresh_token })
      }
      return { data, error }
    } catch (error) {
      return { error: { message: 'Network error. Please try again.' } }
    }
  }

  const signUp = async (email, password, businessData) => {
    try {
      const emailRedirectTo = getAuthRedirectUrl(); // confirmación redirige a auth/callback
      if (typeof window !== 'undefined' && window.__AUTH_DEBUG__) {
        console.log('[Auth] signUp emailRedirectTo:', emailRedirectTo);
      }
      const metadata = {
        full_name: businessData?.name || email,
        name: businessData?.name || email,
      };
      if (typeof window !== 'undefined' && window.__AUTH_DEBUG__) {
        console.log('[Auth] signUp metadata (options.data):', metadata);
      }
      const { data, error } = await supabase?.auth?.signUp({
        email,
        password,
        options: {
          emailRedirectTo,
          data: metadata,
        },
      })
      if (typeof window !== 'undefined' && window.__AUTH_DEBUG__) {
        console.log('[Auth] signUp result:', { hasUser: !!data?.user, hasSession: !!data?.session, error: error?.message });
      }
      if (error) return { data: null, error }

      const userId = data?.user?.id
      const hasSession = !!data?.session

      // If we have an active session, the trigger may not have fired yet
      // (or email confirmation is disabled). Try to ensure business exists.
      if (userId && hasSession && businessData) {
        try {
          // Check if trigger already created the business
          const { data: existingBiz } = await getMyBusiness()
          if (!existingBiz) {
            // Trigger didn't create it yet — create manually
            const { data: biz, error: bizErr } = await createBusinessForUser(userId, {
              name: businessData?.name || 'Mi Negocio',
              whatsapp: businessData?.whatsapp || '',
              description: businessData?.description || '',
            })
            if (bizErr) {
              console.error('Business creation error:', bizErr)
              // Don't block registration — business can be created later
            } else if (biz) {
              setBusiness(biz)
            }
          } else {
            setBusiness(existingBiz)
          }
        } catch (bizErr) {
          console.error('Business creation exception:', bizErr)
          // Don't block registration
        }
      }

      // Notify welcome webhook on successful registration
      const WELCOME_WEBHOOK_URL = import.meta.env.VITE_WELCOME_WEBHOOK_URL;
      if (data?.user?.email && WELCOME_WEBHOOK_URL) {
        console.info('[welcome-webhook] dispatch', {
          source: 'src/contexts/AuthContext.jsx',
          eventName: 'welcome_webhook',
          originalEmail: maskEmailForLog(data.user.email),
          finalEmail: maskEmailForLog(data.user.email),
          testMode: false,
          runtime: {
            mode: import.meta.env?.MODE || null,
            dev: Boolean(import.meta.env?.DEV),
            prod: Boolean(import.meta.env?.PROD),
            targetHost: (() => {
              try {
                return new URL(WELCOME_WEBHOOK_URL).host
              } catch {
                return null
              }
            })(),
          },
          timestamp: new Date().toISOString(),
        })
        fetch(WELCOME_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: data.user.email,
            name: data.user.user_metadata?.name || "amigo",
          }),
        }).catch(() => {}); // fire-and-forget, no bloquea el flujo
      }

      // If no session (email confirmation pending), registration still succeeded
      return { data, error: null }
    } catch (error) {
      return { error: { message: error?.message || 'Network error. Please try again.' } }
    }
  }

  const resendConfirmationEmail = async (email) => {
    try {
      const emailRedirectTo = getAuthRedirectUrl();
      if (typeof window !== 'undefined' && window.__AUTH_DEBUG__) {
        console.log('[Auth] resendConfirmationEmail:', { email, emailRedirectTo });
      }
      const { error } = await supabase?.auth?.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo },
      });
      if (typeof window !== 'undefined' && window.__AUTH_DEBUG__) {
        console.log('[Auth] resendConfirmationEmail result:', error ? { error: error.message } : 'ok');
      }
      return { error };
    } catch (err) {
      return { error: { message: err?.message || 'Error al reenviar el correo' } };
    }
  };

  const resetPasswordForEmail = async (email) => {
    try {
      const redirectTo = getResetPasswordRedirectUrl();
      if (typeof window !== 'undefined' && window.__AUTH_DEBUG__) {
        console.log('[Auth] resetPasswordForEmail:', { email, redirectTo });
      }
      const { data, error } = await supabase?.auth?.resetPasswordForEmail(email, { redirectTo });
      if (typeof window !== 'undefined' && window.__AUTH_DEBUG__) {
        console.log('[Auth] resetPasswordForEmail result:', { error: error?.message, data });
      }
      return { data, error };
    } catch (err) {
      return { error: { message: err?.message || 'Error al enviar el correo de recuperación' } };
    }
  };

  const signInWithGoogle = async () => {
    try {
      const redirectTo = getAuthRedirectUrl();
      const { data, error } = await supabase?.auth?.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      })
      if (error) return { error }
      if (data?.url) {
        window.location.href = data.url
        return { data: { url: data.url }, error: null }
      }
      return { data, error: error || { message: 'No se pudo iniciar sesión con Google' } }
    } catch (error) {
      return { error: { message: error?.message || 'Error al conectar con Google' } }
    }
  }

  const signOut = async () => {
    try {
      // End session tracking before signing out
      stopTrackingSession()
      await endSession(trackingSessionIdRef.current || getCurrentSessionId()).catch(() => {})
      trackingSessionIdRef.current = null

      const { error } = await supabase?.auth?.signOut()
      if (typeof window !== 'undefined' && window.__AUTH_DEBUG__) {
        console.log('[Auth] signOut done', error ? { error: error?.message } : 'ok')
      }
      if (!error) {
        setUser(null)
        setImpersonatedBusiness(null)
        businessOperations?.clear()
      }
      return { error }
    } catch (error) {
      return { error: { message: 'Network error. Please try again.' } }
    }
  }

  const refreshBusiness = async () => {
    if (user) await businessOperations?.load(user?.id)
  }

  /** Actualiza el negocio en memoria sin disparar businessLoading ni hacer fetch. */
  const patchBusiness = (data) => {
    if (data) setBusiness(data)
  }

  /** Refresca el usuario desde Supabase (útil tras confirmar email en otro tab o enlace). */
  const refreshUser = async () => {
    try {
      const { data: { user: u }, error } = await supabase?.auth?.getUser() ?? {}
      if (error) return { error, user: null }
      setUser(u ?? null)
      if (u?.id) {
        await businessOperations?.load(u.id)
      } else {
        businessOperations?.clear()
      }
      return { error: null, user: u ?? null }
    } catch (e) {
      return { error: { message: e?.message || 'Error al actualizar sesión' }, user: null }
    }
  }

  const isAdmin = !!(
    user?.app_metadata?.role === 'admin' ||
    user?.user_metadata?.role === 'admin'
  )

  // Legacy: auto-redirect por mercado/subdominio (cl/ar/go). Ya no aplica: todo vive en go.ventalink.app.
  // Mantener solo carga de sesión y negocio, sin navegación cross-domain.

  const impersonateBusiness = async (businessObj) => {
    if (!isAdmin || !businessObj) return
    setImpersonatedBusiness(businessObj)
  }

  const stopImpersonation = () => {
    setImpersonatedBusiness(null)
  }

  const value = {
    user,
    business: impersonatedBusiness || business,
    realBusiness: business,
    isImpersonating: !!impersonatedBusiness,
    loading,
    sessionReady,
    businessLoading,
    sessionExpiredMessage,
    clearSessionExpiredMessage,
    signIn,
    signUp,
    signInWithGoogle,
    resetPasswordForEmail,
    resendConfirmationEmail,
    signOut,
    refreshBusiness,
    patchBusiness,
    refreshUser,
    isAuthenticated: !!user,
    isEmailConfirmed: !!(user?.email_confirmed_at),
    isAdmin,
    impersonateBusiness,
    stopImpersonation
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
