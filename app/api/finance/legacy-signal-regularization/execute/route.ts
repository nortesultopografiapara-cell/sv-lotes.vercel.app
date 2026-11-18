import { NextResponse } from 'next/server';
import { isLegacySignalRegularizationRouteEnabled } from '@/lib/homolog/env';
import { createAdminSupabase, getRequestAuthUser } from '@/lib/supabase/server';
import {
  LegacySignalAccessError,
  executeLegacySignalForActor,
  loadLegacySignalActor,
  readLegacySignalRequest,
} from '@/lib/finance/legacySignalRegularizationServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isLegacySignalRegularizationRouteEnabled()) {
    return NextResponse.json(
      { success: false, code: 'not_found', message: 'Recurso não disponível.', mutation: false },
      { status: 404 },
    );
  }
  try {
    const { user, configError } = await getRequestAuthUser(request);
    if (configError || !user) {
      return NextResponse.json({ success: false, code: 'UNAUTHORIZED', message: 'Sessão ou autorização inválida.', mutation: false }, { status: 401 });
    }
    const { client: admin, configError: adminError } = createAdminSupabase();
    if (!admin || adminError) {
      return NextResponse.json({ success: false, code: 'SUPABASE_CONFIG', message: 'Supabase não configurado.', mutation: false }, { status: 503 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = readLegacySignalRequest(body);
    if ('error' in parsed) {
      return NextResponse.json({ success: false, code: 'invalid', message: parsed.error, mutation: false }, { status: 400 });
    }
    if (parsed.confirm !== true) {
      return NextResponse.json({ success: false, code: 'confirmation_required', message: 'A regularização exige confirmação explícita.', mutation: false }, { status: 400 });
    }
    const actor = await loadLegacySignalActor(admin, user.id);
    const executed = await executeLegacySignalForActor(admin, actor, String(body.saleId || '').trim(), parsed);
    return NextResponse.json({ success: executed.ok, ...executed, mutation: executed.ok });
  } catch (error) {
    if (error instanceof LegacySignalAccessError) {
      return NextResponse.json({ success: false, code: error.code, message: error.message, mutation: false }, { status: error.status });
    }
    console.error('[legacy-signal-regularization/execute]', error);
    return NextResponse.json({ success: false, code: 'execute_failed', message: 'A regularização não foi concluída. Nenhum valor foi alterado.', mutation: false }, { status: 500 });
  }
}
