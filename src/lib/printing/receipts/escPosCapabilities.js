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

export const CUT_STRATEGIES = {
  partialFunctionB: {
    id: 'partialFunctionB',
    label: 'GS V 66 0 (Funcion B moderna, parcial, 2 bytes de parametro)',
    bytes: [0x1D, 0x56, 0x42, 0x00],
  },
  partialFunctionALegacy: {
    id: 'partialFunctionALegacy',
    label: 'GS V 1 (Funcion A legacy, parcial, 1 byte)',
    bytes: [0x1D, 0x56, 0x01],
  },
};
