import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let value = ''
  for (const byte of bytes) {
    value += String.fromCharCode(byte)
  }
  return btoa(value)
}

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== 'production'
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(isDev ? ["'unsafe-eval'"] : []),
  ]
  const styleSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    'https://fonts.googleapis.com',
    ...(isDev ? ["'unsafe-inline'"] : []),
  ]

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    `style-src ${styleSrc.join(' ')}`,
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: http: https:",
    "media-src 'self' blob: http: https:",
    "connect-src 'self' http: https: ws: wss:",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

export function middleware(request: NextRequest) {
  const nonce = generateNonce()
  const csp = buildCsp(nonce)

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)',
  ],
}
