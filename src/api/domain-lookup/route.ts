/**
 * GET /api/domain-lookup?domain=www.mitienda.cl
 *
 * Resuelve un hostname personalizado al slug del negocio correspondiente.
 * Consulta la tabla business_domains (status = 'active').
 * Usado por middleware.ts para reescribir rutas de dominios propios.
 */
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get('domain');

  if (!domain) {
    return NextResponse.json({ slug: null }, { status: 400 });
  }

  const normalizedDomain = domain.toLowerCase().split(':')[0].trim();

  const { data: domainRecord, error } = await supabase
    .from('business_domains')
    .select('business_id, status')
    .eq('domain', normalizedDomain)
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    console.error('[domain-lookup] DB error:', error.message);
    return NextResponse.json({ slug: null }, { status: 500 });
  }

  if (!domainRecord) {
    return NextResponse.json({ slug: null }, { status: 404 });
  }

  const { data: business } = await supabase
    .from('wa_businesses')
    .select('slug')
    .eq('id', domainRecord.business_id)
    .eq('is_active', true)
    .maybeSingle();

  if (!business?.slug) {
    return NextResponse.json({ slug: null }, { status: 404 });
  }

  return NextResponse.json({ slug: business.slug });
}
