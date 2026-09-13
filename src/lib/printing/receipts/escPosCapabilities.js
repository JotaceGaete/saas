// PRINT-4-BUG2 — subconjunto de comandos ESC/POS candidatos para
// gráficos y corte, expuestos como "estrategias" con nombre.
//
// Contexto: la prueba física del bug reportó que, en el hardware de
// validación (Star TSP100/TSP143 en modo ESC/POS), el texto imprime
// perfecto pero el raster `GS v 0` se imprime como texto literal
// ("v0...") y el corte `GS V 66 0` no se ejecuta. La investigación (ver
// informe del bug) apunta a que la impresora/driver puede estar
// enrutando el trabajo por el parser de "Star Line Mode" en vez de
// "ESC/POS emulation" para comandos binarios que no son texto plano
// (Star exige marcar explícitamente "Enable ESC/POS Routing" en su
// utilidad de configuración de Windows; si no, su propia documentación
// advierte que "algunas aplicaciones pueden usar el parseo de Star Line
// Mode, resultando en impresión corrupta" -- exactamente el síntoma
// observado). Aun así, no se puede asumir cuál combinación funciona sin
// una prueba física.
//
// NINGUNA definición de acá es específica de Star ni de ningún otro
// fabricante: son variantes ESTÁNDAR de la propia especificación
// ESC/POS (Epson), documentadas desde los primeros modelos de matriz de
// puntos -- ver escPosImage.js para la implementación pura de cada una.
// Esta capa existe para que, una vez que el diagnóstico físico confirme
// qué variante interpreta el hardware validado, renderEscPosReceipt (o
// una futura configuración por impresora) pueda elegir la estrategia
// correcta sin que buildSaleReceipt ni CrmTerminal necesiten saber nada
// de impresoras concretas.

import { buildRasterCommand, buildTiledColumnBitImageCommand } from './escPosImage';

export const GRAPHICS_STRATEGIES = {
  rasterGsV0: {
    id: 'rasterGsV0',
    label: 'GS v 0 (raster estandar, por filas)',
    build: buildRasterCommand,
  },
  bitImageEscStar: {
    id: 'bitImageEscStar',
    // "ESC *" -- pese al nombre de la variable, es un comando Epson
    // genérico de la especificación ESC/POS original (bit image por
    // columnas, en franjas de 8 dots -- ver
    // buildTiledColumnBitImageCommand), no una extensión propietaria de
    // Star.
    label: 'ESC * (bit image por columnas, franjas de 8 dots)',
    build: buildTiledColumnBitImageCommand,
  },
  // PRINT-5 — estrategia "sin imagen": para una impresora que no
  // interpreta bien ningún comando de gráficos (perfil `textOnly80`), no
  // hay ninguna variante de imagen que probar -- build() nunca se llama en
  // la práctica (fetchLogoRaster.js corta antes de cargar/rasterizar nada
  // cuando la estrategia resuelta es esta), pero se deja como comando
  // vacío real (no `null`/`undefined`) para que cualquier código que sí
  // llegue a invocarla se comporte como "no imprimir nada", nunca lance.
  none: {
    id: 'none',
    label: 'Sin imagen (solo texto)',
    build: () => new Uint8Array(0),
  },
};

// PRINT-4-BUG3 — confirmado físicamente (hardware de validación: Star
// TSP100 Cutter / TSP143, 80mm): `GS v 0` se imprime como texto literal,
// `ESC *` imprime el patrón correctamente. Por eso `bitImageEscStar` pasa
// a ser el default -- `rasterGsV0` NO se elimina, queda disponible para
// perfiles de otras impresoras que sí lo soporten (Walinka no está
// atada a este hardware).
export const DEFAULT_GRAPHICS_STRATEGY_ID = 'bitImageEscStar';

export function getGraphicsStrategy(id) {
  return GRAPHICS_STRATEGIES[id] || GRAPHICS_STRATEGIES[DEFAULT_GRAPHICS_STRATEGY_ID];
}

// PRINT-5 — ids renombrados de `partialFunctionB`/`partialFunctionALegacy`
// a `gs-v-modern`/`gs-v-legacy`: mismos bytes YA validados físicamente
// (PRINT-4), solo un nombre más descriptivo para la capa de
// perfiles/compatibilidad (ver printerCompatibilityProfiles.js) -- ningún
// comando cambia.
export const CUT_STRATEGIES = {
  'gs-v-modern': {
    id: 'gs-v-modern',
    label: 'GS V 66 0 (Funcion B moderna, parcial, 2 bytes de parametro)',
    bytes: [0x1D, 0x56, 0x42, 0x00],
  },
  'gs-v-legacy': {
    id: 'gs-v-legacy',
    label: 'GS V 1 (Funcion A legacy, parcial, 1 byte)',
    bytes: [0x1D, 0x56, 0x01],
  },
  // PRINT-5 — "sin corte": para una impresora cuya cuchilla no responde a
  // ninguna variante de `GS V`, o simplemente para dejar que el cajero
  // corte manualmente. Distinto del flag `autoCut`/`receipt.cut` (que
  // decide SI se intenta cortar): esta es una estrategia más, seleccionable
  // igual que las otras, que produce cero bytes de corte.
  none: {
    id: 'none',
    label: 'Sin corte (no se envia ningun comando)',
    bytes: [],
  },
};

// PRINT-5 — default histórico: el único comando de corte que este
// renderer emitía antes de esta capa de perfiles (`CMD.CUT_PARTIAL` en
// renderEscPosReceipt.js) era exactamente `gs-v-modern`. Cualquier
// receipt/config sin `cutStrategyId` explícito debe seguir produciendo
// bytes IDÉNTICOS a los ya validados físicamente.
export const DEFAULT_CUT_STRATEGY_ID = 'gs-v-modern';

export function getCutStrategy(id) {
  return CUT_STRATEGIES[id] || CUT_STRATEGIES[DEFAULT_CUT_STRATEGY_ID];
}
