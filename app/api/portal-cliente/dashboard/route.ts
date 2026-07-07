import { NextResponse } from 'next/server';
import { loadClientPortalDashboard } from '@/lib/portal-cliente/dashboard';
import { isClientPortalEnabled } from '@/lib/portal-cliente/config';
import {
  getClientPortalSessionCookie,
  readClientPortalSessionToken,
} from '@/lib/portal-cliente/session';
import { createAdminSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  if (!isClientPortalEnabled()) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  const cookie = await getClientPortalSessionCookie();
  if (!cookie) {
    return NextResponse.json(
      { ok: false, code: 'UNAUTHORIZED', message: 'Sessão não encontrada. Faça login novamente.' },
      { status: 401 },
    );
  }

  const session = readClientPortalSessionToken(cookie);
  if (!session) {
    return NextResponse.json(
      {
        ok: false,
        code: 'EXPIRED',
        message: 'Sessão expirada. Solicite um novo código de acesso.',
      },
      { status: 401 },
    );
  }

  const { client: admin, configError } = createAdminSupabase();
  if (!admin) {
    return NextResponse.json(
      { ok: false, code: 'NOT_FOUND', message: configError || 'Serviço indisponível.' },
      { status: 503 },
    );
  }

  const dashboard = await loadClientPortalDashboard(admin, session.scope);
  if (!dashboard) {
    return NextResponse.json(
      { ok: false, code: 'NOT_FOUND', message: 'Não foi possível carregar seus dados.' },
      { status: 404 },
    );
  }

  return NextResponse.json(dashboard);
}
