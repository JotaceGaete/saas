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
  const [loading, setLoading] = useState(true)
  const [businessLoading, setBusinessLoading] = useState(false)

  const businessOperations = {
    async load(userId) {
      if (!userId) return
      setBusinessLoading(true)
      try {
        const { data } = await getMyBusiness()
        if (data) {
          const isPaid = data.planSlug === 'pro' || data.planSlug === 'business'
          const expired = data.planExpiresAt && new Date(data.planExpiresAt) <= new Date()
          if (isPaid && expired) {
            await updateBusiness(data.id, { planSlug: 'starter', planExpiresAt: null })
            const { data: updated } = await getMyBusiness()
            setBusiness(updated || data)
            if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('showPlanExpiredBanner', '1')
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
    supabase?.auth?.getSession()?.then(({ data: { session } }) => {
      authStateHandlers?.onChange(null, session)
    })
    const { data: { subscription } } = supabase?.auth?.onAuthStateChange(
      authStateHandlers?.onChange
    )
    return () => subscription?.unsubscribe()
  }, [])

  const signIn = async (email, password) => {
    try {
      const { data, error } = await supabase?.auth?.signInWithPassword({ email, password })
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
      if (!error) {
        setUser(null)
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

  const value = {
    user,
    business,
    loading,
    businessLoading,
    signIn,
    signUp,
    signOut,
    refreshBusiness,
    isAuthenticated: !!user,
    isAdmin
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
