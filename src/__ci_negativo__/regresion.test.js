// PRUEBA TEMPORAL de la CI (PR de verificación negativa): debe fallar y bloquear. No se fusiona.
import { it, expect } from 'vitest';
it('regresión simulada para verificar la CI', () => { expect(1).toBe(2); });
it('una prueba que intenta salir a la red debe fallar por el aislamiento', async () => {
  const r = await fetch('https://hxxdketymcntadffmajf.supabase.co/rest/v1/').then(() => 'alcanzó', () => 'bloqueado');
  expect(r).toBe('alcanzó');
});
