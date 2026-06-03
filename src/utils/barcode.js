// EAN-13 utilities for internal store codes (prefix "20" — reserved for in-store use)

export function calcEan13Check(digits12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits12[i], 10) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code) {
  if (!/^\d{13}$/.test(code)) return false;
  return calcEan13Check(code.slice(0, 12)) === parseInt(code[12], 10);
}

/** Generate a random EAN-13 starting with prefix "20" */
export function generateRawEan13() {
  const prefix = '20';
  const rand = String(Math.floor(Math.random() * 1e10)).padStart(10, '0');
  const digits12 = prefix + rand;
  return digits12 + calcEan13Check(digits12);
}
