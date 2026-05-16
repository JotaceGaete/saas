import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get('domain')

  if (!domain) {
    return NextResponse.json({ slug: null }, { status: 400 })
  }

  const { data } = await supabase
    .from('custom_domains')
    .select('business_slug, verified')
    .eq('domain', domain)
    .single()

  if (!data || !data.verified) {
    return NextResponse.json({ slug: null }, { status: 404 })
  }

  return NextResponse.json({ slug: data.business_slug })
}