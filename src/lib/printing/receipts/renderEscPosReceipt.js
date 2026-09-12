// PRINT-1/PRINT-4 — capacidades genéricas de impresión ESC/POS (estándar,
// no de marca): alineación, negrita, doble tamaño, imagen raster, avance
// de papel y corte. No debe agregarse acá nada específico de un
// modelo/fabricante -- eso, si alguna vez hiciera falta, iría dentro de
// un provider concreto (ver providers/printerProvider.js), nunca en este
// renderer.
//
// PRINT-4 — este renderer pasa a ser DUEÑO de toda la presentación: además
// de los comandos ESC/POS, decide el ancho de columnas, el wrap de texto
// largo, el layout de la tabla de ítems y el formato de moneda. El
// builder (buildSaleReceipt.js) solo entrega datos semánticos crudos
// (números, strings sin formatear) -- ver el `type` de cada línea más
// abajo. Esto mantiene la regla de la arquitectura: "el builder define
// contenido, el renderer decide presentación".

import { formatMoney } from 'utils/formatMoney';
import { fetchLogoRaster } from './fetchLogoRaster';
import { buildRasterCommand, buildVerticalMarkerBits, buildGeometryTestBits } from './escPosImage';
import { GRAPHICS_STRATEGIES, CUT_STRATEGIES, getGraphicsStrategy } from './escPosCapabilities';
import { buildLayout } from './printerProfile';

const ESC = 0x1B;
const GS = 0x1D;
const LF = 0x0A;

// Comandos ESC/POS estándar, soportados por la enorme mayoría de
// impresoras térmicas compatibles (no solo Star/Epson).
const CMD = {
  INIT: [ESC, 0x40],           // ESC @   — reinicia la impresora
  ALIGN_LEFT: [ESC, 0x61, 0x00],   // ESC a 0
  ALIGN_CENTER: [ESC, 0x61, 0x01], // ESC a 1
  BOLD_ON: [ESC, 0x45, 0x01],  // ESC E 1
  BOLD_OFF: [ESC, 0x45, 0x00], // ESC E 0
  DOUBLE_ON: [GS, 0x21, 0x11],  // GS !  0x11 — doble ancho + doble alto
  DOUBLE_OFF: [GS, 0x21, 0x00], // GS !  0x00
  // PRINT-4-BUG (corte no funcionaba): la forma anterior [GS,0x56,0x00]
  // es el formato LEGACY de 1 byte "GS V m". La especificación ESC/POS
  // moderna (Epson, y la emulación ESC/POS de Star, que es la que reporta
  // el TSP100) usa la forma parametrizada de 2 bytes "GS V m n". Al
  // enviar solo 1 byte, buena parte de los firmwares se queda esperando
  // el segundo parámetro que nunca llega (es el último comando del
  // trabajo) y el corte simplemente nunca se ejecuta -- el resto del
  // ticket (texto) imprime bien porque no depende de ese segundo byte.
  // Se usa corte PARCIAL (m=66/'B') por preferencia explícita del
  // encargo: dispara el mecanismo de corte pero deja una fibra de papel
  // sin cortar, más tolerante en impresoras/cuchillas distintas que un
  // corte total. Es comando estándar Epson/ESC-POS, no específico de
  // Star/TSP100.
  CUT_PARTIAL: [GS, 0x56, 0x42, 0x00], // GS V 66 0 — corte parcial (forma moderna, 2 bytes de parámetro)
  CUT_FULL: [GS, 0x56, 0x41, 0x00],    // GS V 65 0 — corte total (forma moderna) -- no usado por defecto, queda disponible
};

// PRINT-4-BUG5 — `columnsForWidth` sigue existiendo (lo usan
// buildTestReceipt y los diagnósticos más abajo) pero ya no calcula nada
// por su cuenta: delega en buildLayout(), la ÚNICA fuente de verdad sobre
// anchos. Ninguna sección del renderer vuelve a derivar columnas/ancho de
// logo por su lado -- ver printerProfile.js para el objeto `layout`
// completo (normalCharsPerLine, doubleWidthCharsPerLine, logoMaxWidthDots).
export function columnsForWidth(paperWidthMm) {
  return buildLayout(paperWidthMm).normalCharsPerLine;
}

const LOGO_MAX_HEIGHT_DOTS = 200;

// Sin selección de codepage (fuera de alcance): cualquier carácter fuera
// de Latin-1 se reemplaza por '?' en vez de mandar bytes UTF-8 que la
// impresora interpretaría como basura.
function textBytes(text) {
  const bytes = [];
  const value = String(text ?? '');
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    bytes.push(code < 256 ? code : 0x3F);
  }
  bytes.push(LF);
  return bytes;
}

// Exportada para que ningún receipt builder duplique esta normalización.
export function stripDiacritics(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// PRINT-4-BUG4 — un monto es un token indivisible: "$25.000" nunca debe
// convertirse en "$25." + "000" solo porque una línea no alcanza. La
// prueba física mostró exactamente ese corte a mitad de camino cuando el
// ancho disponible (mal calculado, ver printerProfile.js) quedaba más
// angosto que el propio monto -- este detector evita que el camino
// genérico de corte-de-palabras-largas (más abajo) toque un monto.
const MONEY_TOKEN_PATTERN = /^-?\$-?[\d.,]+$/;

function isIndivisibleToken(word) {
  return MONEY_TOKEN_PATTERN.test(word);
}

// Wrap por palabras a `width` columnas. Nunca trunca una palabra normal
// más larga que `width` de forma impredecible -- se corta en pedazos de
// `width` (mejor que un desborde impredecible en la impresora) EXCEPTO
// si la palabra es un token indivisible (un monto, ver arriba): ese
// jamás se corta, aunque su línea quede más larga que `width` -- una
// línea larga es preferible a un monto ilegible. Texto vacío -> [''] para
// que el llamador siempre tenga al menos una línea que emitir.
export function wrapText(text, width) {
  const safeWidth = Math.max(1, width | 0);
  const value = String(text ?? '');
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines = [];
  let current = '';
  for (const word of words) {
    if (word.length > safeWidth) {
      if (current) {
        lines.push(current);
        current = '';
      }
      if (isIndivisibleToken(word)) {
        lines.push(word);
        continue;
      }
      let remaining = word;
      while (remaining.length > safeWidth) {
        lines.push(remaining.slice(0, safeWidth));
        remaining = remaining.slice(safeWidth);
      }
      current = remaining;
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > safeWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

// Arma una fila "etiqueta ..... valor" (valor alineado a la derecha). Si
// no cabe en una línea, la etiqueta se envuelve y el valor queda en su
// propia línea, también alineado a la derecha -- nunca se trunca ninguno
// de los dos lados.
export function formatRowLines(left, right, width) {
  const safeWidth = Math.max(1, width | 0);
  const leftText = String(left ?? '');
  const rightText = String(right ?? '');

  if (leftText.length + 1 + rightText.length <= safeWidth) {
    const padding = safeWidth - leftText.length - rightText.length;
    return [leftText + ' '.repeat(Math.max(1, padding)) + rightText];
  }

  const leftLines = wrapText(leftText, safeWidth);
  const rightLine = rightText.length < safeWidth
    ? ' '.repeat(safeWidth - rightText.length) + rightText
    : rightText;
  return [...leftLines, rightLine];
}

// Cantidad -> "2x" (unidades) o "1.5x" (peso/fracción) sin ceros de
// relleno -- ambos casos deben quedar legibles en el ticket.
function formatQuantity(qty) {
  const num = Number(qty);
  if (!Number.isFinite(num)) return `${qty ?? ''}x`;
  if (Number.isInteger(num)) return `${num}x`;
  return `${num.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}x`;
}

// PRINT-4-BUG4 — precio unitario y total de línea van SIEMPRE juntos en
// su propia fila (nunca compartida con el nombre del producto, que ya
// compite por espacio contra el total): "  $24.000 c/u    $24.000". Se
// intenta primero CON la indentación de dos espacios (más legible); si
// no entra en una sola línea, se reintenta SIN indentación para ganar
// esos caracteres antes de resignarse a partir en dos líneas -- nunca se
// parte el monto en ningún caso (formatRowLines ya lo garantiza).
function formatUnitPriceAndTotalLines(unitPriceStr, lineTotalStr, columns) {
  const indentedRows = formatRowLines(`  ${unitPriceStr} c/u`, lineTotalStr, columns);
  if (indentedRows.length === 1) return indentedRows;
  return formatRowLines(`${unitPriceStr} c/u`, lineTotalStr, columns);
}

// Línea(s) de un ítem del ticket: cabecera "Nx Producto" (envuelta si el
// nombre es largo, SOLA -- nunca comparte línea con el total) + fila de
// precio unitario/total + nota opcional -- todo esto es presentación
// pura, por eso vive en el renderer y no en buildSaleReceipt.
function formatItemLines(item, columns, defaultCurrency) {
  const currency = item.currency ?? defaultCurrency;
  const qtyStr = formatQuantity(item.qty);
  const name = stripDiacritics(item.name || '');
  const unitPriceStr = formatMoney(item.unitPrice, currency);
  const lineTotalStr = formatMoney(item.lineTotal, currency);
  const header = `${qtyStr} ${name}`.trim();

  const lines = [...wrapText(header, columns)];
  lines.push(...formatUnitPriceAndTotalLines(unitPriceStr, lineTotalStr, columns));
  if (item.note) lines.push(...wrapText(`  ${stripDiacritics(item.note)}`, columns));
  return lines;
}

/**
 * @typedef {Object} ReceiptLine
 * @property {'text'|'divider'|'row'|'itemsHeader'|'item'|'total'|'logo'} [type='text']
 */
/**
 * @typedef {Object} Receipt
 * @property {ReceiptLine[]} lines
 * @property {number} [feedLines]
 * @property {boolean} [cut]
 * @property {number} [paperWidthMm]
 * @property {string} [currency]
 */

/**
 * Receipt -> comandos ESC/POS crudos, listos para PrinterProvider.print().
 * Async porque el logo (type: 'logo') requiere cargar/rasterizar una
 * imagen (fetch + canvas) -- si eso falla o no hay logo, simplemente no
 * se emite esa línea y el resto del ticket imprime normal.
 */
export async function renderEscPosReceipt(receipt) {
  const paperWidthMm = receipt?.paperWidthMm || 80;
  // PRINT-4-BUG5 — único cálculo de layout de todo el render. Cada
  // sección de más abajo (texto, ítems, TOTAL en doble ancho, logo,
  // separador) lee de este mismo objeto -- ninguna vuelve a calcular su
  // propio ancho. `columns` es un alias de `layout.normalCharsPerLine`
  // para no reescribir cada uso más abajo.
  const layout = buildLayout(paperWidthMm);
  const columns = layout.normalCharsPerLine;
  const currency = receipt?.currency;
  const bytes = [...CMD.INIT];

  const emit = (text, { align, bold, double } = {}) => {
    bytes.push(...(align === 'center' ? CMD.ALIGN_CENTER : CMD.ALIGN_LEFT));
    if (bold) bytes.push(...CMD.BOLD_ON);
    if (double) bytes.push(...CMD.DOUBLE_ON);
    bytes.push(...textBytes(text));
    if (double) bytes.push(...CMD.DOUBLE_OFF);
    if (bold) bytes.push(...CMD.BOLD_OFF);
  };

  const emitWrapped = (text, opts = {}) => {
    const width = opts.double ? layout.doubleWidthCharsPerLine : columns;
    for (const wrapped of wrapText(text, width)) emit(wrapped, opts);
  };

  for (const line of receipt?.lines || []) {
    const type = line?.type || 'text';
    switch (type) {
      case 'logo': {
        const maxWidthDots = layout.logoMaxWidthDots;
        // PRINT-4-BUG3: `imageMode` es un id de estrategia genérico (ver
        // escPosCapabilities.js) que buildSaleReceipt/printerConfigStorage
        // pasan tal cual -- este renderer no sabe ni le importa qué
        // impresora hay detrás. Sin imageMode, fetchLogoRaster cae al
        // default (la variante confirmada físicamente).
        // PRINT-4-BUG6: el logo seguía cortándose en la prueba física de
        // BUG5 pese a que el ancho lógico ya era conservador -- la causa
        // más probable es la centrada vía `ESC a 1` (ALIGN_CENTER),
        // que confía en que la impresora recentre cada franja de `ESC *`
        // de forma idéntica. Se reemplaza por un margen izquierdo
        // EXPLÍCITO (`layout.logoLeftMarginDots`) horneado directamente
        // en el bitmap (ver fetchLogoRaster.js/escPosImage.js#padBitsLeft)
        // y se imprime en ALIGN_LEFT: la posición horizontal ya no
        // depende de ningún estado de alineación de la impresora.
        // eslint-disable-next-line no-await-in-loop -- el orden de impresión importa, no se puede paralelizar
        const raster = await fetchLogoRaster(line.url, {
          maxWidthDots,
          maxHeightDots: LOGO_MAX_HEIGHT_DOTS,
          graphicsStrategyId: receipt?.imageMode,
          leftMarginDots: layout.logoLeftMarginDots,
        });
        if (raster?.command?.length) {
          bytes.push(...CMD.ALIGN_LEFT);
          bytes.push(...raster.command);
          bytes.push(LF);
        }
        break;
      }
      // PRINT-4-BUG1/BUG2: comando de imagen ya construido (sin pasar por
      // fetchLogoRaster/canvas) -- centrado, igual que un logo real. Lo usan
      // los diagnósticos de compatibilidad para poder aislar, en una
      // impresión física, si el problema está en el comando de gráficos en
      // sí (esta línea) o en la carga/rasterización de una imagen real
      // (type: 'logo'). Command-agnóstico: sirve tanto para GS v 0 como
      // para cualquier otra variante (ver escPosCapabilities.js).
      case 'rasterBytes':
        if (line.command?.length) {
          bytes.push(...CMD.ALIGN_CENTER);
          bytes.push(...line.command);
          bytes.push(LF);
        }
        break;
      // PRINT-4-BUG2: bytes ESC/POS crudos, sin alineación ni salto de
      // línea implícito -- usado por el diagnóstico de corte para inyectar
      // una variante de comando de corte en un punto exacto del ticket.
      case 'raw':
        if (line.bytes?.length) bytes.push(...line.bytes);
        break;
      case 'divider':
        emit('-'.repeat(columns));
        break;
      case 'row': {
        const rightText = line.amount != null ? formatMoney(line.amount, line.currency ?? currency) : (line.right ?? '');
        for (const rowLine of formatRowLines(line.left, rightText, columns)) {
          emit(rowLine, { bold: line.bold });
        }
        break;
      }
      case 'itemsHeader':
        emit(formatRowLines('CANT/PRODUCTO', 'TOTAL', columns)[0], { bold: true });
        break;
      case 'item':
        for (const itemLine of formatItemLines(line, columns, currency)) emit(itemLine);
        break;
      case 'total': {
        // PRINT-4-BUG4/BUG5 — el doble tamaño reduce a la mitad los
        // caracteres por línea; el padding SIEMPRE se calcula con
        // `layout.doubleWidthCharsPerLine` (ya calculado UNA sola vez al
        // tope de esta función a partir de `normalCharsPerLine`), nunca
        // con `columns` completo y activando el doble tamaño después (eso
        // fue justo lo que produjo, en la prueba física, "$25." en una
        // línea y "000" en la siguiente -- la impresora desbordaba el
        // ancho real en modo doble). Si etiqueta+monto no caben en una
        // sola línea a ese ancho, formatRowLines ya resuelve el layout
        // seguro (etiqueta en su propia línea, monto completo alineado a
        // la derecha en la siguiente) -- se emite igual en doble tamaño,
        // nunca se abandona el énfasis ni se divide el monto.
        const amountStr = formatMoney(line.amount, line.currency ?? currency);
        if (line.emphasize) {
          for (const rowLine of formatRowLines(line.label, amountStr, layout.doubleWidthCharsPerLine)) {
            emit(rowLine, { bold: true, double: true });
          }
          break;
        }
        for (const rowLine of formatRowLines(line.label, amountStr, columns)) {
          emit(rowLine, { bold: true });
        }
        break;
      }
      case 'text':
      default:
        emitWrapped(line.text, { align: line.align, bold: line.bold, double: line.double });
        break;
    }
  }

  const feedLines = Number.isFinite(receipt?.feedLines) ? receipt.feedLines : 3;
  for (let i = 0; i < feedLines; i++) bytes.push(LF);
  if (receipt?.cut !== false) bytes.push(...CMD.CUT_PARTIAL);
  return new Uint8Array(bytes);
}

/** Arma el Receipt (datos planos, sin ESC/POS) del ticket de prueba de PRINT-1. */
export function buildTestReceipt({ businessName = 'Walinka', printerName = '', paperWidthMm = 80 } = {}) {
  const columns = columnsForWidth(paperWidthMm);
  const divider = { text: '-'.repeat(columns) };
  const now = new Date();
  const fecha = now.toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return {
    paperWidthMm,
    lines: [
      { text: stripDiacritics(businessName).toUpperCase() || 'WALINKA', align: 'center', bold: true, double: true },
      { text: 'Ticket de prueba', align: 'center' },
      divider,
      { text: `Impresora: ${printerName || 'no seleccionada'}` },
      { text: `Ancho: ${paperWidthMm} mm` },
      { text: `Fecha: ${fecha}` },
      divider,
      { text: 'Este ticket confirma que la' },
      { text: 'conexion con tu impresora' },
      { text: 'termica esta funcionando.' },
      divider,
      { text: 'Todo listo!', align: 'center', bold: true },
    ],
    feedLines: 4,
    cut: true,
  };
}

// PRINT-4-BUG1: bitmap fijo de diagnóstico (tablero de 8x8, sin depender
// de ninguna imagen real) para poder aislar en una impresión física si el
// comando GS v 0 en sí es compatible con la impresora, separado de
// cualquier problema de carga/rasterización de un logo real.
function buildCheckerboardBits(size) {
  const bits = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) bits[y * size + x] = (x + y) % 2;
  }
  return bits;
}

/**
 * Arma el Receipt de diagnóstico de PRINT-4-BUG1: texto ASCII conocido +
 * un raster mínimo (tablero de 8x8) generado en el momento -- no requiere
 * red ni un logo real. Sirve para la prueba física de dos pasos que pide
 * el bug: (A) solo texto -- ver buildTestReceipt -- y (B) texto + este
 * raster, para aislar si el fallo está en el comando de imagen en sí.
 */
export function buildRasterDiagnosticReceipt({ paperWidthMm = 80 } = {}) {
  const bits = buildCheckerboardBits(8);
  const command = buildRasterCommand(bits, 8, 8);
  return {
    paperWidthMm,
    lines: [
      { text: 'TEST WALINKA', align: 'center', bold: true },
      { text: 'Prueba de imagen (diagnostico)', align: 'center' },
      { type: 'divider' },
      { type: 'rasterBytes', command },
      { type: 'divider' },
      { text: 'Fin de la prueba de imagen', align: 'center' },
    ],
    feedLines: 4,
    cut: true,
  };
}

/**
 * PRINT-4-BUG2 — diagnóstico A/B de comandos de GRÁFICOS: imprime el
 * mismo patrón de 8x8 con dos comandos ESC/POS estándar distintos (ver
 * escPosCapabilities.js), cada uno con texto identificador antes/después,
 * para poder confirmar en una impresión física cuál interpreta realmente
 * la impresora -- sin generar ninguna venta ni tocar el flujo de cobro.
 * No pide corte (cut: false): el diagnóstico de corte es un ticket
 * separado (ver buildCutCapabilityDiagnosticReceipt) para no mezclar
 * variables.
 */
export function buildImageCapabilityDiagnosticReceipt({ paperWidthMm = 80 } = {}) {
  const bits = buildCheckerboardBits(8);
  return {
    paperWidthMm,
    lines: [
      { text: 'DIAGNOSTICO DE IMAGEN', align: 'center', bold: true },
      { type: 'divider' },
      { text: `Antes de Imagen A (${GRAPHICS_STRATEGIES.rasterGsV0.label})` },
      { type: 'rasterBytes', command: GRAPHICS_STRATEGIES.rasterGsV0.build(bits, 8, 8) },
      { text: 'Despues de Imagen A' },
      { type: 'divider' },
      { text: `Antes de Imagen B (${GRAPHICS_STRATEGIES.bitImageEscStar.label})` },
      { type: 'rasterBytes', command: GRAPHICS_STRATEGIES.bitImageEscStar.build(bits, 8, 8) },
      { text: 'Despues de Imagen B' },
      { type: 'divider' },
      { text: 'FIN DIAGNOSTICO DE IMAGEN', align: 'center', bold: true },
    ],
    feedLines: 4,
    cut: false,
  };
}

/**
 * PRINT-4-BUG2 — diagnóstico A/B de comandos de CORTE: inyecta dos
 * variantes de corte estándar ESC/POS distintas (ver
 * escPosCapabilities.js) en puntos identificados del ticket con texto
 * antes/después de cada una. Si una variante corta, el papel queda
 * físicamente separado en ese punto -- la señal es visible sin ambigüedad.
 * No agrega un corte final propio (cut: false): las dos líneas `raw` SON
 * las pruebas.
 */
export function buildCutCapabilityDiagnosticReceipt({ paperWidthMm = 80 } = {}) {
  return {
    paperWidthMm,
    lines: [
      { text: 'DIAGNOSTICO DE CORTE', align: 'center', bold: true },
      { type: 'divider' },
      { text: `Antes de Corte A (${CUT_STRATEGIES.partialFunctionB.label})` },
      { type: 'raw', bytes: CUT_STRATEGIES.partialFunctionB.bytes },
      { text: 'Despues de Corte A' },
      { type: 'divider' },
      { text: `Antes de Corte B (${CUT_STRATEGIES.partialFunctionALegacy.label})` },
      { type: 'raw', bytes: CUT_STRATEGIES.partialFunctionALegacy.bytes },
      { text: 'Despues de Corte B' },
      { type: 'divider' },
      { text: 'FIN DIAGNOSTICO DE CORTE', align: 'center', bold: true },
    ],
    feedLines: 4,
    cut: false,
  };
}

const LOGO_DIAGNOSTIC_MARKER_HEIGHT_DOTS = 48; // ~6mm a 203dpi -- visible sin depender del alto real del logo
const LOGO_DIAGNOSTIC_MARKER_THICKNESS_DOTS = 4;

/**
 * PRINT-4-BUG6 — diagnóstico EXCLUSIVO de logo: imprime una marca vertical
 * en el margen IZQUIERDO esperado (`layout.safeMarginDots`), el logo real
 * del negocio (mismo camino de producción que un ticket real -- `type:
 * 'logo'`, mismo `layout`, mismo `fetchLogoRaster`/`padBitsLeft`) y una
 * marca vertical en el margen DERECHO esperado
 * (`printableWidthDots - safeMarginDots`). Permite confirmar en una
 * impresión física si el logo queda dentro de esas dos marcas, si se pasa
 * del área segura, y si el offset horizontal se mantiene constante entre
 * las franjas de 8 dots de `ESC *` (las marcas y el logo comparten la
 * MISMA franja física, así que cualquier deriva sería visible como
 * desalineación entre ellos). No genera ninguna venta ni toca el flujo de
 * cobro -- receipt sintético, igual que el resto de los diagnósticos de
 * PRINT-4.
 */
export function buildLogoPositionDiagnosticReceipt({ business, paperWidthMm = 80, imageMode } = {}) {
  const layout = buildLayout(paperWidthMm);
  const strategy = getGraphicsStrategy(imageMode);
  const leftMarkerBits = buildVerticalMarkerBits(
    layout.printableWidthDots, layout.safeMarginDots, LOGO_DIAGNOSTIC_MARKER_HEIGHT_DOTS, LOGO_DIAGNOSTIC_MARKER_THICKNESS_DOTS,
  );
  const rightMarkerBits = buildVerticalMarkerBits(
    layout.printableWidthDots,
    layout.printableWidthDots - layout.safeMarginDots - LOGO_DIAGNOSTIC_MARKER_THICKNESS_DOTS,
    LOGO_DIAGNOSTIC_MARKER_HEIGHT_DOTS,
    LOGO_DIAGNOSTIC_MARKER_THICKNESS_DOTS,
  );

  const lines = [
    { text: 'DIAGNOSTICO DE LOGO', align: 'center', bold: true },
    { type: 'divider' },
    { text: 'Marca de margen IZQUIERDO esperado:' },
    { type: 'rasterBytes', command: strategy.build(leftMarkerBits, layout.printableWidthDots, LOGO_DIAGNOSTIC_MARKER_HEIGHT_DOTS) },
    { type: 'divider' },
  ];
  if (business?.logoUrl) {
    lines.push({ text: 'Logo real del negocio (debe quedar completo, sin tocar ninguna marca):' });
    lines.push({ type: 'logo', url: business.logoUrl });
  } else {
    lines.push({ text: 'Este negocio no tiene logo configurado (business.logoUrl vacio) -- solo se ven las marcas de margen.' });
  }
  lines.push({ type: 'divider' });
  lines.push({ text: 'Marca de margen DERECHO esperado:' });
  lines.push({ type: 'rasterBytes', command: strategy.build(rightMarkerBits, layout.printableWidthDots, LOGO_DIAGNOSTIC_MARKER_HEIGHT_DOTS) });
  lines.push({ type: 'divider' });
  lines.push({ text: 'FIN DIAGNOSTICO DE LOGO', align: 'center', bold: true });

  return {
    paperWidthMm,
    imageMode,
    lines,
    feedLines: 4,
    cut: true,
  };
}

const GEOMETRY_TEST_BLOCK_WIDTH_DOTS = 60; // ~7.5mm a 203dpi -- visible, con margen de sobra a ambos lados
const GEOMETRY_TEST_BLOCK_HEIGHT_DOTS = 40; // 5 franjas de 8 dots
const GEOMETRY_TEST_MARK_THICKNESS_DOTS = 8;

/**
 * PRINT-4-BUG8 — BUG7 (fragmentar `ESC *` en bloques <=255 columnas) NO
 * resolvió el corrimiento físico reportado: el logo real sigue apareciendo
 * corrido al extremo derecho pese a la reducción de ancho, el margen
 * horneado en el bitmap, el abandono de `ESC a 1` y la fragmentación en
 * bloques. Se agotó lo que se puede corregir por análisis de código o
 * tests -- hace falta una prueba física que revele, SIN NINGUNA suposición
 * sobre el firmware, dónde aparece realmente un bitmap enviado por la
 * MISMA ruta `ESC *` que usa el logo (`buildTiledColumnBitImageCommand`,
 * vía `getGraphicsStrategy`/`escPosCapabilities` -- ningún código nuevo).
 *
 * Imprime tres imágenes independientes, cada una del ancho físico
 * completo (`layout.printableWidthDots`, que a 80mm ya excede 255 dots y
 * por lo tanto ejercita la misma fragmentación en bloques de BUG7) y cada
 * una con:
 *   - una marca de `GEOMETRY_TEST_MARK_THICKNESS_DOTS` en la columna 0
 *     (el origen físico teórico del comando);
 *   - una marca igual en la última columna (el borde físico teórico);
 *   - UN bloque negro de prueba en una posición teórica distinta por
 *     imagen: alineado a la izquierda (offset 0), centrado matemáticamente
 *     ((printableWidthDots-ancho)/2), y alineado a la derecha
 *     (printableWidthDots-ancho).
 *
 * Si el bloque "izquierda" no aparece pegado a la marca de columna 0, el
 * problema es más fundamental que `logoLeftMarginDots` (el propio origen
 * de coordenadas del comando no es lo que se asume, y hace falta
 * posicionamiento horizontal explícito -- p. ej. `ESC $ nL nH` -- en vez
 * de un margen horneado en píxeles). Si "derecha" muestra una
 * discontinuidad justo en el borde entre los bloques de 255 columnas de
 * BUG7, confirma que esos bloques NO se están concatenando horizontalmente
 * en esta emulación. No genera ninguna venta ni toca el flujo de cobro.
 */
export function buildLogoGeometryDiagnosticReceipt({ paperWidthMm = 80, imageMode } = {}) {
  const layout = buildLayout(paperWidthMm);
  const strategy = getGraphicsStrategy(imageMode);
  const width = layout.printableWidthDots;
  const blockWidth = Math.min(GEOMETRY_TEST_BLOCK_WIDTH_DOTS, Math.max(1, width - 2 * GEOMETRY_TEST_MARK_THICKNESS_DOTS));

  const positions = [
    { label: 'IZQUIERDA', left: 0 },
    { label: 'CENTRO MATEMATICO', left: Math.floor((width - blockWidth) / 2) },
    { label: 'DERECHA', left: width - blockWidth },
  ];

  const lines = [
    { text: 'DIAGNOSTICO DE GEOMETRIA (ESC *)', align: 'center', bold: true },
    { type: 'divider' },
    { text: `Ancho de referencia: ${width} dots. Cada bloque negro debe verse EXACTAMENTE en la posicion indicada, entre la marca de columna 0 y la marca de la ultima columna.` },
    { type: 'divider' },
  ];
  for (const { label, left } of positions) {
    const bits = buildGeometryTestBits(width, left, blockWidth, GEOMETRY_TEST_BLOCK_HEIGHT_DOTS, GEOMETRY_TEST_MARK_THICKNESS_DOTS);
    lines.push({ text: `Bloque ${label} (offset teorico: ${left} dots):` });
    lines.push({ type: 'rasterBytes', command: strategy.build(bits, width, GEOMETRY_TEST_BLOCK_HEIGHT_DOTS) });
    lines.push({ type: 'divider' });
  }
  lines.push({ text: 'FIN DIAGNOSTICO DE GEOMETRIA', align: 'center', bold: true });

  return {
    paperWidthMm,
    imageMode,
    lines,
    feedLines: 4,
    cut: true,
  };
}
