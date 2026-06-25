import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  process.env.NODAL_BASE_URL,
].filter(Boolean) as string[];

export function middleware(req: NextRequest) {
  const origin = req.headers.get('origin') ?? '';
  const isAllowed = ALLOWED_ORIGINS.includes(origin);

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': isAllowed ? origin : 'null',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Block non-API routes from CORS check
  if (!req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Check origin for API routes
  if (origin && !isAllowed) {
     return new NextResponse(JSON.stringify({ error: 'Forbidden' }), {
       status: 403,
       headers: { 'Content-Type': 'application/json' }
     });
  }

  const response = NextResponse.next();
  response.headers.set(
    'Access-Control-Allow-Origin',
    isAllowed ? origin : 'null'
  );
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
