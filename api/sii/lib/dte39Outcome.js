// Pure fiscal outcome classifier. Never retries an uncertain DTE submission.
export function classifyDte39Outcome(error, result) {
  if (result) {
    if (!Number.isSafeInteger(result.folio) || result.folio <= 0)
      return {state:'unknown',error:'PROVIDER_RESULT_WITHOUT_VALID_FOLIO'};
    if (result.isSimulation) return {state:'unknown',error:'SIMULATION_NOT_ISSUED'};
    return {state:'issued',folio:result.folio,response:{folio:result.folio}};
  }
  if (!error) return {state:'unknown',error:'NO_PROVIDER_RESULT'};
  const status=Number(error.status);
  // A remote HTTP failure is not proof that the fiscal operation did not occur.
  // Never requeue without checking the operation identifier with the provider.
  return {state:'unknown',error:status ? 'PROVIDER_HTTP_'+status : 'PROVIDER_OUTCOME_UNCERTAIN'};
}

export function classifyDte39Preflight(error) {
  const reason=String(error?.message||'PREFLIGHT_FAILED');
  // No network call was attempted, so no duplicate emission risk.
  return {state:'failed',error:/^[A-Z][A-Z0-9_]{2,80}$/.test(reason)?reason:'PREFLIGHT_FAILED'};
}
