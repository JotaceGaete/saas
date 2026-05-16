import { NextRequest, NextResponse } from 'next/server'

const WALINKA_DOMAINS = [
  'ventalink.app',
  'cl.ventalink.app',
  'go.ventalink.app',
  'miralatienda.de',
  'localhost',
]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const host = req.headers.get('host') ?? ''
  const hostname = host.split(':')[0]

  // ── Admin guard ────────────────────────────────────────────
  if (pathname.startsWith('/admin')) {
    if (pathname.startsWith('/admin/login')) return NextResponse.next()
    const token = req.cookies.get('admin_token')?.value
    if (token !== process.env.ADMIN_SECRET) {
      return NextResponse.redirect(new URL('/admin/login', req.url))
    }
    return NextResponse.next()
  }

  // ── Custom domain mapping ──────────────────────────────────
  const isWalinka = WALINKA_DOMAINS.some(
    d => hostname === d || hostname.endsWith(`.${d}`)
  )
  if (isWalinka) return NextResponse.next()

  // Llamar a una API route interna que sí puede usar Supabase
  const lookupUrl = new URL('/api/domain-lookup', req.url)
  lookupUrl.searchParams.set('domain', hostname)

  const res = await fetch(lookupUrl.toString())

  if (!res.ok) {
    return NextResponse.redirect(new URL('https://miralatienda.de'))
  }

  const { slug } = await res.json()

  if (!slug) {
    return NextResponse.redirect(new URL('https://miralatienda.de'))
  }

  const url = req.nextUrl.clone()
  url.pathname = `/catalogo/${slug}`
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/((?!_next/static|_next/image|favicon.ico|api/).*)',
  ],
}