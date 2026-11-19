import { next } from '@vercel/functions';
import { readCookie, verifySession } from './lib/auth.js';

// Giriş etməmiş istifadəçi yalnız giriş səhifəsini görür.
export const config = {
  matcher: ['/((?!login\\.html|api/login|favicon\\.svg).*)'],
};

export default async function middleware(request) {
  const user = await verifySession(readCookie(request.headers.get('cookie'))).catch(() => null);
  if (user) return next();
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'Giriş tələb olunur' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  return Response.redirect(new URL('/login.html', request.url), 302);
}
