function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET() {
  return json({
    ok: true,
    route: 'health-json',
    method: 'GET',
  });
}

export async function POST() {
  return json({
    ok: true,
    route: 'health-json',
    method: 'POST',
  });
}
