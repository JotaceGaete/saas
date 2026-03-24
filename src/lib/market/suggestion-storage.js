/**
 * Preferencia de mercado y snooze de sugerencias (solo UI de entrada; no negocio).
 * localStorage: ventalink_market_preference (cl|ar|go), ventalink_market_suggestion_state (pares con TTL).
 */

const PREFERENCE_KEY = 'ventalink_market_preference';
const STATE_KEY = 'ventalink_market_suggestion_state';

/** 30 días por par sugerido|actual */
export const MARKET_SUGGESTION_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * @param {'CL'|'AR'|'GLOBAL'} market
 * @returns {'cl'|'ar'|'go'}
 */
export function marketToPreferenceKey(market) {
  if (market === 'CL') return 'cl';
  if (market === 'AR') return 'ar';
  return 'go';
}

/**
 * @returns {'cl'|'ar'|'go'|null}
 */
export function getStoredMarketPreference() {
  if (typeof window === 'undefined') return null;
  try {
    const v = localStorage.getItem(PREFERENCE_KEY);
    if (v === 'cl' || v === 'ar' || v === 'go') return v;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * @param {'cl'|'ar'|'go'} key
 */
export function setStoredMarketPreference(key) {
  if (typeof window === 'undefined') return;
  try {
    if (key === 'cl' || key === 'ar' || key === 'go') localStorage.setItem(PREFERENCE_KEY, key);
  } catch {
    /* ignore */
  }
}

function loadPairState() {
  if (typeof window === 'undefined') return { pairs: {} };
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return { pairs: {} };
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.pairs === 'object' ? parsed : { pairs: {} };
  } catch {
    return { pairs: {} };
  }
}

function savePairState(state) {
  if (typeof window === 'undefined') return;
  try {
    const pairs = { ...state.pairs };
    const now = Date.now();
    Object.keys(pairs).forEach((k) => {
      if (pairs[k] < now) delete pairs[k];
    });
    localStorage.setItem(STATE_KEY, JSON.stringify({ pairs }));
  } catch {
    /* ignore */
  }
}

/**
 * Par "mercado sugerido por país | mercado del sitio actual" (ej. CL|GLOBAL).
 */
export function pairKey(suggestedMarket, currentMarket) {
  return `${suggestedMarket}|${currentMarket}`;
}

export function isPairDismissed(suggestedMarket, currentMarket) {
  const key = pairKey(suggestedMarket, currentMarket);
  const state = loadPairState();
  const exp = state.pairs[key];
  return typeof exp === 'number' && exp > Date.now();
}

/**
 * @param {'CL'|'AR'|'GLOBAL'} suggestedMarket
 * @param {'CL'|'AR'|'GLOBAL'} currentMarket
 */
export function dismissSuggestionPair(suggestedMarket, currentMarket, ttlMs = MARKET_SUGGESTION_SNOOZE_MS) {
  const state = loadPairState();
  const key = pairKey(suggestedMarket, currentMarket);
  state.pairs[key] = Date.now() + ttlMs;
  savePairState(state);
}

export function preferenceMatchesCurrentMarket(currentMarket) {
  const pref = getStoredMarketPreference();
  if (!pref) return false;
  return pref === marketToPreferenceKey(currentMarket);
}
