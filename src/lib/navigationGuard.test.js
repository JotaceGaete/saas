import { describe, it, expect, vi } from 'vitest';
import { createNavigationGuardStore } from './navigationGuard';

describe('createNavigationGuardStore', () => {
  it('calls the action directly when no guard is registered', () => {
    const store = createNavigationGuardStore();
    const action = vi.fn();
    store.attemptLeave(action);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('delegates to the registered guard instead of calling the action directly', () => {
    const store = createNavigationGuardStore();
    const action = vi.fn();
    const guard = vi.fn();
    store.setGuard(guard);
    store.attemptLeave(action);
    expect(guard).toHaveBeenCalledWith(action);
    expect(action).not.toHaveBeenCalled();
  });

  it('lets the guard decide whether to run the action (e.g. isDirty = false)', () => {
    const store = createNavigationGuardStore();
    const action = vi.fn();
    store.setGuard((leaveAction) => leaveAction());
    store.attemptLeave(action);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('lets the guard block the action (e.g. isDirty = true, dialog opened instead)', () => {
    const store = createNavigationGuardStore();
    const action = vi.fn();
    store.setGuard(() => {});
    store.attemptLeave(action);
    expect(action).not.toHaveBeenCalled();
  });

  it('falls back to direct navigation after clearGuard (e.g. page unmounted)', () => {
    const store = createNavigationGuardStore();
    const action = vi.fn();
    store.setGuard(() => {});
    store.clearGuard();
    store.attemptLeave(action);
    expect(action).toHaveBeenCalledTimes(1);
  });
});
