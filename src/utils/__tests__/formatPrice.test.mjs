/**
 * Manual tests for formatPrice + applyPriceDisplayMode.
 * Run with: node src/utils/__tests__/formatPrice.test.mjs
 *
 * These use Node.js ICU data which is consistent with how Vercel serverless
 * functions resolve Intl — the critical environment where the NIO regression appeared.
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { pathToFileURL } from 'url';
import path from 'path';

// ── Inline the helpers to avoid needing a build step ──────────────────────────

function applyPriceDisplayMode(formatted, amount, displayMode = 'auto') {
  if (displayMode !== 'hide_zero_decimals') return formatted;
  const n = Number(amount);
  if (!Number.isFinite(n) || n % 1 !== 0) return formatted;
  return formatted.replace(/[.,]00$/, '');
}

const LATAM_ZERO_DECIMAL = new Set(['CLP', 'ARS', 'CRC', 'COP', 'GTQ', 'PYG', 'UYU', 'BOB']);
const CURRENCY_SYMBOL_MAP = { CLP: '$', ARS: '$', CRC: '₡', COP: '$', GTQ: 'Q', PYG: '₲', UYU: '$U', BOB: 'Bs' };
const FALLBACK_LOCALE = { CLP:'es-CL', ARS:'es-AR', USD:'en-US', MXN:'es-MX', COP:'es-CO', PEN:'es-PE', EUR:'es-ES', BOB:'es-BO', CRC:'es-CR', GTQ:'es-GT', NIO:'es-NI', HNL:'es-HN', DOP:'es-DO', PYG:'es-PY', UYU:'es-UY' };
const COUNTRY_CONFIG = { CL:{symbol:'$',locale:'es-CL'}, AR:{symbol:'$',locale:'es-AR'}, NI:{symbol:'C$',locale:'es-NI'}, HN:{symbol:'L',locale:'es-HN'}, DO:{symbol:'RD$',locale:'es-DO'}, US:{symbol:'US$',locale:'en-US'}, PE:{symbol:'S/',locale:'es-PE'}, MX:{symbol:'$',locale:'es-MX'}, CO:{symbol:'$',locale:'es-CO'} };

function formatCurrencyFn(amount, currency, locale) {
  const cur = (currency || 'USD').toUpperCase();
  const loc = locale || FALLBACK_LOCALE[cur] || 'en-US';
  const n = Number(amount);
  const value = Number.isFinite(n) && n >= 0 ? n : 0;
  const zeroDecimal = new Set(['CLP','ARS']).has(cur);
  const opts = { style: 'currency', currency: cur, ...(zeroDecimal && { minimumFractionDigits: 0, maximumFractionDigits: 0 }) };
  try { return new Intl.NumberFormat(loc, opts).format(zeroDecimal ? Math.round(value) : value); }
  catch { return String(value); }
}

function formatPrice(amount, currency, countryCode, displayMode = 'auto') {
  const cur = String(currency || 'USD').trim().toUpperCase();
  const code = String(countryCode || '').trim().toUpperCase();
  const n = Number(amount);
  const value = Number.isFinite(n) && n >= 0 ? n : 0;
  let formatted;
  if (LATAM_ZERO_DECIMAL.has(cur)) {
    const symbol = COUNTRY_CONFIG[code]?.symbol ?? CURRENCY_SYMBOL_MAP[cur] ?? cur;
    const numStr = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true }).format(Math.round(value));
    formatted = `${symbol} ${numStr}`;
  } else if (cur === 'USD') {
    const numStr = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }).format(value);
    formatted = `US$ ${numStr}`;
  } else {
    const locale = COUNTRY_CONFIG[code]?.locale;
    formatted = formatCurrencyFn(value, cur, locale);
  }
  return applyPriceDisplayMode(formatted, value, displayMode);
}

// ── Test runner ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(description, actual, expected) {
  if (actual === expected) {
    console.log(`  ✓  ${description}`);
    passed++;
  } else {
    console.error(`  ✗  ${description}`);
    console.error(`       expected: ${JSON.stringify(expected)}`);
    console.error(`       actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ── Nicaragua (NIO / NI) ───────────────────────────────────────────────────────
console.log('\nNicaragua NIO + NI:');
test('auto        → C$160.00',  formatPrice(160,    'NIO', 'NI', 'auto'),              'C$160.00');
test('always      → C$160.00',  formatPrice(160,    'NIO', 'NI', 'always'),            'C$160.00');
test('hide_zero   → C$160',     formatPrice(160,    'NIO', 'NI', 'hide_zero_decimals'),'C$160');
test('hide_zero   → C$160.50',  formatPrice(160.5,  'NIO', 'NI', 'hide_zero_decimals'),'C$160.50');
test('hide_zero   → C$65',      formatPrice(65,     'NIO', 'NI', 'hide_zero_decimals'),'C$65');
test('hide_zero   → C$195',     formatPrice(195,    'NIO', 'NI', 'hide_zero_decimals'),'C$195');

// ── USD ────────────────────────────────────────────────────────────────────────
console.log('\nUSD + US:');
test('auto        → US$ 160.00', formatPrice(160,   'USD', 'US', 'auto'),              'US$ 160.00');
test('always      → US$ 160.00', formatPrice(160,   'USD', 'US', 'always'),            'US$ 160.00');
test('hide_zero   → US$ 160',    formatPrice(160,   'USD', 'US', 'hide_zero_decimals'),'US$ 160');
test('hide_zero   → US$ 10.99',  formatPrice(10.99, 'USD', 'US', 'hide_zero_decimals'),'US$ 10.99');

// ── Chile (CLP / CL) — zero-decimal, hide_zero_decimals must not change anything ──
console.log('\nChile CLP + CL (zero-decimal, must not be affected by any mode):');
test('auto        → $ 160',      formatPrice(160,   'CLP', 'CL', 'auto'),              '$ 160');
test('always      → $ 160',      formatPrice(160,   'CLP', 'CL', 'always'),            '$ 160');
test('hide_zero   → $ 160',      formatPrice(160,   'CLP', 'CL', 'hide_zero_decimals'),'$ 160');
test('auto        → $ 3.000',    formatPrice(3000,  'CLP', 'CL', 'auto'),              '$ 3.000');

// ── applyPriceDisplayMode edge cases ──────────────────────────────────────────
console.log('\napplyPriceDisplayMode edge cases:');
test('auto passthrough',         applyPriceDisplayMode('C$160.00',   160,   'auto'),              'C$160.00');
test('always passthrough',       applyPriceDisplayMode('C$160.00',   160,   'always'),            'C$160.00');
test('comma-decimal (,00)',      applyPriceDisplayMode('$10.990,00', 10990, 'hide_zero_decimals'),'$10.990');
test('real decimal not stripped',applyPriceDisplayMode('C$160.50',   160.5, 'hide_zero_decimals'),'C$160.50');
test('zero amount integer',      applyPriceDisplayMode('C$0.00',     0,     'hide_zero_decimals'),'C$0');

// ── Summary ────────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
