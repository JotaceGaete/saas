function getHostFromHeaders(headers) {
  const host = headers.get('x-forwarded-host') || headers.get('host') || '';
  return String(host).trim().toLowerCase();
}

/**
 * PayPal solo para región global (go.).
 */
export function isPaypalAllowedForRequest(request) {
  const host = getHostFromHeaders(request.headers);
  const isGo = host === 'go.ventalink.app' || host.endsWith('.go.ventalink.app');
  return isGo;
}

export function assertPaypalAllowedForRequest(request) {
  if (!isPaypalAllowedForRequest(request)) {
    throw new Error('[billing-eligibility] PayPal is only enabled for go. region');
  }
}

