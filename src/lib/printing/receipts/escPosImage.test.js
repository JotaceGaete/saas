import { describe, expect, it } from 'vitest';
import {
  rgbaToGrayscale, ditherFloydSteinberg, buildRasterCommand, buildColumnBitImageCommand,
  buildTiledColumnBitImageCommand, padBitsLeft, buildVerticalMarkerBits, buildGeometryTestBits,
  buildAbsolutePositionCommand, buildPositionedTiledColumnBitImageCommand,
} from './escPosImage';

// Todo este archivo trabaja sobre arrays de píxeles fijos -- ninguna de
// estas funciones toca Image/canvas/fetch (eso vive en
// fetchLogoRaster.js), así que se puede probar con datos deterministas.

describe('rgbaToGrayscale', () => {
  it('convierte blanco opaco a 255 y negro opaco a 0', () => {
    // 1x2: primer píxel blanco opaco, segundo negro opaco
    const rgba = Uint8ClampedArray.from([255, 255, 255, 255, 0, 0, 0, 255]);
    const gray = rgbaToGrayscale(rgba, 1, 2);
    expect(gray[0]).toBe(255);
    expect(gray[1]).toBe(0);
  });

  it('mezcla píxeles transparentes sobre fondo blanco (nunca los deja negros)', () => {
    // negro pero totalmente transparente -> debe dar blanco (255), no negro
    const rgba = Uint8ClampedArray.from([0, 0, 0, 0]);
    const gray = rgbaToGrayscale(rgba, 1, 1);
    expect(gray[0]).toBe(255);
  });

  it('semi-transparente queda entre el color y el blanco', () => {
    const rgba = Uint8ClampedArray.from([0, 0, 0, 128]);
    const gray = rgbaToGrayscale(rgba, 1, 1);
    expect(gray[0]).toBeGreaterThan(0);
    expect(gray[0]).toBeLessThan(255);
  });
});

describe('ditherFloydSteinberg', () => {
  it('todo blanco (255) produce todo ceros (nada imprime)', () => {
    const gray = new Uint8ClampedArray(4).fill(255);
    const bits = ditherFloydSteinberg(gray, 2, 2);
    expect(Array.from(bits)).toEqual([0, 0, 0, 0]);
  });

  it('todo negro (0) produce todo unos (todo imprime)', () => {
    const gray = new Uint8ClampedArray(4).fill(0);
    const bits = ditherFloydSteinberg(gray, 2, 2);
    expect(Array.from(bits)).toEqual([1, 1, 1, 1]);
  });

  it('gris intermedio produce una mezcla de 0 y 1 (no todo igual)', () => {
    const gray = new Uint8ClampedArray(16).fill(128);
    const bits = ditherFloydSteinberg(gray, 4, 4);
    const ones = Array.from(bits).filter((b) => b === 1).length;
    expect(ones).toBeGreaterThan(0);
    expect(ones).toBeLessThan(16);
  });

  it('no lanza en bordes (1x1)', () => {
    expect(() => ditherFloydSteinberg(new Uint8ClampedArray([200]), 1, 1)).not.toThrow();
  });
});

describe('buildRasterCommand', () => {
  it('arma el header GS v 0 con m=0 y xL/xH/yL/yH correctos', () => {
    const bits = new Uint8Array(8 * 3); // 8 px de ancho (1 byte/fila), 3 filas
    const command = buildRasterCommand(bits, 8, 3);
    expect(Array.from(command.slice(0, 8))).toEqual([0x1D, 0x76, 0x30, 0x00, 1, 0, 3, 0]);
  });

  it('redondea el ancho en bytes hacia arriba (9 px -> 2 bytes/fila)', () => {
    const bits = new Uint8Array(9 * 1);
    const command = buildRasterCommand(bits, 9, 1);
    expect(command[4]).toBe(2); // bytesPerRow (xL)
    expect(command[5]).toBe(0); // xH
    expect(command.length).toBe(8 + 2 * 1);
  });

  it('empaqueta los bits en MSB-first dentro de cada byte', () => {
    // fila de 8 px: 1,0,0,0,0,0,0,0 -> byte 0x80
    const bits = Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 0]);
    const command = buildRasterCommand(bits, 8, 1);
    expect(command[8]).toBe(0x80);
  });

  it('un píxel negro en la última posición de la fila enciende el bit menos significativo', () => {
    const bits = Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 1]);
    const command = buildRasterCommand(bits, 8, 1);
    expect(command[8]).toBe(0x01);
  });

  it('sin píxeles negros produce solo ceros en la data', () => {
    const bits = new Uint8Array(16);
    const command = buildRasterCommand(bits, 8, 2);
    expect(Array.from(command.slice(8))).toEqual([0, 0]);
  });
});

describe('buildColumnBitImageCommand — PRINT-4-BUG2 (alternativa ESC * al raster GS v 0)', () => {
  const ESC = 0x1B;

  it('arma el header ESC * m nL nH con m=0 (8-dot single density) y ancho correcto', () => {
    const bits = new Uint8Array(8 * 3); // 8 columnas, 3 dots de alto
    const command = buildColumnBitImageCommand(bits, 8, 3);
    expect(Array.from(command.slice(0, 5))).toEqual([ESC, 0x2A, 0x00, 8, 0]);
    expect(command.length).toBe(5 + 8); // header + 1 byte por columna
  });

  it('empaqueta cada columna en un byte vertical, MSB = dot superior', () => {
    // columna 0: dot superior (y=0) negro, resto blanco -> bit7 = 1 -> 0x80
    const bits = Uint8Array.from([
      1, 0, // y=0
      0, 0, // y=1
      0, 0, // y=2
    ]);
    const command = buildColumnBitImageCommand(bits, 2, 3);
    expect(command[5]).toBe(0x80); // columna 0
    expect(command[6]).toBe(0x00); // columna 1
  });

  it('el dot inferior de una columna de 8 enciende el bit menos significativo', () => {
    const width = 1;
    const height = 8;
    const bits = new Uint8Array(width * height);
    bits[7 * width] = 1; // y=7 (última fila), única columna
    const command = buildColumnBitImageCommand(bits, width, height);
    expect(command[5]).toBe(0x01);
  });

  it('lanza si se pide una altura mayor a 8 dots (modo de 24 dots no implementado)', () => {
    expect(() => buildColumnBitImageCommand(new Uint8Array(9), 1, 9)).toThrow(/8 dots/);
  });

  it('nunca depende de UTF-8: solo produce bytes 0-255 puros', () => {
    const bits = new Uint8Array(64).fill(1);
    const command = buildColumnBitImageCommand(bits, 8, 8);
    expect(command.every((b) => b >= 0 && b <= 255)).toBe(true);
  });
});

describe('buildTiledColumnBitImageCommand — PRINT-4-BUG3 (logo real vía ESC *, en franjas de 8 dots)', () => {
  const ESC = 0x1B;
  const LF = 0x0A;

  it('para una altura de exactamente 8 dots, produce UNA sola franja envuelta en ESC 3 8 ... LF ... ESC 2', () => {
    const bits = new Uint8Array(8 * 8);
    const command = buildTiledColumnBitImageCommand(bits, 8, 8);
    // ESC 3 8
    expect(Array.from(command.slice(0, 3))).toEqual([ESC, 0x33, 8]);
    // el comando ESC * validado (m=0, ancho=8) arranca justo después
    expect(Array.from(command.slice(3, 8))).toEqual([ESC, 0x2A, 0x00, 8, 0]);
    // LF tras los 8 bytes de datos de la franja
    expect(command[3 + 5 + 8]).toBe(LF);
    // ESC 2 al final
    expect(Array.from(command.slice(-2))).toEqual([ESC, 0x32]);
  });

  it('para una altura mayor a 8 dots, la divide en varias franjas de hasta 8 dots cada una', () => {
    const width = 4;
    const height = 20; // 3 franjas: 8 + 8 + 4
    const bits = new Uint8Array(width * height);
    const command = Array.from(buildTiledColumnBitImageCommand(bits, width, height));

    // Cada franja arranca con ESC * (0x1B, 0x2A) -- deben aparecer exactamente 3 veces
    let count = 0;
    for (let i = 0; i < command.length - 1; i++) {
      if (command[i] === ESC && command[i + 1] === 0x2A) count++;
    }
    expect(count).toBe(3);
  });

  it('la última franja parcial (altura no múltiplo de 8) no lanza y usa su altura real, no 8 fija', () => {
    const width = 2;
    const height = 3; // una sola franja parcial
    const bits = new Uint8Array(width * height);
    expect(() => buildTiledColumnBitImageCommand(bits, width, height)).not.toThrow();
  });

  it('reutiliza EXACTAMENTE buildColumnBitImageCommand por franja (mismos bytes de datos ya validados físicamente)', () => {
    const width = 8;
    const height = 8;
    const bits = Uint8Array.from({ length: 64 }, (_, i) => (i % 5 === 0 ? 1 : 0));
    const tiled = Array.from(buildTiledColumnBitImageCommand(bits, width, height));
    const single = Array.from(buildColumnBitImageCommand(bits, width, height));
    // El comando de la única franja debe ser un subconjunto contiguo idéntico
    const startIndex = tiled.findIndex((b, i) => b === ESC && tiled[i + 1] === 0x2A);
    expect(tiled.slice(startIndex, startIndex + single.length)).toEqual(single);
  });

  it('nunca produce bytes fuera de rango 0-255', () => {
    const bits = new Uint8Array(6 * 17).fill(1);
    const command = buildTiledColumnBitImageCommand(bits, 6, 17);
    expect(command.every((b) => b >= 0 && b <= 255)).toBe(true);
  });

  // PRINT-4-BUG7 — el logo real (incluso ya achicado en BUG6) mide
  // típicamente bastante más de 255 dots de ancho; el patrón de falla
  // físico reportado (logo recortado y "deformado" a la derecha, en TODAS
  // las pruebas con el logo real, mientras que los patrones de
  // diagnóstico de 8x8 -- muy por debajo de 255 -- siempre imprimieron
  // bien) es consistente con una emulación que solo confía en el byte
  // bajo (nL) del ancho de `ESC *` e ignora/trunca nH. La corrección:
  // ninguna franja emite un solo `ESC *` de más de 255 columnas -- se
  // subdivide en bloques consecutivos (sin LF entre ellos) que la
  // especificación ESC/POS pega horizontalmente en la misma línea.
  describe('PRINT-4-BUG7 — ningún ESC * individual supera 255 columnas de ancho', () => {
    it('un ancho de 300 (>255) produce DOS bloques ESC * consecutivos por franja, de 255 y 45 columnas, sin LF entre ellos', () => {
      const width = 300;
      const height = 8;
      const bits = new Uint8Array(width * height);
      const command = Array.from(buildTiledColumnBitImageCommand(bits, width, height));

      // ESC 3 8 al inicio
      expect(command.slice(0, 3)).toEqual([ESC, 0x33, 8]);

      // Primer bloque: [ESC,0x2A,0x00, nL=255,nH=0] + 255 bytes de datos
      let i = 3;
      expect(command.slice(i, i + 5)).toEqual([ESC, 0x2A, 0x00, 255, 0]);
      i += 5 + 255;
      // Segundo bloque arranca INMEDIATAMENTE después (sin LF de por medio)
      expect(command.slice(i, i + 5)).toEqual([ESC, 0x2A, 0x00, 45, 0]);
      i += 5 + 45;
      // Recién ahora el LF que cierra la franja completa
      expect(command[i]).toBe(LF);
    });

    it('nunca emite un byte nL >= 256 (0-255 siempre) aunque el ancho real sea mucho mayor', () => {
      const width = 700; // 3 bloques: 255 + 255 + 190
      const bits = new Uint8Array(width * 8);
      const command = Array.from(buildTiledColumnBitImageCommand(bits, width, 8));

      const widths = [];
      for (let idx = 0; idx < command.length - 4; idx++) {
        if (command[idx] === ESC && command[idx + 1] === 0x2A && command[idx + 2] === 0x00) {
          widths.push(command[idx + 3] + command[idx + 4] * 256);
        }
      }
      expect(widths).toEqual([255, 255, 190]);
      expect(widths.every((w) => w <= 255)).toBe(true);
      expect(widths.reduce((a, b) => a + b, 0)).toBe(width);
    });

    it('reconstruye EXACTAMENTE el bitmap original al concatenar los bloques -- ningún píxel se pierde ni se desplaza en el corte', () => {
      const width = 260; // 2 bloques: 255 + 5
      const height = 8;
      // patrón determinista, no trivial (evita falsos positivos con todo-cero o todo-uno)
      const bits = Uint8Array.from({ length: width * height }, (_, idx) => (idx % 7 === 0 ? 1 : 0));
      const command = Array.from(buildTiledColumnBitImageCommand(bits, width, height));

      // bloque 1: columnas 0..254, bloque 2: columnas 255..259
      const header1 = command.slice(3, 8);
      const data1 = command.slice(8, 8 + 255);
      const header2 = command.slice(8 + 255, 8 + 255 + 5);
      const data2 = command.slice(8 + 255 + 5, 8 + 255 + 5 + 5);

      expect(header1).toEqual([ESC, 0x2A, 0x00, 255, 0]);
      expect(header2).toEqual([ESC, 0x2A, 0x00, 5, 0]);

      const reconstructed = [...data1, ...data2];
      const expected = Array.from(buildColumnBitImageCommand(bits, width, height).slice(5));
      expect(reconstructed).toEqual(expected);
    });

    it('un ancho de exactamente 255 (límite) sigue produciendo UN solo bloque, sin dividir de más', () => {
      const width = 255;
      const bits = new Uint8Array(width * 8);
      const command = Array.from(buildTiledColumnBitImageCommand(bits, width, 8));
      let count = 0;
      for (let idx = 0; idx < command.length - 1; idx++) {
        if (command[idx] === ESC && command[idx + 1] === 0x2A) count++;
      }
      expect(count).toBe(1);
    });

    it('con altura mayor a 8 dots y ancho mayor a 255, cada franja tiene su propio LF de cierre (no se mezclan bloques de franjas distintas)', () => {
      const width = 300;
      const height = 16; // 2 franjas
      const bits = new Uint8Array(width * height);
      const command = Array.from(buildTiledColumnBitImageCommand(bits, width, height));

      let lfCount = 0;
      for (const b of command) if (b === LF) lfCount++;
      expect(lfCount).toBe(2); // uno por franja, nunca uno por bloque

      let escStarCount = 0;
      for (let idx = 0; idx < command.length - 1; idx++) {
        if (command[idx] === ESC && command[idx + 1] === 0x2A) escStarCount++;
      }
      expect(escStarCount).toBe(4); // 2 bloques x 2 franjas
    });
  });
});

// PRINT-4-BUG6 — el logo seguía cortándose en la prueba física de BUG5
// pese a que el ancho lógico ya era conservador: la centrada vía `ESC a`
// no se puede validar sin hardware real. `padBitsLeft` hornea el margen
// izquierdo directamente en los píxeles ANTES de armar cualquier comando
// (GS v 0 o ESC *), así que el offset horizontal deja de depender de
// ningún estado de alineación de la impresora.
describe('padBitsLeft — PRINT-4-BUG6 (margen izquierdo horneado en el bitmap)', () => {
  it('sin padding (0), devuelve los mismos bits/width sin copiar', () => {
    const bits = Uint8Array.from([1, 0, 0, 1]);
    const result = padBitsLeft(bits, 2, 2, 0);
    expect(result.bits).toBe(bits);
    expect(result.width).toBe(2);
  });

  it('agrega EXACTAMENTE `leftPaddingDots` columnas en blanco a la izquierda de cada fila', () => {
    // 2x2, todo negro
    const bits = Uint8Array.from([1, 1, 1, 1]);
    const { bits: padded, width } = padBitsLeft(bits, 2, 2, 3);
    expect(width).toBe(5);
    expect(padded.length).toBe(5 * 2);
    // fila 0: [0,0,0,1,1] -- 3 columnas en blanco, luego los 2 píxeles originales
    expect(Array.from(padded.slice(0, 5))).toEqual([0, 0, 0, 1, 1]);
    // fila 1: mismo patrón
    expect(Array.from(padded.slice(5, 10))).toEqual([0, 0, 0, 1, 1]);
  });

  it('preserva el contenido original exacto, solo desplazado -- nunca lo distorsiona ni lo recorta', () => {
    const bits = Uint8Array.from([1, 0, 1, 0, 1, 0]); // 3x2: fila0=[1,0,1], fila1=[0,1,0]
    const { bits: padded, width } = padBitsLeft(bits, 3, 2, 2);
    expect(width).toBe(5);
    expect(Array.from(padded.slice(0, 5))).toEqual([0, 0, 1, 0, 1]);
    expect(Array.from(padded.slice(5, 10))).toEqual([0, 0, 0, 1, 0]);
  });

  it('un padding negativo se trata como 0 (nunca recorta el bitmap)', () => {
    const bits = Uint8Array.from([1, 1]);
    const result = padBitsLeft(bits, 2, 1, -5);
    expect(result.bits).toBe(bits);
    expect(result.width).toBe(2);
  });
});

describe('buildVerticalMarkerBits — PRINT-4-BUG6 (diagnóstico de margen)', () => {
  it('enciende exactamente `thicknessDots` columnas empezando en `markColumnDots`, en todas las filas', () => {
    const bits = buildVerticalMarkerBits(10, 4, 3, 2);
    for (let y = 0; y < 3; y++) {
      const row = Array.from(bits.slice(y * 10, y * 10 + 10));
      expect(row).toEqual([0, 0, 0, 0, 1, 1, 0, 0, 0, 0]);
    }
  });

  it('nunca escribe fuera del ancho total, aunque la marca quede pegada al borde derecho', () => {
    const bits = buildVerticalMarkerBits(10, 9, 1, 4);
    expect(bits.length).toBe(10);
    expect(Array.from(bits)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
  });

  it('una columna negativa se recorta a 0 en vez de lanzar', () => {
    expect(() => buildVerticalMarkerBits(10, -3, 2, 2)).not.toThrow();
  });
});

// PRINT-4-BUG8 — BUG7 no resolvió el corrimiento físico del logo (sigue
// apareciendo corrido al extremo derecho). `buildGeometryTestBits` es
// geometría absoluta, sin ninguna lógica de centrado/margen -- solo
// confirma que el bitmap generado tiene el bloque de prueba EXACTAMENTE
// donde se le pide, para que la prueba física (no el análisis de código)
// diga si la impresora lo respeta.
describe('buildGeometryTestBits — PRINT-4-BUG8 (geometría absoluta para el diagnóstico físico)', () => {
  it('marca la columna 0..markThicknessDots (izquierda) y las últimas markThicknessDots columnas (derecha), en toda fila', () => {
    const bits = buildGeometryTestBits(20, 100, 1, 2, 3); // bloque fuera de rango a propósito -- no debe afectar las marcas
    for (let y = 0; y < 2; y++) {
      const row = Array.from(bits.slice(y * 20, y * 20 + 20));
      expect(row.slice(0, 3)).toEqual([1, 1, 1]); // marca izquierda
      expect(row.slice(17, 20)).toEqual([1, 1, 1]); // marca derecha
    }
  });

  it('enciende exactamente el bloque de prueba en [blockLeftDots, blockLeftDots+blockWidthDots)', () => {
    const bits = buildGeometryTestBits(30, 10, 5, 1, 2);
    const row = Array.from(bits);
    // marcas: [0,1] y [28,29]; bloque: [10..14]
    expect(row).toEqual([
      1, 1, 0, 0, 0, 0, 0, 0, 0, 0, // 0-9 (marca izquierda en 0-1)
      1, 1, 1, 1, 1, 0, 0, 0, 0, 0, // 10-19 (bloque en 10-14)
      0, 0, 0, 0, 0, 0, 0, 0, 1, 1, // 20-29 (marca derecha en 28-29)
    ]);
  });

  it('un bloque a la izquierda (offset 0) queda pegado a la marca izquierda; uno a la derecha (offset width-blockWidth) queda pegado a la marca derecha', () => {
    const width = 40;
    const blockWidth = 6;
    const leftBits = Array.from(buildGeometryTestBits(width, 0, blockWidth, 1, 2));
    const rightBits = Array.from(buildGeometryTestBits(width, width - blockWidth, blockWidth, 1, 2));
    // bloque izquierda se funde con la marca izquierda -> primeras 6 columnas encendidas (marca de 2 + bloque de 6, se superponen en 0-1)
    expect(leftBits.slice(0, 6)).toEqual([1, 1, 1, 1, 1, 1]);
    // bloque derecha se funde con la marca derecha -> últimas 6 columnas encendidas
    expect(rightBits.slice(-6)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('un bloque centrado matemáticamente queda a igual distancia de ambas marcas', () => {
    const width = 100;
    const blockWidth = 10;
    const left = Math.floor((width - blockWidth) / 2); // 45
    const bits = Array.from(buildGeometryTestBits(width, left, blockWidth, 1, 8));
    const firstBlockCol = bits.findIndex((b, i) => b === 1 && i >= 8 && i < width - 8);
    const lastBlockCol = width - 8 - 1 - Array.from(bits.slice(8, width - 8)).reverse().findIndex((b) => b === 1);
    expect(firstBlockCol).toBe(left);
    expect(lastBlockCol).toBe(left + blockWidth - 1);
    expect(left).toBe(width - (left + blockWidth)); // distancia igual a ambos lados
  });

  it('nunca lanza con parámetros fuera de rango (bloque negativo, ancho mayor al total, etc.)', () => {
    expect(() => buildGeometryTestBits(10, -50, 1000, 5, 100)).not.toThrow();
  });
});

// PRINT-4-BUG9 — la prueba física de BUG8 confirmó que el margen horneado
// en píxeles (padBitsLeft) NO funciona como mecanismo de posicionamiento
// en esta impresora: un bloque con ~226 columnas de padding apareció
// comprimido contra el borde derecho, y uno con ~452 desapareció por
// completo. Se reemplaza por `ESC $ nL nH` (posición absoluta), emitido
// explícitamente antes de cada bloque de imagen real (sin ningún padding).
describe('buildAbsolutePositionCommand — PRINT-4-BUG9 (ESC $ nL nH)', () => {
  const ESC = 0x1B;

  it('arma ESC $ nL nH con nL/nH correctos para un valor menor a 256', () => {
    expect(buildAbsolutePositionCommand(100)).toEqual([ESC, 0x24, 100, 0]);
  });

  it('codifica correctamente valores >= 256 en dos bytes (nL + 256*nH)', () => {
    expect(buildAbsolutePositionCommand(452)).toEqual([ESC, 0x24, 452 & 0xFF, 452 >> 8]);
    expect(buildAbsolutePositionCommand(452)).toEqual([ESC, 0x24, 196, 1]);
  });

  it('un valor negativo se trata como 0 en vez de producir un byte negativo', () => {
    expect(buildAbsolutePositionCommand(-10)).toEqual([ESC, 0x24, 0, 0]);
  });

  it('offset 0 (bloque IZQUIERDA) produce nL=0, nH=0', () => {
    expect(buildAbsolutePositionCommand(0)).toEqual([ESC, 0x24, 0, 0]);
  });
});

describe('buildPositionedTiledColumnBitImageCommand — PRINT-4-BUG9 (sin padding, posición explícita)', () => {
  const ESC = 0x1B;
  const LF = 0x0A;

  it('el bitmap NO lleva ningún padding: el ancho de los datos es EXACTAMENTE `width`, nunca `xDots + width`', () => {
    const width = 60;
    const height = 8;
    const bits = new Uint8Array(width * height).fill(1);
    const command = Array.from(buildPositionedTiledColumnBitImageCommand(bits, width, height, 226));

    // ESC 3 8, luego ESC $ nL nH, luego ESC * 0 nL nH (ancho = 60, NO 286)
    expect(command.slice(0, 3)).toEqual([ESC, 0x33, 8]);
    expect(command.slice(3, 7)).toEqual([ESC, 0x24, 226, 0]); // ESC $ 226 0
    expect(command.slice(7, 12)).toEqual([ESC, 0x2A, 0x00, 60, 0]); // ESC * 0 60 0 -- SOLO 60 columnas
    expect(command.length).toBe(3 + 4 + 5 + 60 + 1 + 2); // ESC3 + ESC$ + header + data + LF + ESC2
  });

  it('reemite ESC $ con el MISMO x antes de cada franja (una franja nueva resetea la posición horizontal)', () => {
    const width = 10;
    const height = 24; // 3 franjas de 8 dots
    const bits = new Uint8Array(width * height).fill(1);
    const command = Array.from(buildPositionedTiledColumnBitImageCommand(bits, width, height, 150));

    let count = 0;
    for (let i = 0; i < command.length - 3; i++) {
      if (command[i] === ESC && command[i + 1] === 0x24 && command[i + 2] === (150 & 0xFF) && command[i + 3] === (150 >> 8)) count++;
    }
    expect(count).toBe(3); // una vez por franja
  });

  it('con un ancho > 255 (MAX_ESC_STAR_WIDTH_DOTS), reposiciona con xDots + chunkStart antes de CADA chunk, no solo una vez por franja', () => {
    const width = 300; // 2 chunks: 255 + 45
    const height = 8;
    const bits = new Uint8Array(width * height).fill(1);
    const xDots = 100;
    const command = Array.from(buildPositionedTiledColumnBitImageCommand(bits, width, height, xDots));

    const positions = [];
    for (let i = 0; i < command.length - 3; i++) {
      if (command[i] === ESC && command[i + 1] === 0x24) positions.push(command[i + 2] + command[i + 3] * 256);
    }
    expect(positions).toEqual([100, 100 + 255]);
  });

  it('offset 0 (IZQUIERDA) produce ESC $ 0 0 antes del bloque', () => {
    const bits = new Uint8Array(8 * 8).fill(1);
    const command = Array.from(buildPositionedTiledColumnBitImageCommand(bits, 8, 8, 0));
    const idx = command.findIndex((b, i) => b === ESC && command[i + 1] === 0x24);
    expect(command.slice(idx, idx + 4)).toEqual([ESC, 0x24, 0, 0]);
  });

  it('preserva exactamente los píxeles reales (round-trip) -- el reposicionamiento no distorsiona el contenido', () => {
    const width = 12;
    const height = 8;
    const bits = Uint8Array.from({ length: width * height }, (_, i) => (i % 3 === 0 ? 1 : 0));
    const command = Array.from(buildPositionedTiledColumnBitImageCommand(bits, width, height, 40));
    // datos: después de ESC3(3) + ESC$(4) + header ESC*(5)
    const data = command.slice(3 + 4 + 5, 3 + 4 + 5 + width);
    const expected = Array.from(buildColumnBitImageCommand(bits, width, height).slice(5));
    expect(data).toEqual(expected);
  });

  it('termina cada franja con un LF y el comando completo con ESC 2, igual que la variante sin posicionar', () => {
    const bits = new Uint8Array(8 * 8).fill(1);
    const command = Array.from(buildPositionedTiledColumnBitImageCommand(bits, 8, 8, 50));
    expect(command.slice(-2)).toEqual([ESC, 0x32]);
    expect(command.includes(LF)).toBe(true);
  });
});
