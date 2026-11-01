// Verificación del perfil que usa la Star TSP100IIU (preset -> generic80):
// genera los bytes reales del renderer con logo y corte, y los deja en disco
// para validarlos con el validador del conector (validate --file).
import { describe, it, expect, vi } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildSaleReceipt } from './buildSaleReceipt';
import { renderEscPosReceipt } from './renderEscPosReceipt';
import { COMPATIBILITY_PROFILES, getPresetProfileIdForPrinter, getCompatibilityProfile } from './printerCompatibilityProfiles';

// Logo determinista: usa la estrategia de imagen real del perfil, sin red.
vi.mock('./fetchLogoRaster', async () => {
  const caps = await vi.importActual('./escPosCapabilities');
  return {
    fetchLogoRaster: async (_url, opts) => {
      const strategy = caps.getGraphicsStrategy(opts.graphicsStrategyId);
      const w = 16;
      const h = 16;
      const bits = new Uint8Array(w * h);
      for (let i = 0; i < bits.length; i += 3) bits[i] = 1;
      return { command: strategy.build(bits, w, h, 0), width: w, height: h, xDots: 0 };
    },
  };
});

const STAR = 'Star TSP100 Cutter (TSP143)';
const ESC = 0x1b;
const GS = 0x1d;

function containsSeq(bytes, seq) {
  for (let i = 0; i + seq.length <= bytes.length; i++) {
    if (seq.every((b, k) => bytes[i + k] === b)) return true;
  }
  return false;
}

async function renderFor(profileId) {
  const p = getCompatibilityProfile(profileId);
  const receipt = buildSaleReceipt({
    business: { name: 'Prueba', logoUrl: 'https://ejemplo.invalid/logo.png' },
    items: [
      { name: 'Producto largo de prueba', quantity: 2, unitPrice: 1500 },
      { name: 'Otro producto', quantity: 1, unitPrice: 1000 },
    ],
    total: 4000,
    printLogo: p.printLogo,
    imageMode: p.imageMode,
    cutStrategyId: p.cutStrategyId,
    autoCut: p.autoCut,
  });
  return renderEscPosReceipt(receipt);
}

describe('perfil de la Star (preset) genera logo y corte', () => {
  it('la Star se mapea al Recomendado (generic80)', () => {
    expect(getPresetProfileIdForPrinter(STAR)).toBe('generic80');
  });

  it('bytes con logo ESC * y corte GS V 66 0 al final, empiezan con ESC @', async () => {
    const bytes = Array.from(await renderFor(getPresetProfileIdForPrinter(STAR)));
    expect(bytes.slice(0, 2)).toEqual([ESC, 0x40]);
    expect(containsSeq(bytes, [ESC, 0x2a])).toBe(true); // ESC * (logo)
    expect(bytes.slice(-4)).toEqual([GS, 0x56, 0x42, 0x00]);
    expect(containsSeq(bytes, [GS, 0x76, 0x30])).toBe(false); // sin GS v 0
    expect(containsSeq(bytes, [ESC, 0x70])).toBe(false); // sin pulso de cajón
    // Escribe el ticket real para validarlo con el conector (validate --file).
    const out = process.env.HOTFIX_TICKET_OUT;
    if (out) {
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, Buffer.from(bytes));
    }
  });

  it('la XP-80C / perfil por defecto no cambia: mismos campos que Recomendado', () => {
    expect(COMPATIBILITY_PROFILES.generic80).toMatchObject({
      imageMode: 'bitImageEscStar', cutStrategyId: 'gs-v-modern', printLogo: true, autoCut: true,
    });
  });
});
