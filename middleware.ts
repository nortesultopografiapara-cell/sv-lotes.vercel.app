import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  const isDevPreview = request.nextUrl.hostname.includes("aistudio") || 
                       request.nextUrl.hostname.includes("run.app") ||
                       process.env.NODE_ENV === "development";

  const isDemoAllowed = !supabaseUrl || !supabaseAnonKey;
  const isDemoMode = isDemoAllowed && request.cookies.get('demo_mode')?.value === 'true';

  let user = null;
  let userData = null;

  if (supabaseUrl && supabaseAnonKey) {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });

    try {
      const { data } = await supabase.auth.getUser();
      user = data.user;
      
      if (user) {
        const { data: ud } = await supabase.from('users').select('role').eq('id', user.id).single();
        userData = ud;
      }
    } catch (e) {
      console.error('Middleware auth check error', e);
    }
  }

  const url = request.nextUrl.clone();

  // 1. PUBLIC ROUTES
  const publicRoutes = ['/login', '/auth/callback', '/verify-email', '/api/setup', '/api/regenerate', '/validar'];
  const isPublicRoute = publicRoutes.some(route => url.pathname.startsWith(route));

  if (isPublicRoute) {
    if ((user || isDemoMode || isDevPreview) && url.pathname === '/login') {
      url.pathname = isDevPreview || userData?.role === 'BROKER' ? '/map' : '/dashboard';
      return NextResponse.redirect(url);
    }
    return response;
  }

  // 2. PROTECTED ROUTES - NO SESSION
  if (!user && !isDemoMode && !isDevPreview) {
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // 4. BROKER ROUTE PROTECTION
  if (userData?.role === 'BROKER') {
    const allowedRoutesForBroker = ['/map'];
    const blockedRoutes = ['/dashboard', '/customers', '/finance', '/contracts', '/settings'];
    
    // If exact path is one of the blocked routes, redirect to /map
    const isBlocked = blockedRoutes.some(r => url.pathname.startsWith(r));
    if (isBlocked || url.pathname === '/') {
       url.pathname = '/map';
       return NextResponse.redirect(url);
    }
  } else if (isDevPreview && url.pathname === '/') {
       url.pathname = '/map';
       return NextResponse.redirect(url);
  }

  // 5. HARDENING HEADERS
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
