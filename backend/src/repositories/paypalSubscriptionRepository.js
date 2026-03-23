import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const LOCAL_STORAGE_PATH = resolve(__dirname, '../../.data/paypal-subscriptions.json');
const STORAGE_PATH = process.env.VERCEL
  ? '/tmp/paypal-subscriptions.json'
  : LOCAL_STORAGE_PATH;

function getInitialState() {
  return {
    sandbox: [],
    live: [],
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

function nowIso() {
  return new Date().toISOString();
}

function upsertBySubscriptionId(items, record) {
  const idx = items.findIndex((item) => item?.paypalSubscriptionId === record.paypalSubscriptionId);
  if (idx >= 0) {
    items[idx] = {
      ...items[idx],
      ...record,
      updatedAt: nowIso(),
    };
    return items[idx];
  }
  const created = {
    ...record,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  items.push(created);
  return created;
}

export async function saveOrUpdateSubscriptionRecord(environment, record) {
  const state = await readStorage();
  const list = Array.isArray(state[environment]) ? state[environment] : [];
  const saved = upsertBySubscriptionId(list, record);
  state[environment] = list;
  await writeStorage(state);
  return saved;
}

export async function getSubscriptionRecordByPaypalId(environment, paypalSubscriptionId) {
  const id = String(paypalSubscriptionId || '').trim();
  if (!id) return null;
  const state = await readStorage();
  const list = Array.isArray(state[environment]) ? state[environment] : [];
  return list.find((item) => item?.paypalSubscriptionId === id) || null;
}

export async function listSubscriptionRecords(environment) {
  const state = await readStorage();
  const list = Array.isArray(state[environment]) ? state[environment] : [];
  return [...list];
}

