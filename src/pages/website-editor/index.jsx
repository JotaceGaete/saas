import React, { useEffect, useMemo, useState } from 'react';
import PanelHeader from 'components/ui/PanelHeader';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import { useAuth } from '../../contexts/AuthContext';
import { WEBSITE_TEMPLATES, canUseWebsiteEditor } from '../../websites/templates';
import {
  getSiteContentState,
  saveSiteDraft,
  publishSiteContent,
  uploadSiteImage,
  describeSiteContentError,
} from '../../services/siteContentService';

// Editor de Walinka Websites (fase 1). Genera los campos desde el contrato de la plantilla;
// no permite agregar, quitar ni reordenar secciones.
const TEMPLATE_KEY = 'artemis-home';

const inputClass = 'w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30';
const labelClass = 'mb-1 block text-sm font-medium text-foreground';
const hintClass = 'mt-1 text-xs text-muted-foreground';

function cloneDraft(value) {
  return JSON.parse(JSON.stringify(value));
}

function TextField({ label, value, onChange, limit, multiline = false, disabled }) {
  const [min, max] = limit;
  const length = (value ?? '').length;
  const common = {
    className: inputClass,
    value: value ?? '',
    onChange: (e) => onChange(e.target.value),
    disabled,
    maxLength: max,
    'aria-label': label,
  };
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {multiline ? <textarea rows={3} {...common} /> : <input type="text" {...common} />}
      <p className={hintClass}>{length}/{max} caracteres{length < min ? ` · mínimo ${min}` : ''}</p>
    </div>
  );
}

function ImageField({ value, onChange, onUpload, uploading, disabled }) {
  return (
    <div className="space-y-2">
      <label className={labelClass}>Imagen</label>
      {value?.url ? (
        <img src={value.url} alt={value.alt || ''} className="h-40 w-full max-w-sm rounded-md object-cover" />
      ) : (
        <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Aún no hay imagen. Sube una para publicar.</p>
      )}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={disabled || uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = '';
        }}
        aria-label="Subir imagen"
        className="text-sm"
      />
      {uploading && <p className={hintClass}>Subiendo imagen…</p>}
      <TextField
        label="Texto alternativo"
        value={value?.alt ?? ''}
        onChange={(alt) => onChange({ ...value, alt })}
        limit={[1, 140]}
        disabled={disabled}
      />
    </div>
  );
}

function HrefField({ value, onChange, disabled }) {
  const valid = typeof value === 'string' && /^\/[^/\\]/.test(value);
  return (
    <div>
      <label className={labelClass}>Destino del botón (ruta interna)</label>
      <input
        type="text"
        className={inputClass}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label="Destino del botón"
      />
      <p className={hintClass}>{valid ? 'Ruta válida.' : 'Debe empezar con "/", por ejemplo /catalogo?categoria=vintage.'}</p>
    </div>
  );
}

export default function WebsiteEditorPage() {
  const { business, isAdmin } = useAuth();
  const template = WEBSITE_TEMPLATES[TEMPLATE_KEY];
  const allowed = canUseWebsiteEditor({ business, isAdmin });

  const [draft, setDraft] = useState(null);
  const [savedDraft, setSavedDraft] = useState(null);
  const [publishedAt, setPublishedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // 'save' | 'publish' | 'upload'
  const [message, setMessage] = useState(null);
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    if (!allowed || !business?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const state = await getSiteContentState({ businessId: business.id, templateKey: TEMPLATE_KEY });
        const initial = state?.draft && Object.keys(state.draft).length > 0
          ? state.draft
          : template.buildInitialDraft();
        if (cancelled) return;
        setDraft(cloneDraft(initial));
        setSavedDraft(cloneDraft(initial));
        setPublishedAt(state?.published_at ?? null);
      } catch (error) {
        if (!cancelled) setMessage({ type: 'error', text: describeSiteContentError(error) });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [allowed, business?.id, template]);

  const hasUnsaved = useMemo(
    () => draft !== null && savedDraft !== null && JSON.stringify(draft) !== JSON.stringify(savedDraft),
    [draft, savedDraft],
  );

  if (!allowed) {
    return (
      <DashboardAppShell backgroundColor="#f7f7f9">
        <PanelHeader title={<h1 className="text-base font-bold">Sitio web</h1>} />
        <div className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">
          El editor de sitio web todavía no está habilitado para este comercio.
        </div>
      </DashboardAppShell>
    );
  }

  const setSectionField = (sectionKey, fieldKey, value) => {
    setDraft((prev) => ({
      ...prev,
      sections: { ...prev.sections, [sectionKey]: { ...prev.sections[sectionKey], [fieldKey]: value } },
    }));
  };

  const handleSave = async () => {
    setBusy('save');
    setMessage(null);
    try {
      await saveSiteDraft({ businessId: business.id, templateKey: TEMPLATE_KEY, draft });
      setSavedDraft(cloneDraft(draft));
      setErrors([]);
      setMessage({ type: 'success', text: 'Borrador guardado. Todavía no se muestra en la tienda.' });
    } catch (error) {
      setMessage({ type: 'error', text: describeSiteContentError(error) });
    } finally {
      setBusy(null);
    }
  };

  const handlePublish = async () => {
    setMessage(null);
    const problems = template.validate(savedDraft);
    if (problems.length > 0) {
      setErrors(problems);
      setMessage({ type: 'error', text: 'Hay campos por corregir antes de publicar.' });
      return;
    }
    setErrors([]);
    setBusy('publish');
    try {
      const at = await publishSiteContent({ businessId: business.id, templateKey: TEMPLATE_KEY });
      setPublishedAt(at);
      setMessage({ type: 'success', text: 'Publicado. La tienda mostrará el cambio en unos minutos.' });
    } catch (error) {
      setMessage({ type: 'error', text: describeSiteContentError(error) });
    } finally {
      setBusy(null);
    }
  };

  const handleUpload = async (sectionKey, file) => {
    setBusy('upload');
    setMessage(null);
    try {
      const url = await uploadSiteImage({ businessId: business.id, file });
      const current = draft.sections[sectionKey].image;
      setSectionField(sectionKey, 'image', { ...current, url });
    } catch (error) {
      setMessage({ type: 'error', text: error?.message || 'No se pudo subir la imagen.' });
    } finally {
      setBusy(null);
    }
  };

  const disabled = busy !== null;

  return (
    <DashboardAppShell backgroundColor="#f7f7f9">
      <div role="main" className="min-h-screen w-full max-w-full min-w-0 overflow-x-hidden">
        <PanelHeader title={<h1 className="text-base font-bold text-foreground">Sitio web · Portada</h1>} />
        <div className="mx-auto max-w-3xl space-y-8 p-4 md:p-6">
          <p className="text-sm text-muted-foreground">
            Edita los textos e imágenes de la portada. El diseño y la posición de cada bloque no cambian.
            {publishedAt && <> Última publicación: {new Date(publishedAt).toLocaleString('es-CL')}.</>}
          </p>

          {loading && <p className="text-sm text-muted-foreground">Cargando contenido…</p>}

          {!loading && draft && template.sections.map((section) => (
            <section key={section.key} className="space-y-4 rounded-xl border border-border bg-white p-5">
              <h2 className="text-sm font-semibold text-foreground">{section.label}</h2>
              {section.fields.map((field) => {
                const value = draft.sections[section.key][field.key];
                if (field.type === 'text' || field.type === 'textarea') {
                  return (
                    <TextField
                      key={field.key}
                      label={field.label}
                      value={value}
                      limit={field.limit}
                      multiline={field.type === 'textarea'}
                      onChange={(v) => setSectionField(section.key, field.key, v)}
                      disabled={disabled}
                    />
                  );
                }
                if (field.type === 'image') {
                  return (
                    <ImageField
                      key={field.key}
                      value={value}
                      uploading={busy === 'upload'}
                      disabled={disabled}
                      onChange={(v) => setSectionField(section.key, field.key, v)}
                      onUpload={(file) => handleUpload(section.key, file)}
                    />
                  );
                }
                if (field.type === 'href') {
                  return (
                    <HrefField
                      key={field.key}
                      value={value}
                      disabled={disabled}
                      onChange={(v) => setSectionField(section.key, field.key, v)}
                    />
                  );
                }
                if (field.type === 'list') {
                  return (
                    <div key={field.key} className="space-y-3">
                      <label className={labelClass}>{field.label}</label>
                      {value.map((item, index) => (
                        <TextField
                          key={index}
                          label={`Destacado ${index + 1}`}
                          value={item}
                          limit={field.limit}
                          disabled={disabled}
                          onChange={(v) => {
                            const next = [...value];
                            next[index] = v;
                            setSectionField(section.key, field.key, next);
                          }}
                        />
                      ))}
                    </div>
                  );
                }
                return null;
              })}
            </section>
          ))}

          {errors.length > 0 && (
            <ul className="list-disc space-y-1 rounded-md border border-red-200 bg-red-50 p-4 pl-8 text-sm text-red-700">
              {errors.map((err) => <li key={err}>{err}</li>)}
            </ul>
          )}

          {message && (
            <p role="status" className={message.type === 'error' ? 'text-sm text-red-700' : 'text-sm text-green-700'}>
              {message.text}
            </p>
          )}

          <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-border bg-[#f7f7f9] py-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={disabled || loading || !hasUnsaved}
              className="rounded-md border border-border bg-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {busy === 'save' ? 'Guardando…' : 'Guardar borrador'}
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={disabled || loading || hasUnsaved}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy === 'publish' ? 'Publicando…' : 'Publicar'}
            </button>
            {hasUnsaved && <span className="text-xs text-muted-foreground">Hay cambios sin guardar. Guarda el borrador antes de publicar.</span>}
          </div>
        </div>
      </div>
    </DashboardAppShell>
  );
}
