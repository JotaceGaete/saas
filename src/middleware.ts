import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Tus dominios propios de Walinka — no los proceses como custom domain
const WALINKA_DOMAINS = [
  'ventalink.app',
  'cl.ventalink.app',
  'go.ventalink.app',
  'miralatienda.de',
  'localhost',
]

export async function middleware(req: NextRequest) {
  const host = req.headers.get('host') ?? ''
  const hostname = host.split(':')[0] // quitar el puerto en desarrollo

  // Si es un dominio propio de Walinka, no hacer nada
  const isWalinka = WALINKA_DOMAINS.some(d => hostname === d || hostname.endsWith(`.${d}`))
  if (isWalinka) return NextResponse.next()

  // Buscar en Supabase qué slug corresponde a este dominio
  const { data } = await supabase
    .from('custom_domains')
    .select('business_slug, verified')
    .eq('domain', hostname)
    .single()

  if (!data || !data.verified) {
    // Dominio no registrado o no verificado
    return NextResponse.redirect(new URL('https://miralatienda.de'))
  }

  // Reescribir la URL internamente al catálogo correcto
  const url = req.nextUrl.clone()
  url.pathname = `/catalogo/${data.business_slug}`

  return NextResponse.rewrite(url)
}

export const config = {
  matcher: [
    // Aplica a todas las rutas excepto archivos estáticos y API
    '/((?!_next/static|_next/image|favicon.ico|api/).*)',
  ],
}