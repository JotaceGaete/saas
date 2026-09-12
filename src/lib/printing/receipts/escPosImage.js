// PRINT-4 — capacidades genéricas de imagen ESC/POS (comando raster
// estándar GS v 0, no específico de marca/modelo). Todo acá es JS puro
// sobre arrays de píxeles ya decodificados -- ninguna función de este
// archivo toca `Image`/`canvas`/`fetch` (eso vive en fetchLogoRaster.js,
// la única pieza que necesita el navegador de verdad). Por eso todo esto
// es testeable con datos fijos, sin mockear el DOM.

const GS = 0x1D;

/**
 * RGBA (Uint8ClampedArray de un canvas, 4 bytes/píxel) -> escala de
 * grises (1 byte/píxel, 0-255). Los píxeles con transparencia se
 * mezclan sobre blanco -- el papel térmico es blanco, así que un logo
 * PNG con fondo transparente debe imprimirse como si tuviera fondo
 * blanco, no negro.
 */
export function rgbaToGrayscale(rgba, width, height) {
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const a = rgba[i * 4 + 3];
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    gray[i] = (luminance * a + 255 * (255 - a)) / 255;
  }
  return gray;
}

/**
 * Dithering Floyd–Steinberg: escala de grises -> 1 bit/píxel (1 = negro
 * imprime, 0 = blanco no imprime). Da mucha mejor calidad visual que un
 * umbral plano para logos con degradados/antialiasing -- es el mismo
 * algoritmo que usan la mayoría de las librerías ESC/POS de imagen.
 */
export function ditherFloydSteinberg(grayscale, width, height) {
  const buffer = Float32Array.from(grayscale);
  const bits = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const oldValue = buffer[idx];
      const newValue = oldValue < 128 ? 0 : 255;
      bits[idx] = newValue === 0 ? 1 : 0;
      const error = oldValue - newValue;
      if (x + 1 < width) buffer[idx + 1] += (error * 7) / 16;
      if (y + 1 < height) {
        if (x > 0) buffer[idx + width - 1] += (error * 3) / 16;
        buffer[idx + width] += (error * 5) / 16;
        if (x + 1 < width) buffer[idx + width + 1] += (error * 1) / 16;
      }
    }
  }
  return bits;
}

const ESC = 0x1B;

/**
 * Bits monocromos (1=negro) -> comando ESC/POS `GS v 0` (raster bit
 * image), formato estándar soportado por la enorme mayoría de
 * impresoras térmicas ESC/POS -- no solo Star/Epson.
 * `GS v 0 m xL xH yL yH d1..dk`, m=0 (normal), xL/xH = ancho en BYTES
 * (no píxeles), yL/yH = alto en píxeles, d = bitmap MSB-first.
 *
 * PRINT-4-BUG10 — `xDots` (opcional) antepone `ESC $ xDots` (posición
 * absoluta, ver buildAbsolutePositionCommand) antes del comando raster,
 * para el mismo mecanismo de posicionamiento explícito validado
 * físicamente para `ESC *` -- sin este parámetro, comportamiento
 * IDÉNTICO al de siempre (compatibilidad total con callers existentes).
 */
export function buildRasterCommand(bits, width, height, xDots) {
  const bytesPerRow = Math.ceil(width / 8);
  const data = new Uint8Array(bytesPerRow * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (bits[y * width + x]) {
        data[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  const header = [
    GS, 0x76, 0x30, 0x00,
    bytesPerRow & 0xFF, (bytesPerRow >> 8) & 0xFF,
    height & 0xFF, (height >> 8) & 0xFF,
  ];
  const position = Number.isFinite(xDots) ? buildAbsolutePositionCommand(xDots) : [];
  return new Uint8Array([...position, ...header, ...data]);
}

/**
 * PRINT-4-BUG2 — alternativa ESC/POS ESTÁNDAR al raster `GS v 0`: el bit
 * image por columnas `ESC * m nL nH d1..dk` (comando Epson genérico de la
 * especificación ESC/POS original, no una extensión de ningún
 * fabricante). Se usa cuando `GS v 0` no es interpretado por una
 * emulación/firmware dada -- ver escPosCapabilities.js. Bits monocromos
 * (1=negro), un byte VERTICAL de 8 dots por columna (modo m=0, "8-dot
 * single density"), MSB = dot superior. Solo soporta alturas de hasta 8
 * dots: alcanza para el diagnóstico físico; el modo de 24 dots (varias
 * bandas apiladas) no se implementa porque no hace falta todavía.
 */
export function buildColumnBitImageCommand(bits, width, height) {
  if (height > 8) {
    throw new Error('buildColumnBitImageCommand solo soporta alturas de hasta 8 dots (modo de 8-dot single density)');
  }
  const data = new Uint8Array(width);
  for (let x = 0; x < width; x++) {
    let column = 0;
    for (let y = 0; y < height; y++) {
      if (bits[y * width + x]) column |= 0x80 >> y;
    }
    data[x] = column;
  }
  const header = [ESC, 0x2A, 0x00, width & 0xFF, (width >> 8) & 0xFF];
  return new Uint8Array([...header, ...data]);
}

/**
 * PRINT-4-BUG6 — diagnóstico exclusivo de logo: una franja vertical
 * sólida de `thicknessDots` de ancho en la columna `markColumnDots`, del
 * mismo ancho total (`totalWidthDots`) que se le pasaría a la estrategia
 * de gráficos real -- sirve para marcar físicamente dónde debería caer
 * el margen izquierdo/derecho esperado, independiente del logo real del
 * negocio (que puede no estar configurado, o tener cualquier forma).
 */
export function buildVerticalMarkerBits(totalWidthDots, markColumnDots, heightDots, thicknessDots = 4) {
  const width = Math.max(1, totalWidthDots | 0);
  const height = Math.max(1, heightDots | 0);
  const thickness = Math.max(1, thicknessDots | 0);
  const start = Math.max(0, Math.min(width - 1, markColumnDots | 0));
  const end = Math.min(width, start + thickness);
  const bits = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = start; x < end; x++) bits[y * width + x] = 1;
  }
  return bits;
}

/**
 * PRINT-4-BUG8 — BUG7 (fragmentar `ESC *` en bloques <=255 columnas) NO
 * resolvió el corrimiento físico reportado: el logo real sigue apareciendo
 * corrido al extremo derecho. En vez de seguir ajustando por teoría, este
 * bitmap arma, en UNA sola imagen del ancho físico completo
 * (`totalWidthDots`), una marca en la columna 0 (el origen teórico), una
 * marca en la última columna (el borde teórico) y un bloque negro de
 * prueba en `blockLeftDots` -- así una prueba física puede leer
 * directamente, sin ninguna suposición sobre el firmware, dónde aparece
 * realmente cada posición. Reutiliza la MISMA ruta de construcción de
 * bits que cualquier otro diagnóstico/logo -- nada de esto depende de
 * ninguna lógica de centrado, es geometría absoluta. (PRINT-4-BUG10: el
 * padding horneado en píxeles que este diagnóstico terminó descartando
 * ya no existe en este archivo -- ver buildAbsolutePositionCommand.)
 */
export function buildGeometryTestBits(totalWidthDots, blockLeftDots, blockWidthDots, heightDots, markThicknessDots = 8) {
  const width = Math.max(1, totalWidthDots | 0);
  const height = Math.max(1, heightDots | 0);
  const markThickness = Math.max(1, Math.min(width, markThicknessDots | 0));
  const blockWidth = Math.max(1, blockWidthDots | 0);
  const blockLeft = Math.max(0, Math.min(width - 1, blockLeftDots | 0));
  const blockRight = Math.min(width, blockLeft + blockWidth);
  const bits = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < markThickness; x++) bits[row + x] = 1; // marca IZQUIERDA: columna 0..markThickness
    for (let x = Math.max(0, width - markThickness); x < width; x++) bits[row + x] = 1; // marca DERECHA: última(s) columna(s)
    for (let x = blockLeft; x < blockRight; x++) bits[row + x] = 1; // bloque de prueba en la posición a verificar
  }
  return bits;
}

const LF = 0x0A;
const BAND_HEIGHT_DOTS = 8;

// PRINT-4-BUG7 — el logo real (incluso ya achicado a 70% de
// contentWidthDots en BUG6, más el margen izquierdo horneado) mide
// TÍPICAMENTE bastante más de 255 dots de ancho a 80mm. `ESC * m nL nH`
// codifica ese ancho en DOS bytes (nL + 256*nH) según la especificación
// Epson original -- buildColumnBitImageCommand ya arma esos dos bytes
// correctamente -- pero el patrón de falla físico reportado (logo
// recortado y "deformado" hacia la derecha, consistente en TODAS las
// pruebas con el logo real, mientras que los patrones de diagnóstico de
// 8x8 -- muy por debajo de 255 -- siempre imprimieron bien) es exactamente
// lo que se ve cuando una emulación ESC/POS solo confía en el byte bajo
// (nL) del ancho e ignora o trunca nH: la impresora cree que el bloque de
// datos termina antes de tiempo, y los bytes de imagen sobrantes se
// interpretan como si fueran el comando/dato siguiente -- corrompiendo
// visualmente el resto de esa franja (recorte + patrón irregular que
// parece "estirado").
//
// La corrección no depende de confirmar esa hipótesis con certeza: para
// eliminar el riesgo por completo, cada banda se sub-divide horizontalmente
// en bloques de a lo sumo `MAX_ESC_STAR_WIDTH_DOTS` columnas, cada uno
// emitido como su PROPIO comando `ESC *` (nL de 1 byte siempre exacto, sin
// depender de que la impresora lea nH). Comandos `ESC *` consecutivos sin
// un LF de por medio se imprimen pegados horizontalmente en la misma línea
// -- comportamiento estándar de la especificación ESC/POS, no una
// suposición nueva -- así que dividir en bloques no cambia el resultado
// visual esperado en una impresora que sí soporta nH, y arregla las que no.
const MAX_ESC_STAR_WIDTH_DOTS = 255;

// PRINT-4-BUG9/BUG10 — la prueba física de BUG8 (bloques de posición
// absoluta conocida, sin ningún logo real de por medio) fue concluyente:
// un bloque "centro" con ~226 columnas de margen izquierdo horneadas en
// píxeles blancos apareció comprimido contra el borde DERECHO del papel
// (no en el centro), y uno "derecha" con ~452 columnas de margen
// desapareció por completo del área imprimible. Esto descartó por
// completo el margen horneado en el bitmap (el antiguo `padBitsLeft`,
// BUG6, eliminado en BUG10) como mecanismo de posicionamiento en esta
// impresora/emulación: cientos de columnas en blanco NO son "gratis" --
// consumen (o corrompen) el mismo presupuesto de ancho que el contenido
// real, empujando o eliminando el contenido real antes de que llegue a
// imprimirse.
//
// `ESC $ nL nH` (posición absoluta de impresión, especificación Epson
// estándar) mueve el punto de impresión a `nL + nH*256` unidades de
// movimiento horizontal desde el margen izquierdo, ANTES de imprimir lo
// que sea que venga después -- acá se asume la unidad por defecto de esta
// impresora (sin `GS P`) igual a 1 dot nativo, la asunción más común en
// clones ESC/POS simples que no implementan unidades de movimiento
// configurables. BUG9 confirmó físicamente que este mecanismo SÍ
// funciona (x=0 y x=226 imprimieron en la posición correcta); también
// reveló que el ancho nominal (512 dots a 80mm) NO es el área realmente
// imprimible -- ver `effectivePrintableWidthDots` en printerProfile.js.
export function buildAbsolutePositionCommand(dotsFromLeft) {
  const n = Math.max(0, dotsFromLeft | 0);
  return [ESC, 0x24, n & 0xFF, (n >> 8) & 0xFF]; // ESC $ nL nH
}

/**
 * PRINT-4-BUG3/BUG7/BUG10 — `ESC *` (ver buildColumnBitImageCommand)
 * confirmado físicamente en el hardware de validación, pero solo cubre 8
 * dots de alto por invocación. Un logo real es mucho más alto (y más
 * ancho que `MAX_ESC_STAR_WIDTH_DOTS`), así que esta función lo divide en
 * franjas horizontales de 8 dots de alto, y cada franja además en bloques
 * de a lo sumo `MAX_ESC_STAR_WIDTH_DOTS` columnas -- reutilizando EXACTO
 * el mismo comando ya validado para cada bloque -- no se cambia de modo
 * (m=0) ni se inventa nada nuevo.
 *
 * Para que las franjas queden pegadas sin espacios ni superposición se
 * usa `ESC 3 n` (avance de línea fino, en dots -- comando ESC/POS
 * estándar, independiente de cualquier fabricante) fijado a 8 antes de
 * la primera franja, un LF de 8 dots exactos después de cada una (nunca
 * entre los bloques de una misma franja, para que queden pegados
 * horizontalmente), y `ESC 2` (vuelve al espaciado de línea por defecto)
 * al final para no afectar el texto que viene después de la imagen.
 *
 * PRINT-4-BUG10 — `xDots` (opcional): si es un número finito, `bits`
 * debe contener EXCLUSIVAMENTE el contenido real (sin ningún padding
 * horizontal, abandonado tras la prueba física de BUG8) y se antepone
 * `ESC $ (xDots + chunkStart)` (ver buildAbsolutePositionCommand)
 * inmediatamente antes de CADA bloque `ESC *` -- una nueva línea de
 * impresión (cada franja de 8 dots termina en un LF) siempre resetea la
 * posición horizontal al margen izquierdo, así que no alcanza con
 * posicionar una sola vez al principio; y cada chunk de <=255 columnas
 * dentro de una misma franja ancha se reposiciona también por separado,
 * para no depender de que comandos `ESC *` consecutivos se concatenen
 * horizontalmente por su cuenta -- la suposición que BUG7 no pudo
 * confirmar físicamente. Sin `xDots` (omitido/no numérico), comportamiento
 * IDÉNTICO al histórico de BUG3/BUG7 (sin `ESC $`, sin padding): todos
 * los diagnósticos anteriores (BUG1/2/3/8) que llaman a esta función con
 * 3 argumentos siguen produciendo bytes idénticos a los ya validados.
 */
export function buildTiledColumnBitImageCommand(bits, width, height, xDots) {
  const hasPosition = Number.isFinite(xDots);
  const bytes = [ESC, 0x33, BAND_HEIGHT_DOTS]; // ESC 3 8
  for (let bandStart = 0; bandStart < height; bandStart += BAND_HEIGHT_DOTS) {
    const bandHeight = Math.min(BAND_HEIGHT_DOTS, height - bandStart);
    const bandBits = new Uint8Array(width * bandHeight);
    for (let y = 0; y < bandHeight; y++) {
      for (let x = 0; x < width; x++) {
        bandBits[y * width + x] = bits[(bandStart + y) * width + x];
      }
    }
    for (let chunkStart = 0; chunkStart < width; chunkStart += MAX_ESC_STAR_WIDTH_DOTS) {
      const chunkWidth = Math.min(MAX_ESC_STAR_WIDTH_DOTS, width - chunkStart);
      const chunkBits = new Uint8Array(chunkWidth * bandHeight);
      for (let y = 0; y < bandHeight; y++) {
        for (let x = 0; x < chunkWidth; x++) {
          chunkBits[y * chunkWidth + x] = bandBits[y * width + chunkStart + x];
        }
      }
      if (hasPosition) bytes.push(...buildAbsolutePositionCommand(xDots + chunkStart));
      bytes.push(...buildColumnBitImageCommand(chunkBits, chunkWidth, bandHeight));
    }
    bytes.push(LF);
  }
  bytes.push(ESC, 0x32); // ESC 2 -- espaciado de línea por defecto
  return new Uint8Array(bytes);
}
