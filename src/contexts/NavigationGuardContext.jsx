import React, { createContext, useContext, useRef } from 'react';
import { createNavigationGuardStore } from '../lib/navigationGuard';

const NavigationGuardContext = createContext(null);

export function NavigationGuardProvider({ children }) {
  const storeRef = useRef(null);
  if (!storeRef.current) storeRef.current = createNavigationGuardStore();

  return (
    <NavigationGuardContext.Provider value={storeRef.current}>
      {children}
    </NavigationGuardContext.Provider>
  );
}

/**
 * attemptLeave(action) is the single function every navigation trigger in the
 * app must call instead of navigating directly. setGuard/clearGuard are used
 * by the page that owns the unsaved-changes state (e.g. ProductEditor) to
 * install the decision logic while it's mounted.
 */
export function useNavigationGuard() {
  const ctx = useContext(NavigationGuardContext);
  if (!ctx) throw new Error('useNavigationGuard must be used within a NavigationGuardProvider');
  return ctx;
}
