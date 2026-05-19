function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET() {
  return jsonResponse({
    loopsTestMode: process.env.LOOPS_TEST_MODE ?? null,
    loopsEnabled: process.env.LOOPS_ENABLED ?? null,
    rollout: process.env.LOOPS_ROLLOUT_PERCENT ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  });
}

export async function POST() {
  return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
}
