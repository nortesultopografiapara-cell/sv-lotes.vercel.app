import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

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
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();
  const url = request.nextUrl.clone();

  // 1. PUBLIC ROUTES
  const publicRoutes = ['/login', '/auth/callback', '/verify-email'];
  const isPublicRoute = publicRoutes.some(route => url.pathname.startsWith(route));

  if (isPublicRoute) {
    if (session && url.pathname === '/login') {
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
    return response;
  }

  // 2. PROTECTED ROUTES - NO SESSION
  if (!session) {
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // 3. EMAIL VERIFICATION
  if (!session.user.email_confirmed_at) {
    if (url.pathname !== '/verify-email') {
      url.pathname = '/verify-email';
      return NextResponse.redirect(url);
    }
  }

  // 4. ONBOARDING & TENANT VERIFICATION
  // We need to fetch user profile to check onboarding and tenant
  const { data: userData } = await supabase
    .from('users')
    .select('role, tenant_id, onboarding_completed, force_password_change')
    .eq('id', session.user.id)
    .single();

  if (userData) {
    // SECURITY: Store tenant_id in header for downstream uses (server operations)
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

    // ROLE/TENANT GUARD
    if (url.pathname.startsWith('/empresas') && userData.role !== 'SUPER_ADMIN') {
      url.pathname = '/'; // Deny access
      return NextResponse.redirect(url);
    }

    if (userData.role !== 'SUPER_ADMIN' && !userData.tenant_id && !needsOnboarding) {
       // Orphan user
       await supabase.auth.signOut();
       url.pathname = '/login';
       return NextResponse.redirect(url);
    }
  }

  // 5. HARDENING HEADERS (CSP, XSS, etc)
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
