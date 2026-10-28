#!/usr/bin/env node
/**
 * Offline SII certification gate. Requires local xmllint and xmlsec1.
 * Validate with the SII's official Boleta XML XSD bundle and verify XMLDSig
 * using a trusted signer certificate. NEVER accept "valid" merely because
 * an XML document parses or contains a Signature element.
 *
 * Example:
 * node scripts/sii/verify-boleta.mjs --xml ./fixtures/boleta-firmada.xml \
 *   --xsd ./sii-official/EnvioBOLETA_v11.xsd --cert ./certs/trusted-public.pem
 *
 * The XSD filename above is illustrative: always use the actual official
 * bundle and correct top-level schema downloaded from sii.cl.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function requireArg(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith('--')) {
    throw new Error(`Falta argumento ${name}`);
  }
  const value = resolve(args[index + 1]);
  if (!existsSync(value)) throw new Error(`Archivo inexistente: ${name}`);
  return value;
}
function run(binary, args) {
  const result = spawnSync(binary, args, { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024, shell: false });
  if (result.error) throw new Error(`No se pudo ejecutar ${binary}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${binary} rechazó el documento (código ${result.status}): ${(result.stderr || result.stdout || '').slice(0, 3000)}`);
}
function checkDocumentShape(xml) {
  // These checks are only an additional gate; XSD and cryptographic checks
  // are authoritative. No DTD/external entities allowed.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('DTD y entidades externas prohibidas');
  if (!/<(?:[A-Za-z_][\w.-]*:)?Signature\b/.test(xml)) throw new Error('Firma XMLDSig ausente');
  if (!/<(?:[A-Za-z_][\w.-]*:)?TED\b/.test(xml)) throw new Error('Timbre electrónico ausente');
  if (!/<(?:[A-Za-z_][\w.-]*:)?TipoDTE>39<\/(?:[A-Za-z_][\w.-]*:)?TipoDTE>/.test(xml)) throw new Error('Solo boletas tipo 39');
}

export function verifySignedBoleta({ xml, xsd, cert }) {
  const source = readFileSync(xml);
  if (source.length === 0 || source.length > 10 * 1024 * 1024) throw new Error('Tamaño XML inválido');
  const document = source.toString('utf8');
  checkDocumentShape(document);
  // No --nonet fallback: schema imports MUST resolve locally.
  run('xmllint', ['--nonet', '--noout', '--schema', xsd, xml]);
  // xmlsec1 rejects invalid digest/signature and checks against explicit
  // trusted public certificate. Enforce exact ID attribute registration
  // after inspecting the official signed XML schema and signature reference.
  run('xmlsec1', ['--verify', '--pubkey-cert-pem', cert, '--id-attr:ID', 'Documento', xml]);
  return { schemaValid: true, signatureCryptographicallyValid: true, note: 'CAF, TED and signer authorization still require independent verification' };
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (isDirectRun) {
  try {
    const xml = requireArg(process.argv.slice(2), '--xml');
    const xsd = requireArg(process.argv.slice(2), '--xsd');
    const cert = requireArg(process.argv.slice(2), '--cert');
    const result = verifySignedBoleta({ xml, xsd, cert });
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) {
    process.stderr.write(`Validación fallida: ${error.message}\n`);
    process.exitCode = 1;
  }
}
