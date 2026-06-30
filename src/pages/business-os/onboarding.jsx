import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createBusinessConfig } from '../../business/businessEngine.js';
import { BLUEPRINTS } from '../../business/blueprints/index.js';
import { GOALS } from '../../business/goals/index.js';
import { OUTPUTS } from '../../business/outputs/index.js';
import { STAGES } from '../../business/stages/index.js';

// ─── Constantes de UI ─────────────────────────────────────────────────────────

const STAGE_COLORS = {
  0: { bg: '#f3f4f6', text: '#6b7280', dot: '#9ca3af' },
  1: { bg: '#eff6ff', text: '#1d4ed8', dot: '#3b82f6' },
  2: { bg: '#f0fdf4', text: '#15803d', dot: '#22c55e' },
  3: { bg: '#fdf4ff', text: '#7e22ce', dot: '#a855f7' },
  4: { bg: '#fff7ed', text: '#c2410c', dot: '#f97316' },
};

const STAGE_LABELS = { 1: 'Presencia', 2: 'Ventas', 3: 'Gestión', 4: 'Crecimiento' };

const OUTPUT_COLORS = {
  website:   { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  catalog:   { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  whatsapp:  { bg: '#f0fdf4', text: '#166534', border: '#86efac' },
  crm:       { bg: '#fdf4ff', text: '#7e22ce', border: '#e9d5ff' },
  tpv:       { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
  caja:      { bg: '#fefce8', text: '#a16207', border: '#fef08a' },
  stock:     { bg: '#f0f9ff', text: '#0369a1', border: '#bae6fd' },
  dashboard: { bg: '#f9fafb', text: '#374151', border: '#e5e7eb' },
};

// ─── Componentes de paso ──────────────────────────────────────────────────────

function StepBadge({ current, total }) {
  return (
    <p className="text-xs font-semibold tracking-widest uppercase mb-6" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)', opacity: 0.7 }}>
      Paso {current} de {total}
    </p>
  );
}

function ProgressBar({ step }) {
  const pct = Math.round((step / 3) * 100);
  return (
    <div className="w-full h-1 rounded-full mb-10" style={{ backgroundColor: 'rgba(17,24,39,0.08)' }}>
      <div
        className="h-1 rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: 'var(--color-primary)' }}
      />
    </div>
  );
}

// ─── Paso 1: Blueprint ────────────────────────────────────────────────────────

function StepBlueprint({ selected, onSelect }) {
  const blueprints = Object.values(BLUEPRINTS);
  return (
    <div>
      <StepBadge current={1} total={3} />
      <h1 className="text-2xl font-semibold mb-1" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
        ¿Qué tipo de negocio tenés?
      </h1>
      <p className="text-sm mb-8" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-body)' }}>
        Elegí el que más se parece. Después podés ajustar todo.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {blueprints.map(bp => {
          const isSelected = selected === bp.slug;
          return (
            <button
              key={bp.slug}
              onClick={() => onSelect(bp.slug)}
              className="flex items-start gap-4 rounded-2xl border p-4 text-left transition-all duration-150"
              style={{
                borderColor: isSelected ? 'var(--color-primary)' : 'rgba(17,24,39,0.10)',
                backgroundColor: isSelected ? 'var(--color-primary-50, #eff6ff)' : '#fff',
                boxShadow: isSelected ? '0 0 0 2px var(--color-primary)' : '0 1px 3px rgba(17,24,39,0.06)',
              }}
            >
              <span className="text-3xl leading-none mt-0.5">{bp.icon}</span>
              <div>
                <p className="font-semibold text-sm" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>
                  {bp.label}
                </p>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-body)' }}>
                  {bp.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Paso 2: Goals ───────────────────────────────────────────────────────────

function StepGoals({ blueprintSlug, selected, onToggle }) {
  const bp = BLUEPRINTS[blueprintSlug];
  const availableGoals = bp?.availableGoals ?? Object.keys(GOALS);

  return (
    <div>
      <StepBadge current={2} total={3} />
      <h1 className="text-2xl font-semibold mb-1" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
        ¿Qué querés lograr?
      </h1>
      <p className="text-sm mb-8" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-body)' }}>
        Podés elegir varios. Después podés agregar más.
      </p>
      <div className="flex flex-col gap-3">
        {availableGoals.map(slug => {
          const goal = GOALS[slug];
          if (!goal) return null;
          const isChecked = selected.includes(slug);
          const isDefault = bp?.defaultGoals?.includes(slug);
          return (
            <label
              key={slug}
              className="flex items-start gap-4 rounded-2xl border p-4 cursor-pointer transition-all duration-150"
              style={{
                borderColor: isChecked ? 'var(--color-primary)' : 'rgba(17,24,39,0.10)',
                backgroundColor: isChecked ? 'var(--color-primary-50, #eff6ff)' : '#fff',
                boxShadow: isChecked ? '0 0 0 2px var(--color-primary)' : '0 1px 3px rgba(17,24,39,0.06)',
              }}
            >
              <div className="flex-shrink-0 mt-0.5">
                <div
                  className="w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors duration-150"
                  style={{
                    borderColor: isChecked ? 'var(--color-primary)' : 'rgba(17,24,39,0.25)',
                    backgroundColor: isChecked ? 'var(--color-primary)' : 'transparent',
                  }}
                >
                  {isChecked && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              </div>
              <input type="checkbox" className="sr-only" checked={isChecked} onChange={() => onToggle(slug)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-body)' }}>
                    {goal.label}
                  </p>
                  {isDefault && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(17,24,39,0.06)', color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                      Recomendado
                    </span>
                  )}
                </div>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-body)' }}>
                  {goal.description}
                </p>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ─── Paso 3: Resultado ────────────────────────────────────────────────────────

function OutputPill({ slug }) {
  const out = OUTPUTS[slug];
  const colors = OUTPUT_COLORS[slug] ?? { bg: '#f3f4f6', text: '#374151', border: '#e5e7eb' };
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border"
      style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border, fontFamily: 'var(--font-caption)' }}
    >
      {out?.label ?? slug}
    </span>
  );
}

function PagePill({ page }) {
  const labels = {
    home: 'Inicio',
    products: 'Productos',
    contact: 'Contacto',
    about: 'Nosotros',
    services: 'Servicios',
    gallery: 'Galería',
  };
  return (
    <span
      className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium border"
      style={{ backgroundColor: '#f9fafb', color: '#374151', borderColor: '#e5e7eb', fontFamily: 'var(--font-caption)' }}
    >
      {labels[page] ?? page}
    </span>
  );
}

function ResultCard({ title, children }) {
  return (
    <div
      className="rounded-2xl border p-5"
      style={{ borderColor: 'rgba(17,24,39,0.08)', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(17,24,39,0.06)' }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function StepResult({ blueprintSlug, goalSlugs }) {
  const bp = BLUEPRINTS[blueprintSlug];
  const config = createBusinessConfig(blueprintSlug, goalSlugs, { name: 'Tu negocio' });
  const stageColors = STAGE_COLORS[config.stage] ?? STAGE_COLORS[0];
  const stageName = STAGE_LABELS[config.stage];
  const stageData = STAGES.find(s => s.stage === config.stage);

  const hasWebsite = config.outputs.includes('website');

  return (
    <div>
      <StepBadge current={3} total={3} />
      <h1 className="text-2xl font-semibold mb-1" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
        Tu negocio está listo para configurarse
      </h1>
      <p className="text-sm mb-8" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-body)' }}>
        Esto es lo que activaríamos según lo que elegiste.
      </p>

      <div className="flex flex-col gap-4">

        {/* Resumen del negocio */}
        <ResultCard title="Tipo de negocio">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{bp.icon}</span>
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>{bp.label}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-body)' }}>
                {goalSlugs.length} necesidad{goalSlugs.length !== 1 ? 'es' : ''} seleccionada{goalSlugs.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </ResultCard>

        {/* Herramientas activadas */}
        <ResultCard title="Herramientas que se activarían">
          <div className="flex flex-wrap gap-2">
            {config.outputs.map(slug => (
              <OutputPill key={slug} slug={slug} />
            ))}
          </div>
        </ResultCard>

        {/* Sitio web */}
        {hasWebsite && (
          <ResultCard title="Sitio web sugerido">
            <div className="flex flex-wrap gap-2 mb-3">
              {config.website.pages.map(page => (
                <PagePill key={page} page={page} />
              ))}
            </div>
            <div
              className="mt-3 rounded-xl p-3 text-xs"
              style={{ backgroundColor: 'rgba(17,24,39,0.04)', fontFamily: 'var(--font-body)', color: 'var(--color-muted-foreground)' }}
            >
              <span className="font-semibold" style={{ color: 'var(--color-foreground)' }}>Layout: </span>
              {config.website.layout} · <span className="font-semibold" style={{ color: 'var(--color-foreground)' }}>Tema: </span>
              {config.website.theme}
            </div>
          </ResultCard>
        )}

        {/* Etapa actual */}
        <ResultCard title="Etapa actual">
          <div className="flex items-center gap-3">
            <span
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ backgroundColor: stageColors.bg, color: stageColors.text }}
            >
              {config.stage || '—'}
            </span>
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>
                {stageName ?? 'Sin stage aún'}
              </p>
              {stageData && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-body)' }}>
                  {stageData.description}
                </p>
              )}
            </div>
          </div>
        </ResultCard>

        {/* Próxima recomendación */}
        {config.nextStageHint && (
          <div
            className="rounded-2xl border p-4 flex items-start gap-3"
            style={{ borderColor: '#fde68a', backgroundColor: '#fffbeb' }}
          >
            <span className="text-lg flex-shrink-0 mt-0.5">💡</span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: '#92400e', fontFamily: 'var(--font-caption)' }}>
                Próximo paso
              </p>
              <p className="text-sm" style={{ color: '#78350f', fontFamily: 'var(--font-body)' }}>
                {config.nextStageHint}
              </p>
            </div>
          </div>
        )}

        {/* Debug: config completa */}
        <details className="rounded-2xl border overflow-hidden" style={{ borderColor: 'rgba(17,24,39,0.08)' }}>
          <summary
            className="px-5 py-3 cursor-pointer text-xs font-semibold uppercase tracking-widest select-none"
            style={{ backgroundColor: '#f9fafb', color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
          >
            Ver config completa del motor
          </summary>
          <pre
            className="p-5 text-xs leading-relaxed overflow-auto"
            style={{ backgroundColor: '#0f172a', color: '#94a3b8', fontFamily: 'monospace', maxHeight: 320 }}
          >
            {JSON.stringify(config, null, 2)}
          </pre>
        </details>

      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function BusinessOsOnboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [blueprint, setBlueprint] = useState(null);
  const [goals, setGoals] = useState([]);

  function handleSelectBlueprint(slug) {
    const bp = BLUEPRINTS[slug];
    setBlueprint(slug);
    setGoals(bp?.defaultGoals ?? []);
  }

  function handleToggleGoal(slug) {
    setGoals(prev =>
      prev.includes(slug) ? prev.filter(g => g !== slug) : [...prev, slug],
    );
  }

  function canAdvance() {
    if (step === 1) return !!blueprint;
    if (step === 2) return goals.length > 0;
    return true;
  }

  function handleNext() {
    if (step < 3) setStep(s => s + 1);
  }

  function handleBack() {
    if (step > 1) setStep(s => s - 1);
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--color-background, #f9fafb)' }}>

      {/* Header */}
      <header
        className="sticky top-0 z-10 border-b px-4 py-3 flex items-center justify-between"
        style={{ backgroundColor: 'rgba(255,255,255,0.92)', borderColor: 'rgba(17,24,39,0.08)', backdropFilter: 'blur(8px)' }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-60"
            style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Volver
          </button>
        </div>
        <p className="text-xs font-semibold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
          Business OS · Demo
        </p>
        <div className="w-16" />
      </header>

      {/* Contenido */}
      <main className="flex-1 flex flex-col items-center px-4 py-10">
        <div className="w-full max-w-xl">

          <ProgressBar step={step} />

          <div key={step} style={{ animation: 'fadeSlideIn 0.25s ease' }}>
            {step === 1 && (
              <StepBlueprint selected={blueprint} onSelect={handleSelectBlueprint} />
            )}
            {step === 2 && (
              <StepGoals blueprintSlug={blueprint} selected={goals} onToggle={handleToggleGoal} />
            )}
            {step === 3 && (
              <StepResult blueprintSlug={blueprint} goalSlugs={goals} />
            )}
          </div>

          {/* Navegación */}
          <div className="flex items-center justify-between mt-10 gap-4">
            {step > 1 ? (
              <button
                onClick={handleBack}
                className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all border"
                style={{
                  borderColor: 'rgba(17,24,39,0.12)',
                  color: 'var(--color-muted-foreground)',
                  backgroundColor: '#fff',
                  fontFamily: 'var(--font-body)',
                }}
              >
                Atrás
              </button>
            ) : (
              <div />
            )}

            {step < 3 ? (
              <button
                onClick={handleNext}
                disabled={!canAdvance()}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{
                  backgroundColor: canAdvance() ? 'var(--color-primary)' : 'rgba(17,24,39,0.10)',
                  color: canAdvance() ? '#fff' : 'rgba(17,24,39,0.30)',
                  fontFamily: 'var(--font-body)',
                  cursor: canAdvance() ? 'pointer' : 'not-allowed',
                }}
              >
                Continuar
              </button>
            ) : (
              <button
                onClick={() => navigate('/dashboard')}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold"
                style={{
                  backgroundColor: 'var(--color-primary)',
                  color: '#fff',
                  fontFamily: 'var(--font-body)',
                }}
              >
                Ir al Dashboard
              </button>
            )}
          </div>

        </div>
      </main>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
