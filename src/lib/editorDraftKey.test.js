import { describe, it, expect } from 'vitest';
import { buildEditorDraftKey } from './editorDraftKey';

describe('buildEditorDraftKey', () => {
  it('combina namespace y businessId', () => {
    expect(buildEditorDraftKey('design', 'biz-1')).toBe('design:biz-1');
    expect(buildEditorDraftKey('business-config', 'biz-2')).toBe('business-config:biz-2');
  });

  it('devuelve null sin businessId', () => {
    expect(buildEditorDraftKey('design', null)).toBeNull();
    expect(buildEditorDraftKey('design', undefined)).toBeNull();
    expect(buildEditorDraftKey('design', '')).toBeNull();
  });

  it('devuelve null sin namespace', () => {
    expect(buildEditorDraftKey('', 'biz-1')).toBeNull();
    expect(buildEditorDraftKey(null, 'biz-1')).toBeNull();
  });

  it('namespaces distintos no colisionan para el mismo negocio', () => {
    const a = buildEditorDraftKey('design', 'biz-1');
    const b = buildEditorDraftKey('business-config', 'biz-1');
    expect(a).not.toBe(b);
  });
});
