import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    }
  );

  // Use getUser() instead of getSession() in middleware to ensure security
  // and trigger refresh of cookies if necessary.
  const { data: { user } } = await supabase.auth.getUser();
  const url = request.nextUrl.clone();

  // 1. PUBLIC ROUTES
  const publicRoutes = ['/login', '/auth/callback', '/verify-email', '/api/setup', '/api/regenerate'];
  const isPublicRoute = publicRoutes.some(route => url.pathname.startsWith(route)) || url.pathname === '/';

  if (isPublicRoute) {
    if (user && (url.pathname === '/login' || url.pathname === '/')) {
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
    return response;
  }

  // 2. PROTECTED ROUTES - NO SESSION
  if (!user) {
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // 3. EMAIL VERIFICATION
  // Commenting this out if email confirmation shouldn't be strictly enforced during login
  // if (!user.email_confirmed_at) {
  //  if (url.pathname !== '/verify-email') {
  //    url.pathname = '/verify-email';
  //    return NextResponse.redirect(url);
  //  }
  // }
  
  // Temporarily disable extra logic to fix the basic auth loop as requested by the user.
  /*
  // 4. ONBOARDING & TENANT VERIFICATION
  const { data: userData } = await supabase
    .from('users')
    .select('role, tenant_id, onboarding_completed, force_password_change')
    .eq('id', user.id)
    .single();

  if (userData) {
    response.headers.set('x-tenant-id', userData.tenant_id || '');
    response.headers.set('x-user-role', userData.role || '');

    const needsOnboarding = !userData.onboarding_completed || userData.force_password_change;
    const authSetupRoutes = ['/onboarding'];

    if (needsOnboarding && !authSetupRoutes.includes(url.pathname)) {
      url.pathname = '/onboarding';
      return NextResponse.redirect(url);
    }

    if (!needsOnboarding && authSetupRoutes.includes(url.pathname)) {
      url.pathname = '/';
      return NextResponse.redirect(url);
    }

    if (url.pathname.startsWith('/empresas') && userData.role !== 'SUPER_ADMIN') {
      url.pathname = '/';
      return NextResponse.redirect(url);
    }

    if (userData.role !== 'SUPER_ADMIN' && !userData.tenant_id && !needsOnboarding) {
       await supabase.auth.signOut();
       url.pathname = '/login';
       return NextResponse.redirect(url);
    }
  }
  */

  // 4. BROKER ROUTE PROTECTION
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (userData?.role === 'BROKER') {
    const allowedRoutesForBroker = ['/map'];
    const blockedRoutes = ['/dashboard', '/customers', '/finance', '/contracts', '/settings'];
    
    // If exact path is one of the blocked routes, redirect to /map
    const isBlocked = blockedRoutes.some(r => url.pathname.startsWith(r));
    if (isBlocked || url.pathname === '/') {
       url.pathname = '/map';
       return NextResponse.redirect(url);
    }
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
