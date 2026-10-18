import { NextResponse, type NextRequest } from 'next/server';
import { serverClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get('code');
  if (code) {
    try {
      const client = await serverClient();
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL('/', base));
    } catch {
      /* Report auth failure to app. */
    }
  }
  return NextResponse.redirect(new URL('/?auth_error=1', base));
}