import { describe, it, expect, vi } from 'vitest';

// RequireBusinessCountry.jsx importa useAuth desde ../contexts/AuthContext,
// que a su vez importa ../lib/supabase — ese módulo revienta al evaluarse
// sin VITE_SUPABASE_URL/ANON_KEY reales (ver src/lib/supabase.js). Como esta
// prueba solo necesita la función pura shouldBlockForBusinessLoading (no usa
// useAuth en absoluto), se mockea el import para aislarla sin depender de
// variables de entorno ni tocar ningún otro archivo de producción.
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({}) }));
// business-country-policy.js (importado por RequireBusinessCountry.jsx para
// isOnboardingComplete/getMissingOnboardingFields) importa a su vez
// waBusinessService.js -> lib/supabase.js, mismo problema. No se usa nada
// de este mock en las aserciones.
vi.mock('../services/waBusinessService', () => ({ getEffectivePlanSlug: () => 'starter' }));

const { shouldBlockForBusinessLoading } = await import('./RequireBusinessCountry');

describe('shouldBlockForBusinessLoading', () => {
  it('bloquea en la carga INICIAL (sin business todavía)', () => {
    expect(shouldBlockForBusinessLoading(true, null)).toBe(true);
  });

  it('NO bloquea un refetch en segundo plano con un business ya cargado (Regresión: TOKEN_REFRESHED tras volver de pestaña no debe desmontar la página)', () => {
    expect(shouldBlockForBusinessLoading(true, { id: 'biz-1' })).toBe(false);
  });

  it('no bloquea cuando no está cargando', () => {
    expect(shouldBlockForBusinessLoading(false, { id: 'biz-1' })).toBe(false);
    expect(shouldBlockForBusinessLoading(false, null)).toBe(false);
  });
});
