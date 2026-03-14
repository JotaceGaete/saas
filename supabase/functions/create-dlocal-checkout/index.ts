// Integración dLocal Go eliminada. Este endpoint ya no está en uso.
// Respuesta 410 para que ningún cliente siga usándolo.
Deno.serve(() => new Response(JSON.stringify({ error: 'dLocal Go integration removed' }), { status: 410, headers: { 'Content-Type': 'application/json' } }));
