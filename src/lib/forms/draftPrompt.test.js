import { describe, it, expect } from 'vitest';
import { shouldOfferDraftRestore, shouldWithdrawDraftPrompt } from './draftPrompt';

describe('shouldOfferDraftRestore', () => {
  it('lo muestra solo al cargar con formulario limpio y sin foco en ningún campo', () => {
    expect(shouldOfferDraftRestore({
      hasDraft: true,
      isDirty: false,
      isLoading: false,
      isFieldFocused: false,
    })).toBe(true);
  });

  it('NO lo muestra si el usuario ya modificó el formulario (isDirty)', () => {
    expect(shouldOfferDraftRestore({
      hasDraft: true,
      isDirty: true,
      isLoading: false,
      isFieldFocused: false,
    })).toBe(false);
  });

  it('NO lo muestra si hay un campo enfocado, aunque el formulario aún no esté "dirty"', () => {
    expect(shouldOfferDraftRestore({
      hasDraft: true,
      isDirty: false,
      isLoading: false,
      isFieldFocused: true,
    })).toBe(false);
  });

  it('NO lo muestra mientras la pantalla sigue cargando', () => {
    expect(shouldOfferDraftRestore({
      hasDraft: true,
      isDirty: false,
      isLoading: true,
      isFieldFocused: false,
    })).toBe(false);
  });

  it('NO lo muestra si no hay ningún borrador guardado', () => {
    expect(shouldOfferDraftRestore({
      hasDraft: false,
      isDirty: false,
      isLoading: false,
      isFieldFocused: false,
    })).toBe(false);
  });
});

describe('shouldWithdrawDraftPrompt', () => {
  it('oculta el diálogo si el usuario empieza a escribir mientras está abierto', () => {
    expect(shouldWithdrawDraftPrompt({ isPromptOpen: true, isDirty: true })).toBe(true);
  });

  it('no hace nada si el diálogo ya está cerrado', () => {
    expect(shouldWithdrawDraftPrompt({ isPromptOpen: false, isDirty: true })).toBe(false);
  });

  it('no hace nada si el diálogo está abierto pero el formulario sigue limpio', () => {
    expect(shouldWithdrawDraftPrompt({ isPromptOpen: true, isDirty: false })).toBe(false);
  });
});
