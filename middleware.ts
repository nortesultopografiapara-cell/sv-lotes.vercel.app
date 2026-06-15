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
        const { data: ud } = await supabase.from('users').select('role, status').eq('id', user.id).single();
        userData = ud;
      }
    } catch (e) {
      console.error('Middleware auth check error', e);
    }
  }

  const url = request.nextUrl.clone();

  // 1. PUBLIC ROUTES (landing + auth + validação)
  const isLanding = url.pathname === '/';
  const publicRoutes = ['/login', '/auth/callback', '/verify-email', '/api/setup', '/api/regenerate', '/validar', '/validar-recibo', '/api/validar-recibo', '/api/company-lookup', '/sign', '/api/sign'];
  const isPublicRoute = isLanding || publicRoutes.some(route => url.pathname.startsWith(route));

  if (isPublicRoute) {
    if (user || isDemoMode) {
      if (isLanding) {
        const loginRole = String(userData?.role || '').toUpperCase();
        url.pathname =
          loginRole === 'BROKER' || loginRole === 'CORRETOR'
            ? '/map'
            : loginRole === 'OWNER'
              ? '/dashboard'
              : '/dashboard';
        return NextResponse.redirect(url);
      }
      if (url.pathname === '/login') {
        const loginRole = String(userData?.role || '').toUpperCase();
        url.pathname =
          loginRole === 'BROKER' || loginRole === 'CORRETOR'
            ? '/map'
            : loginRole === 'OWNER'
              ? '/dashboard'
              : '/dashboard';
        return NextResponse.redirect(url);
      }
    }
    if (isDevPreview && url.pathname === '/login') {
      url.pathname = '/map';
      return NextResponse.redirect(url);
    }
    return response;
  }

  // 2. PROTECTED ROUTES - NO SESSION
  if (!user && !isDemoMode && !isDevPreview) {
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && userData && String(userData.status || 'ACTIVE').toUpperCase() === 'INACTIVE') {
    url.pathname = '/login';
    url.searchParams.set('inactive', '1');
    return NextResponse.redirect(url);
  }

  // 4. BROKER / CORRETOR — somente Mapa GIS (venda e reserva)
  const brokerRole = String(userData?.role || '').toUpperCase();
  const isBroker = brokerRole === 'BROKER' || brokerRole === 'CORRETOR';
  if (isBroker) {
    const blockedRoutes = [
      '/dashboard',
      '/customers',
      '/finance',
      '/contracts',
      '/settings',
      '/companies',
      '/crm',
      '/logs',
      '/plans',
      '/users',
      '/owners',
      '/saas-finance',
      '/offline-sync',
      '/reports',
    ];
    const isBlocked = blockedRoutes.some((r) => url.pathname.startsWith(r));
    if (isBlocked) {
      url.pathname = '/map';
      return NextResponse.redirect(url);
    }
  }

  // 5. OWNER — somente módulos liberados por empreendimento
  const isOwner = brokerRole === 'OWNER';
  if (isOwner) {
    const ownerBlockedRoutes = [
      '/customers',
      '/dashboard/brokers',
      '/settings',
      '/users',
      '/owners',
      '/companies',
      '/crm',
      '/logs',
      '/plans',
      '/saas-finance',
      '/offline-sync',
      '/reports',
      '/master',
    ];
    const isOwnerBlocked = ownerBlockedRoutes.some((r) => url.pathname.startsWith(r));
    if (isOwnerBlocked) {
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }

    const isOwnerApiWrite =
      url.pathname.startsWith('/api/') &&
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method.toUpperCase());
    if (isOwnerApiWrite) {
      return NextResponse.json(
        {
          error:
            'Perfil OWNER possui acesso somente leitura. Esta ação não é permitida.',
          code: 'OWNER_READ_ONLY',
        },
        { status: 403 },
      );
    }
  }

  // 6. HARDENING HEADERS
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
