#!/usr/bin/env node
// Compara un reporte JSON de Vitest con la línea base de fallas preexistentes.
//
// - Falla (exit 1) si hay CUALQUIER falla que no esté en la línea base: una regresión nueva nunca
//   queda oculta.
// - Falla también si el reporte falta o no contiene pruebas (Vitest no corrió).
// - Solo avisa (exit 0) si una entrada de la línea base ya pasa: hay que borrarla del archivo.
//
// Uso: node scripts/ci/vitest-baseline.mjs <reporte.json> <linea-base.txt>
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { relative } from 'node:path';

const [reportPath, baselinePath] = process.argv.slice(2);
if (!reportPath || !baselinePath) {
  console.error('Uso: vitest-baseline.mjs <reporte.json> <linea-base.txt>');
  process.exit(2);
}
if (!existsSync(reportPath)) {
  console.error(`No existe el reporte de Vitest (${reportPath}): Vitest no terminó.`);
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
if (!Array.isArray(report.testResults) || !(report.numTotalTests > 0)) {
  console.error('El reporte de Vitest no contiene pruebas.');
  process.exit(1);
}

const cwd = process.cwd();
const fileOf = (name) => relative(cwd, name).split('\\').join('/');
// Identificador estable: «archivo :: describe > … > prueba». Un archivo que no carga se identifica
// solo por su ruta (el mensaje de error puede variar).
const failures = new Set();
for (const f of report.testResults) {
  const file = fileOf(f.name);
  const failed = (f.assertionResults ?? []).filter((a) => a.status === 'failed');
  if (failed.length === 0 && f.status === 'failed') failures.add(`${file} :: (no carga)`);
  for (const a of failed) failures.add(`${file} :: ${[...(a.ancestorTitles ?? []), a.title].join(' > ')}`);
}

const baseline = new Set(
  readFileSync(baselinePath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.replace(/ :: \(no carga el archivo:.*\)$/, ' :: (no carga)')),
);

const nuevas = [...failures].filter((id) => !baseline.has(id)).sort();
const resueltas = [...baseline].filter((id) => !failures.has(id)).sort();
const conocidas = [...failures].filter((id) => baseline.has(id)).length;

const lines = [
  `Vitest: ${report.numTotalTests} pruebas, ${report.numFailedTests} fallidas.`,
  `Fallas conocidas de la línea base: ${conocidas}. Nuevas: ${nuevas.length}. Ya corregidas: ${resueltas.length}.`,
];
console.log(lines.join('\n'));
if (resueltas.length) {
  console.log('\nEntradas de la línea base que ya pasan (bórralas de la línea base):');
  for (const id of resueltas) console.log(`  ✓ ${id}`);
}
if (nuevas.length) {
  console.error('\nFALLAS NUEVAS (no están en la línea base):');
  for (const id of nuevas) console.error(`  ✗ ${id}`);
}

// Resumen visible en la página del job de GitHub Actions.
if (process.env.GITHUB_STEP_SUMMARY) {
  const md = ['### Vitest contra la línea base', '', ...lines, ''];
  if (nuevas.length) md.push('**Fallas nuevas:**', '', ...nuevas.map((id) => `- ✗ \`${id}\``), '');
  if (resueltas.length) md.push('**Ya pasan (borrar de la línea base):**', '', ...resueltas.map((id) => `- ✓ \`${id}\``), '');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n');
}

process.exit(nuevas.length ? 1 : 0);
