import { describe, it, expect } from 'vitest';
import { resolveFiscalAutoMode } from './fiscalAutoMode';

describe('resolveFiscalAutoMode', () => {
  it('apagado por defecto en producción', () => {
    expect(resolveFiscalAutoMode({}, 'go.walinka.com')).toBe('off');
    expect(resolveFiscalAutoMode({}, 'saas-git-main-jotacegaete.vercel.app')).toBe('off');
  });
  it('simulado por defecto en el alias de rama de una Preview', () => {
    expect(resolveFiscalAutoMode({}, 'saas-git-claude-project-thread-x9ut7z-jotacegaete.vercel.app')).toBe('simulated');
  });
  it('la simulación nunca corre en un dominio de producción', () => {
    expect(resolveFiscalAutoMode({ VITE_FISCAL_AUTO_EMIT: 'simulated' }, 'go.walinka.com')).toBe('off');
    expect(resolveFiscalAutoMode({ VITE_FISCAL_AUTO_EMIT: 'simulated' }, 'localhost')).toBe('simulated');
  });
  it('real solo si se pide explícitamente; off siempre gana', () => {
    expect(resolveFiscalAutoMode({ VITE_FISCAL_AUTO_EMIT: 'live' }, 'go.walinka.com')).toBe('live');
    expect(resolveFiscalAutoMode({ VITE_FISCAL_AUTO_EMIT: 'off' }, 'saas-git-x-y.vercel.app')).toBe('off');
  });
  it('Preview abierta por la URL del deployment (no el alias de rama): simulado', () => {
    // Caso de NV-0056: saas-<hash>-….vercel.app no coincide con saas-git-…
    const host = 'saas-7fhdnp8ph-juan-s-projects-afd7e18e.vercel.app';
    expect(resolveFiscalAutoMode({}, host)).toBe('off'); // antes: sin entorno de build
    expect(resolveFiscalAutoMode({ VITE_VERCEL_ENV: 'preview' }, host)).toBe('simulated');
    expect(resolveFiscalAutoMode({ VITE_VERCEL_ENV: 'preview' }, 'preview.walinka.com')).toBe('simulated');
  });
  it('una compilación de producción nunca simula, aunque se abra por un alias saas-git-', () => {
    const env = { VITE_VERCEL_ENV: 'production' };
    expect(resolveFiscalAutoMode(env, 'saas-git-claude-x-juan-s-projects-afd7e18e.vercel.app')).toBe('off');
    expect(resolveFiscalAutoMode({ ...env, VITE_FISCAL_AUTO_EMIT: 'simulated' }, 'localhost')).toBe('off');
    expect(resolveFiscalAutoMode(env, 'go.walinka.com')).toBe('off');
  });
});
