import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createBusinessForUser, getMyBusiness, updateBusiness } from '../services/waBusinessService';
import { getAppBaseUrl, getAuthRedirectUrl, getResetPasswordRedirectUrl } from '../config/appUrl';

const AuthContext = createContext({})

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}

const SESSION_EXPIRED_MESSAGE = 'Tu sesión expiró. Vuelve a iniciar sesión.'

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [business, setBusiness] = useState(null)
  const [impersonatedBusiness, setImpersonatedBusiness] = useState(null)
  const [loading, setLoading] = useState(true)
  const [businessLoading, setBusinessLoading] = useState(false)
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState(null)

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
            if (typeof sessionStorage !== 'undefined') {
              sessionStorage.setItem(trialExpired ? 'showTrialExpiredBanner' : 'showPlanExpiredBanner', '1')
            }
          } else {
            setBusiness(data)
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

  const authStateHandlers = {
    onChange: (event, session) => {
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
      if (event === 'SIGNED_OUT') {
        if (typeof window !== 'undefined') {
          console.log('[Auth] session expired')
        }
        setUser(null)
        setImpersonatedBusiness(null)
        businessOperations?.clear()
        setSessionExpiredMessage(SESSION_EXPIRED_MESSAGE)
        setLoading(false)
        return
      }
      setUser(session?.user ?? null)
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
        if (error) {
          const msg = error?.message ?? ''
          if (msg.includes('Refresh Token') || msg.includes('refresh_token') || msg.includes('JWT')) {
            if (typeof window !== 'undefined' && window.__AUTH_DEBUG__) {
              console.warn('[Auth] invalid/expired session, clearing', msg)
            }
            await supabase?.auth?.signOut({ scope: 'local' })
            authStateHandlers?.onChange('SIGNED_OUT', null)
            return
          }
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
      const { data, error } = await supabase?.auth?.signUp({
        email,
        password,
        options: {
          emailRedirectTo,
          data: {
            full_name: businessData?.name || email,
            name: businessData?.name || email,
            whatsapp: businessData?.whatsapp || '',
            country: businessData?.country ?? null,
            country_code: businessData?.countryCode ?? null,
          },
        },
      })
      if (typeof window !== 'undefined' && window.__AUTH_DEBUG__) {
        console.log('[Auth] signUp result:', { hasUser: !!data?.user, hasSession: !!data?.session, error: error?.message });
      }
      if (error) return { data: null, error }

      // Email de bienvenida (fallback client-side; trigger en BD también puede enviarlo).
      const user = data?.user
      const userEmail = user?.email
      if (!user || !userEmail || typeof userEmail !== 'string' || !userEmail.trim()) {
        if (typeof window !== 'undefined') {
          console.log('[Auth] send-email skip: no user or user.email', { hasUser: !!user, email: user?.email })
        }
      } else {
        const supabaseUrl = (import.meta.env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')
        const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? ''
        const sessionToken = data?.session?.access_token ?? anonKey
        const userName = user?.user_metadata?.name || user?.user_metadata?.full_name || businessData?.name || ''
        const nameDisplay = (userName || '').trim() || 'Usuario'
        const appBaseUrl = getAppBaseUrl() || 'https://go.ventalink.app'
        const dashboardUrl = `${appBaseUrl.replace(/\/$/, '')}/dashboard`
        const payload = {
          to: userEmail.trim(),
          type: 'welcome',
          name: nameDisplay,
          subject: 'Bienvenido a VentAlink 🚀 Empieza a vender en minutos',
          html: `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Bienvenido a VentAlink</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f3ff;font-family:Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      Tu catálogo online listo para vender por WhatsApp
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f3ff;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background:#6d28d9;padding:24px 24px 20px;color:#ffffff;">
                <p style="margin:0;font-size:13px;opacity:.9;">VentAlink</p>
                <h1 style="margin:8px 0 0;font-size:26px;line-height:1.2;">Bienvenido a VentAlink</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;color:#1f2937;">
                <p style="margin:0 0 12px;font-size:16px;">Hola ${nameDisplay},</p>
                <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
                  Ya estás listo para empezar a vender de forma simple y organizada.
                </p>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
                  Con VentAlink puedes crear tu catálogo online y recibir pedidos directamente por WhatsApp, sin complicaciones.
                </p>
                <ul style="margin:0 0 18px 18px;padding:0;font-size:14px;line-height:1.7;color:#374151;">
                  <li>Organiza tus pedidos automáticamente</li>
                  <li>Comparte un solo link en todas tus redes</li>
                  <li>Recibe pedidos claros, sin mensajes confusos</li>
                  <li>Mejora la presentación de tus productos</li>
                </ul>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 18px;">
                  <tr>
                    <td style="border-radius:10px;background:#7c3aed;">
                      <a href="${dashboardUrl}" style="display:inline-block;padding:12px 18px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">
                        Crear mi catálogo
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#111827;">Empieza en menos de 2 minutos:</p>
                <p style="margin:0 0 4px;font-size:14px;color:#374151;">1. Agrega tu primer producto</p>
                <p style="margin:0 0 4px;font-size:14px;color:#374151;">2. Comparte tu enlace</p>
                <p style="margin:0 0 14px;font-size:14px;color:#374151;">3. Recibe tu primer pedido</p>
                <p style="margin:0 0 14px;font-size:14px;color:#6d28d9;font-weight:700;">
                  Muchos negocios comienzan a recibir pedidos el mismo día.
                </p>
                <p style="margin:0 0 6px;font-size:14px;color:#374151;">Estamos aquí para ayudarte a crecer.</p>
                <p style="margin:0;font-size:14px;color:#111827;font-weight:700;">Equipo VentAlink</p>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 24px 20px;border-top:1px solid #ede9fe;">
                <p style="margin:0;font-size:12px;color:#6b7280;">Si tienes dudas, puedes responder este correo.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
          text: `Bienvenido a VentAlink, ${nameDisplay}. Empieza a vender en minutos: crea tu catálogo en ${dashboardUrl}.`,
          data: {
            user_name: nameDisplay,
            dashboard_url: dashboardUrl,
            name: nameDisplay,
            dashboardUrl,
          },
        }
        console.log('[Auth] send-email payload (final, before fetch):', payload)
        const headers = {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${sessionToken}`,
        }
        fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        })
          .then(async (res) => {
            const responseJson = await res.json().catch(() => ({}))
            if (typeof window !== 'undefined') {
              console.log('[Auth] send-email response:', { status: res.status, statusText: res.statusText, body: responseJson })
            }
            if (!res.ok) {
              console.error('[Auth] send-email failed:', res.status, responseJson)
            }
          })
          .catch((err) => console.error('[Auth] send-email fetch error:', err?.message ?? err))
      }

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
              currency: businessData?.currency || 'CLP',
              country: businessData?.country || null,
              countryCode: businessData?.countryCode || null,
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

  const isAdmin = !!(
    user?.app_metadata?.role === 'admin' ||
    user?.user_metadata?.role === 'admin'
  )

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
