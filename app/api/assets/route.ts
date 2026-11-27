import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isPlatformAdmin } from '@/lib/rls';
import { getRequestAuthUser } from '@/lib/supabase/server';

// Serves private Supabase Storage files
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const path = url.searchParams.get('path'); // e.g. tenant-id/fileName.png

  if (!path || path.includes('..')) {
    return new NextResponse('Missing path parameter', { status: 400 });
  }

  const { user, configError } = await getRequestAuthUser(req);
  if (!user?.id) {
    const status = configError && !/token inválido|sessão inválida/i.test(configError) ? 503 : 401;
    return new NextResponse(status === 401 ? 'Sessão expirada.' : 'Serviço de autenticação indisponível.', { status });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return new NextResponse('Serviço indisponível.', { status: 503 });
  }
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: caller, error: callerError } = await supabaseAdmin
    .from('users')
    .select('role, tenant_id, company_id')
    .eq('id', user.id)
    .maybeSingle();
  if (callerError) return new NextResponse('Não foi possível confirmar a autorização.', { status: 503 });
  const tenantId = String(caller?.tenant_id || caller?.company_id || '');
  const sameTenant = tenantId.length > 0 && (path === tenantId || path.startsWith(`${tenantId}/`));
  if (!caller || (!isPlatformAdmin(caller.role) && !sameTenant)) {
    return new NextResponse('Permissão negada.', { status: 403 });
  }

  const { data, error } = await supabaseAdmin.storage
    .from('company-assets')
    .download(path);

  if (error || !data) {
    return new NextResponse('File not found', { status: 404 });
  }

  return new NextResponse(data, {
    headers: {
      'Content-Type': data.type,
      'Cache-Control': 'public, max-age=31536000',
    },
  });
}
