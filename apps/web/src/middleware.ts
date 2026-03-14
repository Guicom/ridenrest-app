import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Only protect (app)/ routes — (marketing)/ is public
  const isAppRoute =
    pathname.startsWith('/adventures') ||
    pathname.startsWith('/map') ||
    pathname.startsWith('/live') ||
    pathname.startsWith('/settings')

  if (!isAppRoute) return NextResponse.next()

  // Edge-compatible session check: verify cookie presence without importing
  // Node.js-dependent auth server (pg/drizzle cannot run in Edge Runtime).
  // Full session validation happens on protected NestJS API routes.
  const sessionCookie =
    request.cookies.get('better-auth.session_token') ??
    request.cookies.get('__Secure-better-auth.session_token')

  if (!sessionCookie?.value) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Match all routes except static files, API routes, and auth routes
    '/((?!_next/static|_next/image|favicon.ico|api/).*)',
  ],
}
