import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STORAGE_PATH = resolve(__dirname, '../../.data/paypal-catalog.json');

function getInitialState() {
  return {
    sandbox: null,
    live: null,
  };
}

async function readStorage() {
  try {
    const raw = await readFile(STORAGE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...getInitialState(), ...(parsed || {}) };
  } catch {
    return getInitialState();
  }
}

async function writeStorage(data) {
  await mkdir(dirname(STORAGE_PATH), { recursive: true });
  await writeFile(STORAGE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

export async function getPaypalCatalogByEnvironment(environment) {
  const state = await readStorage();
  return state?.[environment] || null;
}

export async function savePaypalCatalogByEnvironment(environment, catalog) {
  const state = await readStorage();
  state[environment] = {
    ...catalog,
    updatedAt: new Date().toISOString(),
  };
  await writeStorage(state);
  return state[environment];
}

