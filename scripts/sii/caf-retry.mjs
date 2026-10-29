// Server only. Retries only fiscal-specific SQLSTATE PZ101; generic 55P03 must fail closed.
// Never retry ambiguous SII submissions through this helper.
export async function reserveWithContentionRetry({
  reserve, sleep, maxAttempts = 3, jitter = Math.random
}) {
  if (typeof reserve !== 'function' || typeof sleep !== 'function') throw Error('Missing backend dependency');
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) throw Error('Invalid retry budget');
  if (typeof jitter !== 'function') throw Error('Invalid jitter provider');
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // The DB reserve function itself enforces idempotency on every call.
      return await reserve();
    } catch (error) {
      if (error?.code !== 'PZ101') throw error;
      if (attempt === maxAttempts) return { status: 'temporarily_unavailable', reason: 'caf_locked' };
      const random = jitter();
      if (!Number.isFinite(random) || random < 0 || random >= 1) throw Error('Invalid jitter value');
      await sleep(Math.min(1000, 50 * 2 ** (attempt - 1)) + Math.floor(random * 50));
    }
  }
}
