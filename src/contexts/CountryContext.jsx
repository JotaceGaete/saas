import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { getStoredCountryCode, setStoredCountryCode, COUNTRY_CODES, getCountryConfig } from '../config/countryConfig';

const CountryContext = createContext(null);

export function useCountry() {
  const ctx = useContext(CountryContext);
  if (!ctx) throw new Error('useCountry must be used within CountryProvider');
  return ctx;
}

/**
 * Indica si el país viene de la selección del usuario (go.ventalink.app) y se puede cambiar.
 */
export function isCountrySelectable() {
  if (typeof window === 'undefined') return false;
  const host = (window.location?.hostname || '').toLowerCase();
  return /(^|\.)go\.ventalink\.app$/.test(host);
}

export function CountryProvider({ children }) {
  const [countryCode, setCountryCodeState] = useState(() => {
    if (typeof window === 'undefined') return 'CL';
    if (!isCountrySelectable()) {
      const host = (window.location?.hostname || '').toLowerCase();
      if (/(^|\.)cl\.ventalink\.app$/.test(host)) return 'CL';
      if (/(^|\.)ar\.ventalink\.app$/.test(host)) return 'AR';
      return getStoredCountryCode() ?? 'CL';
    }
    return getStoredCountryCode() ?? null;
  });

  useEffect(() => {
    const stored = getStoredCountryCode();
    if (stored && stored !== countryCode) setCountryCodeState(stored);
  }, []);

  const setCountry = useCallback((code) => {
    if (code === null || code === undefined) {
      setCountryCodeState(null);
      return;
    }
    const c = String(code).toUpperCase().trim();
    if (!COUNTRY_CODES.includes(c)) return;
    setStoredCountryCode(c);
    setCountryCodeState(c);
  }, []);

  const getCountry = useCallback(() => countryCode, [countryCode]);
  const config = countryCode ? getCountryConfig(countryCode) : getCountryConfig(null);

  const value = {
    countryCode,
    getCountry: getCountry,
    setCountry,
    config,
    isSelectable: isCountrySelectable(),
  };

  return (
    <CountryContext.Provider value={value}>
      {children}
    </CountryContext.Provider>
  );
}
