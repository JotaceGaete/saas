export async function POST() {
  return new Response(
    JSON.stringify({
      ok: false,
      error: 'deprecated_endpoint',
      message: 'Use n8n webhook instead',
    }),
    {
      status: 410,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    },
  );
}

export async function GET() {
  return new Response(
    JSON.stringify({
      ok: false,
      error: 'deprecated_endpoint',
      message: 'Use n8n webhook instead',
    }),
    {
      status: 410,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    },
  );
}
