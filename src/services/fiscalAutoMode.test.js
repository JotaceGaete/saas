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
});
