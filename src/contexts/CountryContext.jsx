import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { getStoredCountryCode, setStoredCountryCode, COUNTRY_CODES, getCountryConfig } from '../config/countryConfig';
import { useAuth } from './AuthContext';

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

function hostnameDefaultCountry() {
  if (typeof window === 'undefined') return null;
  const host = (window.location?.hostname || '').toLowerCase();
  if (/(^|\.)cl\.ventalink\.app$/.test(host)) return 'CL';
  if (/(^|\.)ar\.ventalink\.app$/.test(host)) return 'AR';
  return getStoredCountryCode();
}

export function CountryProvider({ children }) {
  const { business } = useAuth();

  const [countryCode, setCountryCodeState] = useState(() => {
    if (typeof window === 'undefined') return null;
    if (isCountrySelectable()) {
      return getStoredCountryCode() ?? null;
    }
    return hostnameDefaultCountry();
  });

  useEffect(() => {
    const stored = getStoredCountryCode();
    if (stored && stored !== countryCode) setCountryCodeState(stored);
  }, []);

  // Fuente de verdad: country_code del negocio (routing) primero; evita país inferido solo por moneda.
  useEffect(() => {
    if (!business?.id) return;
    const routing = business.routingCountryCode;
    const r = String(routing || '').trim().toUpperCase();
    if (r && COUNTRY_CODES.includes(r)) {
      setCountryCodeState(r);
      if (isCountrySelectable()) setStoredCountryCode(r);
      return;
    }
    const fallback = business.countryCode;
    const n = String(fallback || '').trim().toUpperCase();
    if (n && COUNTRY_CODES.includes(n)) {
      setCountryCodeState(n);
      if (isCountrySelectable()) setStoredCountryCode(n);
    }
  }, [business?.id, business?.routingCountryCode, business?.countryCode]);

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
