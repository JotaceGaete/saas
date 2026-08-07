import React from 'react';

export function useAuth() {
  const businessId = localStorage.getItem('walinka-e2e-business') || 'business-a';
  return {
    user: { id: 'e2e-user', email: 'e2e@walinka.local', user_metadata: {} },
    business: { id: businessId, slug: businessId, name: businessId, planSlug: 'business', designSettings: {} },
    businessLoading: false,
    refreshBusiness: () => {},
    signOut: async () => {},
    isAdmin: false,
    isImpersonating: false,
    stopImpersonation: () => {},
  };
}

export const AuthProvider = ({ children }) => <>{children}</>;
