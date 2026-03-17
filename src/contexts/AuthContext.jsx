import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createBusinessForUser, getMyBusiness, updateBusiness } from '../services/waBusinessService';

const AuthContext = createContext({})

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [business, setBusiness] = useState(null)
  const [impersonatedBusiness, setImpersonatedBusiness] = useState(null)
  const [loading, setLoading] = useState(true)
  const [businessLoading, setBusinessLoading] = useState(false)

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

  const authStateHandlers = {
    onChange: (event, session) => {
      if (typeof window !== 'undefined' && window.__AUTH_DEBUG__) {
        console.log('[Auth] onAuthStateChange', event, session ? { user: session.user?.id, hasRefreshToken: !!session.refresh_token } : null)
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
      const { data, error } = await supabase?.auth?.signUp({
        email,
        password,
        options: { data: {
          full_name: businessData?.name || email,
          name: businessData?.name || email,
          whatsapp: businessData?.whatsapp || '',
        }}
      })
      if (error) return { data: null, error }

      // Email de bienvenida (fire-and-forget, no bloquea el registro)
      const userEmail = data?.user?.email
      if (userEmail) {
        const userName = data?.user?.user_metadata?.name || data?.user?.user_metadata?.full_name || businessData?.name || ''
        const supabaseUrl = (import.meta.env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')
        const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? ''
        const token = data?.session?.access_token ?? anonKey
        fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
          body: JSON.stringify({
            to: userEmail,
            type: 'welcome',
            data: { name: userName, dashboardUrl: 'https://cl.ventalink.app/dashboard' },
          }),
        }).catch((err) => console.error('[Auth] welcome email failed:', err))
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
    signIn,
    signUp,
    signOut,
    refreshBusiness,
    isAuthenticated: !!user,
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
